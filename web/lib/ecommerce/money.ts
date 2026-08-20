/**
 * DINERO — un solo lugar donde los pesos se convierten en texto y al revés.
 *
 * El contrato de datos viejo guarda el precio como string (`"$490"`), que sirve
 * para imprimir una carta y no sirve para nada más: no se suma, no se compara y
 * no se audita. Adentro del ecommerce el precio es SIEMPRE un entero en
 * centésimos, y este módulo es la única frontera.
 *
 *   parsearPrecioLegado("$490")  →  49000     (solo para migrar el seed)
 *   formatearDinero(49000)       →  "$ 490"   (solo para mostrar)
 *
 * Sin este módulo, el formateo se disgrega en veinte concatenaciones distintas
 * y cada una redondea a su manera.
 */

import { MONEDA, type Cents } from "./types";

/** Locale de la instalación. Va junto con la moneda: cambiar uno sin el otro miente. */
const LOCALE = "es-UY";

/**
 * Formatea para mostrar. Los centésimos solo aparecen si existen: un precio de
 * carta se escribe `$ 490`, no `$ 490,00`.
 */
export function formatearDinero(cents: Cents): string {
  if (!Number.isFinite(cents)) return "";
  const decimales = Number.isInteger(cents) && cents % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: MONEDA,
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    /* El separador de miles ayuda a leer `$ 1.250`; el símbolo va estrecho. */
  })
    .format(cents / 100)
    /* Intl mete un espacio duro entre símbolo y número: se normaliza a uno
       común para que las comparaciones en tests no fallen por un byte. */
    .replace(/ | /g, " ");
}

/** Suma segura: evita que un `undefined` se cuele como `NaN` en un total. */
export function sumarCents(valores: readonly Cents[]): Cents {
  return valores.reduce<Cents>((total, v) => total + (Number.isFinite(v) ? v : 0), 0);
}

/** Redondeo defensivo: multiplicar centésimos por cantidad no debe dejar decimales. */
export function multiplicarCents(unitario: Cents, cantidad: number): Cents {
  return Math.round(unitario * cantidad);
}

/* ---------------------------------------------------------------------------
 * Parser de migración
 * ------------------------------------------------------------------------ */

/**
 * Convierte un precio del contrato VIEJO a centésimos.
 *
 * Es deliberadamente estricto y sirve para UNA sola cosa: migrar el seed desde
 * `data/prospects/*.json`. Nunca se usa para validar un precio durante una
 * compra —ahí el precio ya es entero y sale de la base—, porque un parser
 * tolerante convierte un error de carga en una venta a precio equivocado.
 *
 * Acepta:  "$490"  "$ 490"  "490"  "$1.250"  "$490,50"  "UYU 490"  "$U 490"
 * Rechaza: "490.5" (¿miles o decimales?), "desde $490", "490 a 520", "", "gratis"
 *
 * Devuelve `null` ante cualquier ambigüedad. El llamador decide si eso es un
 * aviso o un error: acá no se adivina.
 */
export function parsearPrecioLegado(texto: string | undefined): Cents | null {
  if (typeof texto !== "string") return null;

  const limpio = texto
    .trim()
    .replace(/^(?:\$U|UYU|\$)\s*/i, "") // símbolo o código al principio
    .replace(/\s+/g, "");

  if (!limpio) return null;

  /* Un solo bloque de dígitos, con miles en punto y decimales en coma. Los
     grupos de miles tienen que ser de tres: "1.25" no es mil doscientos
     cincuenta ni un peso veinticinco, es un dato mal cargado. */
  const match = /^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/.exec(limpio);
  if (!match) return null;

  const entero = Number(match[1].replace(/\./g, ""));
  if (!Number.isSafeInteger(entero)) return null;

  const decimales = match[2] ? match[2].padEnd(2, "0") : "00";
  return entero * 100 + Number(decimales);
}

/* ---------------------------------------------------------------------------
 * Entrada de precios en el panel
 *
 * El dueño escribe PESOS (`490`), la base guarda CENTÉSIMOS (`49000`). La
 * conversión vive acá y en ningún otro lado: en cuanto un componente la hace a
 * mano, aparece el producto que salió cien veces más caro.
 * ------------------------------------------------------------------------ */

/**
 * Convierte lo que se tipeó en un campo de precio a centésimos.
 *
 * Acepta:  "490"  " 490 "  "490,50"  "490.5"  "0"
 * Rechaza: "1.250" (¿mil doscientos cincuenta o un peso con veinticinco?),
 *          "-5", "490 pesos", "", "1e3"
 *
 * Es ESTRICTO a propósito. Un parser tolerante en un formulario de precios
 * convierte un error de tipeo en una venta a precio equivocado, y el negocio se
 * entera cuando ya cocinó.
 */
export function parsearPesos(texto: string): Cents | null {
  const limpio = texto.trim().replace(/\s+/g, "");
  if (!limpio) return null;
  /* Un único separador seguido de UNO o DOS dígitos son decimales. Tres
     dígitos detrás del punto es notación de miles y no se adivina. */
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(limpio);
  if (!match) return null;
  const entero = Number(match[1]);
  if (!Number.isSafeInteger(entero)) return null;
  const decimales = match[2] ? match[2].padEnd(2, "0") : "00";
  return entero * 100 + Number(decimales);
}

/**
 * Centésimos → lo que se muestra dentro de un `<input>`: sin símbolo, sin
 * separador de miles y sin decimales cuando son cero. Es la inversa exacta de
 * `parsearPesos`, para que abrir un producto y guardarlo sin tocar nada no le
 * cambie el precio.
 */
export function formatearPesos(cents: Cents): string {
  if (!Number.isFinite(cents)) return "";
  const enteros = Math.trunc(cents / 100);
  const resto = Math.abs(cents % 100);
  return resto === 0
    ? String(enteros)
    : `${enteros},${String(resto).padStart(2, "0")}`;
}

/**
 * Igual que `parsearPesos` pero admite un signo delante.
 *
 * Existe por un caso concreto: el incremento de una opción puede RESTAR ("sin
 * queso, −20"). Un campo vacío vale 0, porque la mayoría de las opciones no
 * cambian el precio y obligar a escribir "0" en cada una es maltrato.
 */
export function parsearPesosConSigno(texto: string): Cents | null {
  const limpio = texto.trim();
  if (!limpio) return 0;
  const negativo = limpio.startsWith("-") || limpio.startsWith("−");
  const cuerpo = negativo ? limpio.slice(1) : limpio;
  const cents = parsearPesos(cuerpo);
  if (cents === null) return null;
  return negativo ? -cents : cents;
}
