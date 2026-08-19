"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { formatearDinero } from "../../../web/lib/ecommerce/money";
import { DURACION_EXPANSION, EASE_BLOQUE } from "../animacion";
import { useTienda } from "./TiendaProvider";

/*
 * Confirmación de que el producto entró al pedido.
 *
 * Existe por una razón concreta de mobile: el contador del carrito vive arriba,
 * en la nav, y el pulgar está abajo. Sin esto, agregar algo desde la hoja de
 * producto no tiene respuesta visible donde la persona está mirando.
 *
 * Se va solo a los ~2 segundos (el reloj lo lleva la tienda) y no tapa nada
 * importante: es una barra fina apoyada al pie, no un modal. Con
 * `prefers-reduced-motion` aparece sin deslizarse.
 */

export default function AvisoAgregado() {
  const tienda = useTienda();
  const reducir = useReducedMotion();
  if (!tienda?.interactivo) return null;

  /* No se muestra encima del carrito abierto: ahí ya se ve lo que entró. */
  const visible = Boolean(tienda.ultimoAgregado) && !tienda.carritoAbierto;
  const { unidades, subtotalCents } = tienda.carrito;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          /* `polite`: avisa sin interrumpir lo que el lector esté leyendo. */
          role="status"
          aria-live="polite"
          initial={reducir ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducir ? { opacity: 0 } : { opacity: 0, y: 16 }}
          transition={
            reducir
              ? { duration: 0 }
              : { duration: DURACION_EXPANSION, ease: EASE_BLOQUE }
          }
          className="fixed inset-x-16 bottom-16 z-50 flex items-center justify-between gap-16 border border-negro bg-carbon px-16 py-12 sm:left-auto sm:right-24 sm:w-[360px]"
        >
          <span className="flex flex-col">
            <span className="font-mono text-caption uppercase tracking-[0.22em] text-queso">
              Agregado
            </span>
            <span className="font-mono text-body-sm text-hueso">
              {unidades} {unidades === 1 ? "producto" : "productos"} ·{" "}
              {formatearDinero(subtotalCents)}
            </span>
          </span>
          <button
            type="button"
            onClick={tienda.abrirCarrito}
            className="inline-flex min-h-[44px] shrink-0 items-center rounded-button bg-brasa px-20 text-body-sm font-bold text-hueso"
          >
            Ver pedido
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
