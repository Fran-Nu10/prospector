import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllProspects } from "@/lib/prospects";
import Pagina from "@templates/hamburgueseria/ecommerce/Pagina";
import Configuracion from "@templates/hamburgueseria/admin/Configuracion";
import PanelProvider from "@templates/hamburgueseria/admin/PanelProvider";

/*
 * CONFIGURACIÓN OPERATIVA Y ZONAS DE DELIVERY.
 *
 * Igual que el resto del panel: cáscara estática, permiso resuelto en el
 * cliente contra la sesión de demostración. El empleado que llegue por la URL
 * ve el marco y el aviso de que la sección es del dueño, nunca la configuración.
 */

export const dynamicParams = false;

export async function generateStaticParams() {
  const prospectos = await getAllProspects();
  return prospectos.map((p) => ({ slug: p.slug }));
}

export const metadata: Metadata = {
  title: "Configuración",
  robots: { index: false, follow: false },
};

export default async function ConfiguracionPage({
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
        <Configuracion slug={slug} />
      </PanelProvider>
    </Pagina>
  );
}
