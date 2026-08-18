"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import type { Review } from "../../web/lib/schema";
import { EtiquetaSeccion } from "./SeccionTitulo";
import { numeral } from "./tipografia";

/*
 * RESEÑAS — escenario editorial, una reseña protagonista por vez.
 *
 * ANTES ERA UNA ESCALERA: cuatro testimonios chicos, cada uno corrido 40px más
 * a la derecha que el anterior, con estrellas + párrafo + nombre repetidos.
 * Leído hoy, eso es una sección de testimonios de 2017: ninguna reseña manda,
 * todas compiten y el ojo no sabe dónde empezar.
 *
 * Ahora hay UN escenario. El rating general queda fijo a la izquierda —es el
 * dato duro, no se mueve— y a la derecha las reseñas se turnan en el MISMO
 * origen: mismo eje horizontal, mismo eje vertical, sin sangrías alternadas.
 * El scroll es el que pasa de una a otra; no hay autoplay ni temporizadores,
 * porque la narrativa la maneja quien lee.
 *
 * Todas las reseñas están en el DOM desde el principio: lo que cambia son las
 * ventanas de opacidad y desplazamiento derivadas del índice, con un solo
 * reloj. Nada de `setState` por frame ni de re-render por píxel — el contador
 * también son capas animadas.
 *
 * ⚠ IMPORTANTE (regla del CLAUDE.md: "No inventar reseñas ni datos falsos del
 * negocio"): las reseñas de `data/prospects/_ejemplo.json` son DATOS DE
 * EJEMPLO para poder ver el diseño. Antes de mandarle la demo a un prospecto
 * hay que REEMPLAZARLAS por reseñas reales (Google Maps, Instagram, o pasadas
 * por el dueño). Si no hay reseñas reales, se borra el campo `reviews` del
 * JSON y la sección desaparece sola.
 *
 * El encabezado (rating + cantidad) sí es dato REAL: lo trae el scraper de la
 * API de Google Places y vive en `_meta.rating` / `_meta.reviewCount`.
 */

/* ---------------------------------------------------------------------------
 * Configuración recalibrable
 * ------------------------------------------------------------------------ */

export const ESCENARIO = {
  /** Track por reseña, en svh. Mobile más corto: el scroll ahí cuesta más. */
  porResena: { mobile: 26, desktop: 30 },
  /** Techo del track: un negocio con 20 reseñas no puede pedir 20 pantallas. */
  topeSvh: 300,
  /** Cuánto del turno de una reseña ocupa su transición de entrada/salida. */
  transicion: 0.22,
} as const;

/** Recorridos del cambio de reseña, en px. */
const ENTRADA = { y: 90, salida: -70, escala: 0.98 } as const;

/** Alto de la nav sticky: el escenario no puede empezar debajo de la barra. */
const ALTO_NAV = 69;

/** Rango neutro: el motion value queda declarado pero no se mueve. */
const QUIETO: [number, number] = [0, 1];

const useLayoutEffectSeguro =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Alto del track según cuántas reseñas hay de verdad. Cuatro reseñas piden
 * ~220svh en desktop; una sola no pide track (ver `animado`).
 */
export function altoTrack(total: number, porResena: number): string {
  return `${Math.min(ESCENARIO.topeSvh, 100 + porResena * total)}svh`;
}

/**
 * La cita baja de tamaño cuando el testimonio es largo. No se trunca ni se
 * esconde detrás de un "ver más": el texto entra entero, más chico.
 */
function tamanoCita(texto: string): string {
  const largo = texto.trim().length;
  if (largo <= 130) return "clamp(28px,3.4vw,56px)";
  if (largo <= 220) return "clamp(28px,2.6vw,42px)";
  return "clamp(26px,2.2vw,34px)";
}

/** Estrellas en ámbar — el acento de comida también marca el valor. */
function Estrellas({ valor, etiqueta }: { valor: number; etiqueta?: string }) {
  const llenas = Math.round(valor);
  return (
    <span
      className="inline-flex gap-4 text-queso"
      role="img"
      aria-label={etiqueta ?? `${valor} de 5`}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} aria-hidden className={i < llenas ? "" : "opacity-25"}>
          ★
        </span>
      ))}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * Una reseña dentro del escenario
 * ------------------------------------------------------------------------ */

