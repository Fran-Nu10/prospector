import { enlacePedirProducto } from "../../web/lib/ecommerce/whatsapp";
import {
  vistaDeProducto,
  type FuenteCatalogo,
  type ProductoVista,
} from "../../web/lib/ecommerce/vistas";

/*
 * Lecturas del menú. Viven fuera de MenuSeccion.tsx porque la plantilla —que
 * es un componente de servidor— también las necesita: una función exportada
 * desde un módulo "use client" no se puede invocar desde el servidor.
 *
 * Las lecturas que ordenaban el `MenuItem` del JSON se eliminaron al pasar el
 * menú al catálogo: el orden y el destacado los decide ahora el catálogo, y
 * dejarlas vivas invitaba a que algo volviera a leer el JSON por su cuenta.
 */

/**
 * Enlace de pedido para un producto concreto.
 *
 * Delega en el único constructor de enlaces del sistema. Sigue devolviendo
 * `null` sin número: sin WhatsApp cargado no se renderiza ningún CTA, que es lo
 * que evita inventarle un teléfono al negocio.
 */
export function hrefPedirProducto(
  whatsapp: string | undefined,
  nombre: string
): string | null {
  return enlacePedirProducto(whatsapp, nombre);
}

/**
 * Producto que encabeza la página: el que trae el distintivo "destacado" y, si
 * no hay ninguno, el primero de la carta.
 *
 * Sale del MISMO catálogo que la vitrina —no de una segunda lectura del JSON—,
 * así el precio del hero no puede quedar desfasado del precio real.
 */
export function destacadoDeCatalogo(
  fuente: FuenteCatalogo
): ProductoVista | null {
  if (fuente.modo === "carta") {
    const items = fuente.secciones.flatMap((s) => s.items);
    return items.find((i) => i.badge === "destacado") ?? items[0] ?? null;
  }
  const activos = fuente.productos.filter((p) => p.active);
  const elegido =
    activos.find((p) => p.badge === "destacado") ?? activos[0] ?? null;
  return elegido ? vistaDeProducto(elegido, new Date(), fuente.timezone) : null;
}
