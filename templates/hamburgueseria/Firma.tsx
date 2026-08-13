"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  easeOut,
  motion,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import type { MenuItem } from "../../web/lib/schema";
import { EtiquetaSeccion } from "./SeccionTitulo";
import {
  DURACION_CAPA,
  EASE_BLOQUE,
  INCLINACION_FIRMA,
  STAGGER_CAPAS,
  VIEWPORT,
  ventanaCapa,
} from "./animacion";
import {
  ALTO_EXPLOTADO,
  ALTO_EXPLOTADO_MOBILE,
  ANCHO_CAPAS,
  CAPAS,
  desplazamientoArmado,
  numeralCapa,
  topExplotadoMobile,
  type Capa,
} from "./capas";
import { useEsAngosto, useProgresoPin } from "./scroll";

/*
 * LA FIRMA — despiece de la burger. El momento estrella de la página.
 *
 * La composición es un póster de 1360×980: el título por delante del pan, el
 * render explotado corrido a la derecha, las seis etiquetas de ingrediente
 * colgadas de hairlines negras que apuntan a su capa, la etiqueta rotada
 * contra el borde y la card de la firma anclada abajo a la izquierda.
 *
 * PROFUNDIDAD SIN SOMBRAS (regla dura del brief): la separan la superposición
 * y el recorte, nada más. La única ayuda es la inclinación inicial, que se
 * resuelve en 0 — el estado final es exactamente la composición plana.
 *
 * MOVIMIENTO:
 *   - Desktop: la sección se pinea y el scroll ABRE el despiece. El pan de
 *     abajo se despega primero; el de arriba nunca se mueve. Cada etiqueta
 *     enciende cuando su capa llega.
 *   - ≤1023px: sin pin y sin inclinación. Las capas se separan de una sola
 *     vez al entrar en viewport, con stagger, y la separación baja a ~0.39
 *     de la de desktop. Las etiquetas se apilan debajo del render.
 *
 * Las capas viajan en % de su propio alto (ver capas.ts): así el recorrido
 * escala con el contenedor y todo el movimiento sigue siendo transform puro.
 */

const useLayoutEffectSeguro =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* El póster vive en un espacio de 1360×980; todas las posiciones son % de
 * esa caja, y el tipo display escala con `cqw` para que la composición se
 * mantenga idéntica a cualquier ancho de contenedor. */
const ANCHO_POSTER = 1360;
const ALTO_POSTER = 980;
const ASPECTO_POSTER = ANCHO_POSTER / ALTO_POSTER;

const pct = (px: number, base: number) => `${((px / base) * 100).toFixed(3)}%`;

/** Caja del render dentro del póster (520×760 en el original). */
const RENDER = {
  left: pct(520, ANCHO_POSTER),
  top: pct(80, ALTO_POSTER),
  width: pct(520, ANCHO_POSTER),
  height: pct(760, ALTO_POSTER),
};

const TITULO = "La firma";
const EYEBROW = "La que te salva";
const ETIQUETA_ROTADA = "Construcción — 6 capas";
const KICKER_CARD = "La firma de la casa";

function ImagenCapa({ capa, eager = false }: { capa: Capa; eager?: boolean }) {
  return (
    <Image
      src={capa.src}
      width={ANCHO_CAPAS}
      height={capa.alto}
      alt=""
      sizes="(min-width: 1024px) 520px, 90vw"
      draggable={false}
      loading={eager ? "eager" : "lazy"}
      className="h-auto w-full select-none"
    />
  );
}

/* --------------------------------------------------------------------------
 * Etiqueta de ingrediente: numeral en ámbar, nombre en hueso, hairline negra
 * que la conecta con el render.
 * ----------------------------------------------------------------------- */

function TextoEtiqueta({ capa, indice }: { capa: Capa; indice: number }) {
  return (
    <span className="whitespace-nowrap font-mono text-[12px] uppercase text-hueso">
      <span className="text-queso">{numeralCapa(indice)}</span> {capa.etiqueta}
    </span>
  );
}

const HAIRLINE = <span aria-hidden className="h-px flex-1 bg-negro" />;

