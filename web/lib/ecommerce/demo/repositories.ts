/**
 * PROVEEDOR DEMO — implementa los tres repositorios sobre la base local.
 *
 * Todo lo que acá se hace a mano, mañana lo hace Postgres: la unicidad del
 * `clientRequestId`, el descuento de stock, la validación de la transición de
 * estado. La forma de los métodos es la misma, así que cambiar de proveedor no
 * toca ni un componente.
 *
 * DOS DECISIONES QUE PARECEN DETALLE Y NO LO SON:
 *
 * · Las lecturas devuelven COPIAS. Si devolviera los objetos guardados, un
 *   componente que ordena una lista in-place estaría corrompiendo la base.
 * · El pedido se arma con `calcularPedido`, que resuelve los precios contra el
 *   catálogo. El proveedor nunca confía en un total que le llega de afuera.
 */

import {
  ahoraIso,
  calcularPedido,
  descontarStock,
  faltantesDeStock,
  productosVivosDeCategoria,
  reponerStock,
  transicionPermitida,
  normalizarTelefono,
  nuevoId,
  siguienteNumeroDePedido,
  aSlug,
} from "../domain";
import type {
  AvailabilityPatch,
  CatalogRepository,
  CategoryPatch,
  ChangeStatusInput,
  CreateOrderResult,
  DeliveryZoneInput,
  EcommerceRepositories,
  ListCatalogOptions,
  ListOrdersOptions,
  ListProductsOptions,
  MarkPaidInput,
  NewCategoryInput,
  NewProductInput,
  OrderRepository,
  ProductPatch,
  SettingsPatch,
  SettingsRepository,
} from "../repositories";
import {
  EcommerceError,
  puedeTransicionarPago,
  type Category,
  type DeliveryZone,
  type Order,
  type OrderDraft,
  type OrderItem,
  type OrderStatus,
  type OrderStatusEvent,
  type Product,
  type RestaurantOperationalSettings,
} from "../types";
import {
  escribirDb,
  leerDb,
  suscribirDemo,
  type DemoDatabase,
} from "./database";

/** Copia profunda para no entregar referencias vivas de la base. */
function copiar<T>(valor: T): T {
  if (typeof structuredClone === "function") return structuredClone(valor);
  return JSON.parse(JSON.stringify(valor)) as T;
}

function porPosicion<T extends { position: number }>(a: T, b: T): number {
  return a.position - b.position;
}

/* ---------------------------------------------------------------------------
 * Catálogo
 *
 * Acá se hacen a mano tres cosas que en Postgres serían restricciones de tabla:
 * la unicidad del slug, la integridad de la referencia a la categoría y el
 * "no borrar nunca". Se escriben como validaciones del proveedor —y no del
 * formulario— para que valgan igual cuando la llamada venga de otro lado.
 * ------------------------------------------------------------------------ */

function slugLibre(
  usados: Iterable<string>,
  nombre: string,
  respaldo: string
): string {
  const base = aSlug(nombre) || respaldo;
  const tomados = new Set(usados);
  let slug = base;
  let n = 2;
  while (tomados.has(slug)) slug = `${base}-${n++}`;
  return slug;
}

/** El slug es la dirección pública: dos iguales son dos productos en una URL. */
function exigirSlugLibre(
  existentes: readonly { id: string; slug: string }[],
  slug: string,
  idActual: string | undefined,
  que: string
): void {
  if (existentes.some((e) => e.id !== idActual && e.slug === slug)) {
    throw new EcommerceError(
      "DUPLICATE_SLUG",
      `Ya hay ${que} con la dirección "${slug}".`,
      { slug }
    );
  }
}

function actualizarProducto(
  db: DemoDatabase,
  id: string,
  cambio: (p: Product) => Product
): { db: DemoDatabase; producto: Product } {
  const indice = db.products.findIndex((p) => p.id === id);
  if (indice < 0) {
    throw new EcommerceError("NOT_FOUND", "Ese producto no existe.", { id });
  }
  const producto = cambio(db.products[indice]);
  const products = [...db.products];
  products[indice] = producto;
  return { db: { ...db, products }, producto };
}

