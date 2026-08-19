"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { formatearDinero } from "../../../web/lib/ecommerce/money";
import type { LineaResuelta } from "../../../web/lib/ecommerce/domain";
import Cantidad from "./Cantidad";
import Hoja from "./Hoja";
import { textoMotivo } from "./copy";
import { useTienda } from "./TiendaProvider";

/*
 * CARRITO — la hoja donde se revisa el pedido.
 *
 * Reglas que se ven en el diseño:
 *
 * · UNA LÍNEA CON PROBLEMA NO DESAPARECE Y NO SUMA. Si el producto se agotó o
 *   salió de la carta mientras estaba en el carrito, se muestra apagada, con el
 *   motivo y con "Quitar" a mano. Borrarla sola dejaría un total que no se
 *   corresponde con lo que la persona vio.
 *
 * · EL PRECIO QUE MANDA ES EL DEL CATÁLOGO. Si cambió desde que se agregó, la
 *   línea lo dice ("antes $X") y el total ya usa el nuevo. No se cobra el viejo
 *   ni se cambia el número en silencio.
 *
 * · EL SUBTOTAL NO SE SUMA ACÁ. Viene resuelto del dominio.
 */

function Linea({ linea }: { linea: LineaResuelta }) {
  const tienda = useTienda();
  if (!tienda) return null;

  const motivo = textoMotivo(linea.motivo);
  const nuevo = tienda.ultimoAgregado === linea.productId;

  return (
    <motion.li
      layout="position"
      initial={false}
      animate={{ opacity: linea.disponible ? 1 : 0.55 }}
      className="flex gap-16 border-b border-negro py-16"
    >
      <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden bg-carbon">
        {linea.imagenUrl && (
          <Image
            src={linea.imagenUrl}
            alt=""
            fill
            sizes="72px"
            className={`object-cover ${linea.disponible ? "" : "grayscale"}`}
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-8">
        <div className="flex items-start justify-between gap-12">
          <div className="flex min-w-0 flex-col gap-4">
            <span className="truncate font-mono text-body-sm uppercase tracking-[0.12em] text-hueso">
              {linea.nombre}
            </span>
            {linea.opciones.length > 0 && (
              <span className="truncate text-caption text-rescoldo">
                {linea.opciones.map((o) => o.optionName).join(" · ")}
              </span>
            )}
            {linea.notes && (
              <span className="truncate text-caption italic text-rescoldo">
                “{linea.notes}”
              </span>
            )}
            {motivo && (
              <span className="font-mono text-caption uppercase tracking-[0.18em] text-brasa">
                {motivo}
              </span>
            )}
            {linea.precioCambio && linea.disponible && (
              /* El cambio de precio se dice, no se disimula. */
              <span className="font-mono text-caption uppercase tracking-[0.18em] text-queso">
                Cambió de precio
                {linea.precioAnteriorCents !== undefined &&
                  ` · antes ${formatearDinero(linea.precioAnteriorCents)}`}
              </span>
            )}
          </div>

          <span
            className={`shrink-0 font-mono text-body-sm font-bold ${
              nuevo ? "text-queso" : "text-hueso"
            }`}
          >
            {linea.lineTotalCents === null
              ? "—"
              : formatearDinero(linea.lineTotalCents)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-12">
          {linea.disponible ? (
            <Cantidad
              compacto
              valor={linea.quantity}
              onCambiar={(v) => tienda.cambiarCantidad(linea.lineId, v)}
              maximo={linea.maximo ?? 99}
              etiqueta={linea.nombre}
            />
          ) : (
            <span className="font-mono text-caption uppercase tracking-[0.18em] text-rescoldo">
              {linea.quantity} en el carrito
            </span>
          )}
          <button
            type="button"
            onClick={() => tienda.quitar(linea.lineId)}
            className="min-h-[44px] font-mono text-caption uppercase tracking-[0.18em] text-rescoldo underline underline-offset-4 hover:text-hueso"
          >
            Quitar
          </button>
        </div>
      </div>
    </motion.li>
  );
}

export default function CarritoHoja() {
  const tienda = useTienda();
  if (!tienda || !tienda.carritoAbierto) return null;

  const { carrito } = tienda;
  const vacio = carrito.lineas.length === 0;
  /* No se puede seguir con líneas rotas adentro: el total que se ve y el que
     el pedido recalcularía serían distintos. */
  const sinComprables = carrito.hayProblemas || carrito.subtotalCents <= 0;

  return (
    <Hoja
      abierta
      onCerrar={tienda.cerrarCarrito}
      titulo="Tu pedido"
      pie={
        vacio ? undefined : (
          <div className="flex flex-col gap-12">
            <div className="flex items-baseline justify-between gap-16">
              <span className="font-mono text-caption uppercase tracking-[0.22em] text-rescoldo">
                Subtotal
              </span>
              <span className="font-mono text-subheading font-bold text-hueso">
                {formatearDinero(carrito.subtotalCents)}
              </span>
            </div>
            {/* El checkout es una PÁGINA, no una tercera hoja apilada: así
                funcionan atrás/adelante, sobrevive a una recarga y completar
                un formulario en mobile no pelea con el teclado. */}
            <a
              href={`/${tienda.slug}/checkout`}
              aria-disabled={sinComprables}
              onClick={(e) => {
                if (sinComprables) e.preventDefault();
                else tienda.cerrarCarrito();
              }}
              className={`inline-flex min-h-[48px] w-full items-center justify-center rounded-button px-24 text-body font-bold ${
                sinComprables
                  ? "pointer-events-none bg-carbon text-rescoldo"
                  : "bg-brasa text-hueso"
              }`}
            >
              Continuar
            </a>
            {carrito.hayProblemas && (
              <p className="text-center text-caption text-rescoldo">
                Quitá lo que ya no está disponible para poder seguir.
              </p>
            )}
          </div>
        )
      }
    >
      {vacio ? (
        <div className="flex flex-col items-start gap-16 py-24">
          <p className="font-display uppercase leading-heading tracking-display text-hueso text-[clamp(28px,7vw,36px)]">
            Todavía no elegiste nada
          </p>
          <p className="text-body-sm leading-body text-rescoldo">
            Mirá la carta y armá tu pedido.
          </p>
          <a
            href="#menu"
            onClick={tienda.cerrarCarrito}
            className="inline-flex min-h-[48px] items-center rounded-button bg-brasa px-32 text-body font-bold text-hueso"
          >
            Ver el menú
          </a>
        </div>
      ) : (
        <>
          {carrito.hayProblemas && (
            <p className="mb-16 border-l-2 border-brasa pl-12 text-body-sm leading-body text-rescoldo">
              Hay productos que ya no se pueden pedir. Quitalos para seguir.
            </p>
          )}

          <ul role="list" className="flex flex-col">
            {carrito.lineas.map((linea) => (
              <Linea key={linea.lineId} linea={linea} />
            ))}
          </ul>

          <button
            type="button"
            onClick={tienda.vaciar}
            className="mt-16 min-h-[44px] font-mono text-body-sm uppercase tracking-[0.18em] text-rescoldo underline underline-offset-4 hover:text-hueso"
          >
            Vaciar carrito
          </button>
        </>
      )}
    </Hoja>
  );
}