function EtiquetaPoster({
  capa,
  indice,
  progreso,
  animado,
}: {
  capa: Capa;
  indice: number;
  progreso: MotionValue<number>;
  /** false = composición estática (reduced motion): la etiqueta ya está. */
  animado: boolean;
}) {
  /* Alternan borde: impares a la derecha, pares a la izquierda. */
  const derecha = indice % 2 === 1;
  const [, fin] = ventanaCapa(indice, CAPAS.length);
  /* Enciende cuando su capa termina de llegar a destino. Sin animación el
   * rango se colapsa en el estado final: el motion value tiene que seguir
   * aplicándose siempre, porque sacarlo del `style` no borra el transform que
   * ya se escribió en el elemento. */
  const encendido: [number, number] = [fin - 0.18, fin];
  const opacity = useTransform(progreso, encendido, animado ? [0, 1] : [1, 1]);
  const x = useTransform(
    progreso,
    encendido,
    animado ? [derecha ? 14 : -14, 0] : [0, 0]
  );

  return (
    <motion.div
      className="absolute flex items-center gap-12"
      style={{
        top: pct(capa.topEtiqueta, ALTO_POSTER),
        left: derecha ? pct(1020, ANCHO_POSTER) : pct(40, ANCHO_POSTER),
        width: derecha ? pct(300, ANCHO_POSTER) : pct(500, ANCHO_POSTER),
        zIndex: 4,
        opacity,
        x,
      }}
    >
      {derecha ? (
        <>
          {HAIRLINE}
          <TextoEtiqueta capa={capa} indice={indice} />
        </>
      ) : (
        <>
          <TextoEtiqueta capa={capa} indice={indice} />
          {HAIRLINE}
        </>
      )}
    </motion.div>
  );
}

/* --------------------------------------------------------------------------
 * Card de la firma — el ítem destacado del menú, no texto de plantilla.
 * ----------------------------------------------------------------------- */

