import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { datosDeLaInstalacion } from "@/lib/ecommerce/vistas";
import Pagina from "@templates/hamburgueseria/ecommerce/Pagina";
import PedidoVista from "@templates/hamburgueseria/ecommerce/PedidoVista";

/*
 * PEDIDO — se recupera por su `publicToken`.
 *
 * POR QUÉ ESTA RUTA NO SE PRERENDERIZA. Los tokens se crean al comprar: no
 * existen en build, así que no hay `generateStaticParams` posible. Se resuelve a
 * demanda.
 *
 * Y POR QUÉ NO LEE EL FILESYSTEM. `getProspectBySlug` lee `data/prospects/`, que
 * en build existe y dentro de una función serverless NO (está documentado en
 * `[slug]/page.tsx`: por eso el resto del sitio es estático). Como la
 * instalación de ecommerce es de un solo restaurante, los datos se toman del
 * bundle. Sin disco, sin sorpresas en producción.
 *
 * El pedido en sí no se busca acá: vive en el navegador donde se creó y lo
 * resuelve el cliente contra el repositorio.
 */

export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

export const metadata: Metadata = {
  title: "Tu pedido",
  robots: { index: false, follow: false },
};

export default async function PedidoPage({
  params,
}: {
  params: Promise<{ slug: string; publicToken: string }>;
}) {
  const { slug, publicToken } = await params;
  const { slug: instalacion, data } = datosDeLaInstalacion();
  if (slug !== instalacion) notFound();

  return (
    <Pagina data={data}>
      <PedidoVista token={publicToken} slug={slug} whatsapp={data.whatsapp} />
    </Pagina>
  );
}
