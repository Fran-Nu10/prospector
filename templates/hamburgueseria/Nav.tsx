import type { ClientData } from "../../web/lib/schema";

/*
 * NAV — barra negra sólida, el ancla visual de la página (ver DESIGN.md).
 *
 * No está en el mock del rediseño, pero es lo único que sostiene la
 * navegación mientras el resto de la página sangra: se mantiene, plana y
 * mínima, para que el hero siga abriendo limpio debajo.
 */

export default function Nav({
  data,
  hrefPedido,
  tieneMenu,
  tieneHorarios,
}: {
  data: ClientData;
  hrefPedido?: string;
  tieneMenu: boolean;
  tieneHorarios: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 bg-negro">
      <nav className="mx-auto flex max-w-[1360px] items-center justify-between gap-24 px-20 py-16 md:px-40">
        <a
          href="#"
          className="font-mono text-body-sm font-bold uppercase tracking-[0.18em] text-hueso"
        >
          {data.name}
        </a>
        <div className="flex items-center gap-24">
          {tieneMenu && (
            <a
              href="#menu"
              className="text-body-sm font-medium text-hueso hover:text-rescoldo"
            >
              Menú
            </a>
          )}
          {tieneHorarios && (
            <a
              href="#horarios"
              className="hidden text-body-sm font-medium text-hueso hover:text-rescoldo sm:block"
            >
              Horarios
            </a>
          )}
          {hrefPedido && (
            <a
              href={hrefPedido}
              className="rounded-button bg-brasa px-16 py-8 text-body-sm font-bold text-hueso"
            >
              Pedir
            </a>
          )}
        </div>
      </nav>
    </header>
  );
}
