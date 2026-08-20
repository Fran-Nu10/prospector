/**
 * CONTRATOS DE REPOSITORIO.
 *
 * Son la costura entre la interfaz y el almacenamiento. Hoy los implementa una
 * base demo en `localStorage`; mañana los implementa Supabase. La UI no puede
 * notar la diferencia, así que estas firmas son lo único que ambos comparten.
 *
 * Por qué todo es asíncrono aunque `localStorage` sea síncrono: si el contrato
 * fuera síncrono, cambiarlo al conectar Supabase obligaría a tocar todos los
 * componentes. Una promesa que resuelve al instante no cuesta nada; un contrato
 * equivocado cuesta una refactorización entera.
 *
 * NO son repositorios genéricos ni un ORM: cada método existe porque una
 * pantalla concreta de las próximas fases lo necesita.
 */

import type {
  AdminRole,
  Category,
  DeliveryZone,
  Order,
  OrderDraft,
  OrderStatus,
  OrderStatusEvent,
  Product,
  ProductAvailability,
  RestaurantOperationalSettings,
} from "./types";

/* ---------------------------------------------------------------------------
 * Catálogo
 * ------------------------------------------------------------------------ */

/** Alta de producto. Lo que no viene toma el valor seguro del proveedor. */
export type NewProductInput = Pick<
  Product,
  "categoryId" | "name" | "priceCents"
> &
  Partial<
    Pick<
      Product,
      | "slug"
      | "description"
      | "active"
      | "soldOut"
      | "stockQuantity"
      | "position"
      | "badge"
      | "ingredients"
      | "imageUrl"
      | "stageImageUrl"
      | "optionGroups"
      | "availability"
    >
  >;

/**
 * Edición parcial. `id` y `createdAt` son inmutables; el `slug` SÍ se puede
 * cambiar —el dueño necesita corregir una dirección mal escrita— y por eso el
 * proveedor revalida su unicidad en cada escritura.
 */
export type ProductPatch = Partial<Omit<Product, "id" | "createdAt">>;

/** Alta de categoría. El slug se deriva del nombre si no viene. */
export type NewCategoryInput = Pick<Category, "name"> &
  Partial<Pick<Category, "slug" | "active" | "position">>;

export type CategoryPatch = Partial<Omit<Category, "id">>;

/** Los tres interruptores de disponibilidad, cada uno opcional. */
export interface AvailabilityPatch {
  active?: boolean;
  soldOut?: boolean;
  stockQuantity?: number | null;
  availability?: ProductAvailability[];
}

export interface ListCatalogOptions {
  /** Por defecto `false`: lo público solo ve el catálogo activo. */
  includeInactive?: boolean;
  /**
   * Por defecto `false`. Lo archivado solo lo pide quien tiene que mostrarlo
   * como archivado —el panel— o quien necesita degradar una línea de carrito
   * con el nombre correcto.
   */
  includeArchived?: boolean;
}

export interface ListProductsOptions extends ListCatalogOptions {
  categoryId?: string;
}

export interface CatalogRepository {
  listCategories(options?: ListCatalogOptions): Promise<Category[]>;
  listProducts(options?: ListProductsOptions): Promise<Product[]>;
  /** Por `id` o por `slug`; devuelve `null` si no existe. */
  getProduct(ref: { id?: string; slug?: string }): Promise<Product | null>;
  createProduct(input: NewProductInput): Promise<Product>;
  updateProduct(id: string, patch: ProductPatch): Promise<Product>;
  /**
   * Copia un producto con otro nombre y otra dirección, INACTIVO.
   *
   * Duplicar es la forma real de dar de alta la cuarta hamburguesa de la carta,
   * y entra apagada porque una copia publicada sin revisar es el mismo producto
   * dos veces en la vitrina.
   */
  duplicateProduct(id: string): Promise<Product>;
  setAvailability(id: string, patch: AvailabilityPatch): Promise<Product>;
  /** Reordena dentro de una categoría. Los ids ausentes quedan al final. */
  reorderProducts(categoryId: string, orderedIds: string[]): Promise<void>;
  createCategory(input: NewCategoryInput): Promise<Category>;
  updateCategory(id: string, patch: CategoryPatch): Promise<Category>;
  /** Reordena la carta entera. Los ids ausentes quedan al final. */
  reorderCategories(orderedIds: string[]): Promise<void>;
}