/**
 * Ventanas de la reseña `i`: su turno es `[i/total, (i+1)/total]`. Entra antes
 * de que termine el turno anterior —hace falta un cruce corto para que no
 * parezca un corte— pero la saliente termina de apagarse antes de que la
 * entrante llegue a opacidad plena, o se leen las dos encimadas.
 *
 * Los puntos se recortan a [0,1]: un keyframe negativo o mayor que 1 hace que
 * Motion falle al construir la animación ("Offsets must be monotonically
 * non-decreasing"). La última no lleva tramo de salida —se queda— así que su
 * ventana tiene dos puntos en vez de cuatro.
 */
function ventanas(i: number, total: number) {
  const inicio = i / total;
  const fin = (i + 1) / total;
  const t = (fin - inicio) * ESCENARIO.transicion;
  const ultima = i === total - 1;
  const puntos = ultima
    ? [Math.max(0, inicio - t), inicio + t * 0.4]
    : [Math.max(0, inicio - t), inicio + t * 0.4, fin - t, fin - t * 0.2];
  return { inicio, fin, t, ultima, puntos };
}

function ResenaPlano({
  review,
  indice,
  total,
  progreso,
  animado,
}: {
  review: Review;
  indice: number;
  total: number;
  progreso: MotionValue<number>;
  animado: boolean;
}) {
  const { ultima, puntos } = ventanas(indice, total);

  /* La última no se apaga: si lo hiciera, el sticky terminaría en negro justo
     antes de soltar la sección siguiente. */
  const rango = animado ? puntos : [...QUIETO];
  const opacity = useTransform(
    progreso,
    rango,
    animado ? (ultima ? [0, 1] : [0, 1, 1, 0]) : [1, 1]
  );
  const y = useTransform(
    progreso,
    rango,
    animado ? (ultima ? [ENTRADA.y, 0] : [ENTRADA.y, 0, 0, ENTRADA.salida]) : [0, 0]
  );
  const scale = useTransform(
    progreso,
    rango,
    animado
      ? ultima
        ? [ENTRADA.escala, 1]
        : [ENTRADA.escala, 1, 1, ENTRADA.escala]
      : [1, 1]
  );

  return (
    <motion.figure
      data-resena=""
      /* Mismo origen exacto para todas: sin sangrías, sin `nth-child`, sin
         escalera. Lo único que cambia entre una y otra es el tiempo. */
      className={
        animado
          ? "absolute inset-x-0 top-0 flex flex-col gap-24"
          : "relative flex flex-col gap-24 border-t border-negro pt-32"
      }
      style={{ opacity, y, scale }}
    >
      <blockquote
        className="max-w-[24ch] font-display uppercase leading-heading tracking-[0.03em] text-hueso lg:max-w-[30ch]"
        style={{ fontSize: tamanoCita(review.text) }}
      >
        {`“${review.text}”`}
      </blockquote>

      <figcaption className="flex flex-wrap items-center gap-x-16 gap-y-8 font-mono text-body-sm uppercase tracking-[0.08em] text-rescoldo">
        <span className="font-bold text-hueso">{review.author}</span>
        {/* Sin fecha no queda un separador colgando. */}
        {review.date && <span aria-hidden>·</span>}
        {review.date && <span>{review.date}</span>}
        {review.rating != null && (
          <Estrellas valor={review.rating} etiqueta={`${review.rating} de 5`} />
        )}
      </figcaption>
    </motion.figure>
  );
}

/** Contador: una capa por reseña, encendida por su propia ventana. */
function Contador({
  indice,
  total,
  progreso,
  animado,
}: {
  indice: number;
  total: number;
  progreso: MotionValue<number>;
  animado: boolean;
}) {
  const { ultima, puntos } = ventanas(indice, total);
  const rango = animado ? puntos : [...QUIETO];
  const opacity = useTransform(
    progreso,
    rango,
    animado ? (ultima ? [0, 1] : [0, 1, 1, 0]) : [1, 1]
  );

  return (
    <motion.span
      aria-hidden
      className="absolute left-0 top-0 font-mono text-body-sm tracking-[0.18em] text-hueso"
      style={{ opacity }}
    >
      {numeral(indice + 1)} / {numeral(total)}
    </motion.span>
  );
}

/* ---------------------------------------------------------------------------
 * Sección
 * ------------------------------------------------------------------------ */

