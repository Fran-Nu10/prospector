"use client";

import { useEffect, useState, type RefObject } from "react";
import { useMotionValue, useSpring, type MotionValue } from "motion/react";

/*
 * Progreso de scroll para el parallax de la galería.
 *
 * El pin del hero NO usa esto: usa `useScroll` de la librería, que es la
 * herramienta correcta para un track completo. Acá hace falta otra cosa —
 * poder APAGAR la medición cuando la variante está oculta por CSS
 * (`display:none`), porque en ese estado el elemento no tiene caja y medirlo
 * es puro gasto. Por eso el listener pasivo + rAF a mano: una sola lectura de
 * layout por frame, y el movimiento después es transform puro.
 */

/** Rango de scroll medido: devuelve el progreso 0→1 crudo. */
function useProgresoCrudo(
  activo: boolean,
  medir: () => number | null
): MotionValue<number> {
  const crudo = useMotionValue(0);

  useEffect(() => {
    if (!activo) return;
    let rafId = 0;
    const leer = () => {
      const p = medir();
      if (p !== null) crudo.set(p);
    };
    const alScrollear = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(leer);
    };
    leer();
    window.addEventListener("scroll", alScrollear, { passive: true });
    window.addEventListener("resize", alScrollear);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", alScrollear);
      window.removeEventListener("resize", alScrollear);
    };
    // `medir` se re-crea en cada render pero solo lee refs: no hace falta
    // re-suscribir por eso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, crudo]);

  return crudo;
}

/**
 * Progreso 0→1 del recorrido de un bloque por el viewport: 0 cuando su borde
 * superior toca el borde inferior de la pantalla, 1 cuando su borde inferior
 * sale por arriba. Es el reloj del parallax.
 */
export function useProgresoViewport(
  ref: RefObject<HTMLElement | null>,
  activo: boolean
): MotionValue<number> {
  const crudo = useProgresoCrudo(activo, () => {
    const el = ref.current;
    if (!el) return null;
    const caja = el.getBoundingClientRect();
    const total = window.innerHeight + caja.height;
    if (total <= 0) return 0.5;
    return Math.min(1, Math.max(0, (window.innerHeight - caja.top) / total));
  });

  return useSpring(crudo, { stiffness: 80, damping: 26, restDelta: 0.001 });
}

/**
 * `true` por debajo de `lg`, donde el póster se recompone en vertical.
 *
 * El corte es el mismo que usan las clases `lg:` de Tailwind (1024px): las
 * composiciones de póster —firma y galería— necesitan ese ancho para no
 * estrangularse, así que la recomposición que el brief pide para ≤768px
 * arranca antes.
 *
 * Solo decide ANIMACIÓN, nunca layout: el layout lo resuelve CSS con las dos
 * variantes en el DOM (`hidden lg:block` / `lg:hidden`), porque ramificar el
 * markup entre servidor y cliente rompe la hidratación.
 */
export function useEsAngosto(): boolean {
  const [angosto, setAngosto] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023.98px)");
    const sincronizar = () => setAngosto(mq.matches);
    sincronizar();
    mq.addEventListener("change", sincronizar);
    return () => mq.removeEventListener("change", sincronizar);
  }, []);

  return angosto;
}

/**
 * `true` una vez montado el componente. Sirve para posponer al cliente
 * cualquier decisión que dependa del navegador (media queries, preferencias)
 * sin romper el HTML del SSR.
 */
export function useMontado(): boolean {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  return montado;
}
