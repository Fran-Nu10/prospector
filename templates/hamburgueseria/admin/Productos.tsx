"use client";

import { useMemo, useState } from "react";
import {
  camposDeModo,
  modoDisponibilidad,
} from "../../../web/lib/ecommerce/domain";
import { formatearDinero } from "../../../web/lib/ecommerce/money";
import type { Category, Product } from "../../../web/lib/ecommerce/types";
import Categorias from "./Categorias";
import FormProducto from "./FormProducto";
import Marco from "./Marco";
import { Selector, Texto } from "./campos";
import { usePanel } from "./PanelProvider";

/*
 * PRODUCTOS — la pantalla donde el dueño administra lo que vende.
 *
 * Es una LISTA AGRUPADA POR CATEGORÍA y no una tabla. Dos razones: en mobile
 * una tabla se comprime hasta ser ilegible o se va de ancho, y el orden de los
 * productos ES el orden de la carta, así que verlos agrupados como se ven en el
 * sitio hace que reordenar tenga sentido.
 *
 * Subir y bajar son botones, no arrastre: funcionan con el teclado, con un dedo
 * y con un lector de pantalla sin escribir nada especial para cada uno.
 *
 * NINGUNA ACCIÓN BORRA. La más destructiva archiva, y lo archivado se puede
 * volver a traer desde el filtro.
 */

type FiltroEstado =
  | "todos"
  | "publicados"
  | "apagados"
  | "agotados"
  | "archivados";

const ESTADOS: { valor: FiltroEstado; titulo: string }[] = [
  { valor: "todos", titulo: "Todos" },
  { valor: "publicados", titulo: "Publicados" },
  { valor: "apagados", titulo: "Apagados" },
  { valor: "agotados", titulo: "Sin disponibilidad" },
  { valor: "archivados", titulo: "Archivados" },
];

/** Cómo se cuenta este producto hoy, en una línea. */
function estadoDe(producto: Product): string {
  if (producto.archived) return "Archivado";
  const partes: string[] = [producto.active ? "Publicado" : "Apagado"];
  const modo = modoDisponibilidad(producto);
  if (modo === "sold_out") partes.push("Agotado");
  if (modo === "limited") {
    partes.push(
      producto.stockQuantity === 0
        ? "Sin stock"
        : `Quedan ${producto.stockQuantity}`
    );
  }
  return partes.join(" · ");
}

