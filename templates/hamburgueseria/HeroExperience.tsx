"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import type { ClientData } from "../../web/lib/schema";
import type { ProductoVista } from "../../web/lib/ecommerce/vistas";
import {
  ALTO_ARMADO,
  ALTO_NAV,
  ANCHO_BURGER,
  ANCHO_CAPAS,
  BURGER_ARMADA,
  CAPAS,
  COREOGRAFIA,
  ESCALA_DESKTOP,
  ESCALA_MOBILE,
  ESCENAS,
  FACTOR_SALIDA,
  INCLINACION_DESKTOP,
  MOBILE,
  TIEMPOS_ESCALA,
} from "./capas";
import { useEsAngosto } from "./scroll";
import { conTopeAlto, dividirNombre, numeral, tamanoSangrado } from "./tipografia";

/*
 * HERO EXPERIENCE — el póster que se abre.
 *
 * Fusiona lo que antes eran dos secciones (el hero y el despiece) en una sola
 * experiencia: el scroll no cambia de sección, atraviesa la burger y desemboca
 * en el menú. El scroll sigue siendo NATIVO —no se secuestra, no se acelera—;
 * lo único que hace el componente es leer su progreso y mapearlo a transforms.
 *
 * ESTRUCTURA
 *
 *   section  ← track alto (350vh desktop / 260vh mobile)
 *   └ div    ← viewport sticky de 100svh, overflow hidden
 *     ├ póster (tagline, copy, CTA, franja, indicador)
 *     ├ nombre sangrado en dos líneas
 *     ├ burger: imagen armada + stack de seis capas
 *     ├ CAPA POR CAPA
 *     └ producto del menú
 *
 * REGLAS DE MOVIMIENTO
 *
 * Solo `transform` y `opacity`. Ninguna medición por frame: `useScroll` sobre
 * el track y de ahí todo sale de `useTransform`, sin un solo `setState`
 * atado al scroll. Los recorridos van en unidades de viewport (vh/vw) para no
 * depender de medir nada en JS.
 *
 * Toda la configuración —assets, ventanas, destinos, escalas— vive en
 * `capas.ts`. Acá no hay ninguna ruta de imagen ni ningún número mágico.
 *
 * REDUCED MOTION: no hay track ni pin. El póster se muestra estático, con la
 * burger armada y todo el contenido legible, y el documento sigue al menú.
 */

const useLayoutEffectSeguro =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* Vocabulario editorial de la plantilla, no del negocio. */
const INDICADOR = "Scroll para abrir";
const ROTULO_APERTURA = "Capa por capa";
const KICKER_PRODUCTO = "Del menú";

/** Techo de altura del display dentro del viewport fijo (ver tipografia.ts). */
const TOPE_LINEA_SVH = 35;

/** Rango neutro: el motion value queda declarado pero no se mueve. */
const QUIETO: [number, number] = [0, 1];

