"use client";

import type { OrderStep } from "../../web/lib/schema";
import { EtiquetaSeccion } from "./SeccionTitulo";
import { RevelarBloque, RevelarLineas } from "./RevelarLineas";
import { delayStagger } from "./animacion";

/*
 * CÓMO PEDIR — los pasos para cerrar el pedido.
 *
 * Tampoco está en el mock, pero es data del prospecto: se recompone en el
 * lenguaje del póster. Cada paso es una FILA a ancho completo separada por
 * una hairline negra, con el numeral gigante a la izquierda haciendo de
 * elemento gráfico —escala tipográfica como recurso, no íconos decorativos—
 * y el texto corrido a la derecha. Las cards desaparecen: acá el ritmo lo
 * marcan las reglas horizontales, igual que en la tabla de horarios.
 *
 * Los íconos son SVG escritos a mano: no se suma ninguna librería nueva por
 * cuatro glifos. `currentColor` para que hereden el color del contenedor.
 */

const ICONOS: Record<NonNullable<OrderStep["icon"]>, React.ReactNode> = {
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M20 12a8 8 0 0 1-11.9 6.9L4 20l1.1-4A8 8 0 1 1 20 12z" />
    </>
  ),
  entrega: (
    <>
      <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17.5" cy="18" r="2" />
    </>
  ),
  local: (
    <>
      <path d="M4 10 12 4l8 6v9H4z" />
      <path d="M10 19v-5h4v5" />
    </>
  ),
};

function Icono({ nombre }: { nombre: NonNullable<OrderStep["icon"]> }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-24 w-24 shrink-0"
    >
      {ICONOS[nombre]}
    </svg>
  );
}

function waHref(whatsapp: string) {
  return `https://wa.me/${whatsapp.replace(/\D/g, "")}`;
}

export default function ComoPedir({
  steps,
  note,
  whatsapp,
  numero,
}: {
  steps: OrderStep[];
  note?: string;
  whatsapp?: string;
  numero: number;
}) {
  return (
    <section className="bg-noche px-20 py-100 md:px-40">
      <div className="mx-auto max-w-[1360px]">
        <EtiquetaSeccion numero={numero} texto="Cómo pedir" regla />

        <ol className="mt-40 flex flex-col">
          {steps.map((paso, i) => (
            <li key={paso.title} className="border-t border-negro">
              <RevelarBloque
                enVista
                retraso={delayStagger(i)}
                className="grid items-baseline gap-x-40 gap-y-12 py-40 md:grid-cols-[160px_1fr_auto]"
              >
                {/* El numeral ES el gráfico. */}
                <span className="font-display leading-heading tracking-display text-brasa text-[clamp(48px,7vw,103px)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="max-w-[560px]">
                  <h3 className="font-display uppercase leading-heading tracking-display text-hueso text-[40px]">
                    {paso.title}
                  </h3>
                  {paso.description && (
                    <RevelarLineas
                      enVista
                      texto={paso.description}
                      retraso={delayStagger(i) + 0.08}
                      className="mt-12 text-body-sm leading-body text-rescoldo"
                    />
                  )}
                </div>
                {paso.icon && (
                  <span className="text-rescoldo md:justify-self-end">
                    <Icono nombre={paso.icon} />
                  </span>
                )}
              </RevelarBloque>
            </li>
          ))}
        </ol>

        {(whatsapp || note) && (
          <RevelarBloque
            enVista
            retraso={delayStagger(steps.length)}
            className="flex flex-wrap items-center gap-24 border-t border-negro pt-40"
          >
            {whatsapp && (
              <a
                href={waHref(whatsapp)}
                className="rounded-button border border-negro bg-brasa px-32 py-16 text-body font-bold text-hueso"
              >
                Pedir por WhatsApp
              </a>
            )}
            {note && (
              <p className="font-mono text-body-sm uppercase tracking-[0.08em] text-rescoldo">
                {note}
              </p>
            )}
          </RevelarBloque>
        )}
      </div>
    </section>
  );
}
