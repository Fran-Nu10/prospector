"use client";

import { useMemo, useState } from "react";
import {
  grupoDePedido,
  ordenarParaPanel,
  type GrupoPanel,
} from "../../../web/lib/ecommerce/domain";
import { formatearDinero } from "../../../web/lib/ecommerce/money";
import type { Order } from "../../../web/lib/ecommerce/types";
import DetallePedido from "./DetallePedido";
import Marco from "./Marco";
import TarjetaPedido from "./TarjetaPedido";
import { usePanel } from "./PanelProvider";

/*
 * PANEL — la pantalla de trabajo del local.
 *
 * Prioriza lo que exige acción: cuatro grupos, el primero son los pedidos sin
 * confirmar, y dentro de cada grupo lo más VIEJO arriba. Nada de un tablero con
 * ocho tarjetas de métricas: quien mira esto está con las manos ocupadas.
 *
 * El detalle es una hoja y no una ruta: abrir un pedido no debería costar una
 * navegación, y volver no debería depender del botón "atrás".
 */

const ROTULOS: Record<GrupoPanel, string> = {
  nuevos: "Nuevos",
  en_curso: "En curso",
  listos: "Listos",
  completados: "Completados",
};

const ORDEN: GrupoPanel[] = ["nuevos", "en_curso", "listos", "completados"];

export default function Panel({ slug }: { slug: string }) {
  const panel = usePanel();
  const [grupo, setGrupo] = useState<GrupoPanel>("nuevos");
  const [abierto, setAbierto] = useState<string | null>(null);

  const pedidos = panel?.pedidos;
  const porGrupo = useMemo(() => {
    const mapa: Record<GrupoPanel, Order[]> = {
      nuevos: [],
      en_curso: [],
      listos: [],
      completados: [],
    };
    for (const pedido of pedidos ?? []) {
      mapa[grupoDePedido(pedido.status)].push(pedido);
    }
    return mapa;
  }, [pedidos]);

  /* Sin proveedor no hay nada; SIN SESIÓN sí hay algo que hacer, y lo hace el
     marco: mandar al acceso. Devolver `null` acá dejaría al visitante sin
     sesión mirando una página en blanco para siempre. */
  if (!panel) return null;

  const esDueño = panel.sesion?.role === "owner";
  const lista = ordenarParaPanel(porGrupo[grupo], grupo);
  const pedidoAbierto = panel.pedidos.find((p) => p.id === abierto) ?? null;

  /* El total del día es información de negocio: el empleado opera, no audita. */
  const totalDelDia = panel.pedidos
    .filter((p) => p.status === "completed")
    .reduce((suma, p) => suma + p.totalCents, 0);

  return (
    <Marco
      slug={slug}
      area="pedidos"
      titulo="Pedidos"
      acciones={
        esDueño ? (
          <span className="flex flex-col text-right">
            <span className="font-mono text-caption uppercase tracking-[0.22em] text-rescoldo">
              Completados hoy
            </span>
            <span className="font-mono text-body font-bold text-hueso">
              {formatearDinero(totalDelDia)}
            </span>
          </span>
        ) : null
      }
    >
      <div className="flex flex-col gap-24">
        <nav
          aria-label="Estado de los pedidos"
          className="-mx-20 flex gap-8 overflow-x-auto px-20 md:mx-0 md:px-0"
        >
          {ORDEN.map((g) => {
            const cantidad = porGrupo[g].length;
            const activo = g === grupo;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setGrupo(g)}
                aria-current={activo ? "true" : undefined}
                className={`inline-flex min-h-[44px] shrink-0 items-center gap-8 border px-16 font-mono text-caption uppercase tracking-[0.18em] ${
                  activo
                    ? "border-brasa bg-carbon text-hueso"
                    : "border-negro text-rescoldo hover:text-hueso"
                }`}
              >
                {ROTULOS[g]}
                <span className={activo ? "text-brasa" : "text-hueso"}>{cantidad}</span>
              </button>
            );
          })}
        </nav>

        {!panel.cargado ? (
          <p className="py-64 text-center font-mono text-body-sm uppercase tracking-[0.22em] text-rescoldo">
            Cargando pedidos…
          </p>
        ) : lista.length === 0 ? (
          <div className="flex flex-col items-start gap-12 py-64">
            <p className="font-display uppercase leading-heading tracking-display text-hueso text-[clamp(24px,6vw,36px)]">
              {panel.pedidos.length === 0
                ? "Todavía no hay pedidos"
                : `Nada en ${ROTULOS[grupo].toLowerCase()}`}
            </p>
            <p className="text-body-sm leading-body text-rescoldo">
              {panel.pedidos.length === 0
                ? "Creá uno desde la tienda para probar el circuito."
                : "Probá con otro estado."}
            </p>
            {panel.pedidos.length === 0 && (
              <a
                href={`/${slug}`}
                className="inline-flex min-h-[48px] items-center rounded-button bg-brasa px-32 text-body font-bold text-hueso"
              >
                Ir a la tienda
              </a>
            )}
          </div>
        ) : (
          <ul
            role="list"
            className="grid gap-12 md:grid-cols-2 xl:grid-cols-3"
          >
            {lista.map((pedido) => (
              <li key={pedido.id}>
                <TarjetaPedido
                  pedido={pedido}
                  activo={pedido.id === abierto}
                  onAbrir={() => {
                    panel.limpiarError();
                    setAbierto(pedido.id);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {pedidoAbierto && (
        <DetallePedido pedido={pedidoAbierto} onCerrar={() => setAbierto(null)} />
      )}
    </Marco>
  );
}
