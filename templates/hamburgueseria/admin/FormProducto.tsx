"use client";

import { useMemo, useState } from "react";
import {
  aSlug,
  camposDeModo,
  modoDisponibilidad,
  validarGruposDeOpciones,
  validarProducto,
} from "../../../web/lib/ecommerce/domain";
import { formatearPesos, parsearPesos } from "../../../web/lib/ecommerce/money";
import type {
  ModoDisponibilidad,
  Product,
  ProductBadge,
} from "../../../web/lib/ecommerce/types";
import Hoja from "../ecommerce/Hoja";
import EditorOpciones, {
  aDominio,
  aFormulario,
  type GrupoForm,
} from "./EditorOpciones";
import {
  AreaTexto,
  CampoImagen,
  Interruptor,
  NotaDeArchivos,
  Opciones,
  Selector,
  Texto,
} from "./campos";
import { usePanel } from "./PanelProvider";

/*
 * ALTA Y EDICIÓN DE UN PRODUCTO.
 *
 * Tres decisiones que gobiernan el archivo:
 *
 * · EL PRECIO SE ESCRIBE EN PESOS Y SE GUARDA EN CENTÉSIMOS, con la conversión
 *   del módulo de dinero. Acá no hay ninguna multiplicación por 100: en cuanto
 *   una pantalla hace esa cuenta a mano, aparece el producto cien veces más caro.
 *
 * · LO QUE VALIDA ES EL DOMINIO. `validarProducto` devuelve errores por campo y
 *   esta pantalla solo los pinta. La misma regla la aplica el proveedor, así
 *   que no se puede guardar por otro camino algo que el formulario rechaza.
 *
 * · NO SE BORRA NADA. El botón destructivo archiva. Los pedidos viejos guardan
 *   copias, pero los reportes por producto siguen mirando su `id`.
 */

const BADGES: { valor: string; titulo: string }[] = [
  { valor: "", titulo: "Sin distintivo" },
  { valor: "destacado", titulo: "Destacado" },
  { valor: "nuevo", titulo: "Nuevo" },
  { valor: "vegano", titulo: "Vegano" },
  { valor: "sin_tacc", titulo: "Sin TACC" },
];

const MODOS = [
  { valor: "available", titulo: "Disponible" },
  { valor: "sold_out", titulo: "Agotado" },
  { valor: "limited", titulo: "Cantidad limitada" },
] as const;

interface Campos {
  name: string;
  slug: string;
  categoryId: string;
  description: string;
  precio: string;
  badge: string;
  active: boolean;
  modo: ModoDisponibilidad;
  stock: string;
  imageUrl: string;
  stageImageUrl: string;
  grupos: GrupoForm[];
}

function camposDe(producto: Product | null, categoriaPorDefecto: string): Campos {
  if (!producto) {
    return {
      name: "",
      slug: "",
      categoryId: categoriaPorDefecto,
      description: "",
      precio: "",
      badge: "",
      /* Un producto nuevo entra PUBLICADO: dar de alta algo para después
         acordarse de encenderlo es la forma más común de que no aparezca. */
      active: true,
      modo: "available",
      stock: "",
      imageUrl: "",
      stageImageUrl: "",
      grupos: [],
    };
  }
  const modo = modoDisponibilidad(producto);
  return {
    name: producto.name,
    slug: producto.slug,
    categoryId: producto.categoryId,
    description: producto.description ?? "",
    precio: producto.priceCents > 0 ? formatearPesos(producto.priceCents) : "",
    badge: producto.badge ?? "",
    active: producto.active,
    modo,
    stock: modo === "limited" ? String(producto.stockQuantity ?? 0) : "",
    imageUrl: producto.imageUrl ?? "",
    stageImageUrl: producto.stageImageUrl ?? "",
    grupos: aFormulario(producto.optionGroups),
  };
}

