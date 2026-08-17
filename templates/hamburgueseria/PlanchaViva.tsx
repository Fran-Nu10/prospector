"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  easeOut,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import type { ClientData } from "../../web/lib/schema";
import { EtiquetaSeccion } from "./SeccionTitulo";
import { useEsAngosto } from "./scroll";

/*
 * PLANCHA VIVA — la ventana que se abre.
 *
 * Segundo pico visual de la página, después del menú. Arranca como una franja
 * cinematográfica angosta recortada sobre el negro y el scroll la abre hasta
 * ocupar la pantalla. No repite la burger explotada del hero: acá no hay
 * despiece ni capas, hay una sola imagen en movimiento.
 *
 * EL MOVIMIENTO ES PESADO. Nada de springs: un spring rebota y esto tiene que
 * sentirse como una plancha industrial. El progreso del scroll entra crudo y
 * sale por curvas de ease, sin oscilación.
 *
 * CÓMO CRECE LA VENTANA SIN DEFORMAR EL VIDEO. El marco se escala en X e Y por
 * separado —de una franja ancha y baja a la pantalla entera— y el contenido
 * lleva la escala INVERSA. El marco recorta, el video no se estira. Todo es
 * transform: cero layout por frame.
 *
 * FASE 1: el video definitivo está en producción. Los rangos y las escalas
 * viven en COREOGRAFIA y ESCALAS, arriba de todo, para recalibrarlos contra el
 * asset real sin tocar el resto. Sin video cargado se muestra un placeholder
 * de desarrollo explícito — nunca una foto vieja haciendo de doble.
 */

/* ---------------------------------------------------------------------------
 * Configuración recalibrable
 * ------------------------------------------------------------------------ */

/** Tramos del progreso del track, 0→1. */
export const COREOGRAFIA = {
  entradaVentana: [0, 0.18],
  expansion: [0.18, 0.58],
  titular: [0.28, 0.62],
  claims: [0.48, 0.76],
  cierre: [0.74, 1],
} as const;

/**
 * Escala inicial del marco. Provisional: la franja de arranque se va a ajustar
 * contra el encuadre real del video cuando llegue.
 */
export const ESCALAS = {
  mobile: { x: 0.9, y: 0.45 },
  desktop: { x: 0.72, y: 0.42 },
} as const;

/** Alto del track. Suficiente para que la apertura respire, sin tramo muerto. */
export const ALTO_TRACK = { mobile: "140svh", desktop: "170svh" } as const;

/** Stagger entre claims, en fracción de progreso. */
const PASO_CLAIM = 0.06;

/** Máximo de claims en pantalla: más satura la ventana. */
const MAX_CLAIMS = 3;

/** Alto de la nav sticky: el contenido nunca arranca debajo de la barra. */
const ALTO_NAV = 69;

/* Vocabulario editorial de la plantilla, no del negocio. */
const CTA_POR_DEFECTO = "Pedir por WhatsApp";
const ROTULO_PLACEHOLDER = "Video en producción";
const NOMBRE_SECCION = "Plancha viva";

const useLayoutEffectSeguro =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* ---------------------------------------------------------------------------
 * Ventana de video
 * ------------------------------------------------------------------------ */

