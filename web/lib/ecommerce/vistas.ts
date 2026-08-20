/**
 * VIEW MODELS — lo único que la plantilla ve del ecommerce.
 *
 * El JSX no debe conocer `Product`, ni `Cents`, ni las tres capas de
 * disponibilidad. Recibe una `ProductoVista`: nombre, precio ya formateado, y
 * un booleano que dice si se puede comprar con el motivo por el cual no.
 *
 * Acá también vive el PUENTE con el mundo viejo: una plantilla que se renderiza
 * para un prospecto sin ecommerce (una demo cualquiera de Prospector) arma las
 * mismas vistas desde `data.menu` y queda en modo CARTA — se ve igual, no se
 * puede comprar. Es lo que evita tener dos componentes de menú.
 */

import type { MenuSection as MenuSectionJson } from "../schema";
import { disponibleAhora } from "./domain";
import { formatearDinero, parsearPrecioLegado } from "./money";
import { DATOS_PROSPECTO, SLUG_INSTALACION } from "./demo/seed";
import { obtenerEcommerce } from "./service";
import type {
  Category,
  Cents,
  DeliveryZone,
  Product,
  ProductBadge,
  ProductOptionGroup,
  RestaurantOperationalSettings,
} from "./types";

/** Por qué un producto no se puede comprar. Se traduce a copy en la plantilla. */
export type MotivoNoComprable =
  | "SIN_ECOMMERCE"
  | "INVALID_PRICE"
  | "ARCHIVED"
  | "CATEGORY_INACTIVE"
  | "INACTIVE"
  | "SOLD_OUT"
  | "OUT_OF_STOCK"
  | "OUT_OF_HOURS";

export interface ProductoVista {
  /** `null` en modo carta: no hay catálogo detrás, así que no hay qué agregar. */
  id: string | null;
  slug: string;
  name: string;
  description?: string;
  /** `null` cuando el precio no es confiable. */
  priceCents: Cents | null;
  /** Ya formateado (`"$ 490"`). El JSX nunca arma dinero a mano. */
  priceLabel: string | null;
  imageUrl?: string;
  stageImageUrl?: string;
  badge?: ProductBadge;
  ingredients?: string[];
  optionGroups: ProductOptionGroup[];
  comprable: boolean;
  motivo?: MotivoNoComprable;
  /** Tope de unidades si el producto lleva control de stock. */
  maximo?: number;
}

export interface SeccionVista {
  id: string;
  title: string;
  items: ProductoVista[];
}

/**
 * Lo que el servidor le pasa a la plantilla.
 *
 * En modo `ecommerce` viajan los productos CRUDOS —no las vistas— por dos
 * razones: el carrito necesita resolver precios contra `Product`, y serializar
 * las dos cosas duplicaría la carga útil. Las vistas se derivan en el render,
 * igual en servidor y en cliente.
 *
 * En modo `carta` no hay catálogo detrás (es una demo de Prospector que no es
 * la instalación de ecommerce): viajan las secciones ya armadas desde el JSON.
 */
export type FuenteCatalogo =
  | {
      modo: "ecommerce";
      /**
       * Solo las que la tienda puede mostrar (activas, sin archivar). Viajan
       * completas —no solo id y nombre— porque el carrito necesita saber si la
       * categoría de una línea sigue habilitando la compra.
       */
      categorias: Category[];
      productos: Product[];
      /** Solo las activas: una zona apagada no se ofrece. */
      zonas: DeliveryZone[];
      ajustes: RestaurantOperationalSettings;
      timezone: string;
    }
  | { modo: "carta"; secciones: SeccionVista[] };

/** Sin menú no hay nada que mostrar, y eso no puede romper la plantilla. */
export const CATALOGO_VACIO: FuenteCatalogo = { modo: "carta", secciones: [] };

function motivoDeProducto(
  producto: Product,
  ahora: Date,
  zona: string,
  comprables: ReadonlySet<string> | null
): MotivoNoComprable | undefined {
  /* El orden importa: un producto sin precio legible es un problema de datos y
     hay que poder distinguirlo de uno que el local apagó a propósito. */
  if (producto.priceCents <= 0) return "INVALID_PRICE";
  if (producto.archived) return "ARCHIVED";
  if (comprables !== null && !comprables.has(producto.categoryId)) {
    return "CATEGORY_INACTIVE";
  }
  if (!producto.active) return "INACTIVE";
  if (producto.soldOut) return "SOLD_OUT";
  if (producto.stockQuantity !== null && producto.stockQuantity <= 0) {
    return "OUT_OF_STOCK";
  }
  if (!disponibleAhora(producto.availability, ahora, zona)) return "OUT_OF_HOURS";
  return undefined;
}

