"use client";

import type { ClientData } from "../../web/lib/schema";
import { EtiquetaSeccion } from "./SeccionTitulo";
import { RevelarBloque } from "./RevelarLineas";
import { delayStagger } from "./animacion";
import { cierreMasTarde, formatearCierre } from "./horarios";

/*
 * HORARIOS Y UBICACIÓN — el cierre informativo, en clave de cartel.
 *
 * El contraste de escala es el recurso: la hora de cierre a 160px contra la
 * tabla en mono de 18px. Ese número NO está escrito en ninguna parte del
 * JSON — sale de los horarios cargados (ver horarios.ts), así que una demo
 * que cierra a las 23:00 dice 11 PM sola.
 *
 * La tabla son hairlines negras y nada más: sin cards, sin fondos. Es un
 * ticket de plancha.
 */

export default function Horarios({
  data,
  numero,
  hrefPedido,
}: {
  data: ClientData;
  numero: number;
  hrefPedido?: string;
}) {
  const cierre = cierreMasTarde(data.hours);
  const hours = data.hours ?? [];

  return (
    <section
      id="horarios"
      className="scroll-mt-64 border-t border-negro bg-noche px-20 py-100 md:px-40 md:py-148"
    >
      <div className="mx-auto grid max-w-[1360px] gap-64 md:grid-cols-2 md:gap-80">
        <div className="flex flex-col items-start gap-24">
          <EtiquetaSeccion numero={numero} texto="Horarios y ubicación" />

          <h2 className="font-display uppercase leading-heading tracking-[0.03em] text-hueso text-[clamp(48px,8vw,103px)]">
            {cierre !== null ? (
              <>
                Hasta las
                <br />
                <span className="text-brasa text-[clamp(64px,13vw,160px)]">
                  {formatearCierre(cierre)}
                </span>
              </>
            ) : (
              "Cuándo y dónde"
            )}
          </h2>

          {data.address && (
            <span className="font-mono text-body-sm uppercase tracking-[0.08em] text-rescoldo">
              {data.address}
            </span>
          )}

          <div className="flex flex-wrap items-center gap-24">
            {hrefPedido && (
              <a
                href={hrefPedido}
                className="inline-block rounded-button border border-negro bg-brasa px-32 py-16 text-body font-bold text-hueso"
              >
                Pedir por WhatsApp
              </a>
            )}
            {data.mapsUrl && (
              <a
                href={data.mapsUrl}
                className="text-body font-medium text-rescoldo underline underline-offset-4 hover:text-hueso"
              >
                Cómo llegar
              </a>
            )}
          </div>

          {(data.phone || data.instagram) && (
            <div className="flex flex-wrap items-center gap-x-24 gap-y-8 font-mono text-body-sm text-rescoldo">
              {data.phone && <span>{data.phone}</span>}
              {data.instagram && (
                <a
                  href={`https://instagram.com/${data.instagram.replace(/^@/, "")}`}
                  className="underline underline-offset-4 hover:text-hueso"
                >
                  {data.instagram}
                </a>
              )}
            </div>
          )}
        </div>

        {hours.length > 0 && (
          <dl className="flex flex-col md:mt-40">
            {hours.map((h, i) => (
              <RevelarBloque
                key={h.day}
                enVista
                retraso={delayStagger(i)}
                className="flex items-baseline justify-between gap-16 border-t border-negro py-20 font-mono text-body text-hueso last:border-b last:border-negro"
              >
                <dt className="uppercase tracking-[0.08em]">{h.day}</dt>
                <dd className="text-rescoldo">{h.open}</dd>
              </RevelarBloque>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
