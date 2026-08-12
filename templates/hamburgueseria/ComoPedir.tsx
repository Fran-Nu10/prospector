"use client";

import type { OrderStep } from "../../web/lib/schema";
import CardViva from "./CardViva";
import SeccionTitulo from "./SeccionTitulo";
import { RevelarBloque } from "./RevelarLineas";
import { delayStagger } from "./animacion";

/*
 * Sección CÓMO PEDIR — los pasos para cerrar el pedido.
 *
 * El numeral gigante en Anton ES el elemento gráfico principal: escala
 * tipográfica como recurso, no íconos decorativos (el norte visual de
 * Impossible Foods usa el tipo del mismo modo). El ícono chico es apoyo.
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
      className="h-24 w-24"
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
}: {
  steps: OrderStep[];
  note?: string;
  whatsapp?: string;
}) {
  return (
    <section className="py-80 md:py-100">
      <div className="mx-auto max-w-[1280px] px-20">
        <SeccionTitulo
          eyebrow="Cómo pedir"
          titulo="Tres pasos y listo"
          sub="Sin apps, sin registro, sin vueltas."
        />

        <ol className="mt-40 grid gap-16 md:grid-cols-3">
          {steps.map((paso, i) => (
            <CardViva key={paso.title} as="li" indice={i} className="h-full">
              <div className="flex h-full flex-col p-24 md:p-32">
                <div className="flex items-center justify-between gap-16 text-brasa">
                  {/* El numeral es el gráfico: 01, 02, 03. */}
                  <span className="font-display leading-heading text-[clamp(48px,6vw,72px)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {paso.icon && <Icono nombre={paso.icon} />}
                </div>
                <h3 className="mt-16 text-subheading leading-subheading font-bold text-hueso">
                  {paso.title}
                </h3>
                {paso.description && (
                  <p className="mt-8 text-body-sm leading-body-sm text-rescoldo">
                    {paso.description}
                  </p>
                )}
              </div>
            </CardViva>
          ))}
        </ol>

        {(whatsapp || note) && (
          <RevelarBloque
            enVista
            retraso={delayStagger(steps.length)}
            className="mt-40 flex flex-wrap items-center gap-24"
          >
            {whatsapp && (
              <a
                href={waHref(whatsapp)}
                className="rounded-button bg-brasa px-32 py-16 text-body font-bold text-hueso"
              >
                Pedir por WhatsApp
              </a>
            )}
            {note && (
              <p className="font-mono text-body-sm text-rescoldo">{note}</p>
            )}
          </RevelarBloque>
        )}
      </div>
    </section>
  );
}