export default function HeroExperience({
  data,
  numero,
  hrefPedido,
  destacado,
}: {
  data: ClientData;
  /** Numeral de la sección, calculado por la plantilla. */
  numero: number;
  /** Acción primaria de la página (WhatsApp si el prospecto lo tiene). */
  hrefPedido?: string;
  /** Producto destacado — sale del catálogo, no de una segunda lectura. */
  destacado: ProductoVista | null;
}) {
  const reducirMovimiento = useReducedMotion();
  const esAngosto = useEsAngosto();

  /* La preferencia de movimiento no existe en el servidor: se decide después
   * del montaje, en un layout effect, para no romper la hidratación. */
  const [sinMovimiento, setSinMovimiento] = useState(false);
  useLayoutEffectSeguro(() => {
    if (reducirMovimiento) setSinMovimiento(true);
  }, [reducirMovimiento]);
  const animado = !sinMovimiento;

  const trackRef = useRef<HTMLElement>(null);
  /* El track empieza donde se pega el sticky y termina donde se despega: ese
   * tramo exacto es el 0→1 del progreso. */
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });
  /* Suaviza el ligado a la rueda del mouse. `useTransform` clampea en los
   * extremos, así que el overshoot del spring no se ve. */
  const progreso = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.0005,
  });

  /* --- Tipo sangrado, con techo de altura porque el viewport es fijo --- */
  const lineas = dividirNombre(data.name);
  const tamano1 = conTopeAlto(tamanoSangrado(lineas[0], 28), TOPE_LINEA_SVH);
  const tamano2 = lineas[1]
    ? conTopeAlto(tamanoSangrado(lineas[1], 28), TOPE_LINEA_SVH)
    : null;

  /* --- Rangos: con reduced motion se colapsan y nada se mueve ---
   * Los motion values se declaran SIEMPRE. Sacarlos del `style` no borraría
   * el transform ya escrito en el elemento y dejaría la escena congelada a
   * mitad de camino. */
  const r = (rango: readonly number[]): number[] =>
    animado ? [...rango] : [...QUIETO];

  const opacidadPoster = useTransform(
    progreso,
    r([ESCENAS.posterFin, ESCENAS.despejeFin]),
    animado ? [1, 0] : [1, 1]
  );
  /* Sin animación no hay secuencia que abrir: el indicador desaparece en vez
   * de prometer algo que no va a pasar. */
  const opacidadIndicador = useTransform(
    progreso,
    r([0, 0.13, 0.22]),
    animado ? [1, 1, 0] : [0, 0]
  );
  const opacidadNombre = useTransform(
    progreso,
    r([ESCENAS.posterFin, 0.3]),
    animado ? [1, 0] : [1, 1]
  );
  const yLinea1 = useTransform(
    progreso,
    r([ESCENAS.posterFin, ESCENAS.despejeFin]),
    animado ? ["0vh", "-12vh"] : ["0vh", "0vh"]
  );
  const yLinea2 = useTransform(
    progreso,
    r([ESCENAS.posterFin, ESCENAS.despejeFin]),
    animado ? ["0vh", "14vh"] : ["0vh", "0vh"]
  );

  /* La burger arranca corrida del centro —el eje desplazado es lo que le da
   * tensión al póster— y se centra durante el despeje. */
  const xBurger = useTransform(
    progreso,
    r([ESCENAS.posterFin, ESCENAS.despejeFin]),
    animado ? ["-4vw", "0vw"] : ["-4vw", "-4vw"]
  );
  const escalaBurger = useTransform(
    progreso,
    r(TIEMPOS_ESCALA),
    animado
      ? esAngosto
        ? ESCALA_MOBILE
        : ESCALA_DESKTOP
      : [ESCALA_DESKTOP[0], ESCALA_DESKTOP[0]]
  );
  const inclinacion = useTransform(
    progreso,
    r([ESCENAS.aperturaFin, ESCENAS.acercamientoFin]),
    animado && !esAngosto ? [INCLINACION_DESKTOP, 0] : [0, 0]
  );

  /* Crossfade oculto: solo tiene efecto si hay un asset armado de verdad. */
  const hayArmada = BURGER_ARMADA.src !== null;
  const opacidadArmada = useTransform(
    progreso,
    r([ESCENAS.crossfadeInicio, ESCENAS.crossfadeFin]),
    animado ? [1, 0] : [1, 1]
  );
  const opacidadStack = useTransform(
    progreso,
    r([ESCENAS.crossfadeInicio, ESCENAS.crossfadeFin]),
    hayArmada && animado ? [0, 1] : [1, 1]
  );

  /* El claim se despide antes que el resto del póster y como una sola unidad
   * (heading + sub juntos). Solo en mobile: en desktop el bloque no cambió de
   * sitio ni de tiempos, y moverlo sería un cambio visual que no se pidió. */
  const claimAnimado = animado && esAngosto;
  const yClaim = useTransform(
    progreso,
    r([0.08, 0.2]),
    claimAnimado ? [0, -24] : [0, 0]
  );
  const opacidadClaim = useTransform(
    progreso,
    r([0.08, 0.2]),
    claimAnimado ? [1, 0] : [1, 1]
  );

  const opacidadRotulo = useTransform(
    progreso,
    r([ESCENAS.despejeFin, 0.34, 0.52, ESCENAS.aperturaFin]),
    animado ? [0, 1, 1, 0] : [0, 0]
  );
  const opacidadProducto = useTransform(
    progreso,
    r([ESCENAS.aperturaFin, 0.66, ESCENAS.acercamientoFin, 0.88]),
    animado ? [0, 1, 1, 0] : [0, 0]
  );
  /* El póster apagado no debe seguir recibiendo clicks. No es animación: es
   * un valor derivado, y va por motion value para no re-renderizar. */
  const punteroPoster = useTransform(progreso, (v) =>
    !animado || v < ESCENAS.despejeFin - 0.02 ? "auto" : "none"
  );

  return (
    <section
      ref={trackRef}
      /* Sin animación no hay track: el usuario no queda fijado varios
         viewports para leer lo mismo. */
      className={`relative bg-noche ${animado ? "h-[260vh] lg:h-[350vh]" : ""}`}
    >
      {/* El nombre completo, una sola vez, para tecnologías de asistencia: lo
          visual está partido en dos líneas y va oculto a AT. */}
      <h1 className="sr-only">{data.name}</h1>

      <div
        /* Pineado ocupa la pantalla entera; en flujo normal arranca DEBAJO de
           la nav, así que se le descuenta su alto o la franja del CTA queda
           fuera de la primera pantalla. */
        className={`relative overflow-hidden ${
          animado ? "sticky top-0 h-svh" : "h-[calc(100svh-69px)]"
        }`}
        style={{
          /* Tope de alto del corredor: en el documento podía medir 18vw, acá
             tiene que convivir con las dos líneas dentro de 100svh. */
          ["--corredor" as string]: esAngosto
            ? "min(26vw, 16svh)"
            : "min(18vw, 14svh)",
        }}
      >
        {/* ---------- Nombre sangrado ---------- */}
        <motion.div
          aria-hidden
          className="absolute inset-x-0 bottom-0 z-[1] flex flex-col items-center justify-center"
          style={{ top: ALTO_NAV, opacity: opacidadNombre }}
        >
          <motion.span
            className="block whitespace-nowrap text-center font-display uppercase leading-heading tracking-display text-hueso"
            style={{ fontSize: tamano1, y: yLinea1 }}
          >
            {lineas[0]}
          </motion.span>
          <span className="block h-[var(--corredor)] shrink-0" />
          {lineas[1] && tamano2 && (
            <motion.span
              className="block whitespace-nowrap text-center font-display uppercase leading-heading tracking-display text-brasa"
              style={{ fontSize: tamano2, y: yLinea2 }}
            >
              {lineas[1]}
            </motion.span>
          )}
        </motion.div>

        {/* ---------- Burger ---------- */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex items-center justify-center"
          /* Centrada en el área VISIBLE, no en el viewport entero: con la nav
             encima, centrar contra `inset-0` mandaba la capa de arriba detrás
             de la barra durante la apertura.
             La perspectiva vive en el contenedor estático: animarla obligaría
             a recalcular el contexto 3D en cada frame. */
          style={{ top: ALTO_NAV, perspective: "1200px" }}
        >
          <motion.div
            className="relative"
            style={{
              width: ANCHO_BURGER,
              x: xBurger,
              scale: escalaBurger,
              rotateX: inclinacion,
            }}
          >
            {BURGER_ARMADA.src && (
              <motion.div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{
                  width: `${BURGER_ARMADA.escalaRelativa * 100}%`,
                  opacity: opacidadArmada,
                }}
              >
                <Image
                  src={BURGER_ARMADA.src}
                  width={BURGER_ARMADA.ancho}
                  height={BURGER_ARMADA.alto}
                  alt=""
                  sizes="(min-width: 1024px) 32vw, 60vw"
                  priority
                  draggable={false}
                  className="h-auto w-full select-none"
                />
              </motion.div>
            )}

            <motion.div
              className="relative w-full"
              style={{
                aspectRatio: `${ANCHO_CAPAS} / ${ALTO_ARMADO}`,
                opacity: opacidadStack,
              }}
            >
              {CAPAS.map((capa, i) => (
                <CapaBurger
                  key={capa.src}
                  indice={i}
                  progreso={progreso}
                  animado={animado}
                  esAngosto={esAngosto}
                />
              ))}
            </motion.div>
          </motion.div>
        </div>

        {/* ---------- Póster: todo lo que se despeja ---------- */}
        <motion.div
          className="absolute inset-x-0 bottom-0 z-[3]"
          style={{
            top: ALTO_NAV,
            opacity: opacidadPoster,
            pointerEvents: punteroPoster,
          }}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-baseline justify-between gap-16 px-20 pb-24 pt-16 md:px-40">
              {data.tagline && (
                <span className="font-mono text-body-sm uppercase tracking-[0.22em] text-rescoldo">
                  {data.tagline}
                </span>
              )}
              <span className="ml-auto shrink-0 font-mono text-body-sm tracking-[0.22em] text-rescoldo">
                MVD · UY
              </span>
            </div>

            {/* El claim cambia de sitio según el ancho, pero es UN SOLO nodo:
                en mobile va arriba, en el aire que queda entre la fila de
                tagline y la primera línea del nombre —abajo pisaba la palabra
                en brasa—; desde `lg` vuelve al pie, a la derecha, exactamente
                como estaba. El `mt-auto` que empuja el bloque hacia abajo se
                muda al indicador en mobile. */}
            {data.hero?.heading && (
              <motion.div
                className="flex px-20 pt-8 md:px-40 lg:mt-auto lg:justify-end lg:pt-0"
                style={{ y: yClaim, opacity: opacidadClaim }}
              >
                <div className="max-w-[340px] text-left lg:max-w-[560px] lg:text-right">
                  <p className="font-display uppercase leading-heading tracking-display text-rescoldo text-[clamp(28px,8vw,36px)] lg:text-[clamp(32px,4vw,48px)]">
                    {data.hero.heading}
                  </p>
                  {data.hero.sub && (
                    <p className="mt-8 text-body-sm leading-body text-rescoldo lg:mt-12">
                      {data.hero.sub}
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            <motion.span
              className="mt-auto block px-20 font-mono text-caption uppercase tracking-[0.22em] text-rescoldo md:px-40 lg:mt-16"
              style={{ opacity: opacidadIndicador }}
            >
              {INDICADOR}
            </motion.span>

            <div className="mt-16 flex flex-wrap items-center gap-x-24 gap-y-8 border-t border-negro px-20 py-16 md:gap-x-40 md:px-40">
              {hrefPedido && (
                <a
                  href={hrefPedido}
                  className="inline-block rounded-button border border-negro bg-brasa px-24 py-12 text-body font-bold text-hueso"
                >
                  Pedir por WhatsApp
                </a>
              )}
              {data.hours?.length ? (
                <span className="font-mono text-body-sm uppercase text-hueso">
                  {data.hours[data.hours.length - 1].day} ·{" "}
                  {data.hours[data.hours.length - 1].open}
                </span>
              ) : null}
              {data.address && (
                <span className="hidden font-mono text-body-sm uppercase text-rescoldo md:inline">
                  {data.address}
                </span>
              )}
              <span className="ml-auto font-mono text-body-sm font-bold text-hueso">
                {numeral(numero)}
              </span>
            </div>
          </div>
        </motion.div>

        {/* ---------- Rótulo de la apertura ----------
            Va DETRÁS de los ingredientes (z por debajo del de la burger): que
            las capas lo tapen a medida que pasan es lo que da profundidad. Con
            el texto delante, todo se lee como una sola lámina plana. */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 z-[1] -translate-y-1/2 text-center font-display uppercase leading-heading tracking-display text-hueso text-[clamp(40px,8vw,103px)]"
          style={{ opacity: opacidadRotulo }}
        >
          {ROTULO_APERTURA}
        </motion.span>

        {/* ---------- Producto del menú ----------
            aria-hidden: el mismo ítem se anuncia completo en la sección del
            menú. Repetirlo acá solo duplicaría la lectura. */}
        {destacado && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute bottom-40 left-20 z-[4] flex max-w-[380px] flex-col items-start gap-12 md:left-40"
            style={{ opacity: opacidadProducto }}
          >
            <span className="font-mono text-[12px] uppercase tracking-[0.22em] text-queso">
              {KICKER_PRODUCTO}
            </span>
            <p className="font-display uppercase leading-heading tracking-display text-hueso text-[clamp(40px,5vw,64px)]">
              {destacado.name}
            </p>
            {destacado.description && (
              <p className="text-body-sm leading-body text-rescoldo">
                {destacado.description}
              </p>
            )}
            {destacado.priceLabel && (
              <span className="font-mono text-subheading font-bold text-hueso">
                {destacado.priceLabel}
              </span>
            )}
          </motion.div>
        )}
      </div>
    </section>
  );
}

/**
 * Una capa del stack. Cada una tiene su ventana y su recorrido propios (ver
 * COREOGRAFIA en capas.ts): con una sola fórmula genérica las seis se mueven
 * como un bloque y el despiece no se lee.
 */
function CapaBurger({
  indice,
  progreso,
  animado,
  esAngosto,
}: {
  indice: number;
  progreso: MotionValue<number>;
  animado: boolean;
  esAngosto: boolean;
}) {
  const capa = CAPAS[indice];
  const paso = COREOGRAFIA[indice];

  const factorSep = esAngosto ? MOBILE.factorSeparacion : 1;
  const factorSalida = esAngosto ? FACTOR_SALIDA.mobile : FACTOR_SALIDA.desktop;
  const factorDeriva = esAngosto ? MOBILE.factorDeriva : 1;

  const separacion = `${(paso.separacionVh * factorSep).toFixed(2)}vh`;
  const salida = `${(paso.salidaVh * factorSalida).toFixed(2)}vh`;
  const deriva = `${(paso.derivaVw * factorDeriva).toFixed(2)}vw`;

  /* La salida termina con el track, en los dos anchos: cualquier valor menor
   * dejaría un tramo final de negro antes de soltarse el sticky. */
  const finSalida = ESCENAS.atravesarFin;

  /* Un solo motion value encadena apertura y salida: la capa se separa, se
   * queda quieta mientras la cámara entra, y recién después sale de cuadro. */
  const y = useTransform(
    progreso,
    animado
      ? [0, paso.apertura[0], paso.apertura[1], ESCENAS.acercamientoFin, finSalida]
      : [0, 1],
    animado
      ? ["0vh", "0vh", separacion, separacion, salida]
      : ["0vh", "0vh"]
  );
  const x = useTransform(
    progreso,
    animado ? [ESCENAS.aperturaFin, ESCENAS.acercamientoFin] : [0, 1],
    animado ? ["0vw", deriva] : ["0vw", "0vw"]
  );
  const scale = useTransform(
    progreso,
    animado ? [ESCENAS.aperturaFin, ESCENAS.acercamientoFin] : [0, 1],
    animado ? [1, paso.escalaCercania] : [1, 1]
  );

  return (
    /* Cada capa va a SU ancho real y centrada: no todas miden lo mismo (el
       bacon sobresale de los panes) y estirarlas al 100% las deformaría. */
    <motion.div
      className="absolute"
      style={{
        top: `${((capa.topArmado / ALTO_ARMADO) * 100).toFixed(3)}%`,
        left: `${(((ANCHO_CAPAS - capa.ancho) / 2 / ANCHO_CAPAS) * 100).toFixed(3)}%`,
        width: `${((capa.ancho / ANCHO_CAPAS) * 100).toFixed(3)}%`,
        zIndex: capa.z,
        y,
        x,
        scale,
      }}
    >
      <Image
        src={capa.src}
        width={capa.ancho}
        height={capa.alto}
        alt=""
        sizes="(min-width: 1024px) 40vw, 70vw"
        draggable={false}
        /* Estas seis SON la burger inicial: tienen que estar antes del primer
           pintado, no depender del lazy loading. Es el único bloque de la
           página marcado como prioritario. */
        priority
        className="h-auto w-full select-none"
      />
    </motion.div>
  );
}