function Boton({
  children,
  onClick,
  disabled,
  etiqueta,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  etiqueta?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      className="min-h-[44px] min-w-[44px] border border-negro px-12 font-mono text-caption uppercase tracking-[0.18em] text-rescoldo hover:text-hueso disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Fila({
  producto,
  onEditar,
  onMover,
  puedeSubir,
  puedeBajar,
}: {
  producto: Product;
  onEditar: () => void;
  onMover: (direccion: -1 | 1) => void;
  puedeSubir: boolean;
  puedeBajar: boolean;
}) {
  const panel = usePanel();
  if (!panel) return null;

  const modo = modoDisponibilidad(producto);
  const guardar = (cambio: Parameters<typeof panel.guardar>[0]) =>
    panel.guardar(cambio);

  return (
    <li className="flex flex-wrap items-center gap-12 border-b border-negro py-12">
      <span className="flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden border border-negro bg-carbon">
        {producto.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={producto.imageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="font-mono text-caption text-rescoldo">—</span>
        )}
      </span>

      <div className="flex min-w-[160px] flex-1 flex-col gap-4">
        <span className="text-body-sm font-bold text-hueso">{producto.name}</span>
        <span className="font-mono text-caption text-rescoldo">
          {producto.priceCents > 0
            ? formatearDinero(producto.priceCents)
            : "Sin precio"}{" "}
          · {estadoDe(producto)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-8">
        {!producto.archived && (
          <>
            <Boton
              onClick={() => onMover(-1)}
              disabled={!puedeSubir}
              etiqueta={`Subir ${producto.name}`}
            >
              ↑
            </Boton>
            <Boton
              onClick={() => onMover(1)}
              disabled={!puedeBajar}
              etiqueta={`Bajar ${producto.name}`}
            >
              ↓
            </Boton>
            <Boton
              onClick={() =>
                guardar((repos) =>
                  repos.catalog.setAvailability(producto.id, {
                    active: !producto.active,
                  })
                )
              }
            >
              {producto.active ? "Apagar" : "Publicar"}
            </Boton>
            <Boton
              onClick={() =>
                guardar((repos) =>
                  repos.catalog.setAvailability(
                    producto.id,
                    camposDeModo(modo === "sold_out" ? "available" : "sold_out")
                  )
                )
              }
            >
              {modo === "sold_out" ? "Hay" : "Agotado"}
            </Boton>
            <Boton onClick={onEditar}>Editar</Boton>
            <Boton
              onClick={() =>
                guardar((repos) => repos.catalog.duplicateProduct(producto.id))
              }
            >
              Duplicar
            </Boton>
          </>
        )}
        <button
          type="button"
          onClick={() =>
            guardar((repos) =>
              repos.catalog.updateProduct(producto.id, {
                archived: !producto.archived,
                /* Restaurar NO republica: vuelve apagado para que alguien lo
                   revise antes de que reaparezca en la carta. */
                ...(producto.archived ? { active: false } : {}),
              })
            )
          }
          className="min-h-[44px] px-12 font-mono text-caption uppercase tracking-[0.18em] text-rescoldo underline underline-offset-4 hover:text-hueso"
        >
          {producto.archived ? "Restaurar" : "Archivar"}
        </button>
      </div>
    </li>
  );
}

export default function Productos({ slug }: { slug: string }) {
  const panel = usePanel();
  const [seccion, setSeccion] = useState<"productos" | "categorias">("productos");
  const [busqueda, setBusqueda] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [estado, setEstado] = useState<FiltroEstado>("todos");
  const [editando, setEditando] = useState<Product | null>(null);
  const [formAbierto, setFormAbierto] = useState(false);

  const catalogo = panel?.catalogo;

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (catalogo?.productos ?? []).filter((p) => {
      if (texto && !`${p.name} ${p.slug}`.toLowerCase().includes(texto)) {
        return false;
      }
      if (categoriaId && p.categoryId !== categoriaId) return false;
      if (estado === "archivados") return p.archived;
      if (p.archived) return false;
      if (estado === "publicados") return p.active;
      if (estado === "apagados") return !p.active;
      if (estado === "agotados") {
        const modo = modoDisponibilidad(p);
        return modo === "sold_out" || p.stockQuantity === 0;
      }
      return true;
    });
  }, [catalogo?.productos, busqueda, categoriaId, estado]);

  if (!panel || !catalogo) return null;

  const categorias = catalogo.categorias.filter((c) => !c.archived);

  const mover = (producto: Product, direccion: -1 | 1) => {
    /* Se reordena contra la categoría ENTERA, no contra lo que se ve: mover un
       producto con un filtro puesto no puede reacomodar los que están
       escondidos. */
    const hermanos = catalogo.productos
      .filter((p) => p.categoryId === producto.categoryId && !p.archived)
      .sort((a, b) => a.position - b.position);
    const i = hermanos.findIndex((p) => p.id === producto.id);
    const destino = i + direccion;
    if (i < 0 || destino < 0 || destino >= hermanos.length) return;
    const orden = hermanos.map((p) => p.id);
    [orden[i], orden[destino]] = [orden[destino], orden[i]];
    panel.guardar((repos) =>
      repos.catalog.reorderProducts(producto.categoryId, orden)
    );
  };

  const abrirNuevo = () => {
    setEditando(null);
    setFormAbierto(true);
  };

  const grupos: { categoria: Category | null; items: Product[] }[] =
    estado === "archivados"
      ? [{ categoria: null, items: filtrados }]
      : categorias
          .map((categoria) => ({
            categoria,
            items: filtrados
              .filter((p) => p.categoryId === categoria.id)
              .sort((a, b) => a.position - b.position),
          }))
          .filter((g) => g.items.length > 0);

  return (
    <Marco
      slug={slug}
      area="productos"
      titulo="Productos"
      acciones={
        <button
          type="button"
          onClick={abrirNuevo}
          disabled={categorias.length === 0}
          className="inline-flex min-h-[44px] items-center rounded-button bg-brasa px-20 text-body-sm font-bold text-hueso disabled:bg-carbon disabled:text-rescoldo"
        >
          Nuevo producto
        </button>
      }
    >
      <div className="flex flex-col gap-24">
        <nav aria-label="Qué se administra" className="flex gap-8">
          {(["productos", "categorias"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeccion(s)}
              aria-current={seccion === s ? "true" : undefined}
              className={`inline-flex min-h-[44px] items-center border px-16 font-mono text-caption uppercase tracking-[0.18em] ${
                seccion === s
                  ? "border-brasa bg-carbon text-hueso"
                  : "border-negro text-rescoldo hover:text-hueso"
              }`}
            >
              {s === "productos" ? "Productos" : "Categorías"}
            </button>
          ))}
        </nav>

        {seccion === "categorias" ? (
          <Categorias />
        ) : !catalogo.cargado ? (
          <p className="py-64 text-center font-mono text-body-sm uppercase tracking-[0.22em] text-rescoldo">
            Cargando catálogo…
          </p>
        ) : (
          <>
            <div className="grid gap-12 md:grid-cols-3">
              <Texto
                etiqueta="Buscar"
                valor={busqueda}
                onCambio={setBusqueda}
                placeholder="Nombre o dirección"
              />
              <Selector
                etiqueta="Categoría"
                valor={categoriaId}
                onCambio={setCategoriaId}
                opciones={[
                  { valor: "", titulo: "Todas" },
                  ...categorias.map((c) => ({ valor: c.id, titulo: c.name })),
                ]}
              />
              <Selector
                etiqueta="Estado"
                valor={estado}
                onCambio={(v) => setEstado(v as FiltroEstado)}
                opciones={ESTADOS}
              />
            </div>

            {categorias.length === 0 && (
              <p className="border-l-2 border-brasa pl-12 text-body-sm leading-body text-rescoldo">
                Todavía no hay categorías. Creá una en la pestaña Categorías
                para poder cargar productos.
              </p>
            )}

            {grupos.length === 0 ? (
              <p className="py-64 text-center text-body-sm text-rescoldo">
                No hay productos que coincidan con el filtro.
              </p>
            ) : (
              grupos.map(({ categoria, items }) => (
                <section
                  key={categoria?.id ?? "archivados"}
                  className="flex flex-col gap-8"
                >
                  <h2 className="font-mono text-body-sm uppercase tracking-[0.22em] text-queso">
                    {categoria
                      ? `${categoria.name}${categoria.active ? "" : " · apagada"}`
                      : "Archivados"}
                  </h2>
                  <ul role="list" className="flex flex-col border-t border-negro">
                    {items.map((producto, i) => (
                      <Fila
                        key={producto.id}
                        producto={producto}
                        onEditar={() => {
                          setEditando(producto);
                          setFormAbierto(true);
                        }}
                        onMover={(d) => mover(producto, d)}
                        puedeSubir={i > 0}
                        puedeBajar={i < items.length - 1}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </>
        )}
      </div>

      {formAbierto && (
        <FormProducto
          producto={editando}
          categoriaPorDefecto={
            /* `||` y no `??`: "Todas" es la cadena vacía, que es un filtro
               válido pero no una categoría donde crear. */
            editando?.categoryId || categoriaId || categorias[0]?.id || ""
          }
          onCerrar={() => setFormAbierto(false)}
        />
      )}
    </Marco>
  );
}
