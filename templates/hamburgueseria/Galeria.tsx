"use client";

import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { EtiquetaSeccion } from "./SeccionTitulo";
import {
  FACTOR_PARALLAX_MOBILE,
  PARALLAX_GALERIA,
  OCULTO,
  VIEWPORT,
  VISIBLE,
  transicionCard,
} from "./animacion";
import { useEsAngosto, useMontado, useProgresoViewport } from "./scroll";

/*
 * GALERÍA — capas, no grilla.
 *
 * Un bloque de color plano sangra fuera del ancho de contenido y las fotos se
 * apoyan encima a distintas alturas y tamaños: la profundidad la dan la
 * superposición y el recorte, nunca una sombra. Las figuras van numeradas
 * como en una lámina, con su pie en mono.
 *
 * Las fotos entran de a tres —una "lámina"— y el bloque plano alterna de lado
 * en cada una, así una galería de nueve fotos no se lee como tres copias de
 * la misma composición. Una lámina incompleta simplemente deja los huecos:
 * el vacío es parte del diseño.
 *
 * En ≤1023px la lámina se deshace en una columna a ancho completo, con el pie
 * debajo de cada foto y el parallax reducido a un tercio.
 */

const ANCHO_LAMINA = 1360;
const ALTO_LAMINA = 920;

const pct = (px: number, base: number) => `${((px / base) * 100).toFixed(3)}%`;

/** Las tres posiciones de una lámina, en % de la caja 1360×920. */
const RANURAS = [
  { left: pct(40, ANCHO_LAMINA), top: "0%", width: "52%", height: "52.174%", pie: "53.913%" },
  { left: "62%", top: "8.696%", width: "36%", height: "60.870%", pie: "71.304%" },
  { left: "14%", top: "58.696%", width: "36%", height: "34.783%", pie: "95.217%" },
] as const;

/** Cada ranura viaja a un ritmo distinto: sin eso el parallax no se nota. */
const RITMO_PARALLAX = [1, -0.6, 0.35] as const;

function pie(indice: number): string {
  return `Fig. ${String(indice + 1).padStart(2, "0")}`;
}

function Foto({
  src,
  alt,
  y,
}: {
  src: string;
  alt: string;
  /* El motion value se aplica siempre: cuando no hay parallax su rango se
   * colapsa en 0, porque sacarlo del `style` no borra el transform que ya se
   * escribió en el elemento. */
  y: MotionValue<number>;
}) {
  return (
    <motion.img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="h-full w-full object-cover"
      style={{ y }}
    />
  );
}

function FiguraLamina({
  src,
  alt,
  indice,
  ranura,
  progreso,
  animado,
}: {
  src: string;
  alt: string;
  indice: number;
  ranura: number;
  progreso: MotionValue<number>;
  animado: boolean;
}) {
  const recorrido = PARALLAX_GALERIA * RITMO_PARALLAX[ranura];
  const y = useTransform(
    progreso,
    [0, 1],
    animado ? [recorrido, -recorrido] : [0, 0]
  );
  const { pie: topPie, ...caja } = RANURAS[ranura];

  return (
    <>
      {/* overflow-hidden: la foto se mueve DENTRO de su marco, el marco no.
          El sobrante va repartido arriba y abajo para que el recorrido no
          descubra un borde. */}
      <div className="absolute overflow-hidden" style={{ ...caja, zIndex: 2 }}>
        <div
          className="absolute inset-x-0"
          style={{
            top: -PARALLAX_GALERIA,
            height: `calc(100% + ${2 * PARALLAX_GALERIA}px)`,
          }}
        >
          <Foto src={src} alt={alt} y={y} />
        </div>
      </div>
      <span
        className="absolute font-mono text-[12px] uppercase text-rescoldo"
        style={{ left: caja.left, top: topPie, zIndex: 2 }}
      >
        {pie(indice)}
      </span>
    </>
  );
}

