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
  carrito,
}: {
  data: ClientData;
  hrefPedido?: string;
  tieneMenu: boolean;
  tieneHorarios: boolean;
  /**
   * Acceso al pedido. Llega como nodo desde la plantilla —no lo importa la nav—
   * para que este componente siga siendo de servidor: el carrito es una isla
   * interactiva, la barra no tiene por qué serlo.
   */
  carrito?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 bg-negro">
      <nav className="mx-auto flex max-w-[1360px] items-center justify-between gap-24 px-20 py-16 md:px-40">
        <a
          href="#"
          className="whitespace-nowrap font-mono text-body-sm font-bold uppercase tracking-[0.18em] text-hueso"
        >
          {data.name}
        </a>
        <div className="flex items-center gap-12 sm:gap-24">
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
          {carrito}
          {hrefPedido && (
            /* Con carrito en la barra, el atajo de WhatsApp se repliega en
               mobile: los dos juntos parten el nombre del negocio en dos
               líneas. La acción no se pierde —sigue en el hero, en "Cómo
               pedir" y en el pie— y el carrito pasa a ser la primaria, que es
               lo que corresponde cuando la página vende. */
            <a
              href={hrefPedido}
              className={`whitespace-nowrap rounded-button bg-brasa px-16 py-8 text-body-sm font-bold text-hueso ${
                carrito ? "hidden sm:inline-block" : ""
              }`}
            >
              Pedir
            </a>
          )}
        </div>
      </nav>
    </header>
  );
}
