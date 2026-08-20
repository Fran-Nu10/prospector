import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllProspects } from "@/lib/prospects";
import Pagina from "@templates/hamburgueseria/ecommerce/Pagina";
import Productos from "@templates/hamburgueseria/admin/Productos";
import PanelProvider from "@templates/hamburgueseria/admin/PanelProvider";

/*
 * CATÁLOGO DEL LOCAL — productos y categorías.
 *
 * La cáscara se prerenderiza; el permiso se resuelve en el cliente, donde vive
 * la sesión de demostración. Un empleado que escriba esta URL a mano llega al
 * HTML —es estático— y NO al contenido: el marco comprueba el rol antes de
 * renderizar nada del catálogo.
 */

export const dynamicParams = false;

export async function generateStaticParams() {
  const prospectos = await getAllProspects();
  return prospectos.map((p) => ({ slug: p.slug }));
}

export const metadata: Metadata = {
  title: "Productos",
  robots: { index: false, follow: false },
};

export default async function ProductosPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const prospectos = await getAllProspects();
  const data = prospectos.find((p) => p.slug === slug);
  if (!data) notFound();

  return (
    <Pagina data={data}>
      <PanelProvider>
        <Productos slug={slug} />
      </PanelProvider>
    </Pagina>
  );
}
