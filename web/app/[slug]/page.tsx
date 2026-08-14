import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllProspects, getProspectBySlug } from "@/lib/prospects";
import type { ClientData } from "@/lib/schema";
import { SITE_URL, urlAbsoluta } from "@/lib/site";
import HamburgueseriaTemplate from "@templates/hamburgueseria/Template";

/*
 * Las demos se prerenderizan en build, no por request.
 *
 * No es una optimización: es un requisito para que anden en producción. Los
 * JSON de prospectos viven en `data/prospects/`, fuera de `web/`, y se leen
 * del filesystem con una ruta calculada. En build ese directorio existe; en
 * runtime, dentro de una función serverless, NO viaja con el bundle — Next no
 * puede trazar una lectura que no puede analizar estáticamente. Con
 * `force-dynamic` la lectura se hacía en cada request y toda demo respondía
 * 404 en Vercel, aunque en local funcionara.
 *
 * Publicar un prospecto nuevo pide un redeploy. No se pierde nada: el
 * filesystem de Vercel es inmutable, así que también lo pedía antes.
 */

/* Un slug que no existía en build responde 404 directo, sin intentar una
 * lectura de disco que ya sabemos que no puede salir bien. */
export const dynamicParams = false;

export async function generateStaticParams() {
  const prospects = await getAllProspects();
  return prospects.map((p) => ({ slug: p.slug }));
}

/* ---------------------------------------------------------------------------
 * Metadata por prospecto.
 *
 * La demo se comparte por WhatsApp y la abre el dueño del restaurante: el
 * título y la preview tienen que ser SUYOS. Con la metadata del layout, el
 * link llegaba anunciando "Prospector — Demos profesionales para restaurantes
 * de Montevideo", que delata la herramienta antes de que el tipo vea la
 * página.
 *
 * Todo sale del ClientData. Nada de esto se hardcodea por prospecto, y no se
 * inventa nada que el JSON no traiga: sin tagline no hay bajada de título,
 * sin `shareImage` no hay imagen. Una preview sin foto es preferible a una con
 * el ícono de imagen rota.
 * ------------------------------------------------------------------------ */

/** Techo del título antes de que los clientes lo corten por la mitad. */
const LARGO_TITULO = 70;
/** Techo de la descripción, en el rango que respetan buscadores y WhatsApp. */
const LARGO_DESCRIPCION = 158;

/**
 * Las demos NO se indexan: son material comercial de un negocio que todavía no
 * es cliente, y no deben competir con su sitio real ni aparecer en búsquedas.
 * `noindex` no afecta la preview: el crawler de WhatsApp lee Open Graph igual.
 */
const SIN_INDEXAR: Metadata["robots"] = {
  index: false,
  follow: false,
  noimageindex: true,
};

function normalizarTexto(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

/** Recorta sin dejar una palabra partida al medio. */
function recortar(texto: string, largo: number): string {
  if (texto.length <= largo) return texto;
  const corte = texto.slice(0, largo);
  const ultimoEspacio = corte.lastIndexOf(" ");
  /* Si el último espacio deja un resto ridículamente corto (una primera
   * palabra larguísima), se corta duro antes que devolver dos sílabas. */
  const base = ultimoEspacio > largo * 0.6 ? corte.slice(0, ultimoEspacio) : corte;
  return `${base.replace(/[\s.,;:—–-]+$/, "")}…`;
}

/**
 * Nombre del negocio como identidad, y la tagline como bajada solo si existe.
 * Si la tagline ya nombra al negocio, se usa sola: repetir el nombre gasta la
 * mitad del título en decir dos veces lo mismo.
 */
function construirTitulo(data: ClientData): string {
  const nombre = normalizarTexto(data.name);
  const tagline = data.tagline ? normalizarTexto(data.tagline) : "";
  if (!tagline) return nombre;
  if (tagline.toLowerCase().includes(nombre.toLowerCase())) return tagline;

  const completo = `${nombre} — ${tagline}`;
  /* Con una tagline larga, el nombre solo es mejor que un título cortado. */
  return completo.length <= LARGO_TITULO ? completo : nombre;
}

/**
 * Orden de preferencia: la bajada del hero es la frase más trabajada del JSON,
 * después la tagline, y el relato solo como último recurso porque arranca
 * contando la historia y no describe el negocio.
 */
function construirDescripcion(data: ClientData): string {
  for (const candidato of [data.hero?.sub, data.tagline, data.about]) {
    const texto = candidato ? normalizarTexto(candidato) : "";
    if (texto) return recortar(texto, LARGO_DESCRIPCION);
  }
  /* Sin ningún texto cargado, solo el nombre: cualquier otra cosa sería
   * inventarle al negocio una especialidad o una zona. */
  return normalizarTexto(data.name);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProspectBySlug(slug);

  if (!data) {
    return { title: "Página no encontrada", robots: SIN_INDEXAR };
  }

  const title = construirTitulo(data);
  const description = construirDescripcion(data);
  const imagen = data.shareImage ? urlAbsoluta(data.shareImage) : null;

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    robots: SIN_INDEXAR,
    openGraph: {
      type: "website",
      locale: "es_UY",
      siteName: data.name,
      url: urlAbsoluta(`/${data.slug}`),
      title,
      description,
      ...(imagen ? { images: [{ url: imagen, alt: data.name }] } : {}),
    },
    /* Sin imagen no hay tarjeta grande que mostrar: se omite entera en vez de
     * declarar un `summary_large_image` vacío. */
    ...(imagen
      ? {
          twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [imagen],
          } satisfies Metadata["twitter"],
        }
      : {}),
  };
}

/**
 * Elige la plantilla según data.vertical. Los verticales sin plantilla
 * todavía caen al render crudo del ClientData.
 */
export default async function ProspectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getProspectBySlug(slug);

  if (!data) notFound();

  if (data.vertical === "hamburgueseria") {
    return <HamburgueseriaTemplate data={data} />;
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <p className="text-sm uppercase tracking-wide text-gray-500">
        {data.vertical} · /{data.slug}
      </p>
      <h1 className="mt-1 text-3xl font-bold">{data.name}</h1>
      {data.tagline && <p className="mt-2 text-gray-600">{data.tagline}</p>}

      <h2 className="mt-8 text-sm font-semibold uppercase text-gray-500">
        ClientData crudo
      </h2>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-green-300">
        {JSON.stringify(data, null, 2)}
      </pre>
    </main>
  );
}