/**
 * Reordena una lista por `position` respetando los ids que llegaron. Lo que no
 * vino queda detrás, con su orden relativo intacto: reordenar una categoría no
 * puede desordenar el resto de la carta.
 */
function reordenar<T extends { id: string; position: number }>(
  elementos: readonly T[],
  orderedIds: readonly string[],
  alcanza: (e: T) => boolean
): T[] {
  const orden = new Map(orderedIds.map((id, i) => [id, i]));
  return elementos.map((e) => {
    if (!alcanza(e)) return e;
    const nueva = orden.get(e.id);
    return {
      ...e,
      position: nueva === undefined ? orden.size + e.position : nueva,
    };
  });
}

const catalogo: CatalogRepository = {
  async listCategories(options: ListCatalogOptions = {}) {
    const db = leerDb();
    return copiar(
      db.categories
        .filter((c) => options.includeArchived || !c.archived)
        .filter((c) => options.includeInactive || c.active)
        .sort(porPosicion)
    );
  },

  async listProducts(options: ListProductsOptions = {}) {
    const db = leerDb();
    return copiar(
      db.products
        .filter((p) => options.includeArchived || !p.archived)
        .filter((p) => options.includeInactive || p.active)
        .filter((p) => !options.categoryId || p.categoryId === options.categoryId)
        .sort(porPosicion)
    );
  },

  async getProduct(ref) {
    const db = leerDb();
    const encontrado = db.products.find(
      (p) => (ref.id && p.id === ref.id) || (ref.slug && p.slug === ref.slug)
    );
    return encontrado ? copiar(encontrado) : null;
  },

  async createProduct(input: NewProductInput) {
    const creado = ahoraIso();
    let nuevo!: Product;
    escribirDb((db) => {
      if (!db.categories.some((c) => c.id === input.categoryId)) {
        throw new EcommerceError("NOT_FOUND", "Esa categoría no existe.", {
          categoryId: input.categoryId,
        });
      }
      const slug =
        input.slug ??
        slugLibre(db.products.map((p) => p.slug), input.name, "producto");
      exigirSlugLibre(db.products, slug, undefined, "otro producto");

      const ultimaPosicion = db.products
        .filter((p) => p.categoryId === input.categoryId)
        .reduce((max, p) => Math.max(max, p.position), -1);

      nuevo = {
        id: nuevoId(),
        categoryId: input.categoryId,
        slug,
        name: input.name,
        description: input.description,
        priceCents: input.priceCents,
        active: input.active ?? true,
        soldOut: input.soldOut ?? false,
        stockQuantity: input.stockQuantity ?? null,
        position: input.position ?? ultimaPosicion + 1,
        badge: input.badge,
        ingredients: input.ingredients,
        imageUrl: input.imageUrl,
        stageImageUrl: input.stageImageUrl,
        optionGroups: input.optionGroups ?? [],
        availability: input.availability ?? [],
        archived: false,
        createdAt: creado,
        updatedAt: creado,
      };
      return { ...db, products: [...db.products, nuevo] };
    });
    return copiar(nuevo);
  },

  async updateProduct(id, patch: ProductPatch) {
    let resultado!: Product;
    escribirDb((db) => {
      if (patch.slug !== undefined) {
        exigirSlugLibre(db.products, patch.slug, id, "otro producto");
      }
      if (
        patch.categoryId !== undefined &&
        !db.categories.some((c) => c.id === patch.categoryId)
      ) {
        throw new EcommerceError("NOT_FOUND", "Esa categoría no existe.", {
          categoryId: patch.categoryId,
        });
      }
      const { db: siguiente, producto } = actualizarProducto(db, id, (p) => ({
        ...p,
        ...patch,
        id: p.id,
        createdAt: p.createdAt,
        updatedAt: ahoraIso(),
      }));
      resultado = producto;
      return siguiente;
    });
    return copiar(resultado);
  },

  async duplicateProduct(id) {
    const creado = ahoraIso();
    let copia!: Product;
    escribirDb((db) => {
      const original = db.products.find((p) => p.id === id);
      if (!original) {
        throw new EcommerceError("NOT_FOUND", "Ese producto no existe.", { id });
      }
      const nombre = `${original.name} (copia)`;
      const ultimaPosicion = db.products
        .filter((p) => p.categoryId === original.categoryId)
        .reduce((max, p) => Math.max(max, p.position), -1);

      copia = {
        ...copiar(original),
        id: nuevoId(),
        slug: slugLibre(db.products.map((p) => p.slug), nombre, "producto"),
        name: nombre,
        /* Entra APAGADA: publicar una copia sin revisarla pone el mismo
           producto dos veces en la vitrina. */
        active: false,
        archived: false,
        position: ultimaPosicion + 1,
        /* Los grupos y opciones también estrenan id: si compartieran el del
           original, editar la copia editaría al padre. */
        optionGroups: original.optionGroups.map((g) => ({
          ...g,
          id: nuevoId(),
          options: g.options.map((o) => ({ ...o, id: nuevoId() })),
        })),
        createdAt: creado,
        updatedAt: creado,
      };
      return { ...db, products: [...db.products, copia] };
    });
    return copiar(copia);
  },

  async setAvailability(id, patch: AvailabilityPatch) {
    let resultado!: Product;
    escribirDb((db) => {
      const { db: siguiente, producto } = actualizarProducto(db, id, (p) => ({
        ...p,
        active: patch.active ?? p.active,
        soldOut: patch.soldOut ?? p.soldOut,
        stockQuantity:
          patch.stockQuantity === undefined ? p.stockQuantity : patch.stockQuantity,
        availability: patch.availability ?? p.availability,
        updatedAt: ahoraIso(),
      }));
      resultado = producto;
      return siguiente;
    });
    return copiar(resultado);
  },

  async reorderProducts(categoryId, orderedIds) {
    escribirDb((db) => ({
      ...db,
      products: reordenar(
        db.products,
        orderedIds,
        (p) => p.categoryId === categoryId
      ),
    }));
  },

  async createCategory(input: NewCategoryInput) {
    let nueva!: Category;
    escribirDb((db) => {
      const slug =
        input.slug ??
        slugLibre(db.categories.map((c) => c.slug), input.name, "categoria");
      exigirSlugLibre(db.categories, slug, undefined, "otra categoría");

      nueva = {
        id: nuevoId(),
        slug,
        name: input.name,
        position:
          input.position ??
          db.categories.reduce((max, c) => Math.max(max, c.position), -1) + 1,
        active: input.active ?? true,
        archived: false,
      };
      return { ...db, categories: [...db.categories, nueva] };
    });
    return copiar(nueva);
  },

  async updateCategory(id, patch: CategoryPatch) {
    let resultado!: Category;
    escribirDb((db) => {
      const indice = db.categories.findIndex((c) => c.id === id);
      if (indice < 0) {
        throw new EcommerceError("NOT_FOUND", "Esa categoría no existe.", { id });
      }
      if (patch.slug !== undefined) {
        exigirSlugLibre(db.categories, patch.slug, id, "otra categoría");
      }
      /* Archivar una categoría con productos vivos los dejaría colgando de un
         padre invisible: ni en la carta ni en el panel. Primero se mueven o se
         archivan los productos. */
      if (patch.archived && productosVivosDeCategoria(id, db.products).length) {
        throw new EcommerceError(
          "CATEGORY_NOT_EMPTY",
          "Esa categoría todavía tiene productos. Movelos a otra o archivalos primero.",
          { categoryId: id }
        );
      }

      resultado = { ...db.categories[indice], ...patch, id };
      const categories = [...db.categories];
      categories[indice] = resultado;
      return { ...db, categories };
    });
    return copiar(resultado);
  },

  async reorderCategories(orderedIds) {
    escribirDb((db) => ({
      ...db,
      categories: reordenar(db.categories, orderedIds, () => true),
    }));
  },
};