function CardFirma({
  item,
  className = "",
  compacta = false,
}: {
  item: MenuItem;
  className?: string;
  compacta?: boolean;
}) {
  return (
    <div className={`flex flex-col items-start gap-16 ${className}`}>
      <span className="font-mono text-[12px] uppercase tracking-[0.22em] text-queso">
        {KICKER_CARD}
      </span>
      <h3
        className={`font-display uppercase leading-heading tracking-display text-hueso ${
          compacta
            ? "text-[clamp(40px,10vw,48px)]"
            : "text-[clamp(40px,3.529cqw,48px)]"
        }`}
      >
        {item.name}
      </h3>
      {item.description && (
        <p className="text-body-sm leading-body text-rescoldo">
          {item.description}
        </p>
      )}
      {item.price && (
        <span className="font-mono text-subheading font-bold text-hueso">
          {item.price}
        </span>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Desktop: el póster pineado.
 * ----------------------------------------------------------------------- */

function CapaExplotada({
  capa,
  indice,
  progreso,
  animado,
}: {
  capa: Capa;
  indice: number;
  progreso: MotionValue<number>;
  animado: boolean;
}) {
  /* La capa se apoya en su posición EXPLOTADA y el progreso la trae desde la
   * apilada: el estado final del scroll es el diseño, sin acumular error. */
  const y = useTransform(
    progreso,
    ventanaCapa(indice, CAPAS.length),
    animado ? [desplazamientoArmado(capa, capa.topExplotado), "0%"] : ["0%", "0%"],
    { ease: easeOut }
  );

  return (
    <motion.div
      className="absolute left-0 w-full"
      style={{
        top: pct(capa.topExplotado, ALTO_EXPLOTADO),
        zIndex: capa.z,
        y,
      }}
    >
      <ImagenCapa capa={capa} />
    </motion.div>
  );
}

function PosterFirma({
  numero,
  destacado,
  animado,
}: {
  numero: number;
  destacado: MenuItem | null;
  animado: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const progreso = useProgresoPin(trackRef, stickyRef, animado);
  const inclinacion = useTransform(
    progreso,
    [0, 0.7],
    animado ? [INCLINACION_FIRMA, 0] : [0, 0],
    { ease: easeOut }
  );

  return (
    <div
      ref={trackRef}
      className={`relative hidden lg:block ${animado ? "h-[220vh]" : ""}`}
    >
      <div
        ref={stickyRef}
        /* pt = alto de la nav sticky: el póster no queda debajo de la barra. */
        className={`flex items-center justify-center px-40 pt-[76px] ${
          animado ? "sticky top-0 h-svh" : "py-100"
        }`}
      >
        <div
          className="relative"
          style={{
            containerType: "size",
            width: `min(${ANCHO_POSTER}px, 100%, calc((100svh - 180px) * ${ASPECTO_POSTER.toFixed(4)}))`,
            aspectRatio: `${ANCHO_POSTER} / ${ALTO_POSTER}`,
          }}
        >
          <EtiquetaSeccion
            numero={numero}
            texto={EYEBROW}
            className="absolute left-0 top-0"
          />

          {/* El título va POR DELANTE del pan: el recorte es la profundidad. */}
          <h2
            className="absolute left-0 z-[3] font-display uppercase leading-heading tracking-[0.03em] text-hueso text-[clamp(48px,7.574cqw,103px)]"
            style={{ top: pct(44, ALTO_POSTER) }}
          >
            {TITULO}
          </h2>

          <div
            className="absolute z-[2]"
            style={{ ...RENDER, perspective: "1200px" }}
          >
            <motion.div
              className="relative h-full w-full"
              style={{ rotateX: inclinacion }}
            >
              {CAPAS.map((capa, i) => (
                <CapaExplotada
                  key={capa.src}
                  capa={capa}
                  indice={i}
                  progreso={progreso}
                  animado={animado}
                />
              ))}
            </motion.div>
          </div>

          {CAPAS.map((capa, i) => (
            <EtiquetaPoster
              key={capa.src}
              capa={capa}
              indice={i}
              progreso={progreso}
              animado={animado}
            />
          ))}

          {/* `writing-mode` y no `rotate`: la etiqueta corre HACIA ABAJO
              desde su ancla en vez de crecer hacia arriba fuera de la caja,
              que con la nav pegada arriba terminaba cortada. */}
          <span
            className="absolute right-0 whitespace-nowrap font-mono text-[12px] uppercase tracking-[0.22em] text-rescoldo"
            style={{ top: pct(180, ALTO_POSTER), writingMode: "vertical-rl" }}
          >
            {ETIQUETA_ROTADA}
          </span>

          {/* 360px del original, con un piso para que el copy no se
              estrangule cuando el póster se achica. */}
          {destacado && (
            <div
              className="absolute bottom-0 left-0"
              style={{ width: `max(260px, ${pct(360, ANCHO_POSTER)})` }}
            >
              <CardFirma item={destacado} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * ≤1023px: el mismo despiece, recompuesto en vertical.
 * ----------------------------------------------------------------------- */

function CapaApilada({
  capa,
  indice,
  animado,
}: {
  capa: Capa;
  indice: number;
  animado: boolean;
}) {
  const destino = topExplotadoMobile(capa);
  /* Se separan de una sola vez al entrar en viewport, de abajo hacia arriba. */
  const retraso = (CAPAS.length - 1 - indice) * STAGGER_CAPAS;

  return (
    <motion.div
      className="absolute left-0 w-full"
      style={{ top: pct(destino, ALTO_EXPLOTADO_MOBILE), zIndex: capa.z }}
      initial={{ y: animado ? desplazamientoArmado(capa, destino) : "0%" }}
      whileInView={{ y: "0%" }}
      viewport={VIEWPORT}
      transition={{
        duration: animado ? DURACION_CAPA : 0,
        ease: EASE_BLOQUE,
        delay: animado ? retraso : 0,
      }}
    >
      <ImagenCapa capa={capa} />
    </motion.div>
  );
}

function FirmaApilada({
  numero,
  destacado,
  animado,
}: {
  numero: number;
  destacado: MenuItem | null;
  animado: boolean;
}) {
  return (
    <div className="px-20 py-100 lg:hidden">
      <EtiquetaSeccion numero={numero} texto={EYEBROW} regla className="mb-24" />
      <h2 className="font-display uppercase leading-heading tracking-[0.03em] text-hueso text-[clamp(48px,13vw,103px)]">
        {TITULO}
      </h2>

      <div
        className="relative mx-auto mt-40 w-full max-w-[420px]"
        style={{ aspectRatio: `${ANCHO_CAPAS} / ${ALTO_EXPLOTADO_MOBILE}` }}
      >
        {CAPAS.map((capa, i) => (
          <CapaApilada
            key={capa.src}
            capa={capa}
            indice={i}
            animado={animado}
          />
        ))}
      </div>

      {/* Etiquetas apiladas: numeradas, con hairline corta a la izquierda. */}
      <ul className="mt-40 flex flex-col gap-12">
        {CAPAS.map((capa, i) => (
          <li key={capa.src} className="flex items-center gap-12">
            <span aria-hidden className="h-px w-24 shrink-0 bg-negro" />
            <TextoEtiqueta capa={capa} indice={i} />
          </li>
        ))}
      </ul>

      {destacado && <CardFirma item={destacado} compacta className="mt-56" />}
    </div>
  );
}

export default function Firma({
  numero,
  destacado,
}: {
  numero: number;
  /** Ítem destacado del menú — el que la sección pone en primer plano. */
  destacado: MenuItem | null;
}) {
  const reducirMovimiento = useReducedMotion();
  const esAngosto = useEsAngosto();

  /* La preferencia de movimiento no existe en el servidor: si se ramifica en
   * el render, el HTML del SSR no coincide con el del cliente y React tira el
   * árbol. Se decide después del montaje, en un layout effect, para que el
   * cambio ocurra antes del primer pintado. */
  const [sinMovimiento, setSinMovimiento] = useState(false);
  useLayoutEffectSeguro(() => {
    if (reducirMovimiento) setSinMovimiento(true);
  }, [reducirMovimiento]);

  return (
    <section className="relative bg-noche">
      <PosterFirma
        numero={numero}
        destacado={destacado}
        animado={!sinMovimiento && !esAngosto}
      />
      <FirmaApilada
        numero={numero}
        destacado={destacado}
        animado={!sinMovimiento}
      />
    </section>
  );
}
