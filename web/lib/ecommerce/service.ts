/**
 * PUNTO ÚNICO DE ACCESO AL ECOMMERCE.
 *
 * Todo lo que necesite datos —una página, un componente, más adelante un Route
 * Handler— pide los repositorios acá y nunca sabe quién los implementa:
 *
 *     const { catalog } = obtenerEcommerce();
 *     const productos = await catalog.listProducts();
 *
 * Cambiar de demo a Supabase es cambiar ESTE archivo (y agregar el proveedor):
 * ningún componente se entera, porque todos hablan contra `repositories.ts`.
 *
 * Es a propósito una fábrica de cuatro líneas y no un contenedor de inyección
 * de dependencias: hay un proveedor por instalación, elegido en build.
 */

import { crearRepositoriosDemo } from "./demo/repositories";
import type { EcommerceRepositories } from "./repositories";

/** Proveedores posibles. `supabase` se suma en la fase de conexión. */
export type ProveedorEcommerce = "demo";

/** El de esta instalación. Hoy solo hay uno. */
export const PROVEEDOR: ProveedorEcommerce = "demo";

let repositorios: EcommerceRepositories | null = null;

/**
 * Devuelve los repositorios de la instalación. Se memoiza porque el proveedor
 * demo mantiene caché de lectura: crear uno nuevo por llamada la tiraría.
 */
export function obtenerEcommerce(): EcommerceRepositories {
  if (!repositorios) repositorios = crearRepositoriosDemo();
  return repositorios;
}

/**
 * Reemplaza el proveedor. Existe para dos cosas concretas: enchufar Supabase
 * cuando llegue, y poder correr las verificaciones contra una implementación
 * controlada. No es un mecanismo para que la UI elija backend en runtime.
 */
export function usarProveedor(repos: EcommerceRepositories): void {
  repositorios = repos;
}

export type { EcommerceRepositories } from "./repositories";
