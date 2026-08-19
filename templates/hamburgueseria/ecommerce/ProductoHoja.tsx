"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { precioUnitario } from "../../../web/lib/ecommerce/domain";
import { formatearDinero } from "../../../web/lib/ecommerce/money";
import { LIMITES } from "../../../web/lib/ecommerce/types";
import type { ProductoVista } from "../../../web/lib/ecommerce/vistas";
import { numeral } from "../tipografia";
import Cantidad from "./Cantidad";
import Hoja from "./Hoja";
import { textoMotivo } from "./copy";
import { useTienda } from "./TiendaProvider";

/*
 * PRODUCTO — la hoja donde se arma la línea antes de agregarla.
 *
 * Sigue el vocabulario de la vitrina: foto grande, nombre en display, precio en
 * mono, ingredientes numerados sobre hairlines. Nada de cards ni de sombras.
 *
 * DOS COSAS QUE NO HACE, a propósito:
 *   · no calcula el precio: lo pide a `precioUnitario`, la misma función que
 *     usa el pedido. Si el JSX sumara los extras por su cuenta, el día que
 *     cambie la regla habría dos verdades;
 *   · no deja agregar lo que no se puede vender. Un producto sin precio válido
 *     o apagado muestra el motivo y el botón queda deshabilitado, sin
 *     inventarle un número para que "funcione".
 */

function grupoObligatorio(min: number, max: number): boolean {
  return min >= 1 && max === 1;
}

