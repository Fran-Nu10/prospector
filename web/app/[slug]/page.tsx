import { notFound } from "next/navigation";
import { getAllProspects, getProspectBySlug } from "@/lib/prospects";
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
