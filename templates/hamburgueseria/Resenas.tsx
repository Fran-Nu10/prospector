"use client";

import type { Review } from "../../web/lib/schema";
import { EtiquetaSeccion } from "./SeccionTitulo";
import { RevelarBloque, RevelarLineas } from "./RevelarLineas";
import { delayStagger } from "./animacion";

/*
 * RESEÑAS — prueba social, sin cards.
 *
 * No está en el mock del rediseño, pero es data del prospecto y no se tira:
 * se recompone con el mismo vocabulario que el resto del póster. Contraste de
 * escala brutal (el rating en Anton gigante contra el testimonio en cuerpo),
 * asimetría de dos columnas, y hairlines negras separando las entradas en
 * lugar de cajas. Cada reseña se corre un poco más a la derecha que la
 * anterior: la columna avanza en diagonal, no se lee como una lista.
 *
 * ⚠ IMPORTANTE (regla del CLAUDE.md: "No inventar reseñas ni datos falsos del
 * negocio"): las reseñas de `data/prospects/_ejemplo.json` son DATOS DE
 * EJEMPLO para poder ver el diseño. Antes de mandarle la demo a un prospecto
 * hay que REEMPLAZARLAS por reseñas reales (Google Maps, Instagram, o pasadas
 * por el dueño). Si no hay reseñas reales, se borra el campo `reviews` del
 * JSON y la sección desaparece sola — es preferible a mostrar testimonios
 * inventados.
 *
 * El encabezado (rating + cantidad) sí es dato REAL: lo trae el scraper de la
 * API de Google Places y vive en `_meta.rating` / `_meta.reviewCount`.
 */

/** Sangría creciente por reseña: la columna avanza en diagonal. */
const SANGRIA = ["lg:ml-0", "lg:ml-40", "lg:ml-80", "lg:ml-[120px]"];

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
  /* Coma decimal: es una web uruguaya, "4,6" y no "4.6". */
  const ratingTexto = rating?.toFixed(1).replace(".", ",");

  return (
    <section className="bg-noche px-20 py-100 md:px-40">
      <div className="mx-auto max-w-[1360px]">
        <EtiquetaSeccion numero={numero} texto="Reseñas" regla />

        <div className="mt-40 grid gap-56 lg:grid-cols-[5fr_7fr] lg:gap-80">
          {/* El número manda; el resto es letra chica. */}
          <div className="flex flex-col items-start gap-16">
            {ratingTexto && rating != null && (
              <>
                <RevelarBloque enVista desplazamiento={18}>
                  <span className="block font-display leading-heading tracking-display text-brasa text-[clamp(64px,10vw,160px)]">
                    {ratingTexto}
                  </span>
                </RevelarBloque>
                <Estrellas
                  valor={rating}
                  etiqueta={`${ratingTexto} de 5 en Google`}
                />
              </>
            )}
            {reviewCount != null && (
              <span className="font-mono text-body-sm uppercase tracking-[0.22em] text-rescoldo">
                {reviewCount} reseñas en Google
              </span>
            )}
          </div>

          <ul className="flex flex-col">
            {reviews.map((review, i) => (
              <li
                key={`${review.author}-${i}`}
                className={`border-t border-negro ${SANGRIA[i % SANGRIA.length]}`}
              >
                <RevelarBloque enVista retraso={delayStagger(i)} className="py-32">
                  <figure>
                    {review.rating != null && (
                      <Estrellas
                        valor={review.rating}
                        etiqueta={`${review.rating} de 5`}
                      />
                    )}
                    <blockquote className="mt-16 max-w-[560px]">
                      <RevelarLineas
                        enVista
                        texto={review.text}
                        retraso={delayStagger(i) + 0.08}
                        className="text-body leading-body text-hueso"
                      />
                    </blockquote>
                    <figcaption className="mt-16 flex flex-wrap items-baseline gap-x-16 font-mono text-body-sm uppercase tracking-[0.08em] text-rescoldo">
                      <span className="font-bold text-hueso">
                        {review.author}
                      </span>
                      {review.date && <span>{review.date}</span>}
                    </figcaption>
                  </figure>
                </RevelarBloque>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
