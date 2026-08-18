"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import type { ClientData, Highlight } from "../../web/lib/schema";
import { EtiquetaSeccion } from "./SeccionTitulo";
import { esNocturno } from "./horarios";

/*
 * HISTORIA — manifiesto cinético.
 *
 * Sigue siendo el respiro de la página —viene después del menú, que es la más
 * densa— pero ya no es una lámina quieta con dos islas sueltas: el titular se
 * arma palabra por palabra con el scroll y una hairline nace junto a la
 * palabra en brasa y baja a buscar el relato. Esa línea es lo que convierte la
 * columna izquierda vacía en una decisión y no en un hueco.
 *
 * NO HAY PIN. Después del hero y de Plancha viva, un tercer track pineado
 * cansa. La sección vive en el flujo normal y lo único que lee del scroll es
 * su propio paso por el viewport.
 *
 * El titular nocturno solo aparece si los horarios lo respaldan: afirmar que
 * el local abre cuando todo cierra es un dato del negocio, y el CLAUDE.md
 * prohíbe inventarlos. La frase es vocabulario de la plantilla (como los
 * rótulos de sección); lo que NO se hardcodea es su despiece: las palabras se
 * tokenizan de la frase que toque, sean cuatro o nueve.
 */

const TITULAR_NOCTURNO = { titulo: "Abrimos cuando todo", remate: "cierra." };
const TITULAR_NEUTRO = { titulo: "De dónde sale esta", remate: "burger." };

/* ---------------------------------------------------------------------------
 * Coreografía — configuración recalibrable, en fracción del progreso.
 * ------------------------------------------------------------------------ */

export const COREOGRAFIA_HISTORIA = {
  /** Cuánto dura la subida de UNA palabra. */
  largoPalabra: 0.16,
  /** Stagger entre palabras. Se achica solo si el titular es largo. */
  pasoPalabra: 0.1,
  /** Techo del tramo que puede ocupar el titular entero. */
  tramoTitular: 0.34,
  hairline: [0.42, 0.62],
  relato: [0.52, 0.76],
  procedencia: [0.6, 0.82],
  datos: [0.66, 0.88],
  /** Stagger entre filas de datos, dentro de su tramo. */
  pasoDato: 0.06,
} as const;

/** Rango neutro: el motion value queda declarado pero no se mueve. */
const QUIETO: [number, number] = [0, 1];

const useLayoutEffectSeguro =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Ventana de la palabra `i` de `total`. El paso se comprime para que un
 * titular largo no empuje la última palabra fuera del tramo reservado.
 */
function ventanaPalabra(i: number, total: number): [number, number] {
  const { largoPalabra, pasoPalabra, tramoTitular } = COREOGRAFIA_HISTORIA;
  const paso =
    total > 1 ? Math.min(pasoPalabra, tramoTitular / (total - 1)) : 0;
  const inicio = i * paso;
  return [inicio, inicio + largoPalabra];
}

/**
 * Zona del local a partir de la dirección: "Av. Brasil 2500, Pocitos,
 * Montevideo" → "Pocitos". Si el último tramo es la ciudad, el barrio es el
 * anterior; si no, el último tramo ya es el barrio.
 */
function zona(address?: string): string | null {
  const partes = address?.split(",").map((p) => p.trim()).filter(Boolean);
  if (!partes?.length) return null;
  const ultimo = partes[partes.length - 1];
  if (/montevideo|uruguay/i.test(ultimo)) {
    return partes.length >= 2 ? partes[partes.length - 2] : null;
  }
  return ultimo;
}

/** Año de fundación, si el prospecto lo trae entre sus datos duros. */
function anioFundacion(data: ClientData): string | null {
  const dato = data.highlights?.find((h) => /^(19|20)\d{2}$/.test(h.value));
  return dato?.value ?? null;
}

/* ---------------------------------------------------------------------------
 * Piezas animadas
 * ------------------------------------------------------------------------ */

