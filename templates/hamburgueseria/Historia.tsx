"use client";

import type { ClientData } from "../../web/lib/schema";
import SeccionTitulo, { EtiquetaRotada } from "./SeccionTitulo";
import { RevelarBloque, RevelarLineas } from "./RevelarLineas";
import { delayStagger } from "./animacion";
import { esNocturno } from "./horarios";

/*
 * HISTORIA — la sección casi vacía.
 *
 * Es el respiro de la página: viene después del menú, que es la más densa, y
 * su trabajo es el silencio. Un titular enorme arriba a la izquierda, el
 * relato chico y desplazado abajo a la derecha, y nada más en el medio. Si se
 * llena, se rompe el ritmo de toda la página.
 *
 * El titular nocturno solo aparece si los horarios lo respaldan: afirmar que
 * el local abre cuando todo cierra es un dato del negocio, y el CLAUDE.md
 * prohíbe inventarlos.
 */

const TITULAR_NOCTURNO = { titulo: "Abrimos cuando todo", remate: "cierra." };
const TITULAR_NEUTRO = { titulo: "De dónde sale esta", remate: "burger." };

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

export default function Historia({
  data,
  numero,
}: {
  data: ClientData;
  numero: number;
}) {
  const titular = esNocturno(data.hours) ? TITULAR_NOCTURNO : TITULAR_NEUTRO;
  const anio = anioFundacion(data);
  const barrio = zona(data.address);
  const procedencia = [anio && `Est. ${anio}`, barrio, "MVD"]
    .filter(Boolean)
    .join(" — ");

  /* El año ya se lee en la línea de procedencia: no se repite en los datos. */
  const datos = data.highlights?.filter((h) => h.value !== anio) ?? [];

  return (
    <section className="bg-noche px-20 py-100 md:px-40 md:py-148">
      <div className="relative mx-auto max-w-[1360px]">
        <EtiquetaRotada
          numero={numero}
          texto="Historia"
          className="left-0 top-0 md:left-[-12px]"
        />

        <SeccionTitulo
          titulo={titular.titulo}
          remate={titular.remate}
          className="max-w-[1000px] pl-24 md:pl-0"
        />

        <div className="mt-64 flex justify-end md:mt-100">
          <div className="flex max-w-[400px] flex-col gap-24">
            {data.about && (
              <RevelarLineas
                enVista
                texto={data.about}
                retraso={0.2}
                paso={0.08}
                desplazamiento={18}
                className="text-body leading-[1.7] text-hueso"
              />
            )}
            <span className="font-mono text-body-sm uppercase tracking-[0.22em] text-rescoldo">
              {procedencia}
            </span>

            {/* Datos duros: van en mono y con hairlines, no en display. La
                sección tiene que seguir leyéndose vacía. */}
            {datos.length > 0 && (
              <dl className="flex flex-col">
                {datos.map((h, i) => (
                  <RevelarBloque
                    key={`${h.value}-${h.label}`}
                    enVista
                    retraso={delayStagger(i)}
                    className="flex items-baseline justify-between gap-16 border-t border-negro py-12 font-mono text-body-sm"
                  >
                    <dt className="uppercase tracking-[0.08em] text-rescoldo">
                      {h.label}
                    </dt>
                    <dd className="font-bold text-hueso">{h.value}</dd>
                  </RevelarBloque>
                ))}
              </dl>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
