"use client";

import { useState } from "react";
import { validarZona } from "../../../web/lib/ecommerce/domain";
import {
  formatearDinero,
  formatearPesos,
  parsearPesos,
} from "../../../web/lib/ecommerce/money";
import type { DeliveryZone } from "../../../web/lib/ecommerce/types";
import Hoja from "../ecommerce/Hoja";
import { Interruptor, Texto } from "./campos";
import { usePanel } from "./PanelProvider";

/*
 * ZONAS DE DELIVERY.
 *
 * La instalación arranca SIN zonas y con el delivery apagado, a propósito: el
 * JSON del prospecto dice "hacemos envíos" en prosa y convertir esa frase en
 * una tarifa sería inventarle un precio al negocio. Las zonas las carga el
 * dueño, con los nombres y los importes que él cobra.
 *
 * Sin una zona activa el delivery no se puede ofrecer aunque el interruptor
 * esté encendido: lo decide `deliveryDisponible` en el dominio, que es la misma
 * función que mira el checkout.
 */

function FormZona({
  zona,
  onCerrar,
}: {
  zona: DeliveryZone | null;
  onCerrar: () => void;
}) {
  const panel = usePanel();
  const [name, setName] = useState(zona?.name ?? "");
  const [costo, setCosto] = useState(
    zona ? formatearPesos(zona.feeCents) : ""
  );
  const [minimo, setMinimo] = useState(
    zona ? formatearPesos(zona.minOrderCents) : "0"
  );
  const [active, setActive] = useState(zona?.active ?? true);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  if (!panel) return null;

  const guardar = async () => {
    if (guardando) return;
    const feeCents = costo.trim() ? parsearPesos(costo) : null;
    const minOrderCents = minimo.trim() ? parsearPesos(minimo) : null;
    const encontrados = validarZona(
      { name, feeCents, minOrderCents },
      { zonas: panel.catalogo.zonas, idActual: zona?.id }
    );
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    setGuardando(true);
    const resultado = await panel.guardar((repos) =>
      repos.settings.upsertDeliveryZone({
        id: zona?.id,
        name: name.trim(),
        feeCents: feeCents ?? 0,
        minOrderCents: minOrderCents ?? 0,
        active,
      })
    );
    setGuardando(false);
    if (resultado) onCerrar();
  };

  return (
    <Hoja
      abierta
      onCerrar={onCerrar}
      titulo={zona ? "Editar zona" : "Nueva zona"}
      pie={
        <div className="flex items-center gap-12">
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            aria-busy={guardando}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-button bg-brasa px-24 text-body font-bold text-hueso disabled:bg-carbon disabled:text-rescoldo"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="min-h-[48px] font-mono text-caption uppercase tracking-[0.18em] text-rescoldo underline underline-offset-4 hover:text-hueso"
          >
            Cancelar
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-16">
        <Texto
          etiqueta="Nombre de la zona"
          valor={name}
          autoFocus
          onCambio={setName}
          error={errores.name}
          ayuda="El barrio o la zona tal como se la nombra en el local."
        />
        <Texto
          etiqueta="Costo de envío en pesos"
          inputMode="decimal"
          valor={costo}
          onCambio={setCosto}
          error={errores.feeCents}
          placeholder="120"
        />
        <Texto
          etiqueta="Pedido mínimo en pesos"
          inputMode="decimal"
          valor={minimo}
          onCambio={setMinimo}
          error={errores.minOrderCents}
          ayuda="0 = sin mínimo."
        />
        <Interruptor
          etiqueta="Activa"
          detalle="Apagada deja de ofrecerse en el checkout."
          valor={active}
          onCambio={setActive}
        />
      </div>
    </Hoja>
  );
}

export default function Zonas() {
  const panel = usePanel();
  const [editando, setEditando] = useState<DeliveryZone | null>(null);
  const [abierto, setAbierto] = useState(false);

  if (!panel) return null;
  const visibles = panel.catalogo.zonas.filter((z) => !z.archived);

  const mover = (indice: number, direccion: -1 | 1) => {
    const destino = indice + direccion;
    if (destino < 0 || destino >= visibles.length) return;
    const orden = visibles.map((z) => z.id);
    [orden[indice], orden[destino]] = [orden[destino], orden[indice]];
    panel.guardar((repos) => repos.settings.reorderDeliveryZones(orden));
  };

  return (
    <section className="flex flex-col gap-16">
      <div className="flex flex-wrap items-center justify-between gap-12">
        <h2 className="font-mono text-body-sm uppercase tracking-[0.22em] text-queso">
          Zonas de delivery
        </h2>
        <button
          type="button"
          onClick={() => {
            setEditando(null);
            setAbierto(true);
          }}
          className="inline-flex min-h-[44px] items-center border border-negro px-16 font-mono text-caption uppercase tracking-[0.18em] text-rescoldo hover:text-hueso"
        >
          Nueva zona
        </button>
      </div>

      {visibles.length === 0 ? (
        <p className="border-l-2 border-brasa pl-12 text-body-sm leading-body text-rescoldo">
          Todavía no hay zonas cargadas, así que el delivery no se puede
          ofrecer. Agregá las zonas a las que llegás con su costo real.
        </p>
      ) : (
        <ul role="list" className="flex flex-col border-t border-negro">
          {visibles.map((zona, i) => (
            <li
              key={zona.id}
              className="flex flex-wrap items-center gap-12 border-b border-negro py-12"
            >
              <div className="flex min-w-[180px] flex-1 flex-col gap-4">
                <span className="text-body-sm font-bold text-hueso">
                  {zona.name}
                </span>
                <span className="font-mono text-caption text-rescoldo">
                  Envío {formatearDinero(zona.feeCents)} ·{" "}
                  {zona.minOrderCents > 0
                    ? `mínimo ${formatearDinero(zona.minOrderCents)}`
                    : "sin mínimo"}
                  {!zona.active && " · apagada"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-8">
                <button
                  type="button"
                  aria-label={`Subir ${zona.name}`}
                  onClick={() => mover(i, -1)}
                  disabled={i === 0}
                  className="min-h-[44px] min-w-[44px] border border-negro font-mono text-caption text-rescoldo hover:text-hueso disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Bajar ${zona.name}`}
                  onClick={() => mover(i, 1)}
                  disabled={i === visibles.length - 1}
                  className="min-h-[44px] min-w-[44px] border border-negro font-mono text-caption text-rescoldo hover:text-hueso disabled:opacity-40"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() =>
                    panel.guardar((repos) =>
                      repos.settings.upsertDeliveryZone({
                        id: zona.id,
                        name: zona.name,
                        feeCents: zona.feeCents,
                        active: !zona.active,
                      })
                    )
                  }
                  className="min-h-[44px] border border-negro px-12 font-mono text-caption uppercase tracking-[0.18em] text-rescoldo hover:text-hueso"
                >
                  {zona.active ? "Apagar" : "Encender"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditando(zona);
                    setAbierto(true);
                  }}
                  className="min-h-[44px] border border-negro px-12 font-mono text-caption uppercase tracking-[0.18em] text-rescoldo hover:text-hueso"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    panel.guardar((repos) =>
                      repos.settings.upsertDeliveryZone({
                        id: zona.id,
                        name: zona.name,
                        feeCents: zona.feeCents,
                        /* Archivar la saca de circulación: apagada además de
                           guardada, para que no reaparezca al restaurarla sin
                           que alguien lo decida. */
                        active: false,
                        archived: true,
                      })
                    )
                  }
                  className="min-h-[44px] px-12 font-mono text-caption uppercase tracking-[0.18em] text-rescoldo underline underline-offset-4 hover:text-hueso"
                >
                  Archivar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {abierto && <FormZona zona={editando} onCerrar={() => setAbierto(false)} />}
    </section>
  );
}