/** Un producto del catálogo → lo que la plantilla necesita para pintarlo. */
export function vistaDeProducto(
  producto: Product,
  ahora: Date = new Date(),
  zona = "America/Montevideo",
  categoriasComprables: ReadonlySet<string> | null = null
): ProductoVista {
  const motivo = motivoDeProducto(producto, ahora, zona, categoriasComprables);
  const precioValido = producto.priceCents > 0;
  return {
    id: producto.id,
    slug: producto.slug,
    name: producto.name,
    description: producto.description,
    priceCents: precioValido ? producto.priceCents : null,
    priceLabel: precioValido ? formatearDinero(producto.priceCents) : null,
    imageUrl: producto.imageUrl,
    stageImageUrl: producto.stageImageUrl,
    badge: producto.badge,
    ingredients: producto.ingredients,
    /* Los grupos apagados no se ofrecen: la hoja del producto no puede pedirle
       al cliente que elija algo que el local retiró. */
    optionGroups: producto.optionGroups
      .filter((g) => g.active)
      .sort((a, b) => a.position - b.position)
      .map((g) => ({
        ...g,
        options: [...g.options].sort((a, b) => a.position - b.position),
      })),
    comprable: motivo === undefined,
    motivo,
    maximo: producto.stockQuantity ?? undefined,
  };
}

/**
 * Arma las secciones a partir del catálogo ya leído. Es pura: la usa tanto la
 * carga inicial del servidor como el refresco del cliente cuando el catálogo
 * cambia, sin duplicar el mapeo.
 */
export function seccionesDeCatalogo(
  categorias: readonly { id: string; name: string }[],
  productos: readonly Product[],
  ahora: Date = new Date(),
  zona = "America/Montevideo"
): SeccionVista[] {
  /* Las categorías que llegan acá son las que la tienda puede mostrar: lo que
     no está en la lista es una categoría apagada, y sus productos dejan de ser
     comprables aunque el producto en sí siga activo. */
  const comprables = new Set(categorias.map((c) => c.id));
  return categorias
    .map((categoria) => ({
      id: categoria.id,
      title: categoria.name,
      items: productos
        /* Lo archivado no se muestra: sigue viajando para que una línea vieja
           del carrito se pueda degradar con su nombre, no para la vitrina. */
        .filter((p) => p.categoryId === categoria.id && !p.archived)
        .map((p) => vistaDeProducto(p, ahora, zona, comprables)),
    }))
    .filter((s) => s.items.length > 0);
}

/**
 * Catálogo real, leído por el repositorio. Funciona en servidor —el proveedor
 * demo devuelve el seed— y en cliente, donde devuelve lo que el dueño tenga
 * guardado.
 *
 * Se piden TAMBIÉN los inactivos: un producto apagado se muestra apagado, no
 * desaparece sin explicación de una carta que la gente ya conoce.
 */
export async function cargarCatalogo(
  slugProspecto: string
): Promise<FuenteCatalogo | null> {
  /* Una instalación = un restaurante. El catálogo del ecommerce es de ESTE
     negocio: servírselo a otra demo del repo mostraría productos ajenos. Ahí
     devuelve null y la plantilla cae a modo carta. */
  if (slugProspecto !== SLUG_INSTALACION) return null;

  const { catalog, settings } = obtenerEcommerce();
  const [categorias, productos, conf, zonas] = await Promise.all([
    catalog.listCategories(),
    /* Con archivados: la vitrina los filtra, pero el carrito los necesita para
       poder decir "ya no está en la carta" con el nombre correcto. */
    catalog.listProducts({ includeInactive: true, includeArchived: true }),
    settings.getSettings(),
    settings.listDeliveryZones(),
  ]);
  return {
    modo: "ecommerce",
    categorias,
    productos,
    zonas,
    ajustes: conf,
    timezone: conf.timezone,
  };
}

/**
 * MODO CARTA — la misma vista armada desde el JSON del prospecto.
 *
 * Es para las demos que NO son la instalación de ecommerce: se ve idéntico,
 * pero sin `id` no hay nada que agregar y la plantilla cae al CTA de WhatsApp
 * de siempre. El precio se muestra tal como vino del JSON, sin reinterpretarlo.
 */
export function catalogoDesdeJson(
  menu: readonly MenuSectionJson[] | undefined
): FuenteCatalogo {
  return {
    modo: "carta",
    secciones: (menu ?? []).map((seccion, i) => ({
      id: `json-${i}`,
      title: seccion.title,
      items: seccion.items.map((item) => {
        const cents = parsearPrecioLegado(item.price);
        return {
          id: null,
          slug: `json-${i}-${item.name}`,
          name: item.name,
          description: item.description,
          priceCents: cents,
          /* Se respeta el string del JSON: es lo que el negocio escribió. */
          priceLabel: item.price ?? null,
          imageUrl: item.image,
          stageImageUrl: item.stageImage,
          badge: item.tag,
          ingredients: item.ingredients,
          optionGroups: [],
          comprable: false,
          motivo: "SIN_ECOMMERCE" as const,
        };
      }),
    })),
  };
}

/**
 * Datos del prospecto de ESTA instalación, tomados del bundle.
 *
 * Las rutas del ecommerce no pueden leerlos del filesystem: `data/prospects/`
 * existe en build pero no dentro de una función serverless (ver el comentario
 * de `app/[slug]/page.tsx`). Como la instalación es de un solo restaurante, el
 * JSON viaja en el bundle igual que el seed y la página del pedido puede
 * renderizarse a demanda sin tocar el disco.
 */
export function datosDeLaInstalacion(): {
  slug: string;
  data: typeof DATOS_PROSPECTO;
} {
  return { slug: SLUG_INSTALACION, data: DATOS_PROSPECTO };
}
