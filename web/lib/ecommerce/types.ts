/**
 * CONTRATO DE DOMINIO DEL ECOMMERCE.
 *
 * Es el idioma que hablan la UI, los repositorios y —más adelante— Supabase.
 * Vale la misma regla que en `schema.ts`: si un dato del negocio varía, vive
 * acá y nunca en el JSX.
 *
 * Tres reglas que atraviesan todo el archivo:
 *
 *   1. EL DINERO ES UN ENTERO EN CENTÉSIMOS. Nunca un string, nunca un float.
 *      `"$490"` es formato de presentación y no entra a este dominio: 490 pesos
 *      son 49000. Lo único que traduce del formato viejo es el parser del seed.
 *   2. LAS FECHAS SON STRINGS ISO 8601 en UTC. Se serializan a `localStorage` y
 *      mañana a Postgres sin ceremonia; el día operativo se calcula en
 *      `America/Montevideo` (ver `ZONA_HORARIA`).
 *   3. EL PEDIDO ES HISTORIA CONGELADA. Guarda copias de lo comprado, no
 *      punteros al catálogo vivo: cambiar un producto no puede reescribir lo
 *      que alguien pagó el mes pasado.
 *
 * Contrato completo y razonado en `docs/ECOMMERCE_SPEC.md`.
 */

/** Zona horaria operativa del local. Explícita para que nada la asuma. */
export const ZONA_HORARIA = "America/Montevideo";

/** Moneda única de la instalación. */
export const MONEDA = "UYU";

/** Dinero: SIEMPRE entero en centésimos. El alias existe para que se lea. */
export type Cents = number;

/** Marca temporal ISO 8601 (`2026-08-19T18:04:00.000Z`). */
export type IsoDate = string;

/* ---------------------------------------------------------------------------
 * Catálogo
 * ------------------------------------------------------------------------ */

export interface Category {
  id: string;
  /** Estable y único: es lo que va a la URL. */
  slug: string;
  name: string;
  /** Orden en la carta. Menor primero. */
  position: number;
  active: boolean;
}

/** Distintivo editorial del producto. Mismo vocabulario que `MenuItem.tag`. */
export type ProductBadge = "destacado" | "nuevo" | "vegano" | "sin_tacc";

/**
 * Franja en la que el producto se ofrece. SIN franjas cargadas, el producto
 * está disponible siempre: una lista vacía significa "sin restricción", no
 * "nunca disponible".
 *
 * Los minutos se cuentan desde las 00:00 locales y el cierre puede pasar de
 * 1440 para representar la madrugada del día siguiente — mismo criterio que
 * `templates/hamburgueseria/horarios.ts`, donde las 02:00 son MÁS TARDE que
 * las 23:00 y no seis horas antes.
 */
export interface ProductAvailability {
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
  startsMin: number;
  endsMin: number;
}

export interface ProductOption {
  id: string;
  name: string;
  /** Diferencia sobre el precio base. Puede ser 0 o negativa. */
  priceDeltaCents: Cents;
  available: boolean;
  position: number;
}

/**
 * Una decisión que toma el cliente. Variante y extra NO son dos estructuras
 * distintas, son la misma con otra configuración:
 *
 *   variante  → minSelect 1, maxSelect 1  (obligatoria, excluyente)
 *   extras    → minSelect 0, maxSelect N  (opcional, acumulable)
 *
 * Tenerlas separadas duplicaría la validación y los reportes.
 */
export interface ProductOptionGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  position: number;
  options: ProductOption[];
}

