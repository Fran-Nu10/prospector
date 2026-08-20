/**
 * PERMISOS DEL PANEL — quién puede entrar a qué.
 *
 * Vive en el dominio y no en la navegación por una razón concreta: ocultar un
 * enlace NO es un permiso. El empleado que escribe la URL a mano tiene que
 * chocar contra la misma regla que le esconde el botón, y esa regla tiene que
 * estar en un solo lugar para que no se puedan contradecir.
 *
 * En modo demo el rol vive en el navegador y cualquiera con la consola abierta
 * puede cambiarlo (ver `sesion.ts`): esto NO es seguridad, es la estructura de
 * autorización correcta esperando a que Supabase Auth la haga cumplir de
 * verdad. Cuando eso pase, se reemplaza `leerSesion` y este archivo no cambia.
 */

import type { AdminRole } from "./types";
import type { SesionAdmin } from "./sesion";

export type AreaPanel = "pedidos" | "productos" | "configuracion";

/**
 * Qué ve cada rol.
 *
 * El empleado opera: toma pedidos, los mueve, cobra. No toca el catálogo ni la
 * configuración, porque un precio o una zona mal cargados en medio de un
 * servicio los paga el negocio.
 */
export const AREAS_POR_ROL: Record<AdminRole, readonly AreaPanel[]> = {
  owner: ["pedidos", "productos", "configuracion"],
  employee: ["pedidos"],
};

export interface DescripcionArea {
  area: AreaPanel;
  titulo: string;
  /** Ruta relativa dentro del panel. `""` es la portada, que son los pedidos. */
  sufijo: string;
}

export const AREAS: readonly DescripcionArea[] = [
  { area: "pedidos", titulo: "Pedidos", sufijo: "" },
  { area: "productos", titulo: "Productos", sufijo: "/productos" },
  { area: "configuracion", titulo: "Configuración", sufijo: "/configuracion" },
];

export function rutaDeArea(slug: string, area: AreaPanel): string {
  const encontrada = AREAS.find((a) => a.area === area);
  return `/${slug}/admin${encontrada?.sufijo ?? ""}`;
}

/** ¿Este rol entra a esta área? */
export function rolPuede(role: AdminRole, area: AreaPanel): boolean {
  return AREAS_POR_ROL[role].includes(area);
}

/**
 * ¿Esta sesión entra a esta área? Sin sesión, no: es la misma respuesta que
 * para un rol sin permiso, y quien pregunta decide si manda a entrar o a
 * decirle que no puede.
 */
export function sesionPuede(
  sesion: SesionAdmin | null,
  area: AreaPanel
): boolean {
  return sesion !== null && rolPuede(sesion.role, area);
}

/** Áreas visibles para una sesión, en el orden de la navegación. */
export function areasDeSesion(sesion: SesionAdmin | null): DescripcionArea[] {
  if (!sesion) return [];
  return AREAS.filter((a) => rolPuede(sesion.role, a.area));
}
