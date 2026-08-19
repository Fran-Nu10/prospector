import type { ClientData } from "../../../web/lib/schema";

/*
 * Cáscara de las páginas del ecommerce (checkout y pedido).
 *
 * No reusa la `Nav` de la landing a propósito: ahí el CTA lleva a WhatsApp y
 * los enlaces son anclas de una sola página. Acá la única navegación que tiene
 * sentido es volver al menú, y la barra tiene que ser lo más quieta posible —
 * quien está completando un pedido no necesita que nada más le llame la
 * atención.
 *
 * Es componente de SERVIDOR: solo pinta el marco. Lo interactivo llega como
 * `children`.
 */

export default function Pagina({
  data,
  children,
}: {
  data: ClientData;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen overflow-x-clip bg-noche font-body text-hueso">
      <header className="sticky top-0 z-40 bg-negro">
        <nav className="mx-auto flex max-w-[1360px] items-center justify-between gap-24 px-20 py-16 md:px-40">
          <a
            href={`/${data.slug}`}
            className="whitespace-nowrap font-mono text-body-sm font-bold uppercase tracking-[0.18em] text-hueso"
          >
            {data.name}
          </a>
          <a
            href={`/${data.slug}#menu`}
            className="text-body-sm font-medium text-hueso hover:text-rescoldo"
          >
            Volver al menú
          </a>
        </nav>
      </header>

      <main className="mx-auto max-w-[1360px] px-20 pb-100 pt-32 md:px-40 md:pb-148 md:pt-56">
        {children}
      </main>
    </div>
  );
}
