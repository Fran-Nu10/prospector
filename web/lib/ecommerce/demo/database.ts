/**
 * BASE DEMO — persistencia local, versionada y desechable.
 *
 * Guarda todo el ecommerce en `localStorage` para que la demo se pueda mostrar,
 * tocar y vender antes de que exista Supabase. Es deliberadamente un
 * ALMACENAMIENTO, no una base: no hay concurrencia, no hay usuarios y lo que se
 * guarda vive en un solo navegador.
 *
 * LO QUE HAY QUE SABER ANTES DE TOCAR ESTE ARCHIVO:
 *
 * · SSR PRIMERO. Este módulo se importa desde componentes de servidor. En el
 *   servidor no hay `window`, así que ninguna línea de nivel de módulo puede
 *   tocarlo: todo acceso está dentro de funciones y detrás de un guard. En el
 *   servidor se devuelve el SEED, de solo lectura, para que una página pueda
 *   renderizar el catálogo sin romperse.
 *
 * · EL SEED SE SIEMBRA UNA VEZ. Si la clave existe y es válida, se respeta. Un
 *   reseed en cada recarga borraría los cambios del dueño, que es exactamente
 *   lo que hace inservible una demo.
 *
 * · SI ESTÁ CORRUPTO, SE REGENERA. Un JSON roto o de otra versión no debe dejar
 *   la página en blanco: se avisa por consola y se vuelve al seed.
 *
 * · NOTIFICA CAMBIOS. `suscribirDemo` + `snapshotDemo` están hechos para
 *   `useSyncExternalStore`: la referencia del snapshot solo cambia cuando el
 *   contenido cambió, que es lo que React necesita para no repintar de más.
 */

import type {
  Category,
  DeliveryZone,
  Order,
  Product,
  RestaurantOperationalSettings,
} from "../types";
import { migrarBase, VERSIONES_MIGRABLES } from "./migraciones";
import { SLUG_INSTALACION, seedPorDefecto } from "./seed";

export interface DemoDatabase {
  version: typeof VERSION;
  categories: Category[];
  products: Product[];
  deliveryZones: DeliveryZone[];
  settings: RestaurantOperationalSettings;
  orders: Order[];
}

/**
 * Versión de la base.
 *
 * v1 → v2 (fase 5): categorías, productos y zonas suman `archived`; el pedido
 * suma `stockApplied`. Una v1 no tiene esos campos y se regenera.
 *
 * v2 → v3: assets normalizados del menú. NO se descarta nada: `migraciones.ts`
 * levanta la v2 guardada, completa las imágenes que faltaban y devuelve todo
 * lo demás igual. Un dueño que ya cargó pedidos y corrigió precios no puede
 * perderlos porque cambiaron unas fotos.
 */
const VERSION = 3 as const;

/**
 * Clave con espacio de nombres por instalación: dos demos abiertas en el mismo
 * navegador no pueden pisarse los pedidos.
 */
export const CLAVE_DEMO = `prospector:ecommerce:${SLUG_INSTALACION}:v${VERSION}`;

/**
 * Claves de versiones anteriores, de la más nueva a la más vieja.
 *
 * La versión va DENTRO de la clave, así que subirla esconde lo guardado en vez
 * de invalidarlo: sin buscar acá, una base perfectamente migrable quedaría
 * olvidada en `localStorage` y el navegador arrancaría de cero.
 */
const CLAVES_ANTERIORES = VERSIONES_MIGRABLES.slice()
  .sort((a, b) => b - a)
  .map((v) => `prospector:ecommerce:${SLUG_INSTALACION}:v${v}`);

let cache: DemoDatabase | null = null;
let semillaServidor: DemoDatabase | null = null;
let escuchandoOtrasPestanas = false;
let avisoDeEscrituraDado = false;
const oyentes = new Set<() => void>();