function Palabra({
  texto,
  indice,
  total,
  brasa,
  progreso,
  animado,
}: {
  texto: string;
  indice: number;
  total: number;
  /** Las palabras del remate van en brasa, como en el resto del póster. */
  brasa: boolean;
  progreso: MotionValue<number>;
  animado: boolean;
}) {
  const rango = animado ? ventanaPalabra(indice, total) : QUIETO;
  const y = useTransform(
    progreso,
    [...rango],
    animado ? ["110%", "0%"] : ["0%", "0%"]
  );

  return (
    /* La máscara solo existe cuando hay animación: sin movimiento no puede
       quedar un `overflow-hidden` recortando descendentes. El padding negativo
       le da aire al tipo sin mover el bloque de sitio. */
    <span
      className={`inline-block ${
        animado ? "overflow-hidden pb-[0.1em] -mb-[0.1em]" : ""
      }`}
    >
      <motion.span
        data-revelar=""
        className={`inline-block ${brasa ? "text-brasa" : ""}`}
        style={{ y }}
      >
        {texto}
      </motion.span>
    </span>
  );
}

function Dato({
  dato,
  indice,
  progreso,
  animado,
}: {
  dato: Highlight;
  indice: number;
  progreso: MotionValue<number>;
  animado: boolean;
}) {
  const [inicio, fin] = COREOGRAFIA_HISTORIA.datos;
  const desde = Math.min(fin - 0.1, inicio + indice * COREOGRAFIA_HISTORIA.pasoDato);
  const rango = animado ? [desde, Math.min(1, desde + 0.16)] : QUIETO;

  /* La divisoria crece; el par etiqueta/valor sube. Dos motion values, un solo
     reloj: nada mide nada por frame. */
  const escalaX = useTransform(progreso, [...rango], animado ? [0, 1] : [1, 1]);
  const opacidad = useTransform(progreso, [...rango], animado ? [0, 1] : [1, 1]);
  const y = useTransform(progreso, [...rango], animado ? [16, 0] : [0, 0]);

  return (
    <div className="flex flex-col">
      <motion.span
        aria-hidden
        data-revelar=""
        className="h-px w-full origin-left bg-negro"
        style={{ scaleX: escalaX }}
      />
      <motion.div
        data-revelar=""
        className="flex items-baseline justify-between gap-16 py-12 font-mono text-body-sm"
        style={{ opacity: opacidad, y }}
      >
        <dt className="uppercase tracking-[0.08em] text-rescoldo">
          {dato.label}
        </dt>
        <dd className="font-bold text-hueso">{dato.value}</dd>
      </motion.div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Sección
 * ------------------------------------------------------------------------ */

export default function Historia({
  data,
  numero,
}: {
  data: ClientData;
  numero: number;
}) {
  const reducirMovimiento = useReducedMotion();
  const [sinMovimiento, setSinMovimiento] = useState(false);
  useLayoutEffectSeguro(() => {
    if (reducirMovimiento) setSinMovimiento(true);
  }, [reducirMovimiento]);
  const animado = !sinMovimiento;

  /* Reloj único de la sección: entra por el pie de la pantalla y termina de
   * contarse antes de que la sección salga por arriba. */
  const seccionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: seccionRef,
    offset: ["start 0.9", "end 0.55"],
  });

  const titular = esNocturno(data.hours) ? TITULAR_NOCTURNO : TITULAR_NEUTRO;
  const frase = `${titular.titulo} ${titular.remate}`;
  const palabras = titular.titulo.split(/\s+/).filter(Boolean);
  const palabrasRemate = titular.remate.split(/\s+/).filter(Boolean);
  const todas = [...palabras, ...palabrasRemate];

  const anio = anioFundacion(data);
  const barrio = zona(data.address);
  const procedencia = [anio && `Est. ${anio}`, barrio, "MVD"]
    .filter(Boolean)
    .join(" — ");

  /* El año ya se lee en la línea de procedencia: no se repite en los datos. */
  const datos = data.highlights?.filter((h) => h.value !== anio) ?? [];

  const r = (rango: readonly number[]): number[] =>
    animado ? [...rango] : [...QUIETO];

  const escalaHairline = useTransform(
    scrollYProgress,
    r(COREOGRAFIA_HISTORIA.hairline),
    animado ? [0, 1] : [1, 1]
  );
  const opacidadRelato = useTransform(
    scrollYProgress,
    r(COREOGRAFIA_HISTORIA.relato),
    animado ? [0, 1] : [1, 1]
  );
  const yRelato = useTransform(
    scrollYProgress,
    r(COREOGRAFIA_HISTORIA.relato),
    animado ? [32, 0] : [0, 0]
  );
  const opacidadProcedencia = useTransform(
    scrollYProgress,
    r(COREOGRAFIA_HISTORIA.procedencia),
    animado ? [0, 1] : [1, 1]
  );
  const yProcedencia = useTransform(
    scrollYProgress,
    r(COREOGRAFIA_HISTORIA.procedencia),
    animado ? [20, 0] : [0, 0]
  );

  return (
    <section
      ref={seccionRef}
      className="bg-noche px-20 py-100 md:px-40 md:py-148"
    >
      {/* Sin JS los motion values quedan escritos en el HTML del servidor y el
          titular no llegaría nunca a su sitio. Esto lo devuelve a su estado
          final; con JS el bloque no existe. */}
      <noscript>
        <style>{`[data-revelar]{opacity:1!important;transform:none!important}`}</style>
      </noscript>

      <div className="mx-auto max-w-[1360px]">
        <EtiquetaSeccion numero={numero} texto="Historia" />

        {/* El heading se anuncia como frase completa: los spans que la parten
            en palabras son decorativos y no deben leerse de a una. */}
        <h2
          aria-label={frase}
          className="mt-24 flex flex-wrap items-baseline gap-x-[0.22em] font-display uppercase leading-heading tracking-display text-hueso text-[clamp(40px,8vw,103px)]"
        >
          {todas.map((palabra, i) => (
            <Palabra
              key={`${i}-${palabra}`}
              texto={palabra}
              indice={i}
              total={todas.length}
              brasa={i >= palabras.length}
              progreso={scrollYProgress}
              animado={animado}
            />
          ))}

          {/* La hairline nace pegada a la palabra en brasa y corre hasta el
              borde del bloque: es la que ata el titular con el relato. */}
          <motion.span
            aria-hidden
            data-revelar=""
            className="ml-[0.3em] mb-[0.28em] h-px min-w-[64px] flex-1 origin-left bg-rescoldo/40"
            style={{ scaleX: escalaHairline }}
          />
        </h2>

        {/* Titular y relato comparten grilla: el relato arranca en la mitad de
            la caja, no flotando contra el borde inferior derecho. */}
        <div className="mt-[clamp(48px,8vh,96px)] md:grid md:grid-cols-12 md:gap-x-24">
          <div className="flex flex-col gap-24 md:col-span-7 md:col-start-6">
            {data.about && (
              <motion.p
                data-revelar=""
                className="max-w-[46ch] text-body leading-[1.7] text-hueso"
                style={{ opacity: opacidadRelato, y: yRelato }}
              >
                {data.about}
              </motion.p>
            )}

            <motion.span
              data-revelar=""
              className="font-mono text-body-sm uppercase tracking-[0.22em] text-rescoldo"
              style={{ opacity: opacidadProcedencia, y: yProcedencia }}
            >
              {procedencia}
            </motion.span>

            {/* Datos duros: mono y hairlines, nunca display. La sección tiene
                que seguir leyéndose vacía. */}
            {datos.length > 0 && (
              <dl className="mt-16 flex flex-col">
                {datos.map((dato, i) => (
                  <Dato
                    key={`${dato.value}-${dato.label}`}
                    dato={dato}
                    indice={i}
                    progreso={scrollYProgress}
                    animado={animado}
                  />
                ))}
              </dl>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