/* ---------------------------------------------------------------------------
 * Configuración
 * ------------------------------------------------------------------------ */

const configuracion: SettingsRepository = {
  async getSettings() {
    return copiar(leerDb().settings);
  },

  async updateSettings(patch: SettingsPatch) {
    let resultado!: RestaurantOperationalSettings;
    escribirDb((db) => {
      resultado = { ...db.settings, ...patch, updatedAt: ahoraIso() };
      return { ...db, settings: resultado };
    });
    return copiar(resultado);
  },

  async listDeliveryZones(options) {
    const db = leerDb();
    return copiar(
      db.deliveryZones
        .filter((z) => options?.includeArchived || !z.archived)
        .filter((z) => options?.includeInactive || z.active)
        .sort(porPosicion)
    );
  },

  async upsertDeliveryZone(zona: DeliveryZoneInput) {
    let resultado!: DeliveryZone;
    escribirDb((db) => {
      const existente = zona.id
        ? db.deliveryZones.find((z) => z.id === zona.id)
        : undefined;

      resultado = {
        id: existente?.id ?? zona.id ?? nuevoId(),
        name: zona.name,
        feeCents: zona.feeCents,
        minOrderCents: zona.minOrderCents ?? existente?.minOrderCents ?? 0,
        active: zona.active ?? existente?.active ?? true,
        position:
          zona.position ?? existente?.position ?? db.deliveryZones.length,
        estimatedMinutes: zona.estimatedMinutes ?? existente?.estimatedMinutes,
        archived: zona.archived ?? existente?.archived ?? false,
      };

      const deliveryZones = existente
        ? db.deliveryZones.map((z) => (z.id === resultado.id ? resultado : z))
        : [...db.deliveryZones, resultado];

      return { ...db, deliveryZones };
    });
    return copiar(resultado);
  },

  async reorderDeliveryZones(orderedIds) {
    escribirDb((db) => ({
      ...db,
      deliveryZones: reordenar(db.deliveryZones, orderedIds, () => true),
    }));
  },
};

