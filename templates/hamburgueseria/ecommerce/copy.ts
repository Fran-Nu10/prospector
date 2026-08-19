import type { MotivoLinea } from "../../../web/lib/ecommerce/domain";
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
  OPTIONS_CHANGED: "Cambiaron las opciones",
};

export function textoMotivo(
  motivo: MotivoNoComprable | MotivoLinea | undefined
): string | null {
  return motivo ? TEXTOS[motivo] : null;
}
