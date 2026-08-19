import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllProspects } from "@/lib/prospects";
import Pagina from "@templates/hamburgueseria/ecommerce/Pagina";
import Panel from "@templates/hamburgueseria/admin/Panel";
import PanelProvider from "@templates/hamburgueseria/admin/PanelProvider";

/*
 * PANEL DEL LOCAL.
 *
 * La cáscara se prerenderiza; todo lo demás —sesión, pedidos, acciones— vive en
 * el cliente, porque en modo demo los pedidos están en el navegador.
 *
 * NO se enlaza desde la navegación pública: se entra por la URL. Es una
 * pantalla de trabajo, no una sección del sitio.
 */

export const dynamicParams = false;

export async function generateStaticParams() {
  const prospectos = await getAllProspects();
  return prospectos.map((p) => ({ slug: p.slug }));
}

export const metadata: Metadata = {
  title: "Pedidos",
  robots: { index: false, follow: false },
};

export default async function AdminPage({
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
        <Panel slug={slug} />
      </PanelProvider>
    </Pagina>
  );
}
