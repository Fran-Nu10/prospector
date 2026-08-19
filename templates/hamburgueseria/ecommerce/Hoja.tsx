"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DURACION_EXPANSION, EASE_BLOQUE } from "../animacion";

/*
 * HOJA — el contenedor de las dos superficies nuevas (producto y carrito).
 *
 * En mobile sube desde abajo y ocupa como mucho el 88% de la pantalla: el
 * pulgar llega al borde inferior, que es donde viven los botones. En pantallas
 * anchas entra desde la derecha como panel. Es la misma hoja: cambia el eje.
 *
 * POR QUÉ VA EN UN PORTAL. La página tiene transforms por todos lados (el hero
 * pineado, los slides del menú). Un `position: fixed` dentro de un ancestro con
 * `transform` se posiciona contra ESE ancestro, no contra el viewport: la hoja
 * aparecería a mitad de la página. El portal la saca al `body`.
 *
 * ACCESIBILIDAD, que acá no es opcional porque tapa el resto de la página:
 * `role="dialog"` + `aria-modal`, foco que entra al abrir y VUELVE al botón que
 * la abrió, Tab atrapado adentro, Escape cierra y el scroll del fondo se
 * bloquea mientras está abierta.
 */

const FOCALIZABLES =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Pantalla ancha = panel lateral; angosta = hoja inferior. */
function useEsAncho(): boolean {
  const [ancho, setAncho] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const leer = () => setAncho(mq.matches);
    leer();
    mq.addEventListener("change", leer);
    return () => mq.removeEventListener("change", leer);
  }, []);
  return ancho;
}

export default function Hoja({
  abierta,
  onCerrar,
  titulo,
  children,
  pie,
}: {
  abierta: boolean;
  onCerrar: () => void;
  /** Se anuncia como nombre del diálogo y se pinta como rótulo. */
  titulo: string;
  children: React.ReactNode;
  /** Barra fija inferior: el precio y la acción nunca quedan fuera de alcance. */
  pie?: React.ReactNode;
}) {
  const idTitulo = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const focoPrevio = useRef<HTMLElement | null>(null);
  const [montado, setMontado] = useState(false);
  const esAncho = useEsAncho();
  const reducir = useReducedMotion();

  useEffect(() => setMontado(true), []);

  /* Bloqueo del scroll de fondo + foco de entrada y de salida. */
  useEffect(() => {
    if (!abierta) return;
    focoPrevio.current = document.activeElement as HTMLElement | null;
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    /* El foco entra al panel, no al primer botón: leer el título antes que
       "cerrar" es la diferencia entre orientarse y perderse. */
    const t = setTimeout(() => panelRef.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = overflowPrevio;
      focoPrevio.current?.focus?.();
    };
  }, [abierta]);

  /* Escape y trampa de Tab. Sin listeners globales: el foco vive adentro. */
  const alTeclear = (evento: React.KeyboardEvent) => {
    if (evento.key === "Escape") {
      evento.stopPropagation();
      onCerrar();
      return;
    }
    if (evento.key !== "Tab" || !panelRef.current) return;
    const focos = [
      ...panelRef.current.querySelectorAll<HTMLElement>(FOCALIZABLES),
    ].filter((e) => e.offsetParent !== null);
    if (!focos.length) return;
    const primero = focos[0];
    const ultimo = focos[focos.length - 1];
    const activo = document.activeElement;
    if (evento.shiftKey && (activo === primero || activo === panelRef.current)) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && activo === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  };

  if (!montado) return null;

  const desplazamiento = esAncho ? { x: "100%" } : { y: "100%" };
  const enSitio = esAncho ? { x: 0 } : { y: 0 };
  const transicion = reducir
    ? { duration: 0 }
    : { duration: DURACION_EXPANSION, ease: EASE_BLOQUE };

  return createPortal(
    <AnimatePresence>
      {abierta && (
        <div className="fixed inset-0 z-[60]" onKeyDown={alTeclear}>
          {/* Fondo: oscurece y cierra. No es un botón para el lector de
              pantalla —la acción ya está en "Cerrar"—, pero sí para el mouse. */}
          <motion.div
            aria-hidden
            onClick={onCerrar}
            className="absolute inset-0 bg-negro/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transicion}
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={idTitulo}
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 flex max-h-[88svh] flex-col border-t border-negro bg-noche outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(92vw,460px)] sm:max-h-none sm:border-l sm:border-t-0"
            initial={desplazamiento}
            animate={enSitio}
            exit={desplazamiento}
            transition={transicion}
          >
            <header className="flex shrink-0 items-center justify-between gap-16 border-b border-negro px-20 py-16 md:px-24">
              <h2
                id={idTitulo}
                className="font-mono text-body-sm uppercase tracking-[0.22em] text-rescoldo"
              >
                {titulo}
              </h2>
              <button
                type="button"
                onClick={onCerrar}
                className="-mr-8 inline-flex min-h-[44px] min-w-[44px] items-center justify-center font-mono text-body-sm uppercase tracking-[0.18em] text-rescoldo hover:text-hueso"
              >
                Cerrar ×
              </button>
            </header>

            {/* `overscroll-contain`: al llegar al final de la hoja el scroll no
                se lo lleva la página de atrás. */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-20 py-24 md:px-24">
              {children}
            </div>

            {pie && (
              <div className="shrink-0 border-t border-negro px-20 py-16 pb-[calc(16px+env(safe-area-inset-bottom))] md:px-24">
                {pie}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
