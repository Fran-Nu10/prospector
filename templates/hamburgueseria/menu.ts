import type { MenuItem, MenuSection } from "../../web/lib/schema";

/*
 * Lecturas del menú. Viven fuera de MenuSeccion.tsx porque la plantilla —que
 * es un componente de servidor— también las necesita: una función exportada
 * desde un módulo "use client" no se puede invocar desde el servidor.
 */

/**
 * Separa el ítem destacado del resto. El destacado es el primero con tag
 * "destacado": la jerarquía de la grilla la decide el JSON, no la plantilla.
 */
export function ordenarConDestacado(items: MenuItem[]): {
  destacado: MenuItem | null;
  resto: MenuItem[];
} {
  const i = items.findIndex((item) => item.tag === "destacado");
  if (i === -1) return { destacado: null, resto: items };
  return { destacado: items[i], resto: items.filter((_, j) => j !== i) };
}

/**
 * Ítem destacado de todo el menú. Lo usa también la firma: la sección
 * protagonista muestra el mismo producto que encabeza la grilla.
 */
export function itemDestacado(menu?: MenuSection[]): MenuItem | null {
  for (const section of menu ?? []) {
    const { destacado } = ordenarConDestacado(section.items);
    if (destacado) return destacado;
  }
  return null;
}

/**
 * Índice del producto que arranca activo en una sección: el destacado si lo
 * hay, y si no el primero. Lo decide el JSON, no la plantilla.
 */
export function indiceInicial(items: MenuItem[]): number {
  const i = items.findIndex((item) => item.tag === "destacado");
  return i === -1 ? 0 : i;
}

/**
 * Enlace de pedido para un producto concreto.
 *
 * Devuelve null si el prospecto no tiene WhatsApp cargado: sin número no se
 * renderiza ningún CTA. Inventar un teléfono o una URL de fallback sería
 * exactamente el tipo de dato falso que prohíbe el CLAUDE.md, y el menú sigue
 * funcionando como carta.
 */
export function hrefPedirProducto(
  whatsapp: string | undefined,
  nombre: string
): string | null {
  const numero = whatsapp?.replace(/\D/g, "");
  if (!numero) return null;
  const texto = encodeURIComponent(`Hola, quiero pedir: ${nombre}.`);
  return `https://wa.me/${numero}?text=${texto}`;
}
