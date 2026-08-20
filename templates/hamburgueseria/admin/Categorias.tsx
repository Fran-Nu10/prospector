"use client";

import { useState } from "react";
import {
  aSlug,
  productosVivosDeCategoria,
  validarCategoria,
} from "../../../web/lib/ecommerce/domain";
import type { Category } from "../../../web/lib/ecommerce/types";
import Hoja from "../ecommerce/Hoja";
import { Interruptor, Texto } from "./campos";
import { usePanel } from "./PanelProvider";

/*
 * CATEGORÍAS — la estructura de la carta.
 *
 * Son pocas y se tocan poco, así que la pantalla es una lista con las acciones
 * a la vista: nada de arrastrar, nada de menús contextuales. Subir y bajar son
 * botones porque un botón funciona con el teclado, con un dedo y con un lector
 * de pantalla; el arrastre no funciona con ninguno de los tres sin trabajo
 * extra que acá no se justifica.
 *
 * NO HAY BORRAR. Una categoría con productos vivos ni siquiera se archiva: el
 * producto quedaría colgando de un padre invisible. Primero se mueven o se
 * archivan los productos, y eso lo dice la pantalla antes de que el proveedor
 * tenga que rechazarlo.
 */

function FormCategoria({
  categoria,
  onCerrar,
}: {
  categoria: Category | null;
  onCerrar: () => void;
}) {
  const panel = usePanel();
  const [name, setName] = useState(categoria?.name ?? "");
  const [slug, setSlug] = useState(categoria?.slug ?? "");
  const [active, setActive] = useState(categoria?.active ?? true);
  const [slugManual, setSlugManual] = useState(categoria !== null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  if (!panel) return null;

  const guardar = async () => {
    if (guardando) return;
    const encontrados = validarCategoria(
      { name, slug },
      { categorias: panel.catalogo.categorias, idActual: categoria?.id }
    );
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    setGuardando(true);
    const datos = { name: name.trim(), slug: slug.trim(), active };
    const resultado = await panel.guardar((repos) =>
      categoria
        ? repos.catalog.updateCategory(categoria.id, datos)
        : repos.catalog.createCategory(datos)
    );
    setGuardando(false);
    if (resultado) onCerrar();
  };

  return (
    <Hoja
      abierta
      onCerrar={onCerrar}
      titulo={categoria ? "Editar categoría" : "Nueva categoría"}
      pie={
        <div className="flex items-center gap-12">
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            aria-busy={guardando}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-button bg-brasa px-24 text-body font-bold text-hueso disabled:bg-carbon disabled:text-rescoldo"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="min-h-[48px] font-mono text-caption uppercase tracking-[0.18em] text-rescoldo underline underline-offset-4 hover:text-hueso"
          >
            Cancelar
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-16">
        <Texto
          etiqueta="Nombre"
          valor={name}
          autoFocus
          onCambio={(v) => {
            setName(v);
            if (!slugManual) setSlug(aSlug(v));
          }}
          error={errores.name}
          placeholder="Hamburguesas"
        />
        <Texto
          etiqueta="Dirección (slug)"
          valor={slug}
          onCambio={(v) => {
            setSlugManual(true);
            setSlug(aSlug(v));
          }}
          error={errores.slug}
          ayuda="Única entre las categorías."
        />
        <Interruptor
          etiqueta="Activa"
          detalle="Apagada desaparece de la carta, y sus productos dejan de poder pedirse."
          valor={active}
          onCambio={setActive}
        />
      </div>
    </Hoja>
  );
}

export default function Categorias() {
  const panel = usePanel();
  const [editando, setEditando] = useState<Category | null>(null);
  const [abierto, setAbierto] = useState(false);

  if (!panel) return null;
  const { categorias, productos } = panel.catalogo;
  const visibles = categorias.filter((c) => !c.archived);

  const mover = (indice: number, direccion: -1 | 1) => {
    const destino = indice + direccion;
    if (destino < 0 || destino >= visibles.length) return;
    const orden = visibles.map((c) => c.id);
    [orden[indice], orden[destino]] = [orden[destino], orden[indice]];
    panel.guardar((repos) => repos.catalog.reorderCategories(orden));
  };

  return (
    <section className="flex flex-col gap-16">
      <div className="flex flex-wrap items-center justify-between gap-12">
        <h2 className="font-mono text-body-sm uppercase tracking-[0.22em] text-queso">
          Categorías
        </h2>
        <button
          type="button"
          onClick={() => {
            setEditando(null);
            setAbierto(true);
          }}
          className="inline-flex min-h-[44px] items-center border border-negro px-16 font-mono text-caption uppercase tracking-[0.18em] text-rescoldo hover:text-hueso"
        >
          Nueva categoría
        </button>
      </div>

      <ul role="list" className="flex flex-col border-t border-negro">
        {visibles.map((categoria, i) => {
          const vivos = productosVivosDeCategoria(categoria.id, productos).length;
          return (
            <li
              key={categoria.id}
              className="flex flex-wrap items-center gap-12 border-b border-negro py-12"
            >
              <div className="flex min-w-[180px] flex-1 flex-col gap-4">
                <span className="text-body-sm font-bold text-hueso">
                  {categoria.name}
                </span>
                <span className="font-mono text-caption text-rescoldo">
                  /{categoria.slug} · {vivos}{" "}
                  {vivos === 1 ? "producto" : "productos"}
                  {!categoria.active && " · apagada"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-8">
                <button
                  type="button"
                  aria-label={`Subir ${categoria.name}`}
                  onClick={() => mover(i, -1)}
                  disabled={i === 0}
                  className="min-h-[44px] min-w-[44px] border border-negro font-mono text-caption text-rescoldo hover:text-hueso disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Bajar ${categoria.name}`}
                  onClick={() => mover(i, 1)}
                  disabled={i === visibles.length - 1}
                  className="min-h-[44px] min-w-[44px] border border-negro font-mono text-caption text-rescoldo hover:text-hueso disabled:opacity-40"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() =>
                    panel.guardar((repos) =>
                      repos.catalog.updateCategory(categoria.id, {
                        active: !categoria.active,
                      })
                    )
                  }
                  className="min-h-[44px] border border-negro px-12 font-mono text-caption uppercase tracking-[0.18em] text-rescoldo hover:text-hueso"
                >
                  {categoria.active ? "Apagar" : "Encender"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditando(categoria);
                    setAbierto(true);
                  }}
                  className="min-h-[44px] border border-negro px-12 font-mono text-caption uppercase tracking-[0.18em] text-rescoldo hover:text-hueso"
                >
                  Editar
                </button>
                <button
                  type="button"
                  disabled={vivos > 0}
                  title={
                    vivos > 0
                      ? "Movés o archivás sus productos y recién ahí se puede archivar."
                      : undefined
                  }
                  onClick={() =>
                    panel.guardar((repos) =>
                      repos.catalog.updateCategory(categoria.id, { archived: true })
                    )
                  }
                  className="min-h-[44px] px-12 font-mono text-caption uppercase tracking-[0.18em] text-rescoldo underline underline-offset-4 hover:text-hueso disabled:no-underline disabled:opacity-40"
                >
                  Archivar
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {visibles.length === 0 && (
        <p className="text-body-sm text-rescoldo">
          No hay categorías. Creá una para poder cargar productos.
        </p>
      )}

      {abierto && (
        <FormCategoria categoria={editando} onCerrar={() => setAbierto(false)} />
      )}
    </section>
  );
}