export interface Product {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
  description?: string;
  /** Precio base, sin opciones. */
  priceCents: Cents;
  /** Fuera del catálogo público: ni se ve ni se puede pedir. */
  active: boolean;
  /** Se ve, pero no se puede pedir. Es distinto de `active: false`. */
  soldOut: boolean;
  /** `null` = sin control de stock. Con número, decrece al crear el pedido. */
  stockQuantity: number | null;
  position: number;
  badge?: ProductBadge;
  /** Copy, no opciones: son texto que el negocio dice, sin precio ni reglas. */
  ingredients?: string[];
  /** Foto cuadrada. Es la que puede subir el dueño. */
  imageUrl?: string;
  /** Recorte con alfa para la vitrina. Asset de agencia (ver la spec, C7). */
  stageImageUrl?: string;
  optionGroups: ProductOptionGroup[];
  availability: ProductAvailability[];
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/* ---------------------------------------------------------------------------
 * Configuración operativa
 * ------------------------------------------------------------------------ */

export interface DeliveryZone {
  id: string;
  name: string;
  feeCents: Cents;
  /** 0 = sin mínimo. */
  minOrderCents: Cents;
  active: boolean;
  position: number;
  estimatedMinutes?: number;
}

/** Franja de atención, con el mismo criterio de minutos que `ProductAvailability`. */
export interface ServiceHour {
  weekday: number;
  opensMin: number;
  closesMin: number;
}

export type PaymentMethod = "cash" | "mercadopago";

export interface RestaurantOperationalSettings {
  /** Interruptor manual: el local puede cerrar aunque el horario diga abierto. */
  acceptingOrders: boolean;
  timezone: string;
  currency: string;
  /** Vacío = sin horarios cargados; la apertura la decide `acceptingOrders`. */
  serviceHours: ServiceHour[];
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  /** Métodos habilitados. Mercado Pago arranca apagado y sin credenciales. */
  paymentMethods: Record<PaymentMethod, boolean>;
  defaultPrepMinutes: number;
  /** Minutos sin confirmar tras los que el panel resalta el pedido. */
  noResponseAlertMinutes: number;
  closedMessage?: string;
  /** Número operativo. Sin él, la plantilla no renderiza ningún botón. */
  whatsappNumber?: string;
  updatedAt: IsoDate;
}

/* ---------------------------------------------------------------------------
 * Pedido
 * ------------------------------------------------------------------------ */

export type FulfillmentType = "pickup" | "delivery";

/**
 * Rol de quien opera el panel.
 *
 * Vive en el dominio y no en la sesión porque queda ESCRITO en el historial del
 * pedido: saber que "lo aceptó el dueño" o "lo canceló un empleado" es dato del
 * negocio, no de la pantalla que lo produjo.
 */
export type AdminRole = "owner" | "employee";

export type OrderStatus =
  | "pending_confirmation"
  | "confirmed"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "ready_for_pickup"
  | "completed"
  | "rejected"
  | "cancelled";

export type PaymentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "refunded";

/** Estados sin salida. Un pedido acá no vuelve. */
export const ESTADOS_TERMINALES: readonly OrderStatus[] = [
  "completed",
  "rejected",
  "cancelled",
];

/**
 * Transiciones permitidas del PEDIDO.
 *
 * `rejected` solo existe desde `pending_confirmation`: una vez aceptado, lo que
 * corresponde es `cancelled` con motivo. Después de `ready` el camino se parte
 * según sea retiro o delivery.
 */
export const TRANSICIONES_PEDIDO: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_confirmation: ["confirmed", "rejected", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "ready_for_pickup", "cancelled"],
  out_for_delivery: ["completed"],
  ready_for_pickup: ["completed"],
  completed: [],
  rejected: [],
  cancelled: [],
};

/** Transiciones permitidas del PAGO. Es otra máquina: no se mezcla con el pedido. */
export const TRANSICIONES_PAGO: Record<PaymentStatus, readonly PaymentStatus[]> =
  {
    pending: ["approved", "rejected", "cancelled"],
    approved: ["refunded"],
    rejected: [],
    cancelled: [],
    refunded: [],
  };

export function puedeTransicionarPedido(
  desde: OrderStatus,
  hacia: OrderStatus
): boolean {
  return TRANSICIONES_PEDIDO[desde].includes(hacia);
}

export function puedeTransicionarPago(
  desde: PaymentStatus,
  hacia: PaymentStatus
): boolean {
  return TRANSICIONES_PAGO[desde].includes(hacia);
}

/**
 * El comprador, copiado dentro del pedido. NO hay cuentas de cliente: el
 * teléfono es la identidad y el snapshot es lo que vale para ese pedido aunque
 * la persona después cambie de nombre o de número.
 */
export interface CustomerSnapshot {
  name: string;
  /** Solo dígitos: es la clave natural del rubro. */
  phone: string;
  email?: string;
}

/** Dirección de entrega, también copiada: mudarse no reescribe una entrega vieja. */
export interface AddressSnapshot {
  zoneId: string;
  zoneName: string;
  address: string;
  reference?: string;
}

/** Opción comprada, congelada con su nombre y su diferencia de precio. */
export interface OrderItemOption {
  optionId: string;
  groupName: string;
  optionName: string;
  priceDeltaCents: Cents;
}

/**
 * Línea del pedido. TODO acá es copia: `productId` queda solo como referencia
 * para reportes, pero lo que se muestra y se cobra sale del snapshot.
 */
export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  productImageUrl?: string;
  /** Precio base + suma de las opciones, ya resuelto por el servidor. */
  unitPriceCents: Cents;
  quantity: number;
  lineTotalCents: Cents;
  options: OrderItemOption[];
  notes?: string;
}

export interface OrderStatusEvent {
  id: string;
  /** `null` en el evento de creación. */
  from: OrderStatus | null;
  to: OrderStatus;
  /** Obligatorio en rechazos y cancelaciones. */
  reason?: string;
  /** Quién lo hizo. `null` = el sistema. En modo demo no hay usuarios todavía. */
  actorId: string | null;
  /**
   * Rol que ejecutó la acción. En modo demo es lo único que se sabe de quién
   * fue —no hay usuarios— y NO se inventa un nombre para rellenar la ficha.
   */
  actorRole?: AdminRole;
  createdAt: IsoDate;
}

