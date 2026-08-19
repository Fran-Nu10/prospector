import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllProspects } from "@/lib/prospects";
import { cargarCatalogo } from "@/lib/ecommerce/vistas";
import Pagina from "@templates/hamburgueseria/ecommerce/Pagina";
import Checkout from "@templates/hamburgueseria/ecommerce/Checkout";
import TiendaProvider from "@templates/hamburgueseria/ecommerce/TiendaProvider";

/*
 * CHECKOUT — página propia, no una hoja apilada.
 *
 * Se prerenderiza como el resto del sitio: el catálogo, las zonas y la
 * configuración salen del repositorio en build (ver `[slug]/page.tsx` para el
 * porqué de generar estático). El carrito y el formulario son del navegador, así
 * que el contenido real lo arma el cliente sobre esta cáscara.
 *
 * Un prospecto que NO es la instalación de ecommerce no tiene checkout: su demo
 * sigue siendo una carta con CTA de WhatsApp.
 */

export const dynamicParams = false;

export async function generateStaticParams() {
  const prospectos = await getAllProspects();
  return prospectos.map((p) => ({ slug: p.slug }));
}

/** Ni el checkout ni el pedido se indexan: son pantallas privadas de compra. */
export const metadata: Metadata = {
  title: "Tu pedido",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const fuente = await cargarCatalogo(slug);
  if (!fuente || fuente.modo !== "ecommerce") notFound();

  const prospectos = await getAllProspects();
  const data = prospectos.find((p) => p.slug === slug);
  if (!data) notFound();

  return (
    <Pagina data={data}>
      <h1 className="mb-24 font-display uppercase leading-heading tracking-display text-hueso text-[clamp(36px,9vw,72px)]">
        Tu pedido
      </h1>
      <TiendaProvider fuente={fuente} slug={slug}>
        <Checkout nombreNegocio={data.name} direccion={data.address} />
      </TiendaProvider>
    </Pagina>
  );
}
