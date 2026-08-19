"use client";

import { horaLocal, minutosDesde } from "../../../web/lib/ecommerce/domain";
import { formatearDinero } from "../../../web/lib/ecommerce/money";
import { numeroVisible } from "../../../web/lib/ecommerce/whatsapp";
import type { Order } from "../../../web/lib/ecommerce/types";
import { textoEstado } from "../ecommerce/copy";

/*
 * TARJETA — lo que se decide sin abrir el pedido.
 *
 * Todo lo que está acá existe porque alguien lo mira de reojo mientras cocina:
 * el número para cantarlo, la hora y el "hace cuánto" para saber si se está
 * enfriando, el total y si ya está cobrado.
 *
 * La dirección NO está: ocupa dos líneas, cambia la altura de todas las
 * tarjetas y solo hace falta cuando el pedido sale. Vive en el detalle.
 */

/** Pasados estos minutos sin confirmar, la tarjeta se marca. */
const MINUTOS_ALERTA = 15;

export default function TarjetaPedido({
  pedido,
  activo,
  onAbrir,
}: {
  pedido: Order;
  activo: boolean;
  onAbrir: () => void;
}) {
  const espera = minutosDesde(pedido.createdAt);
  const unidades = pedido.items.reduce((total, i) => total + i.quantity, 0);
  const cobrado = pedido.payment.status === "approved";
  const urgente =
    pedido.status === "pending_confirmation" && espera >= MINUTOS_ALERTA;

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={`Abrir pedido ${numeroVisible(pedido.orderNumber)} de ${pedido.customer.name}`}
      className={`flex w-full flex-col gap-12 border px-16 py-16 text-left hover:border-brasa ${
        activo ? "border-brasa bg-carbon" : "border-negro"
      }`}
    >
      <div className="flex items-baseline justify-between gap-12">
        <span className="font-mono text-body font-bold text-hueso">
          {numeroVisible(pedido.orderNumber)}
        </span>
        <span
          className={`font-mono text-caption uppercase tracking-[0.18em] ${
            urgente ? "text-brasa" : "text-rescoldo"
          }`}
        >
          {horaLocal(pedido.createdAt)} · hace {espera} min
        </span>
      </div>

      <div className="flex flex-col gap-4">
        <span className="truncate text-body-sm text-hueso">
          {pedido.customer.name}
        </span>
        <span className="font-mono text-caption uppercase tracking-[0.18em] text-rescoldo">
          {pedido.fulfillmentType === "delivery" ? "Delivery" : "Retiro"} ·{" "}
          {unidades} {unidades === 1 ? "producto" : "productos"}
        </span>
      </div>

      <div className="flex items-end justify-between gap-12 border-t border-negro pt-12">
        <span className="flex flex-col gap-4">
          <span className="font-mono text-caption uppercase tracking-[0.18em] text-queso">
            {textoEstado(pedido.status).titulo}
          </span>
          <span
            className={`font-mono text-caption uppercase tracking-[0.18em] ${
              cobrado ? "text-rescoldo" : "text-brasa"
            }`}
          >
            {cobrado ? "Cobrado" : "Sin cobrar"}
          </span>
        </span>
        <span className="font-mono text-subheading font-bold text-hueso">
          {formatearDinero(pedido.totalCents)}
        </span>
      </div>
    </button>
  );
}
