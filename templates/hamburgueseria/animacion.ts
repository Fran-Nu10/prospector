/*
 * CONTRATO DE ANIMACIÓN de la plantilla `hamburgueseria`.
 *
 * Fuente única de verdad del movimiento: TODA la página importa de acá. Si dos
 * secciones se sienten distintas, es porque una no está usando estos valores.
 *
 * Filosofía (ver CLAUDE.md): movimiento INTENCIONAL, no decorativo. Base
 * tranquila, mucho negro quieto, y efecto marcado solo en los dos momentos
 * estrella (el hero con la burger, y el menú).
 *
 * Reglas duras:
 *   - Solo se anima `transform` y `opacity` (GPU). Nunca top/margin/height.
 *   - Toda entrada dispara UNA sola vez (`once: true`).
 *   - `prefers-reduced-motion` siempre lleva al estado final directo.
 *
 * DOS CURVAS, a propósito:
 *   - EASE_TEXTO   → reveal de texto línea por línea. Viene de la referencia
 *                    Vivid+Co (vividand.co) y ya está aprobada en el hero.
 *   - EASE_BLOQUE  → bloques, cards y grillas. Es la que ya usaba el menú.
 * No se unifican en una sola porque eso obligaría a cambiar el hero.
 */

/** Curva de reveal de texto — equivalente a la curva CSS `ease`. */
export const EASE_TEXTO = [0.25, 0.1, 0.25, 1] as const;

/** Curva de entrada de bloques, cards y grillas. */
export const EASE_BLOQUE = "easeOut" as const;

/** Entrada de un bloque de sección. */
export const DURACION_BLOQUE = 0.6;
/** Entrada de una card dentro de una grilla. */
export const DURACION_CARD = 0.5;
/** Reveal de una línea de texto. */
export const DURACION_TEXTO = 0.5;
/** Lift al entrar el puntero. */
export const DURACION_HOVER = 0.25;
/** Vuelta al reposo cuando el puntero sale. */
export const DURACION_REPOSO = 0.3;

/** Estado inicial / final de toda entrada por viewport. */
export const OCULTO = { opacity: 0, y: 28 };
export const VISIBLE = { opacity: 1, y: 0 };

/** Una sola vez, disparando un poco antes de que el bloque toque el borde. */
export const VIEWPORT = { once: true, margin: "-60px" } as const;

/** Lift compartido por todas las cards interactivas de la página. */
export const LIFT_HOVER = {
  y: -6,
  transition: { duration: DURACION_HOVER, ease: EASE_BLOQUE },
} as const;

/**
 * Retraso de stagger por índice dentro de una grilla, con techo: sin él, las
 * filas lejanas de una grilla larga entrarían con un retraso absurdo.
 */
export function delayStagger(i: number): number {
  return Math.min(i * 0.08, 0.6);
}

/** Transición de entrada de una card en grilla (con su stagger). */
export function transicionCard(i: number) {
  return {
    duration: DURACION_CARD,
    ease: EASE_BLOQUE,
    delay: delayStagger(i),
  };
}

/** Transición de entrada de un bloque de sección. */
export const TRANSICION_BLOQUE = {
  duration: DURACION_BLOQUE,
  ease: EASE_BLOQUE,
} as const;

/* ---------------------------------------------------------------------------
 * El momento estrella de la página es el HERO: el póster que se abre capa por
 * capa mientras la sección está pineada. Su coreografía completa —ventanas,
 * destinos, escalas— vive en `capas.ts`, no acá: es configuración de una sola
 * secuencia, no vocabulario compartido por la página.
 * ------------------------------------------------------------------------ */

/** Recorrido del parallax de la galería, en px. */
export const PARALLAX_GALERIA = 56;

/** En mobile el parallax se reduce a un tercio (el scroll manda). */
export const FACTOR_PARALLAX_MOBILE = 1 / 3;
