/*
 * Tipo display sangrado — el recurso central del póster.
 *
 * El nombre del negocio viene del JSON y puede tener 6 o 26 caracteres, así
 * que un tamaño fijo por breakpoint no sirve: con uno corto no llega a los
 * bordes y con uno largo desborda. Acá el tamaño se calcula a partir de
 * CUÁNTOS caracteres tiene la línea, para que la mancha de tinta ocupe
 * siempre el mismo porcentaje del viewport y corte contra los dos bordes.
 *
 * Todo sale como un `clamp()` de CSS: una sola escala fluida y continua, sin
 * saltos por breakpoint, y sin medir nada en JS.
 */

/**
 * Avance medio de un carácter de Anton en mayúsculas, en em, ya con el
 * tracking de +0.06em del sistema incluido. Medido sobre el nombre del
 * contrato de datos; alcanza para estimar el ancho de una línea sin layout.
 */
const AVANCE_ANTON = 0.54;

/** Piso duro del sistema: Anton nunca baja de 40px (ver DESIGN.md). */
const MINIMO_ANTON = 40;

/**
 * Tamaño fluido para una línea de display que tiene que sangrar.
 *
 * @param texto        la línea a componer
 * @param maxVw        techo, en vw — evita que una línea de 3 letras explote
 * @param anchoObjetivo qué porcentaje del viewport debe ocupar la línea
 */
export function tamanoSangrado(
  texto: string,
  maxVw: number,
  anchoObjetivo = 96
): string {
  const caracteres = Math.max(texto.trim().length, 1);
  const divisor = (caracteres * AVANCE_ANTON).toFixed(2);
  return `clamp(${MINIMO_ANTON}px, calc(${anchoObjetivo}vw / ${divisor}), ${maxVw}vw)`;
}

/**
 * Le pone techo de ALTURA a un tamaño ya calculado por ancho.
 *
 * El sangrado solo mira el ancho del viewport, y eso alcanza mientras el
 * póster fluye en el documento. Dentro de un viewport fijo de `100svh` no: en
 * una pantalla ancha y baja, dos líneas dimensionadas por ancho no entran a lo
 * alto. El tope se activa solo ahí; en mobile y en pantallas altas manda el
 * ancho y el sangrado se conserva intacto.
 */
export function conTopeAlto(tamano: string, topeSvh: number): string {
  return `min(${tamano}, ${topeSvh}svh)`;
}

/**
 * Parte el nombre en las dos líneas del hero, equilibradas por CANTIDAD DE
 * CARACTERES y no de palabras: "La Pasiva Pocitos" corta en "LA PASIVA" /
 * "POCITOS" y las dos líneas terminan con un tamaño parecido, que es lo que
 * hace que el bloque se lea como un solo póster.
 *
 * Un nombre de una sola palabra devuelve una única línea: partir una palabra
 * al medio se lee como error, no como recurso.
 */
export function dividirNombre(nombre: string): string[] {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length < 2) return [nombre.trim()];

  let mejorCorte = 1;
  let mejorDiferencia = Infinity;
  for (let corte = 1; corte < palabras.length; corte++) {
    const arriba = palabras.slice(0, corte).join(" ").length;
    const abajo = palabras.slice(corte).join(" ").length;
    const diferencia = Math.abs(arriba - abajo);
    if (diferencia < mejorDiferencia) {
      mejorDiferencia = diferencia;
      mejorCorte = corte;
    }
  }
  return [
    palabras.slice(0, mejorCorte).join(" "),
    palabras.slice(mejorCorte).join(" "),
  ];
}

/** Numeral de sección del póster: 1 → "01". */
export function numeral(n: number): string {
  return String(n).padStart(2, "0");
}