/* ---------------------------------------------------------------------------
 * Pedidos
 * ------------------------------------------------------------------------ */

const pedidos: OrderRepository = {
  async create(draft: OrderDraft): Promise<CreateOrderResult> {
    const previo = leerDb().orders.find(
      (o) => o.clientRequestId === draft.clientRequestId
    );
    /* Idempotencia: el segundo envío devuelve el MISMO pedido. Es lo que hace
       que un doble click o un reintento por timeout no genere dos comandas. */
    if (previo) return { order: copiar(previo), duplicated: true };

    if (!draft.clientRequestId) {
      throw new EcommerceError("INVALID_INPUT", "Falta la clave de idempotencia.");
    }

    let creado!: Order;
    escribirDb((db) => {
      const calculo = calcularPedido(draft, {
        products: db.products,
        zones: db.deliveryZones,
        settings: db.settings,
        categories: db.categories,
      });

      if (
        draft.payment.cashReceivedCents !== undefined &&
        draft.payment.cashReceivedCents < calculo.totalCents
      ) {
        throw new EcommerceError(
          "INVALID_INPUT",
          "El monto con el que paga no alcanza el total."
        );
      }

      const ahora = ahoraIso();
      const items: OrderItem[] = calculo.items.map((i) => ({ ...i, id: nuevoId() }));
      const entrega = draft.fulfillment;

      creado = {
        id: nuevoId(),
        orderNumber: siguienteNumeroDePedido(db.orders.length),
        publicToken: nuevoId(),
        clientRequestId: draft.clientRequestId,
        status: "pending_confirmation",
        fulfillmentType: entrega.type,
        customer: {
          ...draft.customer,
          phone: normalizarTelefono(draft.customer.phone),
        },
        address:
          entrega.type === "delivery" && calculo.zone
            ? {
                zoneId: calculo.zone.id,
                zoneName: calculo.zone.name,
                address: entrega.address,
                reference: entrega.reference,
              }
            : undefined,
        items,
        subtotalCents: calculo.subtotalCents,
        deliveryFeeCents: calculo.deliveryFeeCents,
        totalCents: calculo.totalCents,
        payment: {
          method: draft.payment.method,
          status: "pending",
          amountCents: calculo.totalCents,
          cashReceivedCents: draft.payment.cashReceivedCents,
        },
        notes: draft.notes,
        stockApplied: false,
        statusHistory: [
          {
            id: nuevoId(),
            from: null,
            to: "pending_confirmation",
            actorId: null,
            createdAt: ahora,
          },
        ],
        createdAt: ahora,
        updatedAt: ahora,
      };

      /* El stock NO se descuenta acá: se descuenta cuando el local ACEPTA el
         pedido. Hasta ese momento nadie se comprometió a cocinarlo, y reservar
         unidades por pedidos que después se rechazan deja la carta agotada de
         mentira. Ver `stockApplied` en `types.ts`. */
      return { ...db, orders: [...db.orders, creado] };
    });

    return { order: copiar(creado), duplicated: false };
  },

  async list(options: ListOrdersOptions = {}) {
    const db = leerDb();
    const buscado = options.search?.trim().toLowerCase();
    const encontrados = db.orders
      .filter((o) => !options.status?.length || options.status.includes(o.status))
      .filter((o) => !options.from || o.createdAt >= options.from)
      .filter((o) => !options.to || o.createdAt <= options.to)
      .filter((o) => {
        if (!buscado) return true;
        return (
          o.orderNumber.toLowerCase().includes(buscado) ||
          o.customer.name.toLowerCase().includes(buscado) ||
          o.customer.phone.includes(buscado.replace(/\D/g, ""))
        );
      })
      /* Más nuevo primero: el tablero del local mira siempre lo que acaba de
         entrar. */
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return copiar(
      options.limit ? encontrados.slice(0, options.limit) : encontrados
    );
  },

  async getById(id) {
    const encontrado = leerDb().orders.find((o) => o.id === id);
    return encontrado ? copiar(encontrado) : null;
  },

  async getByPublicToken(token) {
    const encontrado = leerDb().orders.find((o) => o.publicToken === token);
    return encontrado ? copiar(encontrado) : null;
  },

  async changeStatus(id, to: OrderStatus, input: ChangeStatusInput = {}) {
    let resultado!: Order;
    escribirDb((db) => {
      const indice = db.orders.findIndex((o) => o.id === id);
      if (indice < 0) {
        throw new EcommerceError("NOT_FOUND", "Ese pedido no existe.", { id });
      }
      const actual = db.orders[indice];

      if (!transicionPermitida(actual, to)) {
        /* Acá caen tres cosas a la vez: el segundo clic sobre el mismo botón
           (no hay doble evento ni doble transición), un salto imposible
           —completar un pedido recién entrado—, y una modalidad equivocada
           —mandar a reparto algo que se retira en el local—. */
        throw new EcommerceError(
          "INVALID_TRANSITION",
          `No se puede pasar de ${actual.status} a ${to}.`,
          { desde: actual.status, hacia: to }
        );
      }
      if ((to === "rejected" || to === "cancelled") && !input.reason?.trim()) {
        throw new EcommerceError(
          "INVALID_INPUT",
          "Rechazar o cancelar exige un motivo."
        );
      }
      if (to === "confirmed" && input.estimatedMinutes === undefined) {
        throw new EcommerceError(
          "INVALID_INPUT",
          "Confirmar exige un tiempo estimado."
        );
      }
      if (
        to === "out_for_delivery" &&
        actual.fulfillmentType !== "delivery"
      ) {
        throw new EcommerceError(
          "INVALID_TRANSITION",
          "Ese pedido es para retirar en el local."
        );
      }
      if (to === "ready_for_pickup" && actual.fulfillmentType !== "pickup") {
        throw new EcommerceError(
          "INVALID_TRANSITION",
          "Ese pedido es para entregar a domicilio."
        );
      }

      /* --- STOCK ---------------------------------------------------------
       *
       * Aceptar es el momento en que el local se compromete: ahí y solo ahí se
       * descuenta. `stockApplied` hace que la operación sea de UNA sola vez —
       * dos pestañas aceptando el mismo pedido descuentan una— y que cancelar
       * reponga únicamente lo que efectivamente se restó.
       */
      const cae = to === "rejected" || to === "cancelled";
      const acepta = to === "confirmed";
      const descuenta = acepta && !actual.stockApplied;
      const repone = cae && actual.stockApplied;

      if (descuenta) {
        const faltantes = faltantesDeStock(actual.items, db.products);
        if (faltantes.length) {
          throw new EcommerceError(
            "STOCK_INSUFFICIENT",
            faltantes.length === 1
              ? `No hay stock suficiente de ${faltantes[0].nombre}: quedan ${faltantes[0].disponible} y el pedido lleva ${faltantes[0].pedido}.`
              : `No hay stock suficiente de: ${faltantes
                  .map((f) => `${f.nombre} (quedan ${f.disponible}, lleva ${f.pedido})`)
                  .join(", ")}.`,
            { faltantes }
          );
        }
      }

      const ahora = ahoraIso();
      const evento: OrderStatusEvent = {
        id: nuevoId(),
        from: actual.status,
        to,
        reason: input.reason,
        actorId: input.actorId ?? null,
        actorRole: input.actorRole,
        createdAt: ahora,
      };

      resultado = {
        ...actual,
        status: to,
        estimatedMinutes:
          input.estimatedMinutes ?? actual.estimatedMinutes,
        rejectionReason: cae ? input.reason : actual.rejectionReason,
        stockApplied: descuenta ? true : repone ? false : actual.stockApplied,
        /* El pago NO se aprueba solo al completar: dar por cobrado lo que quizá
           no se cobró ensucia el reporte. Solo se cancela cuando el pedido cae. */
        payment:
          cae && actual.payment.status === "pending"
            ? { ...actual.payment, status: "cancelled" }
            : actual.payment,
        statusHistory: [...actual.statusHistory, evento],
        updatedAt: ahora,
      };

      const orders = [...db.orders];
      orders[indice] = resultado;

      return {
        ...db,
        orders,
        products: descuenta
          ? descontarStock(db.products, actual.items)
          : repone
            ? reponerStock(db.products, actual.items)
            : db.products,
      };
    });
    return copiar(resultado);
  },

  async markPaid(id, input: MarkPaidInput = {}) {
    let resultado!: Order;
    escribirDb((db) => {
      const indice = db.orders.findIndex((o) => o.id === id);
      if (indice < 0) {
        throw new EcommerceError("NOT_FOUND", "Ese pedido no existe.", { id });
      }
      const actual = db.orders[indice];

      /* Idempotente: si ya estaba cobrado se devuelve tal cual, con su fecha
         original. Un segundo clic no puede reescribir cuándo se cobró. */
      if (actual.payment.status === "approved") {
        resultado = actual;
        return db;
      }
      if (!puedeTransicionarPago(actual.payment.status, "approved")) {
        throw new EcommerceError(
          "INVALID_TRANSITION",
          "Ese pago no se puede marcar como cobrado.",
          { desde: actual.payment.status }
        );
      }

      const ahora = ahoraIso();
      resultado = {
        ...actual,
        /* El total NO se toca: cobrar no recalcula nada. */
        payment: {
          ...actual.payment,
          status: "approved",
          paidAt: ahora,
          markedByRole: input.actorRole,
        },
        updatedAt: ahora,
      };
      const orders = [...db.orders];
      orders[indice] = resultado;
      return { ...db, orders };
    });
    return copiar(resultado);
  },

  async listStatusEvents(orderId) {
    const pedido = leerDb().orders.find((o) => o.id === orderId);
    if (!pedido) {
      throw new EcommerceError("NOT_FOUND", "Ese pedido no existe.", { orderId });
    }
    return copiar(pedido.statusHistory);
  },
};

/** El proveedor completo. */
export function crearRepositoriosDemo(): EcommerceRepositories {
  return {
    catalog: catalogo,
    settings: configuracion,
    orders: pedidos,
    suscribir: suscribirDemo,
  };
}