export default function FormProducto({
  producto,
  categoriaPorDefecto,
  onCerrar,
}: {
  producto: Product | null;
  categoriaPorDefecto: string;
  onCerrar: () => void;
}) {
  const panel = usePanel();
  const [campos, setCampos] = useState<Campos>(() =>
    camposDe(producto, categoriaPorDefecto)
  );
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [sucio, setSucio] = useState(false);
  /* El slug se deriva del nombre hasta que alguien lo toca. Después es suyo:
     regenerarlo mientras se edita cambiaría una dirección ya publicada. */
  const [slugManual, setSlugManual] = useState(producto !== null);

  const catalogo = panel?.catalogo;

  const sugerencias = useMemo(() => {
    const rutas = new Set<string>();
    for (const p of catalogo?.productos ?? []) {
      if (p.imageUrl) rutas.add(p.imageUrl);
      if (p.stageImageUrl) rutas.add(p.stageImageUrl);
    }
    return [...rutas].sort();
  }, [catalogo?.productos]);

  if (!panel || !catalogo) return null;

  /* Qué error apaga cada campo. Corregir lo que el formulario marcó tiene que
     BORRAR la marca en el momento: dejar el mensaje viejo debajo de un campo ya
     arreglado hace dudar de si se guardó, y acá además escondía la vista previa
     de la imagen recién corregida. */
  const ERROR_DE_CAMPO: Partial<Record<keyof Campos, string>> = {
    name: "name",
    slug: "slug",
    categoryId: "categoryId",
    description: "description",
    precio: "priceCents",
    stock: "stockQuantity",
    imageUrl: "imageUrl",
    stageImageUrl: "stageImageUrl",
  };

  const cambiar = (cambio: Partial<Campos>) => {
    setSucio(true);
    setCampos((c) => ({ ...c, ...cambio }));
    setErrores((previos) => {
      const siguientes = { ...previos };
      let cambió = false;
      for (const campo of Object.keys(cambio) as (keyof Campos)[]) {
        const clave = ERROR_DE_CAMPO[campo];
        if (clave && clave in siguientes) {
          delete siguientes[clave];
          cambió = true;
        }
        /* Los grupos se indexan por posición: se limpian en bloque. */
        if (campo === "grupos") {
          for (const k of Object.keys(siguientes)) {
            if (k.startsWith("grupo.") || k === "optionGroups") {
              delete siguientes[k];
              cambió = true;
            }
          }
        }
      }
      return cambió ? siguientes : previos;
    });
  };

  const cerrarConAviso = () => {
    if (
      sucio &&
      !window.confirm("Hay cambios sin guardar. ¿Querés salir igual?")
    ) {
      return;
    }
    onCerrar();
  };

  const guardar = async () => {
    /* Protección contra doble envío: el segundo clic no encuentra nada que
       hacer. Sin esto, dos envíos crean dos productos con el mismo nombre. */
    if (guardando) return;

    const precioCents = campos.precio.trim() ? parsearPesos(campos.precio) : null;
    const gruposDominio = aDominio(campos.grupos);
    const entrada = {
      name: campos.name,
      slug: campos.slug,
      categoryId: campos.categoryId,
      description: campos.description,
      priceCents: precioCents,
      active: campos.active,
      modo: campos.modo,
      stockQuantity: campos.modo === "limited" ? Number(campos.stock) : null,
      imageUrl: campos.imageUrl,
      stageImageUrl: campos.stageImageUrl,
    };

    const encontrados = {
      ...validarProducto(entrada, {
        productos: catalogo.productos,
        categorias: catalogo.categorias,
        idActual: producto?.id,
      }),
      ...validarGruposDeOpciones(gruposDominio),
    };
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    setGuardando(true);
    const disponibilidad = camposDeModo(campos.modo, Number(campos.stock));
    const comunes = {
      name: campos.name.trim(),
      slug: campos.slug.trim(),
      categoryId: campos.categoryId,
      description: campos.description.trim() || undefined,
      priceCents: precioCents ?? 0,
      active: campos.active,
      badge: (campos.badge || undefined) as ProductBadge | undefined,
      imageUrl: campos.imageUrl.trim() || undefined,
      stageImageUrl: campos.stageImageUrl.trim() || undefined,
      optionGroups: gruposDominio,
      ...disponibilidad,
    };

    const resultado = await panel.guardar((repos) =>
      producto
        ? repos.catalog.updateProduct(producto.id, comunes)
        : repos.catalog.createProduct(comunes)
    );
    setGuardando(false);
    if (resultado) onCerrar();
  };

  const categorias = catalogo.categorias.filter((c) => !c.archived);

  return (
    <Hoja
      abierta
      onCerrar={cerrarConAviso}
      titulo={producto ? "Editar producto" : "Nuevo producto"}
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
            onClick={cerrarConAviso}
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
          valor={campos.name}
          autoFocus
          onCambio={(v) =>
            cambiar({ name: v, ...(slugManual ? {} : { slug: aSlug(v) }) })
          }
          error={errores.name}
          placeholder="Doble Doble"
        />

        <Texto
          etiqueta="Dirección (slug)"
          valor={campos.slug}
          onCambio={(v) => {
            setSlugManual(true);
            cambiar({ slug: aSlug(v) });
          }}
          error={errores.slug}
          ayuda="Es lo que va en el enlace. Única en todo el catálogo."
        />

        <Selector
          etiqueta="Categoría"
          valor={campos.categoryId}
          onCambio={(v) => cambiar({ categoryId: v })}
          error={errores.categoryId}
          opciones={categorias.map((c) => ({
            valor: c.id,
            titulo: c.active ? c.name : `${c.name} (apagada)`,
          }))}
        />

        <AreaTexto
          etiqueta="Descripción"
          valor={campos.description}
          onCambio={(v) => cambiar({ description: v })}
          error={errores.description}
        />

        <Texto
          etiqueta="Precio en pesos"
          inputMode="decimal"
          valor={campos.precio}
          onCambio={(v) => cambiar({ precio: v })}
          error={errores.priceCents}
          ayuda="Escribilo como lo decís: 490."
          placeholder="490"
        />

        <Selector
          etiqueta="Distintivo"
          valor={campos.badge}
          onCambio={(v) => cambiar({ badge: v })}
          opciones={BADGES}
        />

        <Interruptor
          etiqueta="Publicado"
          detalle="Apagado no aparece en la carta ni se puede pedir."
          valor={campos.active}
          onCambio={(v) => cambiar({ active: v })}
        />

        <Opciones
          etiqueta="Disponibilidad"
          valor={campos.modo}
          onCambio={(v) => cambiar({ modo: v as ModoDisponibilidad })}
          opciones={MODOS}
        />

        {campos.modo === "limited" && (
          <Texto
            etiqueta="Cantidad disponible"
            inputMode="numeric"
            valor={campos.stock}
            onCambio={(v) => cambiar({ stock: v })}
            error={errores.stockQuantity}
            ayuda="Se descuenta cuando aceptás el pedido, no cuando entra."
            placeholder="10"
          />
        )}

        <NotaDeArchivos />

        <CampoImagen
          etiqueta="Imagen principal"
          valor={campos.imageUrl}
          onCambio={(v) => cambiar({ imageUrl: v })}
          error={errores.imageUrl}
          sugerencias={sugerencias}
        />

        <CampoImagen
          etiqueta="Imagen recortada (vitrina)"
          valor={campos.stageImageUrl}
          onCambio={(v) => cambiar({ stageImageUrl: v })}
          error={errores.stageImageUrl}
          ayuda="Opcional: el recorte con fondo transparente del menú grande."
          sugerencias={sugerencias}
        />

        <EditorOpciones
          grupos={campos.grupos}
          onCambio={(g) => cambiar({ grupos: g })}
          errores={errores}
        />
      </div>
    </Hoja>
  );
}
