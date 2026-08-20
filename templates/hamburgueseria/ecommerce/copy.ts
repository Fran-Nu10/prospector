import type { MotivoLinea } from "../../../web/lib/ecommerce/domain";
import type {
  EcommerceErrorCode,
  OrderStatus,
} from "../../../web/lib/ecommerce/types";
import type { MotivoNoComprable } from "../../../web/lib/ecommerce/vistas";

/*
 * Los motivos por los que algo no se puede comprar son códigos del dominio
 * (`SOLD_OUT`, `INVALID_PRICE`…). Acá —y solo acá— se traducen a lo que lee una
 * persona. El JSX nunca escribe estos textos a mano: si el mismo estado se
 * llama distinto en el menú y en el carrito, la página se siente rota.
 *
 * `INVALID_PRICE` es un problema de datos, no del negocio: al comprador se le
 * dice que hay que consultarlo, y el diagnóstico técnico queda en el aviso del
 * seed, que sí nombra el código.
 */

const TEXTOS: Record<MotivoNoComprable | MotivoLinea, string> = {
  SIN_ECOMMERCE: "Pedilo por WhatsApp",
  INVALID_PRICE: "Consultar precio",
  INACTIVE: "No disponible",
  SOLD_OUT: "Agotado",
  OUT_OF_STOCK: "Sin stock",
  OUT_OF_HOURS: "Fuera de horario",
  NOT_FOUND: "Ya no está en la carta",
  ARCHIVED: "Ya no está en la carta",
  /* Al comprador no le importa que la culpa sea de la categoría: para él es
     una cosa que hoy no se puede pedir. El código distingue, el texto no. */
  CATEGORY_INACTIVE: "No disponible",
  OPTIONS_CHANGED: "Cambiaron las opciones",
};

export function textoMotivo(
  motivo: MotivoNoComprable | MotivoLinea | undefined
): string | null {
  return motivo ? TEXTOS[motivo] : null;
}

/**
 * Errores del dominio traducidos para el comprador.
 *
 * Nunca se le muestra el código ni el mensaje técnico: se le dice qué pasó y
 * qué puede hacer. Si aparece un código sin traducción, cae al mensaje del
 * dominio, que ya está escrito en español.
 */
const ERRORES: Partial<Record<EcommerceErrorCode, string>> = {
  STORE_CLOSED: "El local no está tomando pedidos en este momento.",
  EMPTY_ORDER: "Tu pedido está vacío.",
  ITEM_UNAVAILABLE:
    "Uno de los productos dejó de estar disponible. Revisá el carrito.",
  INVALID_OPTIONS: "Cambiaron las opciones de un producto. Revisá el carrito.",
  PRICE_CHANGED:
    "Cambió el precio de un producto mientras completabas el pedido. Revisá el total y confirmá de nuevo.",
  ZONE_UNAVAILABLE: "Esa zona de entrega ya no está disponible.",
  MIN_ORDER_NOT_MET: "El pedido no llega al mínimo de la zona.",
  FULFILLMENT_DISABLED: "Esa forma de entrega no está disponible.",
  PAYMENT_METHOD_DISABLED: "Ese método de pago todavía no está disponible.",
  NOT_FOUND: "No encontramos lo que buscabas.",
};

export function textoError(codigo: EcommerceErrorCode, respaldo: string): string {
  return ERRORES[codigo] ?? respaldo;
}

/**
 * Estado del pedido, contado como lo cuenta el local.
 *
 * `pending_confirmation` NO dice "confirmado": el pedido no está aceptado hasta
 * que alguien del local lo acepta a mano, y prometerlo antes es la forma más
 * rápida de quedar mal con un cliente.
 */
const ESTADOS: Record<OrderStatus, { titulo: string; detalle: string }> = {
  pending_confirmation: {
    titulo: "Pedido recibido",
    detalle: "Esperando confirmación del local.",
  },
  confirmed: {
    titulo: "Pedido confirmado",
    detalle: "El local lo aceptó y ya lo está preparando.",
  },
  preparing: { titulo: "En preparación", detalle: "Lo están cocinando." },
  ready: { titulo: "Pronto", detalle: "Ya está listo." },
  out_for_delivery: {
    titulo: "En camino",
    detalle: "Salió para tu dirección.",
  },
  ready_for_pickup: {
    titulo: "Listo para retirar",
    detalle: "Podés pasar a buscarlo.",
  },
  completed: { titulo: "Entregado", detalle: "Gracias por tu compra." },
  rejected: {
    titulo: "Pedido rechazado",
    detalle: "El local no pudo tomarlo.",
  },
  cancelled: { titulo: "Pedido cancelado", detalle: "Este pedido se canceló." },
};

export function textoEstado(estado: OrderStatus) {
  return ESTADOS[estado];
}
