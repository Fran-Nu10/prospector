/**
 * MIGRACIONES DE LA BASE DEMO.
 *
 * Hasta ahora, subir la versión de la base significaba TIRARLA: se detectaba
 * que lo guardado no era de esta versión y se volvía al seed. Para una demo
 * recién abierta da igual; para una que el dueño ya usó —con sus pedidos,
 * sus precios corregidos y sus productos nuevos— es perder su trabajo por un
 * cambio de assets. Este módulo existe para que eso no vuelva a pasar.
 *
 * REGLA DE ORO: la migración AGREGA, no reemplaza. Todo lo que la persona
 * escribió gana siempre. Lo único que se completa es lo que está vacío.
 *
 * Qué se conserva, sin excepción: pedidos, historial de estados, pagos,
 * categorías, zonas, configuración, productos creados desde el panel, precios
 * y textos editados. El carrito ni se toca: vive en otra clave.
 */

import type { Product } from "../types";
import type { DemoDatabase } from "./database";
import { seedPorDefecto } from "./seed";

/** Versiones anteriores que esta migración sabe leer. */
export const VERSIONES_MIGRABLES: readonly number[] = [2];

/**
 * Completa las imágenes que faltan usando las del seed actual.
 *
 * POR QUÉ SOLO LAS QUE FALTAN. Un producto del seed cuya foto el dueño cambió
 * desde el panel tiene una ruta que él eligió: pisarla con la del seed sería
 * deshacerle un cambio a sus espaldas. Un producto que nunca tuvo imagen —los
 * acompañamientos, que llegaron sin foto— o al que le falta el recorte de
 * vitrina —Bacon Fest— sí se completa: ahí no hay decisión de nadie que
 * respetar, hay un hueco.
 *
 * Los productos creados desde el panel no aparecen en el seed y no se tocan.
 */
export function completarImagenesDelSeed(
  productos: readonly Product[],
  semilla: DemoDatabase = seedPorDefecto()
): { productos: Product[]; completados: string[] } {
  const porId = new Map(semilla.products.map((p) => [p.id, p]));
  const porSlug = new Map(semilla.products.map((p) => [p.slug, p]));
  const completados: string[] = [];

  const vacia = (valor?: string) => !valor || !valor.trim();

  const productosNuevos = productos.map((producto) => {
    const original = porId.get(producto.id) ?? porSlug.get(producto.slug);
    if (!original) return producto;

    const imageUrl = vacia(producto.imageUrl) ? original.imageUrl : producto.imageUrl;
    const stageImageUrl = vacia(producto.stageImageUrl)
      ? original.stageImageUrl
      : producto.stageImageUrl;

    if (imageUrl === producto.imageUrl && stageImageUrl === producto.stageImageUrl) {
      return producto;
    }
    completados.push(producto.name);
    return { ...producto, imageUrl, stageImageUrl };
  });

  return { productos: productosNuevos, completados };
}

/**
 * Lleva una base guardada de v2 a v3.
 *
 * v3 no cambia la FORMA de nada: cambia lo que el seed sabe de las imágenes.
 * Por eso la migración es de contenido y no de estructura, y por eso alcanza
 * con completar los huecos.
 *
 * Devuelve `null` si lo guardado no es una v2 reconocible; ahí sí corresponde
 * volver al seed, porque no hay nada rescatable.
 */
export function migrarBase(guardada: unknown): DemoDatabase | null {
  if (!guardada || typeof guardada !== "object") return null;
  const base = guardada as Partial<DemoDatabase> & { version?: number };

  if (typeof base.version !== "number" || !VERSIONES_MIGRABLES.includes(base.version)) {
    return null;
  }
  if (
    !Array.isArray(base.products) ||
    !Array.isArray(base.categories) ||
    !Array.isArray(base.deliveryZones) ||
    !Array.isArray(base.orders) ||
    !base.settings
  ) {
    return null;
  }

  const { productos, completados } = completarImagenesDelSeed(base.products);
  if (completados.length && typeof console !== "undefined") {
    console.info(
      `[ecommerce demo] base v${base.version} → v3: se completaron las imágenes de ${completados.join(", ")}. ` +
        "Pedidos, precios y configuración quedaron intactos."
    );
  }

  return {
    ...(base as DemoDatabase),
    version: 3,
    products: productos,
  };
}