function Lamina({
  fotos,
  desde,
  nombre,
  invertida,
  animado,
}: {
  fotos: string[];
  /** Índice global de la primera foto, para numerar las figuras. */
  desde: number;
  nombre: string;
  /** El bloque plano sangra por la izquierda en vez de por la derecha. */
  invertida: boolean;
  animado: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const progreso = useProgresoViewport(ref, animado);

  return (
    <div
      ref={ref}
      className="relative mx-auto mt-64 hidden lg:block"
      style={{
        width: `min(${ANCHO_LAMINA}px, 100%)`,
        aspectRatio: `${ANCHO_LAMINA} / ${ALTO_LAMINA}`,
      }}
    >
      {/* Bloque plano sangrado: separa las fotos del fondo sin una sombra. */}
      <div
        aria-hidden
        className="absolute bg-carbon"
        style={{
          top: pct(120, ALTO_LAMINA),
          width: "58%",
          height: pct(640, ALTO_LAMINA),
          ...(invertida
            ? { left: pct(-80, ANCHO_LAMINA) }
            : { right: pct(-80, ANCHO_LAMINA) }),
        }}
      />
      {fotos.map((src, i) => (
        <FiguraLamina
          key={src}
          src={src}
          alt={`${nombre} — foto ${desde + i + 1}`}
          indice={desde + i}
          ranura={i}
          progreso={progreso}
          animado={animado}
        />
      ))}
    </div>
  );
}

function ColumnaMobile({
  gallery,
  nombre,
  animado,
  parallax,
}: {
  gallery: string[];
  nombre: string;
  /** Entrada de cada foto al viewport. */
  animado: boolean;
  /** El parallax solo se mide cuando esta variante es la visible. */
  parallax: boolean;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const progreso = useProgresoViewport(ref, parallax);
  const recorrido = PARALLAX_GALERIA * FACTOR_PARALLAX_MOBILE;
  const y = useTransform(
    progreso,
    [0, 1],
    parallax ? [recorrido, -recorrido] : [0, 0]
  );

  return (
    <ul ref={ref} className="mt-40 flex flex-col gap-40 px-20 lg:hidden">
      {gallery.map((src, i) => (
        <motion.li
          key={src}
          initial={OCULTO}
          whileInView={VISIBLE}
          viewport={VIEWPORT}
          transition={animado ? transicionCard(i) : { duration: 0 }}
          className="flex flex-col gap-12"
        >
          <div className="relative aspect-[4/3] overflow-hidden">
            <div
              className="absolute inset-x-0"
              style={{
                top: -recorrido,
                height: `calc(100% + ${2 * recorrido}px)`,
              }}
            >
              <Foto src={src} alt={`${nombre} — foto ${i + 1}`} y={y} />
            </div>
          </div>
          <span className="font-mono text-[12px] uppercase text-rescoldo">
            {pie(i)}
          </span>
        </motion.li>
      ))}
    </ul>
  );
}

export default function Galeria({
  gallery,
  nombre,
  numero,
}: {
  gallery: string[];
  /** Nombre del negocio, para el alt de cada foto. */
  nombre: string;
  numero: number;
}) {
  const esAngosto = useEsAngosto();
  const reducirMovimiento = useReducedMotion();
  /* Se decide tras el montaje para no ramificar el HTML del SSR. */
  const montado = useMontado();
  const sinMovimiento = montado && reducirMovimiento;

  const laminas: string[][] = [];
  for (let i = 0; i < gallery.length; i += RANURAS.length) {
    laminas.push(gallery.slice(i, i + RANURAS.length));
  }

  return (
    <section className="overflow-x-clip bg-noche pb-100 pt-100 md:pb-148">
      <EtiquetaSeccion
        numero={numero}
        texto="Galería"
        regla
        className="mx-auto max-w-[1360px] px-20 md:px-40"
      />

      {laminas.map((fotos, i) => (
        <Lamina
          key={fotos[0]}
          fotos={fotos}
          desde={i * RANURAS.length}
          nombre={nombre}
          invertida={i % 2 === 1}
          animado={!esAngosto && !sinMovimiento}
        />
      ))}

      <ColumnaMobile
        gallery={gallery}
        nombre={nombre}
        animado={!sinMovimiento}
        parallax={esAngosto && !sinMovimiento}
      />
    </section>
  );
}
