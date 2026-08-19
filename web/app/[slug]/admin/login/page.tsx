import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllProspects } from "@/lib/prospects";
import Pagina from "@templates/hamburgueseria/ecommerce/Pagina";
import Acceso from "@templates/hamburgueseria/admin/Acceso";
import PanelProvider from "@templates/hamburgueseria/admin/PanelProvider";

/*
 * ACCESO AL PANEL — de demostración.
 *
 * No hay usuarios ni contraseñas: se elige un rol. La pantalla lo dice con
 * todas las letras en vez de simular un login que no verifica nada.
 */

export const dynamicParams = false;

export async function generateStaticParams() {
  const prospectos = await getAllProspects();
  return prospectos.map((p) => ({ slug: p.slug }));
}

export const metadata: Metadata = {
  title: "Acceso al panel",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
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
        <Acceso slug={slug} />
      </PanelProvider>
    </Pagina>
  );
}