function enNavegador(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/** Validación mínima: alcanza para distinguir "mi base" de "cualquier cosa". */
function esBaseValida(valor: unknown): valor is DemoDatabase {
  if (!valor || typeof valor !== "object") return false;
  const db = valor as Partial<DemoDatabase>;
  return (
    db.version === VERSION &&
    Array.isArray(db.categories) &&
    Array.isArray(db.products) &&
    Array.isArray(db.deliveryZones) &&
    Array.isArray(db.orders) &&
    !!db.settings &&
    typeof db.settings === "object" &&
    typeof db.settings.timezone === "string" &&
    !!db.settings.paymentMethods
  );
}

function notificar(): void {
  for (const oyente of oyentes) oyente();
}

/**
 * Otra pestaña escribió: se tira la caché y se avisa. El `storage` event solo
 * llega a las pestañas que NO hicieron el cambio, así que no hay eco.
 */
function escucharOtrasPestanas(): void {
  if (escuchandoOtrasPestanas || !enNavegador()) return;
  escuchandoOtrasPestanas = true;
  window.addEventListener("storage", (evento) => {
    if (evento.key !== CLAVE_DEMO) return;
    cache = null;
    notificar();
  });
}

function persistir(db: DemoDatabase): void {
  try {
    window.localStorage.setItem(CLAVE_DEMO, JSON.stringify(db));
  } catch (error) {
    /* Cuota llena o almacenamiento bloqueado (modo privado). La demo sigue
       funcionando en memoria hasta que se cierre la pestaña: dejarla caer sería
       peor que perder la persistencia. */
    if (!avisoDeEscrituraDado) {
      avisoDeEscrituraDado = true;
      console.warn("[ecommerce demo] no se pudo escribir en localStorage", error);
    }
  }
}

/**
 * Lee la base. En el servidor devuelve el seed —siempre la misma referencia—
 * porque no hay almacenamiento que consultar.
 */
export function leerDb(): DemoDatabase {
  if (!enNavegador()) {
    if (!semillaServidor) semillaServidor = seedPorDefecto();
    return semillaServidor;
  }

  if (cache) return cache;
  escucharOtrasPestanas();

  const crudo = window.localStorage.getItem(CLAVE_DEMO);
  if (crudo) {
    try {
      const parseado: unknown = JSON.parse(crudo);
      if (esBaseValida(parseado)) {
        cache = parseado;
        return cache;
      }
      console.warn(
        "[ecommerce demo] el contenido guardado no tiene la forma esperada; se regenera desde el seed."
      );
    } catch {
      console.warn(
        "[ecommerce demo] el contenido guardado no es JSON válido; se regenera desde el seed."
      );
    }
  }

  /* Nada bajo la clave de esta versión: puede haber una base anterior. Se
     migra —conservando pedidos, precios y configuración— y se guarda bajo la
     clave nueva. La vieja se deja donde está: si algo saliera mal, el dato
     original sigue existiendo. */
  for (const clave of CLAVES_ANTERIORES) {
    const anterior = window.localStorage.getItem(clave);
    if (!anterior) continue;
    try {
      const migrada = migrarBase(JSON.parse(anterior) as unknown);
      if (migrada && esBaseValida(migrada)) {
        cache = migrada;
        persistir(cache);
        return cache;
      }
    } catch {
      console.warn(`[ecommerce demo] ${clave} ilegible; se ignora.`);
    }
  }

  /* Primera visita o contenido irrecuperable: se siembra UNA vez. */
  cache = seedPorDefecto();
  persistir(cache);
  return cache;
}

/**
 * Aplica una mutación y persiste. El mutador devuelve la base NUEVA: se escribe
 * sin mutar la anterior para que la referencia cambie solo cuando cambió algo.
 */
export function escribirDb(
  mutador: (db: DemoDatabase) => DemoDatabase
): DemoDatabase {
  const actual = leerDb();
  const siguiente = mutador(actual);
  cache = siguiente;
  if (enNavegador()) persistir(siguiente);
  notificar();
  return siguiente;
}

/** Snapshot para `useSyncExternalStore` en el cliente. */
export function snapshotDemo(): DemoDatabase {
  return leerDb();
}

/** Snapshot para `useSyncExternalStore` durante el render del servidor. */
export function snapshotServidor(): DemoDatabase {
  if (!semillaServidor) semillaServidor = seedPorDefecto();
  return semillaServidor;
}

/** Suscripción a cambios. Devuelve la baja. */
export function suscribirDemo(oyente: () => void): () => void {
  oyentes.add(oyente);
  escucharOtrasPestanas();
  return () => {
    oyentes.delete(oyente);
  };
}

/**
 * Vuelve al seed a propósito. Es una herramienta de desarrollo y de demo —
 * "dejámelo como estaba antes de que lo rompiéramos en la reunión"—, no una
 * operación que la UI deba ofrecer al dueño sin una confirmación clara.
 */
export function resetearDemo(): DemoDatabase {
  const fresca = seedPorDefecto();
  cache = fresca;
  if (enNavegador()) {
    try {
      window.localStorage.removeItem(CLAVE_DEMO);
    } catch {
      /* Si no se puede borrar, la escritura de abajo igual lo sobrescribe. */
    }
    persistir(fresca);
  }
  notificar();
  return fresca;
}
