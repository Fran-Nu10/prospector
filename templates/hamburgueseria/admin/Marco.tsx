"use client";

import { useEffect } from "react";
import {
  areasDeSesion,
  rutaDeArea,
  type AreaPanel,
} from "../../../web/lib/ecommerce/permisos";
import { usePanel } from "./PanelProvider";

/*
 * MARCO DEL PANEL — la cáscara común de las tres pantallas.
 *
 * Hace cuatro cosas, y las hace UNA vez para todas:
 *
 * · CONTROLA EL ACCESO. Sin sesión manda al acceso; con sesión pero sin permiso
 *   muestra que no se puede entrar. La comprobación no es "esconder el enlace":
 *   quien escribe la URL a mano llega hasta acá y no pasa. La regla la contesta
 *   `permisos.ts`, que es lo que mañana va a hacer cumplir Supabase.
 *
 * · DIBUJA LA NAVEGACIÓN con las áreas que ese rol tiene. El empleado no ve
 *   pestañas que no puede abrir.
 *
 * · DICE QUE ESTO ES UNA DEMO. Adentro del panel, donde trabaja el local. En la
 *   tienda pública, nunca: el cliente que compra no tiene por qué leerlo.
 *
 * · MUESTRA EL ERROR de la última acción, arriba y con `role="alert"`.
 */

export default function Marco({
  slug,
  area,
  titulo,
  acciones,
  children,
}: {
  slug: string;
  area: AreaPanel;
  titulo: string;
  /** Contenido a la derecha del encabezado: totales, botón de alta, etc. */
  acciones?: React.ReactNode;
  children: React.ReactNode;
}) {
  const panel = usePanel();

  /* Sesión ausente o vencida: al panel no se entra. Corre en el cliente porque
     la sesión vive en el navegador, y espera a `sesionResuelta` para no rebotar
     contra el acceso durante la hidratación. */
  useEffect(() => {
    if (panel?.sesionResuelta && panel.sesion === null) {
      window.location.replace(`/${slug}/admin/login`);
    }
  }, [panel?.sesionResuelta, panel?.sesion, slug]);

  if (!panel?.sesion) return null;

  const permitido = panel.puede(area);
  const esDueño = panel.sesion.role === "owner";

  return (
    <div className="flex flex-col gap-24">
      <header className="flex flex-wrap items-end justify-between gap-16">
        <div className="flex flex-col gap-4">
          <span className="font-mono text-caption uppercase tracking-[0.22em] text-queso">
            {esDueño ? "Dueño" : "Empleado"}
          </span>
          <h1 className="font-display uppercase leading-heading tracking-display text-hueso text-[clamp(32px,7vw,56px)]">
            {permitido ? titulo : "Sin acceso"}
          </h1>
        </div>
        <div className="flex items-center gap-16">
          {permitido && acciones}
          <button
            type="button"
            onClick={() => {
              panel.salir();
              window.location.assign(`/${slug}/admin/login`);
            }}
            className="min-h-[44px] font-mono text-caption uppercase tracking-[0.18em] text-rescoldo underline underline-offset-4 hover:text-hueso"
          >
            Salir
          </button>
        </div>
      </header>

      <nav
        aria-label="Secciones del panel"
        className="-mx-20 flex gap-8 overflow-x-auto px-20 md:mx-0 md:px-0"
      >
        {areasDeSesion(panel.sesion).map((a) => {
          const activa = a.area === area && permitido;
          return (
            <a
              key={a.area}
              href={rutaDeArea(slug, a.area)}
              aria-current={activa ? "page" : undefined}
              className={`inline-flex min-h-[44px] shrink-0 items-center border px-16 font-mono text-caption uppercase tracking-[0.18em] ${
                activa
                  ? "border-brasa bg-carbon text-hueso"
                  : "border-negro text-rescoldo hover:text-hueso"
              }`}
            >
              {a.titulo}
            </a>
          );
        })}
      </nav>

      {/* El aviso es del PANEL, no de la tienda: quien opera tiene que saber
          dónde está parado; el cliente que compra, no. */}
      <p className="border-l-2 border-queso pl-12 text-body-sm leading-body text-rescoldo">
        <strong className="text-hueso">Modo demostración.</strong> Los pedidos y
        cambios se guardan únicamente en este navegador.
      </p>

      {panel.error && (
        <p
          role="alert"
          className="border-l-2 border-brasa pl-12 text-body-sm text-rescoldo"
        >
          {panel.error}
        </p>
      )}

      {permitido ? (
        children
      ) : (
        <div
          data-acceso-denegado
          className="flex flex-col items-start gap-12 py-64"
        >
          <p className="font-display uppercase leading-heading tracking-display text-hueso text-[clamp(24px,6vw,36px)]">
            Esta sección es del dueño
          </p>
          <p className="max-w-[52ch] text-body-sm leading-body text-rescoldo">
            Tu sesión entró como empleado y solo trabaja con los pedidos. Para
            administrar el catálogo o la configuración hay que entrar como
            dueño.
          </p>
          <a
            href={rutaDeArea(slug, "pedidos")}
            className="inline-flex min-h-[48px] items-center rounded-button bg-brasa px-32 text-body font-bold text-hueso"
          >
            Volver a pedidos
          </a>
        </div>
      )}
    </div>
  );
}
