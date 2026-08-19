"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DURACION_EXPANSION, EASE_BLOQUE } from "../animacion";
import { useTienda } from "./TiendaProvider";

/*
 * El acceso al carrito desde la nav.
 *
 * Aparece SOLO cuando hay ecommerce detrás: en una demo en modo carta no hay
 * carrito y un ícono muerto en la barra es peor que no tenerlo.
 *
 * El contador late al cambiar —feedback de que algo entró— y se anuncia por
 * texto para quien no lo ve. Sin unidades, el botón sigue existiendo pero sin
 * globo: es la puerta al pedido, no una notificación.
 */

export default function BotonCarrito() {
  const tienda = useTienda();
  const reducir = useReducedMotion();
  if (!tienda?.interactivo) return null;

  const unidades = tienda.carrito.unidades;

  return (
    <button
      type="button"
      onClick={tienda.abrirCarrito}
      aria-label={
        unidades > 0
          ? `Abrir el pedido (${unidades} ${unidades === 1 ? "producto" : "productos"})`
          : "Abrir el pedido"
      }
      /* El área táctil son 44px, pero el margen negativo evita que la barra
         crezca: la nav tiene una altura calibrada y el carrito no puede
         empujar la página entera ocho píxeles hacia abajo. */
      className="relative -my-4 inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-hueso hover:text-rescoldo"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-24 w-24"
      >
        <path d="M4 7h16l-1.5 12.5a1 1 0 0 1-1 .9H6.5a1 1 0 0 1-1-.9L4 7Z" />
        <path d="M9 10V6a3 3 0 0 1 6 0v4" />
      </svg>

      <AnimatePresence>
        {unidades > 0 && (
          <motion.span
            key={unidades}
            aria-hidden
            initial={reducir ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reducir ? undefined : { scale: 0.6, opacity: 0 }}
            transition={
              reducir
                ? { duration: 0 }
                : { duration: DURACION_EXPANSION, ease: EASE_BLOQUE }
            }
            className="absolute -right-4 -top-4 inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-brasa px-4 font-mono text-[11px] font-bold leading-none text-hueso"
          >
            {unidades}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