export default function ProductoHoja() {
  const tienda = useTienda();
  const producto = tienda?.productoAbierto ?? null;

  const [cantidad, setCantidad] = useState(1);
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [nota, setNota] = useState("");

  /* Al cambiar de producto se arranca de cero, y las variantes obligatorias
     vienen con su primera opción disponible ya marcada: obligar a elegir algo
     que no tiene alternativa real es fricción, no configuración. */
  useEffect(() => {
    if (!producto) return;
    setCantidad(1);
    setNota("");
    setElegidas(
      producto.optionGroups
        .filter((g) => grupoObligatorio(g.minSelect, g.maxSelect))
        .map((g) => g.options.find((o) => o.available)?.id)
        .filter((id): id is string => Boolean(id))
    );
  }, [producto]);

  const opcionesElegidas = useMemo(() => {
    if (!producto) return [];
    return producto.optionGroups
      .flatMap((g) => g.options)
      .filter((o) => elegidas.includes(o.id));
  }, [producto, elegidas]);

  if (!tienda || !producto) return null;

  const unitario =
    producto.priceCents === null
      ? null
      : precioUnitario({ priceCents: producto.priceCents }, opcionesElegidas);
  const total = unitario === null ? null : unitario * cantidad;

  /* Un grupo incompleto bloquea el alta: la misma regla que valida el pedido,
     comprobada acá para no ofrecer un botón que va a fallar. */
  const gruposIncompletos = producto.optionGroups.filter((g) => {
    const n = g.options.filter((o) => elegidas.includes(o.id)).length;
    return n < g.minSelect || n > g.maxSelect;
  });

  const motivo = textoMotivo(producto.motivo);
  const puedeAgregar =
    producto.comprable && unitario !== null && gruposIncompletos.length === 0;

  const alternar = (id: string, min: number, max: number, idsGrupo: string[]) => {
    setElegidas((previas) => {
      const yaEstaba = previas.includes(id);
      if (grupoObligatorio(min, max)) {
        /* Excluyente: elegir una reemplaza a la del grupo. */
        return [...previas.filter((x) => !idsGrupo.includes(x)), id];
      }
      if (yaEstaba) return previas.filter((x) => x !== id);
      const enGrupo = previas.filter((x) => idsGrupo.includes(x)).length;
      if (enGrupo >= max) return previas;
      return [...previas, id];
    });
  };

  const imagen = producto.imageUrl ?? producto.stageImageUrl;

  return (
    <Hoja
      abierta
      onCerrar={tienda.cerrarProducto}
      titulo="Producto"
      pie={
        <div className="flex items-center gap-16">
          <div className="flex flex-col">
            <span className="font-mono text-caption uppercase tracking-[0.22em] text-rescoldo">
              {cantidad > 1 ? `${cantidad} unidades` : "Total"}
            </span>
            <span className="font-mono text-subheading font-bold text-hueso">
              {total === null ? "—" : formatearDinero(total)}
            </span>
          </div>
          <button
            type="button"
            disabled={!puedeAgregar}
            onClick={() => {
              /* No se abre el carrito: interrumpe la navegación. La
                 confirmación la da `AvisoAgregado` y el contador de la nav. */
              tienda.agregar(producto, cantidad, elegidas, nota || undefined);
              tienda.cerrarProducto();
            }}
            className="ml-auto inline-flex min-h-[48px] flex-1 items-center justify-center rounded-button bg-brasa px-24 text-body font-bold text-hueso disabled:bg-carbon disabled:text-rescoldo"
          >
            {puedeAgregar ? "Agregar" : (motivo ?? "No disponible")}
          </button>
        </div>
      }
    >
      {imagen && (
        <div className="relative -mx-20 mb-24 aspect-[4/3] md:-mx-24">
          <Image
            src={imagen}
            alt={producto.name}
            fill
            sizes="(min-width: 640px) 460px, 100vw"
            className="object-cover"
          />
        </div>
      )}

      <div className="flex flex-col gap-16">
        <div className="flex flex-col gap-8">
          {producto.badge && (
            <span className="font-mono text-caption uppercase tracking-[0.22em] text-queso">
              {producto.badge === "destacado" ? "La firma" : producto.badge}
            </span>
          )}
          <h3 className="font-display uppercase leading-heading tracking-display text-hueso text-[clamp(32px,9vw,44px)]">
            {producto.name}
          </h3>
          {producto.description && (
            <p className="text-body-sm leading-body text-rescoldo">
              {producto.description}
            </p>
          )}
        </div>

        <div className="flex items-baseline justify-between gap-16 border-t border-negro pt-16">
          <span className="font-mono text-subheading font-bold text-hueso">
            {producto.priceLabel ?? "—"}
          </span>
          {motivo && (
            <span className="font-mono text-body-sm uppercase tracking-[0.18em] text-brasa">
              {motivo}
            </span>
          )}
        </div>

        {producto.ingredients?.length ? (
          <ul role="list" className="flex flex-col">
            {producto.ingredients.map((ingrediente, i) => (
              <li
                key={ingrediente}
                className="flex items-center gap-12 border-t border-negro py-8 font-mono text-[11px] uppercase tracking-[0.18em] text-rescoldo"
              >
                <span className="text-queso">{numeral(i + 1)}</span>
                {ingrediente}
              </li>
            ))}
          </ul>
        ) : null}

        {/* Opciones REALES: si el catálogo no trae ninguna, acá no hay nada.
            No se inventa un "punto de cocción" que el local nunca ofreció. */}
        {producto.optionGroups.map((grupo) => {
          const idsGrupo = grupo.options.map((o) => o.id);
          const excluyente = grupoObligatorio(grupo.minSelect, grupo.maxSelect);
          return (
            <fieldset key={grupo.id} className="flex flex-col gap-8 border-t border-negro pt-16">
              <legend className="font-mono text-caption uppercase tracking-[0.22em] text-rescoldo">
                {grupo.name}
                {grupo.minSelect > 0 && <span className="text-brasa"> · obligatorio</span>}
              </legend>
              {grupo.options.map((opcion) => {
                const marcada = elegidas.includes(opcion.id);
                return (
                  <label
                    key={opcion.id}
                    className={`flex min-h-[44px] cursor-pointer items-center justify-between gap-16 border-b border-negro py-8 text-body-sm ${
                      opcion.available ? "text-hueso" : "text-rescoldo opacity-50"
                    }`}
                  >
                    <span className="flex items-center gap-12">
                      <input
                        type={excluyente ? "radio" : "checkbox"}
                        name={grupo.id}
                        checked={marcada}
                        disabled={!opcion.available}
                        onChange={() =>
                          alternar(opcion.id, grupo.minSelect, grupo.maxSelect, idsGrupo)
                        }
                        className="h-[18px] w-[18px] accent-[var(--color-brasa)]"
                      />
                      {opcion.name}
                      {!opcion.available && (
                        <span className="font-mono text-caption uppercase tracking-[0.18em]">
                          agotado
                        </span>
                      )}
                    </span>
                    {opcion.priceDeltaCents !== 0 && (
                      <span className="font-mono text-body-sm text-rescoldo">
                        {opcion.priceDeltaCents > 0 ? "+" : "−"}
                        {formatearDinero(Math.abs(opcion.priceDeltaCents))}
                      </span>
                    )}
                  </label>
                );
              })}
            </fieldset>
          );
        })}

        <div className="flex flex-col gap-8 border-t border-negro pt-16">
          <label
            htmlFor="nota-producto"
            className="font-mono text-caption uppercase tracking-[0.22em] text-rescoldo"
          >
            Aclaración (opcional)
          </label>
          <input
            id="nota-producto"
            type="text"
            value={nota}
            maxLength={LIMITES.largoObservaciones}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Sin cebolla, bien cocida…"
            className="min-h-[44px] border border-negro bg-carbon px-16 text-body-sm text-hueso placeholder:text-rescoldo/50"
          />
        </div>

        <div className="flex items-center justify-between gap-16 border-t border-negro pt-16">
          <span className="font-mono text-caption uppercase tracking-[0.22em] text-rescoldo">
            Cantidad
          </span>
          <Cantidad
            valor={cantidad}
            onCambiar={setCantidad}
            maximo={Math.min(producto.maximo ?? LIMITES.unidadesPorLinea, LIMITES.unidadesPorLinea)}
            etiqueta={producto.name}
          />
        </div>
      </div>
    </Hoja>
  );
}
