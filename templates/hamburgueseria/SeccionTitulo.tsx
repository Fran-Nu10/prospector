"use client";

import { RevelarBloque, RevelarLineas } from "./RevelarLineas";
import { numeral } from "./tipografia";

/*
 * Apertura de sección — el mayor lever de consistencia de la página.
 *
 * Lenguaje de cartel de calle: la sección se anuncia con su numeral y su
 * nombre en mono, una regla hairline negra que cruza hasta el borde del
 * bloque, y recién después el titular en Anton. El numeral NO está
 * hardcodeado: lo calcula la plantilla según qué secciones trajo el JSON, así
 * una demo sin galería no saltea un número.
 *
 * La escala del título es la que pide el DESIGN.md ("Anton a 103px+ en hero y
 * aperturas de sección"). Los títulos largos parten en dos líneas y el reveal
 * las escalona — por eso `leading-heading` (0.95) es innegociable, con menos
 * las líneas se montan.
 */

/* Cascada: la etiqueta abre, el título entra detrás, el sub cierra. */
const RETRASO_TITULO = 0.1;
const RETRASO_SUB = 0.26;

const CLASE_TITULAR =
  "font-display uppercase leading-heading tracking-[0.03em] text-hueso text-[clamp(48px,8vw,103px)]";

/** Etiqueta de sección: "03 — MENÚ" en mono, con o sin regla. */
export function EtiquetaSeccion({
  numero,
  texto,
  regla = false,
  className = "",
}: {
  numero?: number;
  texto: string;
  /** Hairline negra que corre desde la etiqueta hasta el borde del bloque. */
  regla?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-16 ${className}`}>
      <span className="font-mono text-body-sm uppercase tracking-[0.22em] text-rescoldo">
        {numero != null && `${numeral(numero)} — `}
        {texto}
      </span>
      {regla && <span aria-hidden className="h-px flex-1 bg-negro" />}
    </div>
  );
}

/**
 * Etiqueta rotada 90° contra el margen izquierdo. Vocabulario de póster: el
 * dato se lee de costado y le deja todo el ancho al titular.
 *
 * Va dentro de un contenedor `relative`; el `origin-top-left` hace que rote
 * hacia abajo sin salirse del margen.
 */
export function EtiquetaRotada({
  numero,
  texto,
  className = "",
}: {
  numero?: number;
  texto: string;
  className?: string;
}) {
  return (
    <span
      className={`absolute origin-top-left rotate-90 whitespace-nowrap font-mono text-[12px] uppercase tracking-[0.22em] text-rescoldo ${className}`}
    >
      {numero != null && `${numeral(numero)} — `}
      {texto}
    </span>
  );
}

export default function SeccionTitulo({
  numero,
  eyebrow,
  titulo,
  remate,
  sub,
  regla = true,
  sangrado = false,
  className = "",
}: {
  /** Posición de la sección en la página; la calcula Template.tsx. */
  numero?: number;
  /** Nombre de la sección en mono (ej. "MENÚ"). */
  eyebrow?: string;
  /** Título en Anton. */
  titulo: string;
  /** Remate en brasa que cierra el titular, en la misma línea de texto. */
  remate?: string;
  /** Bajada opcional en cuerpo. */
  sub?: string;
  /** Hairline negra al lado de la etiqueta. */
  regla?: boolean;
  /** El titular sangra hacia afuera del ancho de contenido. */
  sangrado?: boolean;
  className?: string;
}) {
  const retrasoTitulo = eyebrow ? RETRASO_TITULO : 0;
  const claseTitular = `${CLASE_TITULAR} ${
    sangrado ? "ml-[-12px] md:ml-[-48px]" : ""
  }`;

  return (
    <div className={className}>
      {eyebrow && (
        <EtiquetaSeccion
          numero={numero}
          texto={eyebrow}
          regla={regla}
          className="mb-24"
        />
      )}
      {/* Con remate el titular entra como bloque y no línea por línea: el
          reveal por líneas necesita un único nodo de texto, y el remate rojo
          tiene que quedar EN LA MISMA línea que la última palabra. */}
      {remate ? (
        <RevelarBloque enVista retraso={retrasoTitulo} desplazamiento={18}>
          <h2 className={claseTitular}>
            {titulo} <span className="text-brasa">{remate}</span>
          </h2>
        </RevelarBloque>
      ) : (
        <RevelarLineas
          enVista
          as="h2"
          texto={titulo}
          retraso={retrasoTitulo}
          desplazamiento={18}
          className={claseTitular}
        />
      )}
      {sub && (
        <RevelarLineas
          enVista
          texto={sub}
          retraso={eyebrow ? RETRASO_SUB : RETRASO_TITULO}
          className="mt-24 max-w-[520px] text-body leading-body text-rescoldo"
        />
      )}
    </div>
  );
}
