"use client";

import { RevelarLineas } from "./RevelarLineas";

/*
 * Apertura de sección — el mayor lever de consistencia de la página.
 *
 * Antes cada sección abría distinto: el menú con un h2 Anton gigante, y
 * historia / galería / horarios con un eyebrow mono chiquito. A partir de acá
 * TODAS abren igual: eyebrow en mono brasa, título en Anton grande, sub
 * opcional en cuerpo — los tres entrando línea por línea, en cascada.
 *
 * La escala del título es la que pide el DESIGN.md ("Anton a 103px+ en hero y
 * aperturas de sección"): es el recurso gráfico del sistema, no un adorno.
 * Los títulos largos parten en dos líneas y el reveal las escalona — por eso
 * `leading-heading` (0.95) es innegociable, con menos las líneas se montan.
 */

/* Cascada: el eyebrow abre, el título entra detrás, el sub cierra. */
const RETRASO_TITULO = 0.1;
const RETRASO_SUB = 0.26;

export default function SeccionTitulo({
  eyebrow,
  titulo,
  sub,
  className = "",
}: {
  /** Kicker en mono brasa (ej. "La historia"). */
  eyebrow?: string;
  /** Título en Anton. */
  titulo: string;
  /** Bajada opcional en cuerpo. */
  sub?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {eyebrow && (
        <RevelarLineas
          enVista
          texto={eyebrow}
          className="font-mono text-body-sm uppercase tracking-[0.22em] text-brasa"
        />
      )}
      <RevelarLineas
        enVista
        as="h2"
        texto={titulo}
        retraso={eyebrow ? RETRASO_TITULO : 0}
        desplazamiento={18}
        className={`${eyebrow ? "mt-16" : ""} font-display uppercase leading-heading text-hueso text-[clamp(48px,8vw,103px)]`}
      />
      {sub && (
        <RevelarLineas
          enVista
          texto={sub}
          retraso={eyebrow ? RETRASO_SUB : RETRASO_TITULO}
          className="mt-16 max-w-[520px] text-body leading-body text-rescoldo"
        />
      )}
    </div>
  );
}