/* ---------------------------------------------------------------------------
 * Configuración operativa
 * ------------------------------------------------------------------------ */

export type SettingsPatch = Partial<
  Omit<RestaurantOperationalSettings, "updatedAt">
>;

/** Alta o edición de zona: sin `id` es alta. */
export type DeliveryZoneInput = Partial<DeliveryZone> &
  Pick<DeliveryZone, "name" | "feeCents">;

export interface SettingsRepository {
  getSettings(): Promise<RestaurantOperationalSettings>;
  updateSettings(patch: SettingsPatch): Promise<RestaurantOperationalSettings>;
  listDeliveryZones(options?: {
    includeInactive?: boolean;
    includeArchived?: boolean;
  }): Promise<DeliveryZone[]>;
  upsertDeliveryZone(zone: DeliveryZoneInput): Promise<DeliveryZone>;
  /** Reordena las zonas. Los ids ausentes quedan al final. */
  reorderDeliveryZones(orderedIds: string[]): Promise<void>;
}

/* ---------------------------------------------------------------------------
 * Pedidos
 * ------------------------------------------------------------------------ */

export interface ListOrdersOptions {
  status?: OrderStatus[];
  /** Búsqueda por número, nombre o teléfono. */
  search?: string;
  /** ISO. Filtra por `createdAt`. */
  from?: string;
  to?: string;
  limit?: number;
}

export interface CreateOrderResult {
  order: Order;
  /**
   * `true` cuando el `clientRequestId` ya existía y se devolvió el pedido de
   * antes en vez de crear uno nuevo. La UI lo usa para no decir dos veces
   * "pedido creado", y es lo que hace que un doble click no duplique.
   */
  duplicated: boolean;
}

export interface ChangeStatusInput {
  reason?: string;
  estimatedMinutes?: number;
  actorId?: string | null;
  /** Rol que ejecutó la acción; queda escrito en el historial. */
  actorRole?: AdminRole;
}

export interface MarkPaidInput {
  actorRole?: AdminRole;
}

export interface OrderRepository {
  /**
   * Crea el pedido resolviendo precios CONTRA EL CATÁLOGO. El draft trae
   * estructura, no dinero. Si el `clientRequestId` ya existe, devuelve el
   * pedido existente con `duplicated: true` en vez de crear otro.
   */
  create(draft: OrderDraft): Promise<CreateOrderResult>;
  list(options?: ListOrdersOptions): Promise<Order[]>;
  getById(id: string): Promise<Order | null>;
  /** Lectura pública del pedido sin cuenta. */
  getByPublicToken(token: string): Promise<Order | null>;
  /** Valida la transición contra la máquina de estados y registra el evento. */
  changeStatus(
    id: string,
    to: OrderStatus,
    input?: ChangeStatusInput
  ): Promise<Order>;
  listStatusEvents(orderId: string): Promise<OrderStatusEvent[]>;
  /**
   * Marca el pago como cobrado. Es IDEMPOTENTE: llamarlo dos veces deja el
   * mismo pago aprobado con la misma fecha, no dos cobros.
   *
   * Va en el repositorio y no en el cambio de estado del pedido porque son dos
   * máquinas distintas: completar un pedido no cobra, y cobrar no completa.
   */
  markPaid(id: string, input?: MarkPaidInput): Promise<Order>;
}

/* ---------------------------------------------------------------------------
 * El conjunto
 * ------------------------------------------------------------------------ */

export interface EcommerceRepositories {
  catalog: CatalogRepository;
  settings: SettingsRepository;
  orders: OrderRepository;
  /**
   * Avisa que algo del catálogo o de la configuración cambió, para que la UI
   * vuelva a leer. Hoy lo dispara la base demo cuando se escribe; mañana lo va
   * a disparar Supabase Realtime. Es opcional a propósito: un proveedor sin
   * notificaciones sigue cumpliendo el contrato, la UI simplemente no se
   * refresca sola.
   */
  suscribir?(oyente: () => void): () => void;
}
