/**
 * URL pública del sitio.
 *
 * La metadata social (Open Graph, Twitter) exige URLs ABSOLUTAS: el crawler de
 * WhatsApp lee el HTML fuera de contexto y una ruta relativa no le sirve. Esa
 * base no puede salir de los headers de la request —las demos se prerenderizan
 * en build, cuando no hay request— ni del dominio de deployment de Vercel, que
 * cambia en cada preview y dejaría links que apuntan a un deploy viejo.
 *
 * Por eso es explícita: `NEXT_PUBLIC_SITE_URL` cuando está definida, y si no
 * el dominio de producción.
 */

/** Dominio de producción actual. Cambiar acá si se migra a dominio propio. */
const FALLBACK_PRODUCCION = "https://prospector-phi-virid.vercel.app";

/** Sin barra final: la agrega `urlAbsoluta` al resolver. */
function normalizar(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export const SITE_URL = normalizar(
  process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_PRODUCCION
);

/**
 * Resuelve un recurso contra `SITE_URL`. Una URL ya absoluta pasa intacta, así
 * que el JSON del prospecto puede traer tanto `/foto.png` como una URL de CDN.
 */
export function urlAbsoluta(recurso: string): string {
  return new URL(recurso, `${SITE_URL}/`).toString();
}
