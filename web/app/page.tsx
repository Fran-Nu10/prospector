import Link from "next/link";
import { getAllProspects } from "@/lib/prospects";

/* Mismo motivo que en `[slug]/page.tsx`: el índice también sale del
 * filesystem, así que se resuelve en build. Con `force-dynamic` la lista
 * salía vacía en producción. */

export default async function Home() {
  const prospects = await getAllProspects();

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Prospector</h1>
      <p className="mt-2 text-gray-600">
        Demos disponibles ({prospects.length}):
      </p>
      <ul className="mt-4 space-y-2">
        {prospects.map((p) => (
          <li key={p.slug}>
            <Link href={`/${p.slug}`} className="text-blue-600 underline">
              /{p.slug}
            </Link>{" "}
            — {p.name} ({p.vertical})
          </li>
        ))}
      </ul>
    </main>
  );
}
