/*
 * Lecturas derivadas de `hours`.
 *
 * El póster necesita dos cosas que NO están en el contrato de datos y que
 * sería un error pedirle al que carga el JSON: el número gigante de la
 * sección de horarios ("HASTA LAS 3 AM") y si el local es realmente nocturno.
 * Las dos salen de los horarios cargados, así que se calculan acá en vez de
 * hardcodearse en la plantilla.
 *
 * `open` es texto libre ("19:00 – 02:00", "20:00 a 03:00", "Cerrado"): se
 * buscan las horas con una regex y se toma la última como cierre.
 */

interface Horario {
  day: string;
  open: string;
}

const HORA = /(\d{1,2})(?::(\d{2}))?/g;

/** Un cierre después de medianoche se ordena como 24h+ para poder compararlo. */
function aMinutos(hora: number, minuto: number): number {
  const total = hora * 60 + minuto;
  /* Todo lo que cierra entre las 00:00 y las 06:00 pertenece a la noche
   * anterior: 02:00 es MÁS TARDE que 23:00, no seis horas antes. */
  return total <= 6 * 60 ? total + 24 * 60 : total;
}

function cierreDeTramo(open: string): number | null {
  const encontradas = [...open.matchAll(HORA)];
  if (encontradas.length === 0) return null;
  const ultima = encontradas[encontradas.length - 1];
  const hora = Number(ultima[1]);
  const minuto = Number(ultima[2] ?? 0);
  if (hora > 23 || minuto > 59) return null;
  return aMinutos(hora, minuto);
}

/** Cierre más tardío de la semana, en minutos. */
export function cierreMasTarde(hours?: Horario[]): number | null {
  if (!hours?.length) return null;
  const cierres = hours
    .map((h) => cierreDeTramo(h.open))
    .filter((m): m is number => m !== null);
  return cierres.length ? Math.max(...cierres) : null;
}

/** "3 AM", "11:30 PM" — el número gigante del póster. */
export function formatearCierre(minutos: number): string {
  const total = minutos % (24 * 60);
  const hora24 = Math.floor(total / 60);
  const minuto = total % 60;
  const sufijo = hora24 < 12 ? "AM" : "PM";
  const hora12 = hora24 % 12 === 0 ? 12 : hora24 % 12;
  return minuto === 0
    ? `${hora12} ${sufijo}`
    : `${hora12}:${String(minuto).padStart(2, "0")} ${sufijo}`;
}

/**
 * ¿El local cierra después de medianoche? Decide si la página puede afirmar
 * que abre cuando el resto cierra: el CLAUDE.md prohíbe inventar datos del
 * negocio, así que ese titular solo se muestra si los horarios lo respaldan.
 */
export function esNocturno(hours?: Horario[]): boolean {
  const cierre = cierreMasTarde(hours);
  return cierre !== null && cierre >= 24 * 60;
}
