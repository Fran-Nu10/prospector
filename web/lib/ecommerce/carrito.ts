/**
 * CARRITO — estado del comprador, guardado en el navegador.
 *
 * Es deliberadamente OTRA cosa que la base demo: un carrito no es un dato del
 * negocio. No viaja a Supabase, no genera filas que nadie va a mirar y muere
 * con el dispositivo. Por eso tiene su propia clave, su propia versión y su
 * propio ciclo de vida (ver `docs/ECOMMERCE_SPEC.md` §10).
 *
 * QUÉ GUARDA Y QUÉ NO. Guarda estructura —qué producto, cuántos, con qué
 * opciones y qué aclaración— más un snapshot de PRESENTACIÓN para poder pintar
 * la línea al instante. El snapshot NO es autoridad: el precio bueno lo resuelve
 * `resolverCarrito` contra el catálogo vivo, y el snapshot solo sirve para
 * decirle a la persona "esto cambió de precio" en vez de cambiárselo callado.
 *
 * No usa React: es un store con `subscribe`/`getSnapshot` para que el
 * componente lo consuma con `useSyncExternalStore`. Así el estado del carrito
 * no vive dentro de un componente y sobrevive a cualquier remontaje.
 *
 * NOTA sobre la duplicación con `demo/database.ts`: las dos cosas guardan en
 * `localStorage` y las dos toleran basura, pero tienen versión, forma y ciclo de
 * vida distintos. Abstraer veinte líneas de `try/catch` detrás de un genérico
 * costaría más de lo que ahorra.
 */

import { SLUG_INSTALACION } from "./demo/seed";
import type { Cents, LineaCarrito } from "./types";

/** Subirla invalida los carritos guardados con la forma anterior. */
const VERSION = 1 as const;

export const CLAVE_CARRITO = `prospector:carrito:${SLUG_INSTALACION}:v${VERSION}`;

/** Techos duros, iguales a los del dominio: la UI no puede pasarse. */
const MAX_LINEAS = 50;
const MAX_UNIDADES = 99;

interface EstadoCarrito {
  version: typeof VERSION;
  items: LineaCarrito[];
}

const VACIO: EstadoCarrito = { version: VERSION, items: [] };

let cache: EstadoCarrito | null = null;
let escuchando = false;
const oyentes = new Set<() => void>();