export interface Payment {
  method: PaymentMethod;
  status: PaymentStatus;
  amountCents: Cents;
  /** Con cuánto paga el cliente. Informativo: el vuelto se calcula al mostrar. */
  cashReceivedCents?: Cents;
  paidAt?: IsoDate;
  /** Quién marcó el cobro. Auditoría mínima hasta que exista una tabla real. */
  markedByRole?: AdminRole;
}

export interface Order {
  id: string;
  /** Lo que el cliente dice por teléfono: corto y del día. */
  orderNumber: string;
  /** Permite ver el pedido sin cuenta. No aparece en ningún listado público. */
  publicToken: string;
  /** Clave de idempotencia del navegador: evita el pedido duplicado. */
  clientRequestId: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  customer: CustomerSnapshot;
  /** Presente solo en delivery. */
  address?: AddressSnapshot;
  items: OrderItem[];
  subtotalCents: Cents;
  deliveryFeeCents: Cents;
  totalCents: Cents;
  payment: Payment;
  notes?: string;
  estimatedMinutes?: number;
  rejectionReason?: string;
  statusHistory: OrderStatusEvent[];
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/* ---------------------------------------------------------------------------
 * Entrada de creación
 *
 * Lo que la UI manda para crear un pedido es ESTRUCTURA, nunca dinero: qué
 * producto, cuánto y con qué opciones. Los precios los resuelve el proveedor
 * leyendo el catálogo. `expectedTotalCents` existe solo para detectar que al
 * cliente le cambiaron el precio bajo los pies, jamás para calcular.
 * ------------------------------------------------------------------------ */

export interface CartItem {
  productId: string;
  quantity: number;
  optionIds: string[];
  notes?: string;
}

export interface Cart {
  items: CartItem[];
}

/**
 * Línea tal como la guarda el carrito del navegador.
 *
 * `vista` es un snapshot de PRESENTACIÓN —para pintar la línea sin esperar al
 * catálogo— y NO es autoridad: el precio bueno siempre se vuelve a resolver
 * contra el producto vivo. Se conserva para poder decirle al cliente "esto
 * costaba X y ahora cuesta Y" en vez de cambiarle el número por debajo.
 */
export interface LineaCarrito extends CartItem {
  /** Identidad de la línea: mismo producto + mismas opciones + misma nota. */
  lineId: string;
  vista: {
    nombre: string;
    precioUnitarioCents: Cents;
    imagenUrl?: string;
  };
  agregadoEn: IsoDate;
}

export interface OrderDraft {
  clientRequestId: string;
  items: CartItem[];
  fulfillment:
    | { type: "pickup" }
    | { type: "delivery"; zoneId: string; address: string; reference?: string };
  customer: CustomerSnapshot;
  payment: { method: PaymentMethod; cashReceivedCents?: Cents };
  notes?: string;
  /** Total que vio el cliente. Si no coincide, se corta con `PRICE_CHANGED`. */
  expectedTotalCents?: Cents;
}

/** Totales y líneas ya resueltos contra el catálogo. */
export interface OrderCalculation {
  items: Omit<OrderItem, "id">[];
  subtotalCents: Cents;
  deliveryFeeCents: Cents;
  totalCents: Cents;
  zone: DeliveryZone | null;
}

/* ---------------------------------------------------------------------------
 * Errores
 *
 * Tipados y con código: la UI traduce el código a un texto en español y nunca
 * muestra un stack. Cada código corresponde a un flujo excepcional de la spec.
 * ------------------------------------------------------------------------ */

export type EcommerceErrorCode =
  | "STORE_CLOSED"
  | "EMPTY_ORDER"
  | "ITEM_UNAVAILABLE"
  | "INVALID_OPTIONS"
  | "PRICE_CHANGED"
  | "ZONE_UNAVAILABLE"
  | "MIN_ORDER_NOT_MET"
  | "FULFILLMENT_DISABLED"
  | "PAYMENT_METHOD_DISABLED"
  | "INVALID_TRANSITION"
  | "NOT_FOUND"
  | "INVALID_INPUT";

export class EcommerceError extends Error {
  readonly code: EcommerceErrorCode;
  readonly details?: unknown;

  constructor(code: EcommerceErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "EcommerceError";
    this.code = code;
    this.details = details;
  }
}

/* ---------------------------------------------------------------------------
 * Límites duros
 *
 * Se validan en el proveedor, no solo en el formulario: un POST hecho a mano
 * tiene que chocar contra el mismo techo que la UI.
 * ------------------------------------------------------------------------ */

export const LIMITES = {
  lineasPorPedido: 50,
  unidadesPorLinea: 99,
  largoObservaciones: 280,
} as const;