export default function Resenas({
  reviews,
  rating,
  reviewCount,
  numero,
}: {
  reviews: Review[];
  /** Dato real de Google (`_meta.rating`). */
  rating?: number;
  /** Dato real de Google (`_meta.reviewCount`). */
  reviewCount?: number;
  numero: number;
}) {
  const reducirMovimiento = useReducedMotion();
  const [sinMovimiento, setSinMovimiento] = useState(false);
  useLayoutEffectSeguro(() => {
    if (reducirMovimiento) setSinMovimiento(true);
  }, [reducirMovimiento]);

  const trackRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });
  /* La identidad NO es código muerto. `["start start","end end"]` es uno de
   * los presets que Motion traduce a una ViewTimeline nativa (`contain
   * 0%→100%`) y delega las opacidades al compositor; medido acá, con el
   * traspaso puesto la última reseña llegaba a 1 y después se apagaba sola
   * hacia el final del track en vez de quedarse. Pasar por una función corta
   * la cadena mapeable y las anima JS, que es lo único que respeta estas
   * ventanas. Al tocar esta línea, volver a medir el barrido de opacidades. */
  const progreso = useTransform(scrollYProgress, (v) => v);

  const total = reviews.length;
  /* Con una sola reseña no hay narrativa que recorrer: composición editorial
   * en flujo, sin track ni sticky. Lo mismo con menos movimiento. */
  const animado = !sinMovimiento && total > 1;

  /* Coma decimal: es una web uruguaya, "4,6" y no "4.6". */
  const ratingTexto = rating?.toFixed(1).replace(".", ",");

  if (total === 0) return null;

  const encabezado = (
    <div className="flex flex-col items-start gap-16">
      <EtiquetaSeccion numero={numero} texto="Reseñas" />
      {ratingTexto && rating != null && (
        <>
          <span className="block font-display leading-heading tracking-display text-brasa text-[clamp(56px,9vw,160px)]">
            {ratingTexto}
          </span>
          <Estrellas valor={rating} etiqueta={`${ratingTexto} de 5 en Google`} />
        </>
      )}
      {reviewCount != null && (
        <span className="font-mono text-body-sm uppercase tracking-[0.22em] text-rescoldo">
          {reviewCount} reseñas en Google
        </span>
      )}
    </div>
  );

  return (
    <section
      ref={trackRef}
      aria-label="Reseñas"
      className={`relative bg-noche ${
        animado ? "h-[var(--alto-m)] lg:h-[var(--alto-d)]" : ""
      }`}
      style={
        animado
          ? ({
              "--alto-m": altoTrack(total, ESCENARIO.porResena.mobile),
              "--alto-d": altoTrack(total, ESCENARIO.porResena.desktop),
            } as React.CSSProperties)
          : undefined
      }
    >
      {/* Sin JS las reseñas quedarían apiladas y en opacidad 0. Esto las
          devuelve a una lista legible; con JS el bloque no existe. */}
      <noscript>
        <style>{`[data-escenario]{height:auto!important;position:static!important}[data-pista]{position:static!important;min-height:0!important}[data-resena]{position:relative!important;opacity:1!important;transform:none!important;margin-bottom:40px}[data-progreso]{display:none!important}`}</style>
      </noscript>

      <div
        data-escenario=""
        className={
          animado
            ? "sticky top-0 flex h-svh flex-col justify-center overflow-hidden px-20 md:px-40"
            : "px-20 py-100 md:px-40"
        }
        style={animado ? { paddingTop: ALTO_NAV } : undefined}
      >
        <div className="mx-auto w-full max-w-[1360px]">
          <div className="grid gap-40 lg:grid-cols-[5fr_7fr] lg:gap-80">
            {encabezado}

            <div className="flex flex-col">
              {/* Escenario: todas las reseñas nacen en el mismo punto. El alto
                  mínimo evita que el bloque salte cuando cambia el largo del
                  testimonio. */}
              <div
                data-pista=""
                className={
                  animado
                    ? "relative min-h-[42svh] lg:min-h-[46svh]"
                    : "flex flex-col gap-40"
                }
              >
                {reviews.map((review, i) => (
                  <ResenaPlano
                    key={`${review.author}-${i}`}
                    review={review}
                    indice={i}
                    total={total}
                    progreso={progreso}
                    animado={animado}
                  />
                ))}
              </div>

              {animado && (
                <div
                  data-progreso=""
                  className="mt-40 flex items-center gap-24"
                >
                  {/* El contador vive en su propia caja: las capas se apilan
                      absolutas y no empujan la barra. */}
                  <span className="relative block h-[18px] w-[88px] shrink-0">
                    {reviews.map((review, i) => (
                      <Contador
                        key={`c-${review.author}-${i}`}
                        indice={i}
                        total={total}
                        progreso={progreso}
                        animado={animado}
                      />
                    ))}
                  </span>
                  <span
                    aria-hidden
                    className="relative h-px flex-1 bg-negro"
                  >
                    <motion.span
                      className="absolute inset-0 origin-left bg-rescoldo/40"
                      style={{ scaleX: progreso }}
                    />
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