function enNavegador(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/**
 * Identidad de la línea: mismo producto, mismas opciones y misma aclaración es
 * la MISMA línea (se suman cantidades). Cambiar cualquiera de las tres cosas
 * hace una línea nueva — dos hamburguesas, una sin cebolla, no son dos unidades
 * de lo mismo.
 */
export function idDeLinea(
  productId: string,
  optionIds: readonly string[],
  notes?: string
): string {
  const opciones = [...optionIds].sort().join("+");
  const nota = (notes ?? "").trim().toLowerCase();
  return `${productId}|${opciones}|${nota}`;
}

function esLineaValida(valor: unknown): valor is LineaCarrito {
  if (!valor || typeof valor !== "object") return false;
  const l = valor as Partial<LineaCarrito>;
  return (
    typeof l.lineId === "string" &&
    typeof l.productId === "string" &&
    typeof l.quantity === "number" &&
    l.quantity > 0 &&
    Array.isArray(l.optionIds) &&
    !!l.vista &&
    typeof l.vista.nombre === "string" &&
    typeof l.vista.precioUnitarioCents === "number"
  );
}

/**
 * Lee y SANEA. Una versión vieja, un JSON roto o una línea con forma ajena no
 * pueden dejar la página en blanco: en el peor caso el carrito arranca vacío,
 * que es un estado perfectamente usable.
 */
function leerDeAlmacenamiento(): EstadoCarrito {
  const crudo = window.localStorage.getItem(CLAVE_CARRITO);
  if (!crudo) return VACIO;
  try {
    const parseado = JSON.parse(crudo) as Partial<EstadoCarrito>;
    if (parseado?.version !== VERSION || !Array.isArray(parseado.items)) {
      console.warn("[carrito] versión o forma desconocida; se descarta.");
      return VACIO;
    }
    /* Se filtran las líneas rotas en vez de tirar el carrito entero: perder una
       línea corrupta es mejor que perder las seis. */
    const items = parseado.items.filter(esLineaValida).slice(0, MAX_LINEAS);
    if (items.length !== parseado.items.length) {
      console.warn("[carrito] se descartaron líneas con forma inválida.");
    }
    return { version: VERSION, items };
  } catch {
    console.warn("[carrito] contenido ilegible; se descarta.");
    return VACIO;
  }
}

function escuchar(): void {
  if (escuchando || !enNavegador()) return;
  escuchando = true;
  /* Otra pestaña tocó el carrito: se invalida y se avisa. */
  window.addEventListener("storage", (evento) => {
    if (evento.key !== CLAVE_CARRITO) return;
    cache = null;
    for (const o of oyentes) o();
  });
}

function guardar(estado: EstadoCarrito): void {
  cache = estado;
  if (enNavegador()) {
    try {
      window.localStorage.setItem(CLAVE_CARRITO, JSON.stringify(estado));
    } catch {
      /* Cuota o modo privado: el carrito sigue en memoria hasta cerrar. */
    }
  }
  for (const o of oyentes) o();
}

/** Estado actual. En servidor siempre vacío: no hay carrito que leer. */
export function leerCarrito(): EstadoCarrito {
  if (!enNavegador()) return VACIO;
  if (!cache) {
    escuchar();
    cache = leerDeAlmacenamiento();
  }
  return cache;
}

/** Snapshot estable para `useSyncExternalStore`. */
export function snapshotCarrito(): EstadoCarrito {
  return leerCarrito();
}

/** El servidor siempre renderiza el carrito vacío: no hay estado que conocer. */
export function snapshotCarritoServidor(): EstadoCarrito {
  return VACIO;
}

export function suscribirCarrito(oyente: () => void): () => void {
  oyentes.add(oyente);
  escuchar();
  return () => {
    oyentes.delete(oyente);
  };
}

/* ---------------------------------------------------------------------------
 * Acciones
 * ------------------------------------------------------------------------ */

export interface AgregarAlCarrito {
  productId: string;
  quantity: number;
  optionIds?: string[];
  notes?: string;
  /** Snapshot de presentación. NO es autoridad de precio. */
  vista: { nombre: string; precioUnitarioCents: Cents; imagenUrl?: string };
}

function acotar(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Agrega, o suma cantidad si la línea ya existía. */
export function agregarAlCarrito(entrada: AgregarAlCarrito): void {
  const estado = leerCarrito();
  const optionIds = entrada.optionIds ?? [];
  const lineId = idDeLinea(entrada.productId, optionIds, entrada.notes);
  const existente = estado.items.find((l) => l.lineId === lineId);

  if (existente) {
    guardar({
      ...estado,
      items: estado.items.map((l) =>
        l.lineId === lineId
          ? { ...l, quantity: acotar(l.quantity + entrada.quantity, 1, MAX_UNIDADES) }
          : l
      ),
    });
    return;
  }

  if (estado.items.length >= MAX_LINEAS) return;

  guardar({
    ...estado,
    items: [
      ...estado.items,
      {
        lineId,
        productId: entrada.productId,
        quantity: acotar(entrada.quantity, 1, MAX_UNIDADES),
        optionIds,
        notes: entrada.notes?.trim() || undefined,
        vista: entrada.vista,
        agregadoEn: new Date().toISOString(),
      },
    ],
  });
}

/** Cambia la cantidad. Cero o menos equivale a quitar la línea. */
export function cambiarCantidad(lineId: string, cantidad: number): void {
  if (cantidad <= 0) return quitarDelCarrito(lineId);
  const estado = leerCarrito();
  guardar({
    ...estado,
    items: estado.items.map((l) =>
      l.lineId === lineId ? { ...l, quantity: acotar(cantidad, 1, MAX_UNIDADES) } : l
    ),
  });
}

export function quitarDelCarrito(lineId: string): void {
  const estado = leerCarrito();
  guardar({ ...estado, items: estado.items.filter((l) => l.lineId !== lineId) });
}

export function vaciarCarrito(): void {
  guardar({ ...VACIO, items: [] });
}
