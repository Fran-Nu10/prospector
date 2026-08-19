"use client";

import { useState } from "react";
import {
  accionesDisponibles,
  horaLocal,
} from "../../../web/lib/ecommerce/domain";
import { formatearDinero } from "../../../web/lib/ecommerce/money";
import {
  enlaceDelLocal,
  numeroVisible,
  type MensajeDelLocal,
} from "../../../web/lib/ecommerce/whatsapp";
import type { Order, OrderStatus } from "../../../web/lib/ecommerce/types";
import Hoja from "../ecommerce/Hoja";
import { textoEstado } from "../ecommerce/copy";
import { usePanel } from "./PanelProvider";

/*
 * DETALLE — todo lo que hace falta para cumplir el pedido y cerrarlo.
 *
 * Va en la misma hoja accesible que usa la tienda: panel lateral en desktop,
 * hoja inferior en mobile, con foco atrapado y Escape. Una ruta por pedido
 * habría obligado a resolver navegación, historial y estados de carga para
 * ganar exactamente nada.
 *
 * DOS COSAS QUE NO SE NEGOCIAN ACÁ:
 *
 * · LOS BOTONES SALEN DE LA MÁQUINA DE ESTADOS. `accionesDisponibles` decide
 *   qué se puede hacer; la pantalla no arma transiciones por su cuenta y no
 *   puede ofrecer "salió para entrega" en un pedido que se retira.
 *
 * · LO QUE SE MUESTRA ES EL SNAPSHOT DEL PEDIDO, nunca el producto vivo. Si el
 *   dueño cambió el precio hace diez minutos, la comanda sigue diciendo lo que
 *   el cliente compró.
 */

const MINUTOS_RAPIDOS = [15, 20, 25, 30, 40, 45];

const MOTIVOS = [
  "Producto agotado",
  "Local cerrado",
  "Fuera de zona",
  "No podemos tomar el pedido",
  "Otro",
];

/** Rótulo de cada acción. El vocabulario del local, no el del dominio. */
const ACCIONES: Partial<Record<OrderStatus, string>> = {
  confirmed: "Aceptar pedido",
  preparing: "Empezar a preparar",
  ready: "Marcar pronto",
  ready_for_pickup: "Listo para retirar",
  out_for_delivery: "Salió para entrega",
  completed: "Completar",
  rejected: "Rechazar",
  cancelled: "Cancelar",
};

function Fila({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-16 border-b border-negro py-8 text-body-sm">
      <dt className="shrink-0 text-rescoldo">{etiqueta}</dt>
      <dd className="text-right text-hueso">{valor}</dd>
    </div>
  );
}

function BotonWhatsapp({
  telefono,
  mensaje,
  rotulo,
}: {
  telefono: string;
  mensaje: MensajeDelLocal;
  rotulo: string;
}) {
  const href = enlaceDelLocal(telefono, mensaje);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-[44px] items-center justify-center border border-negro px-16 font-mono text-caption uppercase tracking-[0.18em] text-hueso hover:border-brasa"
    >
      {rotulo}
    </a>
  );
}

