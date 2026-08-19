"use client";

import { useCallback, useEffect, useState } from "react";
import { formatearDinero } from "../../../web/lib/ecommerce/money";
import {
  obtenerEcommerce,
  suscribirEcommerce,
} from "../../../web/lib/ecommerce/service";
import type { Order } from "../../../web/lib/ecommerce/types";
import {
  enlaceConsultarPedido,
  numeroVisible,
} from "../../../web/lib/ecommerce/whatsapp";
import { textoEstado } from "./copy";

/*
 * PEDIDO — la página que la persona guarda después de comprar.
 *
 * Se recupera por `publicToken`: no hay cuenta, así que el enlace ES la
 * credencial. Por eso el token es un uuid no adivinable y no aparece en ningún
 * listado.
 *
 * MODO DEMO, dicho sin vueltas: el pedido vive en el navegador donde se creó.
 * Abrir el enlace en otro teléfono no lo encuentra, y la página lo explica en
 * vez de fingir que se perdió o que existe un servidor detrás.
 *
 * Se refresca sola cuando el repositorio avisa que algo cambió —incluida otra
 * pestaña—, así el día que el panel acepte un pedido, el cliente lo ve sin
 * recargar.
 */

function Fila({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-16 border-b border-negro py-12 text-body-sm">
      <dt className="text-rescoldo">{etiqueta}</dt>
      <dd className="text-right text-hueso">{valor}</dd>
    </div>
  );
}

export default function PedidoVista({
  token,
  slug,
  whatsapp,
}: {
  token: string;
  slug: string;
  /** Número del prospecto. Sin él no se renderiza el botón de consulta. */
  whatsapp?: string;
}) {
  const [pedido, setPedido] = useState<Order | null>(null);
  const [buscando, setBuscando] = useState(true);

  const buscar = useCallback(() => {
    obtenerEcommerce()
      .orders.getByPublicToken(token)
      .then((encontrado) => {
        setPedido(encontrado);
        setBuscando(false);
      })
      .catch(() => setBuscando(false));
  }, [token]);

  useEffect(() => {
    buscar();
    /* El proveedor avisa cuando cambia algo: con el demo, al escribir en esta
       pestaña o en otra; con Supabase, por Realtime. */
    return suscribirEcommerce(buscar);
  }, [buscar]);

  if (buscando) {
    return (
      <p className="py-100 text-center font-mono text-body-sm uppercase tracking-[0.22em] text-rescoldo">
        Buscando tu pedido…
      </p>
    );
  }

  if (!pedido) {
    return (
      <div className="flex flex-col items-start gap-16 py-64">
        <h1 className="font-display uppercase leading-heading tracking-display text-hueso text-[clamp(32px,8vw,56px)]">
          No encontramos este pedido
        </h1>
        <p className="max-w-[46ch] text-body-sm leading-body text-rescoldo">
          No encontramos este pedido en este dispositivo. Esta versión todavía
          funciona en modo demostración: los pedidos quedan guardados en el
          navegador donde se hicieron.
        </p>
        <a
          href={`/${slug}`}
          className="inline-flex min-h-[48px] items-center rounded-button bg-brasa px-32 text-body font-bold text-hueso"
        >
          Volver al inicio
        </a>
      </div>
    );
  }

  const estado = textoEstado(pedido.status);
  const numero = numeroVisible(pedido.orderNumber);
  /* El enlace lo arma el helper compartido: solo el número de pedido, nunca
     dirección ni total (la URL queda en el historial del teléfono). */
  const hrefWhatsapp = enlaceConsultarPedido(whatsapp, pedido.orderNumber);

  return (
    <div className="flex flex-col gap-32">
      <header className="flex flex-col gap-8">
        <span className="font-mono text-body-sm uppercase tracking-[0.22em] text-queso">
          {numero}
        </span>
        <h1 className="font-display uppercase leading-heading tracking-display text-hueso text-[clamp(36px,9vw,72px)]">
          {estado.titulo}
        </h1>
        <p aria-live="polite" className="text-body leading-body text-rescoldo">
          {estado.detalle}
        </p>
        {pedido.estimatedMinutes !== undefined && (
          <p className="font-mono text-body-sm text-hueso">
            Tiempo estimado: {pedido.estimatedMinutes} minutos
          </p>
        )}
        {pedido.rejectionReason && (
          <p className="border-l-2 border-brasa pl-12 text-body-sm leading-body text-rescoldo">
            {pedido.rejectionReason}
          </p>
        )}
      </header>

      <section className="flex flex-col">
        <h2 className="mb-8 font-mono text-caption uppercase tracking-[0.22em] text-rescoldo">
          Tu pedido
        </h2>
        <ul role="list" className="flex flex-col">
          {pedido.items.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-16 border-b border-negro py-12"
            >
              <span className="flex min-w-0 flex-col gap-4">
                <span className="font-mono text-body-sm uppercase tracking-[0.12em] text-hueso">
                  {item.quantity} × {item.productName}
                </span>
                {item.options.length > 0 && (
                  <span className="text-caption text-rescoldo">
                    {item.options.map((o) => o.optionName).join(" · ")}
                  </span>
                )}
                {item.notes && (
                  <span className="text-caption italic text-rescoldo">
                    “{item.notes}”
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-body-sm text-hueso">
                {formatearDinero(item.lineTotalCents)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-8 font-mono text-caption uppercase tracking-[0.22em] text-rescoldo">
          Detalle
        </h2>
        <dl className="flex flex-col">
          <Fila etiqueta="Subtotal" valor={formatearDinero(pedido.subtotalCents)} />
          {pedido.fulfillmentType === "delivery" ? (
            <Fila etiqueta="Envío" valor={formatearDinero(pedido.deliveryFeeCents)} />
          ) : (
            <Fila etiqueta="Retiro en el local" valor="Sin costo" />
          )}
          <Fila
            etiqueta="Total"
            valor={
              <span className="font-mono text-subheading font-bold">
                {formatearDinero(pedido.totalCents)}
              </span>
            }
          />
          <Fila
            etiqueta="Pago"
            valor={
              <>
                {pedido.fulfillmentType === "delivery"
                  ? "Efectivo al recibir"
                  : "Pago al retirar"}
                {pedido.payment.cashReceivedCents !== undefined && (
                  <>
                    {" · paga con "}
                    {formatearDinero(pedido.payment.cashReceivedCents)}
                  </>
                )}
              </>
            }
          />
          {pedido.address && (
            <Fila
              etiqueta="Entrega"
              valor={
                <>
                  {pedido.address.zoneName} · {pedido.address.address}
                  {pedido.address.reference && ` · ${pedido.address.reference}`}
                </>
              }
            />
          )}
          <Fila etiqueta="A nombre de" valor={pedido.customer.name} />
          <Fila etiqueta="Teléfono" valor={pedido.customer.phone} />
          {pedido.notes && <Fila etiqueta="Aclaración" valor={pedido.notes} />}
        </dl>
      </section>

      <div className="flex flex-col gap-12 sm:flex-row">
        <a
          href={`/${slug}`}
          className="inline-flex min-h-[48px] items-center justify-center rounded-button bg-brasa px-32 text-body font-bold text-hueso"
        >
          Volver al inicio
        </a>
        {hrefWhatsapp && (
          <a
            href={hrefWhatsapp}
            className="inline-flex min-h-[48px] items-center justify-center border border-negro px-32 text-body font-bold text-hueso hover:border-brasa"
          >
            Consultar por WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