function Ventana({
  src,
  poster,
  reproducir,
}: {
  src?: string;
  poster?: string;
  /** Con reduced motion no se reproduce: se muestra el poster quieto. */
  reproducir: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  /* Fuera de pantalla el video se pausa: un loop invisible gastando batería es
   * el peor negocio posible en un teléfono. */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !reproducir) return;
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          /* El navegador puede rechazar el autoplay (ahorro de datos, iOS con
             poca batería). No es un error de la página: se traga la promesa y
             queda el poster, que es legible por sí solo. */
          void video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.15 }
    );
    observador.observe(video);
    return () => observador.disconnect();
  }, [src, reproducir]);

  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-carbon">
        <span className="font-mono text-caption uppercase tracking-[0.22em] text-rescoldo">
          {ROTULO_PLACEHOLDER}
        </span>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {!reproducir ? (
        poster ? (
          /* eslint-disable-next-line @next/next/no-img-element -- el poster del
             video no pasa por el optimizador: es el mismo archivo que consume
             <video>. */
          <img src={poster} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-carbon" />
        )
      ) : (
        <video
          ref={videoRef}
          /* `key` en el src: al cruzar el breakpoint React reemplaza el elemento
             en vez de mutarlo, y no quedan dos descargas en vuelo. */
          key={src}
          src={src}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      )}

      {/* Velo de lectura. Va DENTRO de la ventana —y no suelto sobre la
          sección— para que siga exactamente su geometría mientras se abre: si
          estuviera afuera, oscurecería el negro alrededor del marco. Es una
          herramienta de legibilidad, no un efecto: el metal de la espátula y
          el vapor son casi blancos y se comen el titular blanco. Centro
          limpio, peso arriba y abajo, que es donde vive el texto. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(10,10,15,0.82)_0%,rgba(10,10,15,0.45)_26%,rgba(10,10,15,0)_46%,rgba(10,10,15,0)_56%,rgba(10,10,15,0.55)_80%,rgba(10,10,15,0.88)_100%)]"
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Sección
 * ------------------------------------------------------------------------ */

export default function PlanchaViva({
  plancha,
  numero,
  hrefPedido,
}: {
  plancha: NonNullable<ClientData["planchaViva"]>;
  numero: number;
  /** Sin WhatsApp no hay CTA: no se inventa un destino. */
  hrefPedido?: string;
}) {
  const reducirMovimiento = useReducedMotion();
  const esAngosto = useEsAngosto();
  const [montado, setMontado] = useState(false);
  const [sinMovimiento, setSinMovimiento] = useState(false);

  useLayoutEffectSeguro(() => {
    if (reducirMovimiento) setSinMovimiento(true);
  }, [reducirMovimiento]);
  /* El video se elige DESPUÉS del montaje: así se pide exactamente un archivo
   * —el del ancho real— y nunca los dos. En el HTML del servidor no hay
   * ninguno, que además es lo que queremos para no competir con el LCP. */
  useEffect(() => setMontado(true), []);

  const animado = !sinMovimiento;
  const trackRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });
  /* Crudo, sin spring: el rebote elástico contradice el peso de una plancha.
   *
   * La identidad NO es código muerto: si un motion value llega DIRECTO desde
   * `useScroll`, Motion (12.43) delega las opacidades al compositor con una
   * ViewTimeline nativa —traduce `["start start","end end"]` a `contain
   * 0%→100%`— y ese rango no reproduce nuestro progreso: medido acá, las
   * opacidades subían, se daban vuelta a mitad del track y volvían a su valor
   * inicial al final. Pasar por una función corta la cadena mapeable, las anima
   * JS y la coreografía queda como está escrita. Al tocar esta línea, verificar
   * de nuevo con el barrido de progreso. */
  const progreso = useTransform(scrollYProgress, (v) => v);

  const escala = esAngosto ? ESCALAS.mobile : ESCALAS.desktop;
  const src = montado
    ? esAngosto
      ? plancha.mobileVideo
      : plancha.desktopVideo
    : undefined;
  const poster = esAngosto ? plancha.mobilePoster : plancha.desktopPoster;
  const claims = (plancha.claims ?? []).slice(0, MAX_CLAIMS);

  /* Rango neutro cuando no hay animación: los motion values se declaran igual
   * para que ningún transform quede escrito a medio camino. */
  const r = (rango: readonly number[]) => (animado ? [...rango] : [0, 1]);

  const opacidadVentana = useTransform(
    progreso,
    r(COREOGRAFIA.entradaVentana),
    animado ? [0, 1] : [1, 1]
  );
  const escalaX = useTransform(
    progreso,
    r(COREOGRAFIA.expansion),
    animado ? [escala.x, 1] : [1, 1],
    { ease: easeOut }
  );
  const escalaY = useTransform(
    progreso,
    r(COREOGRAFIA.expansion),
    animado ? [escala.y, 1] : [1, 1],
    { ease: easeOut }
  );
  /* Escala inversa del contenido: el marco recorta, el video no se deforma. */
  const inversaX = useTransform(escalaX, (v) => 1 / v);
  const inversaY = useTransform(escalaY, (v) => 1 / v);

  const opacidadTitular = useTransform(
    progreso,
    r(COREOGRAFIA.titular),
    animado ? [0, 1] : [1, 1]
  );
  const yTitular = useTransform(
    progreso,
    r(COREOGRAFIA.titular),
    animado ? [24, 0] : [0, 0]
  );
  const opacidadCierre = useTransform(
    progreso,
    r(COREOGRAFIA.cierre),
    animado ? [0, 1] : [1, 1]
  );
  const yCierre = useTransform(
    progreso,
    r(COREOGRAFIA.cierre),
    animado ? [20, 0] : [0, 0]
  );
  /* El plano tipográfico de fondo se apaga a medida que la ventana lo tapa. */
  const opacidadFondo = useTransform(
    progreso,
    r(COREOGRAFIA.expansion),
    animado ? [0.5, 0] : [0, 0]
  );

  return (
    <section
      ref={trackRef}
      aria-label={NOMBRE_SECCION}
      className={`relative bg-noche ${
        animado ? "h-[140svh] lg:h-[170svh]" : ""
      }`}
    >
      <div
        className={`relative overflow-hidden ${
          animado ? "sticky top-0 h-svh" : "py-100"
        }`}
      >
        {/* --- Plano tipográfico de fondo --- */}
        {plancha.eyebrow && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/2 z-0 -translate-y-1/2 text-center font-display uppercase leading-heading tracking-display text-hueso text-[clamp(48px,16vw,180px)]"
            style={{ opacity: opacidadFondo }}
          >
            {plancha.eyebrow}
          </motion.span>
        )}

        {/* --- Ventana de video ---
            El marco se escala en X e Y y recorta; el contenido lleva la escala
            inversa para que el video no se deforme nunca. */}
        <motion.div
          /* Las dos variantes no comparten utilidades de posición: si conviven
             `absolute` y `relative` en la misma clase, cuál gana lo decide el
             orden del CSS generado, no el del atributo. */
          className={`z-[1] overflow-hidden bg-noche ${
            animado ? "absolute inset-x-0 bottom-0" : "relative h-[52svh]"
          }`}
          /* Los motion values van SIEMPRE, incluso sin animación: si se sacan
             del `style`, Motion no borra lo último que escribió en el DOM y la
             ventana queda con la escala y la opacidad del primer cuadro —o
             sea, invisible y aplastada—. Sin animación los rangos ya están
             colapsados y todos valen 1. `top` sí es condicional: es layout, y
             en la versión quieta el marco no está posicionado. */
          style={{
            top: animado ? ALTO_NAV : undefined,
            opacity: opacidadVentana,
            scaleX: escalaX,
            scaleY: escalaY,
          }}
        >
          <motion.div
            className="h-full w-full"
            style={{ scaleX: inversaX, scaleY: inversaY }}
          >
            <Ventana src={src} poster={poster} reproducir={animado} />
          </motion.div>
        </motion.div>

        {/* --- Plano informativo frontal --- */}
        <div
          className={`pointer-events-none z-[2] flex flex-col px-20 pb-32 md:px-40 ${
            animado ? "absolute inset-x-0 bottom-0" : "relative mt-40"
          }`}
          style={{ top: animado ? ALTO_NAV : undefined }}
        >
          <EtiquetaSeccion
            numero={numero}
            texto={NOMBRE_SECCION}
            className="pt-16"
          />

          <motion.h2
            /* Cruza la ventana pero no se queda sobre el centro de acción: vive
               en el tercio superior y deja el medio libre. */
            className="mt-24 max-w-[16ch] font-display uppercase leading-heading tracking-[0.03em] text-hueso text-[clamp(40px,9vw,96px)]"
            style={{ opacity: opacidadTitular, y: yTitular }}
          >
            {plancha.headline}
          </motion.h2>

          {plancha.body && (
            <motion.p
              className="mt-16 max-w-[46ch] text-body-sm leading-body text-rescoldo lg:text-body"
              style={{ opacity: opacidadTitular }}
            >
              {plancha.body}
            </motion.p>
          )}

          {/* Con animación el bloque se empuja contra el piso de la ventana;
              quieto no hay alto libre que repartir, así que `mt-auto` no separa
              nada y los claims se montan sobre el titular. */}
          <div
            className={`flex flex-col gap-24 ${animado ? "mt-auto" : "mt-40"}`}
          >
            {claims.length > 0 && (
              <ul role="list" className="flex flex-wrap gap-x-24 gap-y-8">
                {claims.map((claim, i) => (
                  <Claim
                    key={claim}
                    texto={claim}
                    indice={i}
                    progreso={progreso}
                    animado={animado}
                  />
                ))}
              </ul>
            )}

            {hrefPedido && (
              <motion.div
                className="pointer-events-auto"
                style={{ opacity: opacidadCierre, y: yCierre }}
              >
                <a
                  href={hrefPedido}
                  className="inline-flex min-h-[48px] items-center rounded-button border border-negro bg-brasa px-32 text-body font-bold text-hueso"
                >
                  {plancha.ctaLabel || CTA_POR_DEFECTO}
                </a>
              </motion.div>
            )}
          </div>
        </div>

        {/* Slot para un futuro plano de vapor con alfa por delante del video.
            No se implementa ni se simula en esta fase: iría acá, en z-[3]. */}
      </div>
    </section>
  );
}

function Claim({
  texto,
  indice,
  progreso,
  animado,
}: {
  texto: string;
  indice: number;
  progreso: MotionValue<number>;
  animado: boolean;
}) {
  const [inicio, fin] = COREOGRAFIA.claims;
  const desde = inicio + indice * PASO_CLAIM;
  const opacity = useTransform(
    progreso,
    animado ? [desde, Math.min(fin, desde + 0.14)] : [0, 1],
    animado ? [0, 1] : [1, 1]
  );
  const y = useTransform(
    progreso,
    animado ? [desde, Math.min(fin, desde + 0.14)] : [0, 1],
    animado ? [12, 0] : [0, 0]
  );

  return (
    <motion.li
      className="font-mono text-body-sm uppercase tracking-[0.22em] text-rescoldo"
      style={{ opacity, y }}
    >
      {texto}
    </motion.li>
  );
}
