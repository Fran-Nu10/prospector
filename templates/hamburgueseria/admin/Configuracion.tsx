"use client";

import { useEffect, useState } from "react";
import { deliveryDisponible } from "../../../web/lib/ecommerce/domain";
import { LIMITES } from "../../../web/lib/ecommerce/types";
import type { SettingsPatch } from "../../../web/lib/ecommerce/repositories";
import Marco from "./Marco";
import Zonas from "./Zonas";
import { AreaTexto, Interruptor } from "./campos";
import { usePanel } from "./PanelProvider";

/*
 * CONFIGURACIÓN OPERATIVA — lo mínimo que el local necesita decidir a diario.
 *
 * Los interruptores GUARDAN AL TOCARLOS. Son decisiones de una sola pregunta
 * que se toman con el local lleno ("cortá el delivery"): meterlas detrás de un
 * botón "guardar" es una forma de que alguien crea que apagó algo que quedó
 * encendido. El mensaje de pausa, que es texto que se escribe, sí tiene su
 * botón.
 *
 * NO HAY HORARIOS SEMANALES todavía: el JSON del prospecto tiene horarios en
 * prosa ("Lun a Jue 19:00 – 02:00"), pensados para el póster, y convertirlos en
 * franjas operativas sería decidir por el negocio a qué hora deja de vender.
 * Hasta que el dueño los cargue, la apertura la manda "aceptar pedidos".
 */

export default function Configuracion({ slug }: { slug: string }) {
  const panel = usePanel();
  const ajustes = panel?.catalogo.ajustes ?? null;

  const [mensaje, setMensaje] = useState("");
  const [mensajeTocado, setMensajeTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [confirmado, setConfirmado] = useState<string | null>(null);

  /* El texto guardado entra en el campo la primera vez y cada vez que cambia
     afuera, salvo que la persona lo esté editando: pisarle lo que está
     escribiendo porque otra pestaña guardó algo sería perderle el trabajo. */
  useEffect(() => {
    if (!mensajeTocado) setMensaje(ajustes?.closedMessage ?? "");
  }, [ajustes?.closedMessage, mensajeTocado]);

  useEffect(() => {
    if (!confirmado) return;
    const t = setTimeout(() => setConfirmado(null), 2500);
    return () => clearTimeout(t);
  }, [confirmado]);

  if (!panel) return null;

  const aplicar = async (patch: SettingsPatch, texto: string) => {
    const resultado = await panel.guardar((repos) =>
      repos.settings.updateSettings(patch)
    );
    if (resultado) setConfirmado(texto);
  };

  const guardarMensaje = async () => {
    if (guardando) return;
    setGuardando(true);
    const resultado = await panel.guardar((repos) =>
      repos.settings.updateSettings({
        closedMessage: mensaje.trim() || undefined,
      })
    );
    setGuardando(false);
    if (resultado) {
      setMensajeTocado(false);
      setConfirmado("Mensaje guardado.");
    }
  };

  const hayDelivery =
    !!ajustes && deliveryDisponible(ajustes, panel.catalogo.zonas);

  return (
    <Marco slug={slug} area="configuracion" titulo="Configuración">
      <div className="flex flex-col gap-32">
        {confirmado && (
          <p
            role="status"
            className="border-l-2 border-queso pl-12 text-body-sm text-hueso"
          >
            {confirmado}
          </p>
        )}

        {!panel.catalogo.cargado || !ajustes ? (
          <p className="py-64 text-center font-mono text-body-sm uppercase tracking-[0.22em] text-rescoldo">
            Cargando configuración…
          </p>
        ) : (
          <>
            <section className="flex flex-col gap-16">
              <h2 className="font-mono text-body-sm uppercase tracking-[0.22em] text-queso">
                Estado del local
              </h2>

              <Interruptor
                etiqueta="Aceptar pedidos"
                detalle="Apagado, la carta se sigue viendo y el cliente puede escribir por WhatsApp, pero no puede confirmar un pedido."
                valor={ajustes.acceptingOrders}
                onCambio={(v) =>
                  aplicar(
                    { acceptingOrders: v },
                    v ? "El local está tomando pedidos." : "Pedidos pausados."
                  )
                }
              />

              <Interruptor
                etiqueta="Retiro en el local"
                valor={ajustes.pickupEnabled}
                onCambio={(v) =>
                  aplicar(
                    { pickupEnabled: v },
                    v ? "Retiro habilitado." : "Retiro pausado."
                  )
                }
              />

              <Interruptor
                etiqueta="Delivery"
                detalle={
                  ajustes.deliveryEnabled && !hayDelivery
                    ? "Encendido, pero sin ninguna zona activa no se puede ofrecer."
                    : "Necesita al menos una zona activa con su costo."
                }
                valor={ajustes.deliveryEnabled}
                onCambio={(v) =>
                  aplicar(
                    { deliveryEnabled: v },
                    v ? "Delivery habilitado." : "Delivery pausado."
                  )
                }
              />

              <p className="text-caption leading-body text-rescoldo">
                Zona horaria:{" "}
                <span className="text-hueso">{ajustes.timezone}</span>. Es la que
                se usa para la hora de cada pedido.
              </p>
            </section>

            <section className="flex flex-col gap-12">
              <h2 className="font-mono text-body-sm uppercase tracking-[0.22em] text-queso">
                Mensaje cuando está pausado
              </h2>
              <AreaTexto
                etiqueta="Qué lee el cliente"
                valor={mensaje}
                onCambio={(v) => {
                  setMensajeTocado(true);
                  setMensaje(v);
                }}
                ayuda={`Opcional. Máximo ${LIMITES.largoObservaciones} caracteres.`}
                error={
                  mensaje.length > LIMITES.largoObservaciones
                    ? "El mensaje es muy largo."
                    : undefined
                }
                placeholder="Hoy cerramos temprano. Volvemos mañana a las 19."
              />
              <button
                type="button"
                onClick={guardarMensaje}
                disabled={
                  guardando ||
                  !mensajeTocado ||
                  mensaje.length > LIMITES.largoObservaciones
                }
                aria-busy={guardando}
                className="self-start inline-flex min-h-[48px] items-center rounded-button bg-brasa px-24 text-body-sm font-bold text-hueso disabled:bg-carbon disabled:text-rescoldo"
              >
                {guardando ? "Guardando…" : "Guardar mensaje"}
              </button>
            </section>

            <Zonas />
          </>
        )}
      </div>
    </Marco>
  );
}
