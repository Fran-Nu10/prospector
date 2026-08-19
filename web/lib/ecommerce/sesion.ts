/**
 * SESIÓN DEL PANEL — de demostración, y se dice.
 *
 * NO ES AUTENTICACIÓN. No hay usuarios, ni contraseñas, ni verificación: es un
 * rol guardado en el navegador para poder probar el circuito operativo antes de
 * que exista Supabase Auth. Cualquiera que abra la consola puede cambiarlo.
 *
 * Existe como MÓDULO PROPIO justamente por eso: el día que entre Auth de verdad
 * se reemplaza la implementación de estas cuatro funciones y ninguna pantalla
 * del panel se entera, porque ninguna lee `localStorage` por su cuenta.
 *
 * Tiene versión, fecha de creación y vencimiento —no porque proteja algo, sino
 * para que una demo abierta hace tres semanas no siga "logueada" y engañe a
 * quien la mira.
 */

import { SLUG_INSTALACION } from "./demo/seed";
import type { AdminRole, IsoDate } from "./types";

const VERSION = 1 as const;

export const CLAVE_SESION = `prospector:panel:${SLUG_INSTALACION}:v${VERSION}`;

/** Doce horas: un turno largo. Después hay que volver a entrar. */
const DURACION_MS = 12 * 60 * 60 * 1000;

export interface SesionAdmin {
  role: AdminRole;
  creadaEn: IsoDate;
  expiraEn: IsoDate;
}

interface SesionGuardada extends SesionAdmin {
  version: typeof VERSION;
}

let cache: SesionAdmin | null | undefined;
let escuchando = false;
const oyentes = new Set<() => void>();

function enNavegador(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function avisar(): void {
  for (const o of oyentes) o();
}

function escuchar(): void {
  if (escuchando || !enNavegador()) return;
  escuchando = true;
  /* Cerrar sesión en una pestaña cierra en todas. */
  window.addEventListener("storage", (evento) => {
    if (evento.key !== CLAVE_SESION) return;
    cache = undefined;
    avisar();
  });
}

function esSesionValida(valor: unknown): valor is SesionGuardada {
  if (!valor || typeof valor !== "object") return false;
  const s = valor as Partial<SesionGuardada>;
  return (
    s.version === VERSION &&
    (s.role === "owner" || s.role === "employee") &&
    typeof s.expiraEn === "string"
  );
}

/**
 * Sesión vigente, o `null` si no hay, está vencida o el contenido es ajeno.
 * Una sesión vencida se borra al leerla: no queda basura esperando.
 */
export function leerSesion(): SesionAdmin | null {
  if (!enNavegador()) return null;
  if (cache !== undefined) return cache;
  escuchar();

  const crudo = window.localStorage.getItem(CLAVE_SESION);
  if (!crudo) {
    cache = null;
    return null;
  }
  try {
    const guardada: unknown = JSON.parse(crudo);
    if (!esSesionValida(guardada)) {
      console.warn("[panel] sesión con forma desconocida; se descarta.");
      cerrarSesion();
      return null;
    }
    if (new Date(guardada.expiraEn).getTime() <= Date.now()) {
      cerrarSesion();
      return null;
    }
    cache = {
      role: guardada.role,
      creadaEn: guardada.creadaEn,
      expiraEn: guardada.expiraEn,
    };
    return cache;
  } catch {
    console.warn("[panel] sesión ilegible; se descarta.");
    cerrarSesion();
    return null;
  }
}

export function iniciarSesion(role: AdminRole): SesionAdmin {
  const ahora = new Date();
  const sesion: SesionAdmin = {
    role,
    creadaEn: ahora.toISOString(),
    expiraEn: new Date(ahora.getTime() + DURACION_MS).toISOString(),
  };
  cache = sesion;
  if (enNavegador()) {
    try {
      const dato: SesionGuardada = { version: VERSION, ...sesion };
      window.localStorage.setItem(CLAVE_SESION, JSON.stringify(dato));
    } catch {
      /* Sin almacenamiento la sesión dura lo que dura la pestaña. */
    }
  }
  avisar();
  return sesion;
}

export function cerrarSesion(): void {
  cache = null;
  if (enNavegador()) {
    try {
      window.localStorage.removeItem(CLAVE_SESION);
    } catch {
      /* Nada que hacer: la caché ya quedó en null. */
    }
  }
  avisar();
}

/* --- Lecturas para React --------------------------------------------------
 * `useSyncExternalStore` exige que el snapshot sea estable: por eso la caché
 * guarda el MISMO objeto hasta que algo cambie de verdad.
 * ---------------------------------------------------------------------- */

export function snapshotSesion(): SesionAdmin | null {
  return leerSesion();
}

/** En el servidor nunca hay sesión: el panel se resuelve en el cliente. */
export function snapshotSesionServidor(): SesionAdmin | null {
  return null;
}

export function suscribirSesion(oyente: () => void): () => void {
  oyentes.add(oyente);
  escuchar();
  return () => {
    oyentes.delete(oyente);
  };
}
