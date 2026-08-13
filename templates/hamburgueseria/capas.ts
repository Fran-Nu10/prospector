/*
 * Geometría de las 6 capas de la burger.
 *
 * Las capas son assets de la PLANTILLA, no datos del cliente: la misma burger
 * genérica sirve para todos los prospectos del vertical (ver CLAUDE.md). Sus
 * etiquetas de ingrediente describen ese render genérico, así que viven acá y
 * no en el ClientData.
 *
 * Todo se expresa en un espacio de diseño de 1024px de ancho — el ancho
 * natural de los PNG. Cada consumidor lo escala:
 *   - el hero apila las capas (`topArmado`),
 *   - la firma las explota (`topExplotado`) y es la que lleva las etiquetas.
 *
 * Nada de esto se mide en px reales: las posiciones se sirven como % del
 * contenedor, así la composición escala entera sin romperse.
 */

/** Ancho del espacio de diseño (= ancho natural de los PNG). */
export const ANCHO_CAPAS = 1024;

/** Alto de la caja del stack armado — el que usa el hero. */
export const ALTO_ARMADO = 895;

/** Alto de la caja de la vista explotada de la firma (desktop). */
export const ALTO_EXPLOTADO = 1497;

/**
 * En mobile la separación entre capas baja a ~0.39 de la de desktop
 * (±180px → ±70px en espacio de diseño): la explosión completa no entra en
 * una pantalla angosta sin comerse el resto de la sección.
 */
export const FACTOR_MOBILE = 0.39;

/** Alto de la caja explotada en mobile (separación reducida). */
export const ALTO_EXPLOTADO_MOBILE = 975;

export interface Capa {
  src: string;
  /** Alto natural del PNG, en espacio de diseño. */
  alto: number;
  /** Posición apilada (hero). */
  topArmado: number;
  /** Posición explotada (firma desktop). */
  topExplotado: number;
  /** Posición de su etiqueta en el póster de la firma (espacio 1360×980). */
  topEtiqueta: number;
  etiqueta: string;
  z: number;
}

/* El orden es visual, de arriba hacia abajo: la etiqueta 01 es el pan de
 * arriba y la 06 el de abajo, igual que en el póster. */
export const CAPAS: Capa[] = [
  // prettier-ignore
  { src: "/hamburgueseria/capas/capa-1-pan-arriba.png", alto: 206, topArmado: 0,   topExplotado: 0,    topEtiqueta: 150, etiqueta: "Pan brioche sellado", z: 6 },
  // prettier-ignore
  { src: "/hamburgueseria/capas/capa-2-bacon.png",      alto: 189, topArmado: 116, topExplotado: 250,  topEtiqueta: 255, etiqueta: "Panceta ahumada",    z: 5 },
  // prettier-ignore
  { src: "/hamburgueseria/capas/capa-3-tomate.png",     alto: 157, topArmado: 212, topExplotado: 455,  topEtiqueta: 360, etiqueta: "Tomate en rodajas",  z: 4 },
  // prettier-ignore
  { src: "/hamburgueseria/capas/capa-4-medallon.png",   alto: 232, topArmado: 309, topExplotado: 662,  topEtiqueta: 465, etiqueta: "Medallón 180 g",     z: 3 },
  // prettier-ignore
  { src: "/hamburgueseria/capas/capa-5-lechuga.png",    alto: 250, topArmado: 413, topExplotado: 886,  topEtiqueta: 580, etiqueta: "Lechuga crespa",     z: 2 },
  // prettier-ignore
  { src: "/hamburgueseria/capas/capa-6-pan-abajo.png",  alto: 207, topArmado: 508, topExplotado: 1091, topEtiqueta: 690, etiqueta: "Pan brioche",        z: 1 },
];

/** Posición explotada de una capa en mobile (separación reducida). */
export function topExplotadoMobile(capa: Capa): number {
  return capa.topArmado + FACTOR_MOBILE * (capa.topExplotado - capa.topArmado);
}

/**
 * Desplazamiento inicial de una capa, en % de SU PROPIO alto: la lleva de la
 * posición explotada (donde queda apoyada en el DOM) de vuelta a la apilada.
 * Se expresa en % y no en px para que el viaje escale junto con el contenedor
 * — es la única forma de animar con `transform` puro sin medir en JS.
 */
export function desplazamientoArmado(capa: Capa, topExplotado: number): string {
  return `${(-((topExplotado - capa.topArmado) / capa.alto) * 100).toFixed(2)}%`;
}

/** Numeral de la capa en el póster ("01"…"06"). */
export function numeralCapa(indice: number): string {
  return String(indice + 1).padStart(2, "0");
}
