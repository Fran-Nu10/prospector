"use client";

import type { ClientData } from "../../web/lib/schema";
import { RevelarBloque } from "./RevelarLineas";
import { tamanoSangrado } from "./tipografia";

/*
 * FOOTER — cierre, no pie de página.
 *
 * Una fila de enlaces en cuerpo chico y, debajo, el nombre a tamaño de cartel
 * RECORTADO contra el borde inferior: la caja mide menos que el tipo, así que
 * las letras se cortan. Es deliberado — el mismo recurso del hero, cerrando
 * la página igual que la abrió.
 *
 * El tamaño sale de la cantidad de caracteres del nombre (ver tipografia.ts):
 * el recorte tiene que verse igual con "Ejemplo Burger" que con un nombre
 * mucho más largo.
 */

/** Proporción de la caja respecto del cuerpo del tipo: lo que queda a la vista. */
const RECORTE = 0.692;

function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-body-sm font-medium text-hueso hover:text-rescoldo"
    >
      {children}
    </a>
  );
}

export default function PieDePagina({
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
  const tamano = tamanoSangrado(data.name, 13);
  const anio = new Date().getFullYear();

  return (
    <footer className="bg-negro">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-baseline gap-x-32 gap-y-16 px-20 py-40 md:px-40">
        {data.instagram && (
          <Enlace
            href={`https://instagram.com/${data.instagram.replace(/^@/, "")}`}
          >
            Instagram
          </Enlace>
        )}
        {hrefPedido && <Enlace href={hrefPedido}>WhatsApp</Enlace>}
        {tieneMenu && <Enlace href="#menu">Menú</Enlace>}
        {tieneHorarios && <Enlace href="#horarios">Horarios</Enlace>}
        {data.mapsUrl && <Enlace href={data.mapsUrl}>Cómo llegar</Enlace>}
        <span className="ml-auto font-mono text-caption uppercase tracking-[0.14em] text-rescoldo">
          © {anio} {data.name} — Montevideo
        </span>
      </div>

      {/* El nombre recortado contra el borde. */}
      <RevelarBloque
        enVista
        desplazamiento={18}
        className="overflow-hidden"
        style={{ height: `calc(${RECORTE} * ${tamano})` }}
      >
        <span
          aria-hidden
          className="block whitespace-nowrap text-center font-display uppercase leading-heading tracking-display text-brasa"
          style={{ fontSize: tamano }}
        >
          {data.name}
        </span>
      </RevelarBloque>
    </footer>
  );
}
