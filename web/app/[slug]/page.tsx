import { notFound } from "next/navigation";
import { getProspectBySlug } from "@/lib/prospects";
import HamburgueseriaTemplate from "@templates/hamburgueseria/Template";

export const dynamic = "force-dynamic";

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
