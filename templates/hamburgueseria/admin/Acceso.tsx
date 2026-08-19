"use client";

import { useEffect } from "react";
import type { AdminRole } from "../../../web/lib/ecommerce/types";
import { usePanel } from "./PanelProvider";

/*
 * ACCESO — dos botones y una advertencia grande.
 *
 * No hay usuarios, ni emails, ni contraseñas: inventarlos sería exactamente el
 * tipo de dato falso que el proyecto prohíbe, y un formulario de login que no
 * verifica nada es peor que decir la verdad. Se elige un rol y se entra.
 *
 * Cuando exista Supabase Auth, esta pantalla se reemplaza entera y el resto del
 * panel no cambia: nadie más lee la sesión directamente.
 */

const ROLES: { rol: AdminRole; titulo: string; detalle: string }[] = [
  {
    rol: "owner",
    titulo: "Entrar como dueño",
    detalle: "Ve todo: pedidos, totales del día y configuración.",
  },
  {
    rol: "employee",
    titulo: "Entrar como empleado",
    detalle: "Opera pedidos. No ve totales ni configuración.",
  },
];

export default function Acceso({ slug }: { slug: string }) {
  const panel = usePanel();

  /* Con sesión abierta, esta pantalla no tiene nada que hacer. */
  useEffect(() => {
    if (panel?.sesionResuelta && panel.sesion) {
      window.location.replace(`/${slug}/admin`);
    }
  }, [panel?.sesionResuelta, panel?.sesion, slug]);

  if (!panel) return null;

  return (
    <div className="mx-auto flex min-h-[70svh] w-full max-w-[520px] flex-col justify-center gap-32 py-64">
      <div className="flex flex-col gap-12">
        <span className="font-mono text-caption uppercase tracking-[0.22em] text-queso">
          Panel del local
        </span>
        <h1 className="font-display uppercase leading-heading tracking-display text-hueso text-[clamp(36px,9vw,64px)]">
          Pedidos
        </h1>
        <p className="border-l-2 border-brasa pl-12 text-body-sm leading-body text-rescoldo">
          <strong className="text-hueso">
            Acceso de demostración — no es autenticación real.
          </strong>{" "}
          No hay usuarios ni contraseñas: se elige un rol para probar el
          circuito. Los pedidos y los cambios se guardan únicamente en este
          navegador.
        </p>
      </div>

      <div className="flex flex-col gap-12">
        {ROLES.map(({ rol, titulo, detalle }) => (
          <button
            key={rol}
            type="button"
            onClick={() => {
              panel.entrar(rol);
              window.location.assign(`/${slug}/admin`);
            }}
            className="flex min-h-[72px] flex-col items-start justify-center gap-4 border border-negro px-20 py-16 text-left hover:border-brasa"
          >
            <span className="text-body font-bold text-hueso">{titulo}</span>
            <span className="text-body-sm text-rescoldo">{detalle}</span>
          </button>
        ))}
      </div>

      <a
        href={`/${slug}`}
        className="min-h-[44px] font-mono text-caption uppercase tracking-[0.18em] text-rescoldo underline underline-offset-4 hover:text-hueso"
      >
        Volver a la tienda
      </a>
    </div>
  );
}