export default function DetallePedido({
  pedido,
  onCerrar,
}: {
  pedido: Order;
  onCerrar: () => void;
}) {
  const panel = usePanel();
  const [minutos, setMinutos] = useState<number | "">(25);
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [nota, setNota] = useState("");
  const [confirmando, setConfirmando] = useState<null | "rejected" | "cancelled">(
    null
  );
  const [avisoPago, setAvisoPago] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  if (!panel) return null;

  const acciones = accionesDisponibles(pedido);
  const cobrado = pedido.payment.status === "approved";
  const puedeAceptar = acciones.includes("confirmed");
  const salidas = acciones.filter((a) => a === "rejected" || a === "cancelled");
  /* `confirmed` NO entra acá: aceptar tiene su propio bloque porque exige un
     tiempo estimado. Ofrecerlo también como botón suelto llevaba a un rechazo
     del repositorio ("confirmar exige un tiempo estimado") sin explicación. */
  const avances = acciones.filter(
    (a) => a !== "rejected" && a !== "cancelled" && a !== "confirmed"
  );
  const telefono = pedido.customer.phone;

  const correr = async (fn: () => Promise<boolean>) => {
    setOcupado(true);
    const ok = await fn();
    setOcupado(false);
    return ok;
  };

  const aceptar = async () => {
    if (minutos === "" || minutos <= 0) return;
    await correr(() =>
      panel.cambiarEstado(pedido.id, "confirmed", { estimatedMinutes: minutos })
    );
  };

  const avanzar = async (destino: OrderStatus) => {
    /* Completar con el pago pendiente es un error operativo frecuente: se
       avisa y se ofrecen las dos salidas, en vez de decidir por el local. */
    if (destino === "completed" && !cobrado) {
      setAvisoPago(true);
      return;
    }
    const ok = await correr(() => panel.cambiarEstado(pedido.id, destino));
    if (ok && destino === "completed") onCerrar();
  };

  const cerrarConMotivo = async (destino: "rejected" | "cancelled") => {
    const razon = [motivo, nota.trim()].filter(Boolean).join(" — ");
    const ok = await correr(() =>
      panel.cambiarEstado(pedido.id, destino, { reason: razon })
    );
    if (ok) onCerrar();
  };

  return (
    <Hoja
      abierta
      onCerrar={onCerrar}
      titulo={`Pedido ${numeroVisible(pedido.orderNumber)}`}
    >
      <div className="flex flex-col gap-24">
        <header className="flex flex-col gap-8">
          <span className="font-mono text-caption uppercase tracking-[0.22em] text-queso">
            {textoEstado(pedido.status).titulo}
          </span>
          <span className="font-mono text-body-sm text-rescoldo">
            {horaLocal(pedido.createdAt)} ·{" "}
            {pedido.fulfillmentType === "delivery" ? "Delivery" : "Retiro"}
          </span>
          {pedido.estimatedMinutes !== undefined && (
            <span className="font-mono text-body-sm text-hueso">
              Estimado: {pedido.estimatedMinutes} minutos
            </span>
          )}
        </header>

        {panel.error && (
          <p role="alert" className="border-l-2 border-brasa pl-12 text-body-sm text-rescoldo">
            {panel.error}
          </p>
        )}

        {/* --- Comanda: el snapshot, no el catálogo vivo --- */}
        <section>
          <h3 className="mb-8 font-mono text-caption uppercase tracking-[0.22em] text-rescoldo">
            Comanda
          </h3>
          <ul role="list" className="flex flex-col">
            {pedido.items.map((item) => (
              <li key={item.id} className="border-b border-negro py-12">
                <div className="flex items-start justify-between gap-12">
                  <span className="font-mono text-body-sm uppercase tracking-[0.12em] text-hueso">
                    {item.quantity} × {item.productName}
                  </span>
                  <span className="shrink-0 font-mono text-body-sm text-hueso">
                    {formatearDinero(item.lineTotalCents)}
                  </span>
                </div>
                {item.options.length > 0 && (
                  <p className="mt-4 text-caption text-rescoldo">
                    {item.options.map((o) => `${o.groupName}: ${o.optionName}`).join(" · ")}
                  </p>
                )}
                {item.notes && (
                  <p className="mt-4 text-caption italic text-queso">“{item.notes}”</p>
                )}
              </li>
            ))}
          </ul>
          {pedido.notes && (
            <p className="mt-12 border-l-2 border-queso pl-12 text-body-sm italic text-queso">
              {pedido.notes}
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-8 font-mono text-caption uppercase tracking-[0.22em] text-rescoldo">
            Cliente y entrega
          </h3>
          <dl className="flex flex-col">
            <Fila etiqueta="Nombre" valor={pedido.customer.name} />
            <Fila etiqueta="Teléfono" valor={telefono} />
            {pedido.address ? (
              <>
                <Fila etiqueta="Zona" valor={pedido.address.zoneName} />
                <Fila etiqueta="Dirección" valor={pedido.address.address} />
                {pedido.address.reference && (
                  <Fila etiqueta="Referencias" valor={pedido.address.reference} />
                )}
              </>
            ) : (
              <Fila etiqueta="Modalidad" valor="Retira en el local" />
            )}
            <Fila etiqueta="Subtotal" valor={formatearDinero(pedido.subtotalCents)} />
            {pedido.fulfillmentType === "delivery" && (
              <Fila etiqueta="Envío" valor={formatearDinero(pedido.deliveryFeeCents)} />
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
                  {cobrado ? "Cobrado" : "Pendiente"}
                  {pedido.payment.paidAt && ` · ${horaLocal(pedido.payment.paidAt)}`}
                  {pedido.payment.markedByRole &&
                    ` · ${pedido.payment.markedByRole === "owner" ? "dueño" : "empleado"}`}
                </>
              }
            />
            {pedido.payment.cashReceivedCents !== undefined && (
              <>
                <Fila
                  etiqueta="Paga con"
                  valor={formatearDinero(pedido.payment.cashReceivedCents)}
                />
                <Fila
                  etiqueta="Cambio"
                  valor={formatearDinero(
                    Math.max(0, pedido.payment.cashReceivedCents - pedido.totalCents)
                  )}
                />
              </>
            )}
          </dl>
        </section>

        {/* --- Acciones --- */}
        {puedeAceptar && (
          <section className="flex flex-col gap-12 border-t border-negro pt-16">
            <h3 className="font-mono text-caption uppercase tracking-[0.22em] text-rescoldo">
              Tiempo estimado
            </h3>
            <div className="flex flex-wrap gap-8">
              {MINUTOS_RAPIDOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMinutos(m)}
                  aria-pressed={minutos === m}
                  className={`min-h-[44px] border px-16 font-mono text-body-sm ${
                    minutos === m
                      ? "border-brasa bg-carbon text-hueso"
                      : "border-negro text-rescoldo hover:text-hueso"
                  }`}
                >
                  {m} min
                </button>
              ))}
              <label className="sr-only" htmlFor="minutos-manual">
                Minutos estimados
              </label>
              <input
                id="minutos-manual"
                type="number"
                inputMode="numeric"
                min={1}
                max={240}
                value={minutos}
                onChange={(e) =>
                  setMinutos(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="min-h-[44px] w-[88px] border border-negro bg-carbon px-12 text-body-sm text-hueso"
              />
            </div>
            <button
              type="button"
              onClick={aceptar}
              disabled={ocupado || minutos === "" || minutos <= 0}
              className="inline-flex min-h-[48px] items-center justify-center rounded-button bg-brasa px-24 text-body font-bold text-hueso disabled:bg-carbon disabled:text-rescoldo"
            >
              Aceptar pedido
            </button>
          </section>
        )}

        {avances.length > 0 && (
          <section className="flex flex-col gap-12 border-t border-negro pt-16">
            <h3 className="font-mono text-caption uppercase tracking-[0.22em] text-rescoldo">
              Avanzar
            </h3>
            {avisoPago && (
              <div className="flex flex-col gap-8 border-l-2 border-queso pl-12">
                <p className="text-body-sm leading-body text-rescoldo">
                  Este pedido todavía figura sin cobrar.
                </p>
                <div className="flex flex-wrap gap-8">
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={async () => {
                      const ok = await correr(() => panel.cobrar(pedido.id));
                      if (!ok) return;
                      setAvisoPago(false);
                      const listo = await correr(() =>
                        panel.cambiarEstado(pedido.id, "completed")
                      );
                      if (listo) onCerrar();
                    }}
                    className="min-h-[44px] rounded-button bg-brasa px-16 text-body-sm font-bold text-hueso"
                  >
                    Cobrar y completar
                  </button>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={async () => {
                      setAvisoPago(false);
                      const ok = await correr(() =>
                        panel.cambiarEstado(pedido.id, "completed")
                      );
                      if (ok) onCerrar();
                    }}
                    className="min-h-[44px] border border-negro px-16 font-mono text-caption uppercase tracking-[0.18em] text-rescoldo hover:text-hueso"
                  >
                    Completar sin cobrar
                  </button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-8">
              {avances.map((destino) => (
                <button
                  key={destino}
                  type="button"
                  disabled={ocupado}
                  onClick={() => avanzar(destino)}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-button bg-brasa px-24 text-body font-bold text-hueso disabled:bg-carbon disabled:text-rescoldo"
                >
                  {ACCIONES[destino] ?? destino}
                </button>
              ))}
            </div>
          </section>
        )}

        {!cobrado && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => correr(() => panel.cobrar(pedido.id))}
            className="inline-flex min-h-[48px] items-center justify-center border border-negro px-24 text-body font-bold text-hueso hover:border-brasa"
          >
            Marcar como cobrado
          </button>
        )}

        {/* --- WhatsApp: siempre por acción explícita --- */}
        <section className="flex flex-col gap-8 border-t border-negro pt-16">
          <h3 className="font-mono text-caption uppercase tracking-[0.22em] text-rescoldo">
            Avisar al cliente
          </h3>
          {enlaceDelLocal(telefono, { tipo: "consulta", orderNumber: pedido.orderNumber }) ? (
            <div className="flex flex-wrap gap-8">
              {pedido.status === "confirmed" && pedido.estimatedMinutes !== undefined && (
                <BotonWhatsapp
                  telefono={telefono}
                  rotulo="Aceptado"
                  mensaje={{
                    tipo: "aceptado",
                    orderNumber: pedido.orderNumber,
                    minutos: pedido.estimatedMinutes,
                  }}
                />
              )}
              {pedido.status === "ready_for_pickup" && (
                <BotonWhatsapp
                  telefono={telefono}
                  rotulo="Listo para retirar"
                  mensaje={{ tipo: "listo_retiro", orderNumber: pedido.orderNumber }}
                />
              )}
              {pedido.status === "out_for_delivery" && (
                <BotonWhatsapp
                  telefono={telefono}
                  rotulo="En reparto"
                  mensaje={{ tipo: "en_reparto", orderNumber: pedido.orderNumber }}
                />
              )}
              {(pedido.status === "rejected" || pedido.status === "cancelled") && (
                <BotonWhatsapp
                  telefono={telefono}
                  rotulo="Aviso de rechazo"
                  mensaje={{ tipo: "rechazado", orderNumber: pedido.orderNumber }}
                />
              )}
              <BotonWhatsapp
                telefono={telefono}
                rotulo="Escribir"
                mensaje={{ tipo: "consulta", orderNumber: pedido.orderNumber }}
              />
            </div>
          ) : (
            <p className="text-body-sm text-rescoldo">
              El teléfono de este pedido no sirve para WhatsApp.
            </p>
          )}
        </section>

        {/* --- Rechazo y cancelación --- */}
        {salidas.length > 0 && (
          <section className="flex flex-col gap-12 border-t border-negro pt-16">
            {confirmando ? (
              <>
                <h3 className="font-mono text-caption uppercase tracking-[0.22em] text-brasa">
                  {confirmando === "rejected" ? "Rechazar pedido" : "Cancelar pedido"}
                </h3>
                <label className="sr-only" htmlFor="motivo">
                  Motivo
                </label>
                <select
                  id="motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="min-h-[48px] border border-negro bg-carbon px-16 text-body-sm text-hueso"
                >
                  {MOTIVOS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="nota-motivo">
                  Nota
                </label>
                <input
                  id="nota-motivo"
                  type="text"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Nota opcional"
                  className="min-h-[48px] border border-negro bg-carbon px-16 text-body-sm text-hueso"
                />
                <div className="flex flex-wrap gap-8">
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => cerrarConMotivo(confirmando)}
                    className="min-h-[48px] rounded-button bg-brasa px-24 text-body font-bold text-hueso"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmando(null)}
                    className="min-h-[48px] px-16 font-mono text-caption uppercase tracking-[0.18em] text-rescoldo underline underline-offset-4"
                  >
                    Volver
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap gap-8">
                {salidas.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setConfirmando(s as "rejected" | "cancelled")}
                    className="min-h-[44px] border border-negro px-16 font-mono text-caption uppercase tracking-[0.18em] text-rescoldo hover:border-brasa hover:text-hueso"
                  >
                    {ACCIONES[s] ?? s}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* --- Historial --- */}
        <section className="border-t border-negro pt-16">
          <h3 className="mb-8 font-mono text-caption uppercase tracking-[0.22em] text-rescoldo">
            Historial
          </h3>
          <ol role="list" className="flex flex-col gap-8">
            {pedido.statusHistory.map((evento) => (
              <li key={evento.id} className="flex flex-col gap-4 text-caption">
                <span className="font-mono uppercase tracking-[0.18em] text-hueso">
                  {horaLocal(evento.createdAt)} · {textoEstado(evento.to).titulo}
                  {evento.actorRole &&
                    ` · ${evento.actorRole === "owner" ? "dueño" : "empleado"}`}
                </span>
                {evento.reason && (
                  <span className="text-rescoldo">{evento.reason}</span>
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Hoja>
  );
}
