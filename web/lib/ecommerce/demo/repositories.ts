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
  normalizarTelefono,
  nuevoId,
  siguienteNumeroDePedido,
  aSlug,
} from "../domain";
import type {
  AvailabilityPatch,
  CatalogRepository,
  ChangeStatusInput,
  CreateOrderResult,
  DeliveryZoneInput,
  EcommerceRepositories,
  ListOrdersOptions,
  ListProductsOptions,
  NewProductInput,
  OrderRepository,
  ProductPatch,
  SettingsPatch,
  SettingsRepository,
} from "../repositories";
import {
  EcommerceError,
  puedeTransicionarPedido,
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
 * ------------------------------------------------------------------------ */

function slugLibre(db: DemoDatabase, nombre: string): string {
  const base = aSlug(nombre) || "producto";
  const usados = new Set(db.products.map((p) => p.slug));
  let slug = base;
  let n = 2;
  while (usados.has(slug)) slug = `${base}-${n++}`;
  return slug;
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

const catalogo: CatalogRepository = {
  async listCategories(options) {
    const db = leerDb();
    return copiar(
      db.categories
        .filter((c) => options?.includeInactive || c.active)
        .sort(porPosicion)
    );
  },

  async listProducts(options: ListProductsOptions = {}) {
    const db = leerDb();
    return copiar(
      db.products
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
      const ultimaPosicion = db.products
        .filter((p) => p.categoryId === input.categoryId)
        .reduce((max, p) => Math.max(max, p.position), -1);

      nuevo = {
        id: nuevoId(),
        categoryId: input.categoryId,
        slug: input.slug ?? slugLibre(db, input.name),
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
      const { db: siguiente, producto } = actualizarProducto(db, id, (p) => ({
        ...p,
        ...patch,
        id: p.id,
        slug: p.slug,
        createdAt: p.createdAt,
        updatedAt: ahoraIso(),
      }));
      resultado = producto;
      return siguiente;
    });
    return copiar(resultado);
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
    escribirDb((db) => {
      const orden = new Map(orderedIds.map((id, i) => [id, i]));
      /* Los ids que no vinieron en la lista quedan detrás, conservando su
         orden relativo: reordenar una página no puede reventar el resto. */
      const products = db.products.map((p) =>
        p.categoryId === categoryId && orden.has(p.id)
          ? { ...p, position: orden.get(p.id)!, updatedAt: ahoraIso() }
          : p.categoryId === categoryId
            ? { ...p, position: orden.size + p.position }
            : p
      );
      return { ...db, products };
    });
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
      };

      const deliveryZones = existente
        ? db.deliveryZones.map((z) => (z.id === resultado.id ? resultado : z))
        : [...db.deliveryZones, resultado];

      return { ...db, deliveryZones };
    });
    return copiar(resultado);
  },
};

/* ---------------------------------------------------------------------------
 * Pedidos
 * ------------------------------------------------------------------------ */

/** Descuenta stock y agota lo que llegó a cero. */
function descontarStock(products: Product[], items: OrderItem[]): Product[] {
  const consumo = new Map<string, number>();
  for (const item of items) {
    consumo.set(item.productId, (consumo.get(item.productId) ?? 0) + item.quantity);
  }
  return products.map((p) => {
    const cantidad = consumo.get(p.id);
    if (!cantidad || p.stockQuantity === null) return p;
    const restante = Math.max(0, p.stockQuantity - cantidad);
    return { ...p, stockQuantity: restante, soldOut: restante === 0 || p.soldOut };
  });
}

/**
 * Repone stock al rechazar o cancelar. Solo levanta el "agotado" cuando el
 * producto estaba en cero: si alguien lo agotó a mano, sigue agotado.
 */
function reponerStock(products: Product[], items: OrderItem[]): Product[] {
  const consumo = new Map<string, number>();
  for (const item of items) {
    consumo.set(item.productId, (consumo.get(item.productId) ?? 0) + item.quantity);
  }
  return products.map((p) => {
    const cantidad = consumo.get(p.id);
    if (!cantidad || p.stockQuantity === null) return p;
    const estabaEnCero = p.stockQuantity === 0;
    return {
      ...p,
      stockQuantity: p.stockQuantity + cantidad,
      soldOut: estabaEnCero ? false : p.soldOut,
    };
  });
}

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

      return {
        ...db,
        products: descontarStock(db.products, items),
        orders: [...db.orders, creado],
      };
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

      if (!puedeTransicionarPedido(actual.status, to)) {
        /* El segundo clic sobre el mismo botón cae acá: no hay doble evento ni
           doble transición. */
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

      const ahora = ahoraIso();
      const evento: OrderStatusEvent = {
        id: nuevoId(),
        from: actual.status,
        to,
        reason: input.reason,
        actorId: input.actorId ?? null,
        createdAt: ahora,
      };

      const cae = to === "rejected" || to === "cancelled";

      resultado = {
        ...actual,
        status: to,
        estimatedMinutes:
          input.estimatedMinutes ?? actual.estimatedMinutes,
        rejectionReason: cae ? input.reason : actual.rejectionReason,
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
        products: cae ? reponerStock(db.products, actual.items) : db.products,
      };
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
