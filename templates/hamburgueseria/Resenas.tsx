"use client";

import type { Review } from "../../web/lib/schema";
import CardViva from "./CardViva";
import SeccionTitulo from "./SeccionTitulo";
import { RevelarBloque } from "./RevelarLineas";

/*
 * Sección RESEÑAS — prueba social.
 *
 * ⚠ IMPORTANTE (regla del CLAUDE.md: "No inventar reseñas ni datos falsos del
 * negocio"): las reseñas de `data/prospects/_ejemplo.json` son DATOS DE EJEMPLO
 * para poder ver el diseño. Antes de mandarle la demo a un prospecto hay que
 * REEMPLAZARLAS por reseñas reales (Google Maps, Instagram, o pasadas por el
 * dueño). Si no hay reseñas reales, se borra el campo `reviews` del JSON y la
 * sección desaparece sola — es preferible a mostrar testimonios inventados.
 *
 * El encabezado (rating + cantidad) sí es dato REAL: lo trae el scraper de la
 * API de Google Places y vive en `_meta.rating` / `_meta.reviewCount`.
 */

/** Estrellas en queso — el ámbar solo aparece en comida y en momentos de valor. */
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

export default function Resenas({
  reviews,
  rating,
  reviewCount,
}: {
  reviews: Review[];
  /** Dato real de Google (`_meta.rating`). */
  rating?: number;
  /** Dato real de Google (`_meta.reviewCount`). */
  reviewCount?: number;
}) {
  /* Coma decimal: es una web uruguaya, "4,6" y no "4.6". */
  const ratingTexto = rating?.toFixed(1).replace(".", ",");

  return (
    <section className="py-80 md:py-100">
      <div className="mx-auto max-w-[1280px] px-20">
        <SeccionTitulo eyebrow="Lo que dicen" titulo="La gente que ya vino" />

        {rating != null && (
          <RevelarBloque enVista retraso={0.32} className="mt-32">
            <p className="flex flex-wrap items-center gap-x-16 gap-y-8">
              <span className="font-display leading-heading text-queso text-[clamp(40px,5vw,64px)]">
                {ratingTexto}
              </span>
              <Estrellas
                valor={rating}
                etiqueta={`${ratingTexto} de 5 en Google`}
              />
              {reviewCount != null && (
                <span className="font-mono text-body-sm uppercase tracking-[0.18em] text-rescoldo">
                  {reviewCount} reseñas en Google
                </span>
              )}
            </p>
          </RevelarBloque>
        )}

        <ul className="mt-40 grid gap-16 md:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r, i) => (
            <CardViva key={`${r.author}-${i}`} as="li" indice={i} className="h-full">
              <figure className="flex h-full flex-col p-24">
                {r.rating != null && (
                  <Estrellas valor={r.rating} etiqueta={`${r.rating} de 5`} />
                )}
                <blockquote className="mt-16 text-body leading-body text-hueso">
                  {r.text}
                </blockquote>
                <figcaption className="mt-24 flex flex-wrap items-baseline gap-x-12 pt-8 font-mono text-body-sm text-rescoldo">
                  <span className="font-bold uppercase tracking-[0.08em]">
                    {r.author}
                  </span>
                  {r.date && <span className="text-caption">{r.date}</span>}
                </figcaption>
              </figure>
            </CardViva>
          ))}
        </ul>
      </div>
    </section>
  );
}
