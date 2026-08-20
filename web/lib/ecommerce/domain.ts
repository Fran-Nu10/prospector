/**
 * REGLAS DE DOMINIO COMPARTIDAS.
 *
 * Todo lo que cualquier proveedor —el demo de hoy, Supabase mañana— tiene que
 * hacer IGUAL: calcular el total de un pedido, decidir si el local está
 * abierto, saber si un producto se ofrece a esta hora.
 *
 * Vive fuera de `service.ts` para que el proveedor pueda importarlo sin que se
 * arme un ciclo con la fábrica.
 *
 * LA REGLA QUE JUSTIFICA EL ARCHIVO: el precio de un pedido NO se calcula en el
 * navegador. `calcularPedido` recibe el catálogo real y devuelve los totales; lo
 * que el cliente vio viaja aparte, solo para detectar que le cambiaron el precio
 * mientras compraba.
 */

import { multiplicarCents, sumarCents } from "./money";
import {
  EcommerceError,
  LIMITES,
  TRANSICIONES_PEDIDO,
  ZONA_HORARIA,
  puedeTransicionarPedido,
  type Category,
  type Cents,
  type ModoDisponibilidad,
  type DeliveryZone,
  type FulfillmentType,
  type IsoDate,
  type LineaCarrito,
  type OrderStatus,
  type OrderCalculation,
  type OrderDraft,
  type OrderItem,
  type OrderItemOption,
  type OrderItem as OrderItemTipo,
  type Product,
  type ProductAvailability,
  type ProductOption,
  type ProductOptionGroup,
  type RestaurantOperationalSettings,
} from "./types";

/* ---------------------------------------------------------------------------
 * Identificadores
 * ------------------------------------------------------------------------ */

/**
 * Id opaco. `crypto.randomUUID` existe en todos los navegadores modernos y en
 * Node 19+; el respaldo cubre contextos inseguros (http en una IP de la LAN),
 * donde `randomUUID` no está disponible aunque el motor sí lo soporte.
 */
export function nuevoId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Marca temporal ISO del momento. Un solo lugar para poder fijarla en pruebas. */
export function ahoraIso(fecha: Date = new Date()): string {
  return fecha.toISOString();
}

/** Slug estable a partir de un nombre: sin tildes, sin símbolos, con guiones. */
export function aSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Teléfono normalizado a dígitos: es la clave natural del cliente. */
export function normalizarTelefono(telefono: string): string {
  return telefono.replace(/\D/g, "");
}

/* ---------------------------------------------------------------------------
 * Tiempo local
 *
 * Vercel corre en UTC y el local vive en Montevideo. Sin esto, un pedido de las
 * 22:00 del viernes cae en sábado y el horario de atención se evalúa corrido.
 * Se resuelve con `Intl`, sin sumar una dependencia de fechas.
 * ------------------------------------------------------------------------ */

const DIAS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export interface MomentoLocal {
  /** 0 = domingo … 6 = sábado, en la zona del local. */
  weekday: number;
  /** Minutos desde las 00:00 locales. */
  minutes: number;
  /** `2026-08-19`, el "día de negocio" para agrupar reportes. */
  isoDate: string;
}

export function momentoLocal(
  fecha: Date = new Date(),
  zona: string = ZONA_HORARIA
): MomentoLocal {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(fecha);

  const leer = (tipo: string) =>
    partes.find((p) => p.type === tipo)?.value ?? "";

  const weekday = DIAS.indexOf(
    leer("weekday").slice(0, 3).toLowerCase() as (typeof DIAS)[number]
  );
  /* `hour12: false` puede devolver 24 a la medianoche en algunos motores. */
  const hora = Number(leer("hour")) % 24;
  const minuto = Number(leer("minute"));

  return {
    weekday: weekday < 0 ? 0 : weekday,
    minutes: hora * 60 + minuto,
    isoDate: `${leer("year")}-${leer("month")}-${leer("day")}`,
  };
}

/**
 * ¿Cae `momento` dentro de la franja? Una franja que cierra después de
 * medianoche se declara con el cierre pasado de 1440 (02:00 = 1560) y cuenta
 * como parte de la noche del día en que abrió.
 */
function dentroDeFranja(
  momento: MomentoLocal,
  franja: { weekday: number; desde: number; hasta: number }
): boolean {
  if (franja.hasta <= 1440) {
    return (
      momento.weekday === franja.weekday &&
      momento.minutes >= franja.desde &&
      momento.minutes < franja.hasta
    );
  }
  /* Tramo que cruza la medianoche: la parte de hoy y la madrugada de mañana. */
  const hoy =
    momento.weekday === franja.weekday && momento.minutes >= franja.desde;
  const madrugada =
    momento.weekday === (franja.weekday + 1) % 7 &&
    momento.minutes < franja.hasta - 1440;
  return hoy || madrugada;
}

/**
 * ¿Se puede pedir ahora?
 *
 * `acceptingOrders` manda sobre todo: el local puede cerrar aunque el horario
 * diga abierto. Sin horarios cargados, ese interruptor es la única palabra —no
 * se inventa un horario por defecto.
 */
export function estaAbierto(
  settings: RestaurantOperationalSettings,
  ahora: Date = new Date()
): boolean {
  if (!settings.acceptingOrders) return false;
  if (!settings.serviceHours.length) return true;
  const momento = momentoLocal(ahora, settings.timezone);
  return settings.serviceHours.some((h) =>
    dentroDeFranja(momento, {
      weekday: h.weekday,
      desde: h.opensMin,
      hasta: h.closesMin,
    })
  );
}

/** Sin franjas cargadas el producto está disponible siempre (ver `types.ts`). */
export function disponibleAhora(
  availability: ProductAvailability[],
  ahora: Date = new Date(),
  zona: string = ZONA_HORARIA
): boolean {
  if (!availability.length) return true;
  const momento = momentoLocal(ahora, zona);
  return availability.some((a) =>
    dentroDeFranja(momento, {
      weekday: a.weekday,
      desde: a.startsMin,
      hasta: a.endsMin,
    })
  );
}

/**
 * Categorías que HABILITAN la compra: activas y sin archivar.
 *
 * Se devuelve un `Set` —o `null` cuando no hay lista que consultar— para que
 * quien recorra un catálogo entero no haga una búsqueda lineal por producto.
 * `null` significa "no verifiques la categoría", que es lo que necesita quien
 * ya recibió los productos filtrados.
 */
export function idsDeCategoriasComprables(
  categorias: readonly Pick<Category, "id" | "active" | "archived">[] | undefined
): ReadonlySet<string> | null {
  if (!categorias) return null;
  return new Set(
    categorias.filter((c) => c.active && !c.archived).map((c) => c.id)
  );
}

/**
 * ¿La categoría del producto lo deja comprable?
 *
 * Un producto activo dentro de una categoría apagada NO se puede pedir: la
 * carta no lo muestra y ofrecerlo igual desde un carrito viejo sería vender
 * algo que el local sacó del menú.
 */
function categoriaHabilita(
  producto: Pick<Product, "categoryId">,
  comprables: ReadonlySet<string> | null
): boolean {
  return comprables === null || comprables.has(producto.categoryId);
}

/** ¿El producto se puede pedir? Junta todas las capas de disponibilidad. */
export function productoPedible(
  producto: Product,
  ahora: Date = new Date(),
  zona: string = ZONA_HORARIA,
  categoriasComprables: ReadonlySet<string> | null = null
): boolean {
  return (
    !producto.archived &&
    producto.active &&
    categoriaHabilita(producto, categoriasComprables) &&
    !producto.soldOut &&
    (producto.stockQuantity === null || producto.stockQuantity > 0) &&
    disponibleAhora(producto.availability, ahora, zona)
  );
}

/* ---------------------------------------------------------------------------
 * Cálculo del pedido
 * ------------------------------------------------------------------------ */

function grupoDeOpcion(
  producto: Product,
  optionId: string
): { grupo: ProductOptionGroup; opcion: ProductOption } | null {
  for (const grupo of producto.optionGroups) {
    const opcion = grupo.options.find((o) => o.id === optionId);
    if (opcion) return { grupo, opcion };
  }
  return null;
}

/**
 * Precio unitario REAL: base del producto más las diferencias de las opciones
 * elegidas. Es la única fórmula de precio unitario del sistema — la usan el
 * cálculo del pedido y la resolución del carrito, para que no puedan dar
 * distinto.
 */
export function precioUnitario(
  producto: { priceCents: Cents },
  opciones: readonly { priceDeltaCents: Cents }[]
): Cents {
  return producto.priceCents + sumarCents(opciones.map((o) => o.priceDeltaCents));
}

/**
 * Resuelve una línea contra el catálogo: precio unitario, opciones y snapshot.
 * Cualquier inconsistencia corta acá — no se "arregla" silenciosamente una
 * opción que no existe ni se ignora un producto agotado.
 */
function calcularLinea(
  producto: Product,
  cantidad: number,
  optionIds: string[],
  notas: string | undefined,
  ahora: Date,
  zona: string,
  comprables: ReadonlySet<string> | null
): Omit<OrderItem, "id"> {
  const opciones: OrderItemOption[] = [];
  const porGrupo = new Map<string, number>();

  for (const optionId of optionIds) {
    const encontrada = grupoDeOpcion(producto, optionId);
    if (!encontrada) {
      throw new EcommerceError(
        "INVALID_OPTIONS",
        `La opción no pertenece a ${producto.name}.`,
        { productId: producto.id, optionId }
      );
    }
    if (!encontrada.opcion.available || !encontrada.grupo.active) {
      throw new EcommerceError(
        "ITEM_UNAVAILABLE",
        `${encontrada.opcion.name} no está disponible.`,
        { productId: producto.id, optionId }
      );
    }
    porGrupo.set(encontrada.grupo.id, (porGrupo.get(encontrada.grupo.id) ?? 0) + 1);
    opciones.push({
      optionId,
      groupName: encontrada.grupo.name,
      optionName: encontrada.opcion.name,
      priceDeltaCents: encontrada.opcion.priceDeltaCents,
    });
  }

  /* Los mínimos y máximos se validan por grupo: una variante obligatoria sin
     elegir es un pedido incompleto, no un pedido barato. */
  for (const grupo of producto.optionGroups) {
    /* Un grupo apagado no exige nada: su mínimo dejaría el producto invendible
       sin que nadie pueda cumplirlo, porque sus opciones ya no se ofrecen. */
    if (!grupo.active) continue;
    const elegidas = porGrupo.get(grupo.id) ?? 0;
    if (elegidas < grupo.minSelect || elegidas > grupo.maxSelect) {
      throw new EcommerceError(
        "INVALID_OPTIONS",
        `"${grupo.name}" admite entre ${grupo.minSelect} y ${grupo.maxSelect} opciones.`,
        { productId: producto.id, groupId: grupo.id, elegidas }
      );
    }
  }

  if (!productoPedible(producto, ahora, zona, comprables)) {
    throw new EcommerceError(
      "ITEM_UNAVAILABLE",
      `${producto.name} no está disponible.`,
      { productId: producto.id }
    );
  }
  if (producto.stockQuantity !== null && producto.stockQuantity < cantidad) {
    throw new EcommerceError(
      "ITEM_UNAVAILABLE",
      `Quedan ${producto.stockQuantity} de ${producto.name}.`,
      { productId: producto.id, disponible: producto.stockQuantity }
    );
  }

  const unitPriceCents: Cents = precioUnitario(producto, opciones);

  return {
    productId: producto.id,
    productName: producto.name,
    productImageUrl: producto.imageUrl,
    unitPriceCents,
    quantity: cantidad,
    lineTotalCents: multiplicarCents(unitPriceCents, cantidad),
    options: opciones,
    notes: notas,
  };
}

export interface ContextoCalculo {
  products: Product[];
  zones: DeliveryZone[];
  settings: RestaurantOperationalSettings;
  /**
   * Opcional: sin ella no se verifica la categoría. Se pasa siempre desde el
   * proveedor —que tiene el catálogo entero— para que apagar una categoría
   * también corte la venta de lo que hay adentro.
   */
  categories?: readonly Category[];
  ahora?: Date;
}

/**
 * Calcula el pedido completo. Es LA función que hace que el navegador no pueda
 * decidir cuánto sale algo: recibe estructura y catálogo, devuelve dinero.
 */
export function calcularPedido(
  draft: OrderDraft,
  ctx: ContextoCalculo
): OrderCalculation {
  const ahora = ctx.ahora ?? new Date();
  const zona = ctx.settings.timezone;

  if (!estaAbierto(ctx.settings, ahora)) {
    throw new EcommerceError(
      "STORE_CLOSED",
      ctx.settings.closedMessage || "El local no está tomando pedidos."
    );
  }
  if (!draft.items.length) {
    throw new EcommerceError("EMPTY_ORDER", "El pedido no tiene productos.");
  }
  if (draft.items.length > LIMITES.lineasPorPedido) {
    throw new EcommerceError("INVALID_INPUT", "El pedido tiene demasiadas líneas.");
  }
  if ((draft.notes?.length ?? 0) > LIMITES.largoObservaciones) {
    throw new EcommerceError("INVALID_INPUT", "Las observaciones son muy largas.");
  }
  if (!ctx.settings.paymentMethods[draft.payment.method]) {
    throw new EcommerceError(
      "PAYMENT_METHOD_DISABLED",
      "Ese método de pago no está disponible."
    );
  }

  const porId = new Map(ctx.products.map((p) => [p.id, p]));
  const comprables = idsDeCategoriasComprables(ctx.categories);
  const items = draft.items.map((item) => {
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > LIMITES.unidadesPorLinea
    ) {
      throw new EcommerceError("INVALID_INPUT", "Cantidad fuera de rango.", {
        productId: item.productId,
      });
    }
    if ((item.notes?.length ?? 0) > LIMITES.largoObservaciones) {
      throw new EcommerceError("INVALID_INPUT", "Las observaciones son muy largas.");
    }
    const producto = porId.get(item.productId);
    if (!producto) {
      throw new EcommerceError("ITEM_UNAVAILABLE", "Ese producto ya no existe.", {
        productId: item.productId,
      });
    }
    return calcularLinea(
      producto,
      item.quantity,
      item.optionIds,
      item.notes,
      ahora,
      zona,
      comprables
    );
  });

  const subtotalCents = sumarCents(items.map((i) => i.lineTotalCents));

  let deliveryFeeCents: Cents = 0;
  let zonaElegida: DeliveryZone | null = null;

  /* Se desestructura para que TypeScript estreche la unión sin castings. */
  const entrega = draft.fulfillment;

  if (entrega.type === "delivery") {
    if (!ctx.settings.deliveryEnabled) {
      throw new EcommerceError("FULFILLMENT_DISABLED", "El delivery está pausado.");
    }
    zonaElegida = ctx.zones.find((z) => z.id === entrega.zoneId) ?? null;
    if (!zonaElegida || !zonaElegida.active) {
      throw new EcommerceError(
        "ZONE_UNAVAILABLE",
        "Esa zona de entrega ya no está disponible."
      );
    }
    if (subtotalCents < zonaElegida.minOrderCents) {
      throw new EcommerceError(
        "MIN_ORDER_NOT_MET",
        "El pedido no llega al mínimo de la zona.",
        { minimoCents: zonaElegida.minOrderCents, subtotalCents }
      );
    }
    deliveryFeeCents = zonaElegida.feeCents;
  } else if (!ctx.settings.pickupEnabled) {
    throw new EcommerceError("FULFILLMENT_DISABLED", "El retiro está pausado.");
  }

  const totalCents = subtotalCents + deliveryFeeCents;

  /* El total del navegador NO calcula: solo delata que el precio cambió
     mientras la persona compraba. Ver el flujo 19.3 de la especificación. */
  if (
    typeof draft.expectedTotalCents === "number" &&
    draft.expectedTotalCents !== totalCents
  ) {
    throw new EcommerceError(
      "PRICE_CHANGED",
      "El precio cambió mientras armabas el pedido.",
      { esperado: draft.expectedTotalCents, actual: totalCents }
    );
  }

  return { items, subtotalCents, deliveryFeeCents, totalCents, zone: zonaElegida };
}

/**
 * Número de pedido: secuencial de cuatro dígitos, `0001`, `0002`.
 *
 * Es el código humano —el que la persona dice por teléfono—, distinto del uuid
 * interno. Acá lo calcula el proveedor contando lo que ya existe, que alcanza
 * para un único navegador; cuando entre Postgres la secuencia la genera la base
 * y deja de haber carrera posible.
 */
export function siguienteNumeroDePedido(existentes: number): string {
  return String(existentes + 1).padStart(4, "0");
}

/* ---------------------------------------------------------------------------
 * Resumen de importes
 *
 * Subtotal, envío y total en UN solo lugar. Parece trivial —una suma— y por eso
 * mismo es donde se cuelan las verdades paralelas: el checkout mostrando un
 * total y el pedido guardando otro.
 * ------------------------------------------------------------------------ */

export interface ResumenImportes {
  subtotalCents: Cents;
  deliveryFeeCents: Cents;
  totalCents: Cents;
  /** Cuánto falta para el mínimo de la zona. 0 = alcanza. */
  faltaParaMinimoCents: Cents;
}

export function resumenImportes(
  subtotalCents: Cents,
  zona: DeliveryZone | null
): ResumenImportes {
  const deliveryFeeCents = zona ? zona.feeCents : 0;
  const falta = zona ? zona.minOrderCents - subtotalCents : 0;
  return {
    subtotalCents,
    deliveryFeeCents,
    totalCents: subtotalCents + deliveryFeeCents,
    faltaParaMinimoCents: falta > 0 ? falta : 0,
  };
}

/* ---------------------------------------------------------------------------
 * Resolución del carrito
 *
 * El carrito del navegador guarda QUÉ pidió la persona (producto, cantidad,
 * opciones) y un snapshot de presentación. El precio bueno sale SIEMPRE de acá:
 * se vuelve a leer el catálogo y se recalcula.
 *
 * A diferencia de `calcularPedido`, esta función NO tira: un carrito con un
 * producto agotado tiene que poder mostrarse para que la persona lo saque. El
 * que corta es el checkout, no la vitrina.
 * ------------------------------------------------------------------------ */

export type MotivoLinea =
  | "NOT_FOUND"
  | "ARCHIVED"
  | "CATEGORY_INACTIVE"
  | "INACTIVE"
  | "SOLD_OUT"
  | "OUT_OF_STOCK"
  | "OUT_OF_HOURS"
  | "INVALID_PRICE"
  | "OPTIONS_CHANGED";

export interface LineaResuelta {
  lineId: string;
  productId: string;
  quantity: number;
  optionIds: string[];
  notes?: string;
  /** Nombre del catálogo vivo; si el producto ya no está, el del snapshot. */
  nombre: string;
  imagenUrl?: string;
  opciones: OrderItemOption[];
  /** `null` cuando no hay precio confiable. */
  unitPriceCents: Cents | null;
  lineTotalCents: Cents | null;
  disponible: boolean;
  motivo?: MotivoLinea;
  /** El precio del catálogo difiere del que la persona vio al agregar. */
  precioCambio: boolean;
  precioAnteriorCents?: Cents;
  /** Tope de unidades cuando el producto lleva control de stock. */
  maximo?: number;
}

export interface CarritoResuelto {
  lineas: LineaResuelta[];
  /** Suma SOLO de las líneas comprables: un total con un agotado adentro miente. */
  subtotalCents: Cents;
  unidades: number;
  hayProblemas: boolean;
  hayCambiosDePrecio: boolean;
}

function motivoDe(
  producto: Product,
  cantidad: number,
  ahora: Date,
  zona: string,
  comprables: ReadonlySet<string> | null
): MotivoLinea | undefined {
  if (producto.priceCents <= 0) return "INVALID_PRICE";
  /* Archivado y "categoría apagada" se distinguen del simple `active: false`
     porque la línea del carrito los cuenta distinto: uno es "ya no existe",
     el otro es "hoy no". Los dos dejan de sumar, pero no dicen lo mismo. */
  if (producto.archived) return "ARCHIVED";
  if (!categoriaHabilita(producto, comprables)) return "CATEGORY_INACTIVE";
  if (!producto.active) return "INACTIVE";
  if (producto.soldOut) return "SOLD_OUT";
  if (producto.stockQuantity !== null && producto.stockQuantity < cantidad) {
    return "OUT_OF_STOCK";
  }
  if (!disponibleAhora(producto.availability, ahora, zona)) return "OUT_OF_HOURS";
  return undefined;
}

export function resolverCarrito(
  lineas: readonly LineaCarrito[],
  productos: readonly Product[],
  ahora: Date = new Date(),
  zona: string = ZONA_HORARIA,
  categorias?: readonly Pick<Category, "id" | "active" | "archived">[]
): CarritoResuelto {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const comprables = idsDeCategoriasComprables(categorias);

  const resueltas = lineas.map<LineaResuelta>((linea) => {
    const producto = porId.get(linea.productId);

    /* El producto desapareció del catálogo: la línea NO se borra sola. Se
       muestra con lo último que se sabía de ella y sin precio, para que la
       persona la saque a conciencia. */
    if (!producto) {
      return {
        lineId: linea.lineId,
        productId: linea.productId,
        quantity: linea.quantity,
        optionIds: linea.optionIds,
        notes: linea.notes,
        nombre: linea.vista.nombre,
        imagenUrl: linea.vista.imagenUrl,
        opciones: [],
        unitPriceCents: null,
        lineTotalCents: null,
        disponible: false,
        motivo: "NOT_FOUND",
        precioCambio: false,
      };
    }

    /* Las opciones se releen del producto vivo: si una dejó de existir o de
       estar disponible, la línea queda marcada en vez de cobrarse igual. */
    const opciones: OrderItemOption[] = [];
    let opcionesRotas = false;
    for (const optionId of linea.optionIds) {
      const encontrada = grupoDeOpcion(producto, optionId);
      if (!encontrada || !encontrada.opcion.available || !encontrada.grupo.active) {
        opcionesRotas = true;
        continue;
      }
      opciones.push({
        optionId,
        groupName: encontrada.grupo.name,
        optionName: encontrada.opcion.name,
        priceDeltaCents: encontrada.opcion.priceDeltaCents,
      });
    }

    /* El estado del PRODUCTO manda sobre el de sus opciones: si el producto se
       archivó, decir "cambiaron las opciones" sería contar la mitad menos
       importante de lo que pasó. */
    const motivo =
      motivoDe(producto, linea.quantity, ahora, zona, comprables) ??
      (opcionesRotas ? "OPTIONS_CHANGED" : undefined);
    const unitario = precioUnitario(producto, opciones);
    const precioValido = producto.priceCents > 0;

    return {
      lineId: linea.lineId,
      productId: linea.productId,
      quantity: linea.quantity,
      optionIds: linea.optionIds,
      notes: linea.notes,
      nombre: producto.name,
      imagenUrl: producto.imageUrl ?? linea.vista.imagenUrl,
      opciones,
      unitPriceCents: precioValido ? unitario : null,
      lineTotalCents: precioValido
        ? multiplicarCents(unitario, linea.quantity)
        : null,
      disponible: motivo === undefined,
      motivo,
      /* Se avisa el cambio aunque la línea siga comprable: el precio nuevo es
         el que vale, pero la persona tiene que enterarse. */
      precioCambio: precioValido && unitario !== linea.vista.precioUnitarioCents,
      precioAnteriorCents: linea.vista.precioUnitarioCents,
      maximo: producto.stockQuantity ?? undefined,
    };
  });

  return {
    lineas: resueltas,
    subtotalCents: sumarCents(
      resueltas.filter((l) => l.disponible).map((l) => l.lineTotalCents ?? 0)
    ),
    unidades: resueltas
      .filter((l) => l.disponible)
      .reduce((total, l) => total + l.quantity, 0),
    hayProblemas: resueltas.some((l) => !l.disponible),
    hayCambiosDePrecio: resueltas.some((l) => l.precioCambio),
  };
}

/* ---------------------------------------------------------------------------
 * Acciones disponibles sobre un pedido
 *
 * El panel NO decide qué botones mostrar mirando el estado a ojo: pregunta acá.
 * Así la pantalla no puede ofrecer una transición que el repositorio va a
 * rechazar, y agregar un estado nuevo no obliga a recorrer el JSX.
 * ------------------------------------------------------------------------ */

/**
 * Estados a los que ESTE pedido puede pasar ahora mismo.
 *
 * Además de la máquina general, filtra por modalidad: un pedido de retiro nunca
 * "sale para entrega" y uno de delivery nunca queda "listo para retirar".
 */
export function accionesDisponibles(pedido: {
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
}): OrderStatus[] {
  return TRANSICIONES_PEDIDO[pedido.status].filter((destino) => {
    if (destino === "out_for_delivery") return pedido.fulfillmentType === "delivery";
    if (destino === "ready_for_pickup") return pedido.fulfillmentType === "pickup";
    return true;
  });
}

/** ¿La transición es legal para este pedido concreto? */
export function transicionPermitida(
  pedido: { status: OrderStatus; fulfillmentType: FulfillmentType },
  destino: OrderStatus
): boolean {
  return (
    puedeTransicionarPedido(pedido.status, destino) &&
    accionesDisponibles(pedido).includes(destino)
  );
}

/** Minutos transcurridos desde que entró el pedido. Para el "hace 12 min". */
export function minutosDesde(iso: IsoDate, ahora: Date = new Date()): number {
  const ms = ahora.getTime() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

/** Hora local `19:42` de una marca ISO. */
export function horaLocal(
  iso: IsoDate,
  zona: string = ZONA_HORARIA
): string {
  return new Intl.DateTimeFormat("es-UY", {
    timeZone: zona,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/* ---------------------------------------------------------------------------
 * Agrupación operativa
 *
 * El panel no muestra nueve estados: muestra cuatro columnas que responden a
 * "¿qué tengo que hacer ahora?". El mapeo vive acá, junto a la máquina, y no en
 * el JSX — si mañana se agrega un estado, se agrega en un solo lugar.
 * ------------------------------------------------------------------------ */

export type GrupoPanel = "nuevos" | "en_curso" | "listos" | "completados";

export const GRUPOS_PANEL: Record<GrupoPanel, readonly OrderStatus[]> = {
  nuevos: ["pending_confirmation"],
  en_curso: ["confirmed", "preparing"],
  listos: ["ready", "ready_for_pickup", "out_for_delivery"],
  completados: ["completed", "rejected", "cancelled"],
};

export function grupoDePedido(estado: OrderStatus): GrupoPanel {
  for (const [grupo, estados] of Object.entries(GRUPOS_PANEL)) {
    if (estados.includes(estado)) return grupo as GrupoPanel;
  }
  return "completados";
}

/**
 * Ordena para trabajar, no para archivar.
 *
 * Los pedidos que esperan acción van del MÁS VIEJO al más nuevo: el que lleva
 * veinte minutos sin confirmar tiene que estar arriba, no enterrado bajo los
 * que acaban de entrar. Lo terminado se lista al revés, como un historial.
 */
export function ordenarParaPanel<T extends { status: OrderStatus; createdAt: IsoDate }>(
  pedidos: readonly T[],
  grupo: GrupoPanel
): T[] {
  const copia = [...pedidos];
  return grupo === "completados"
    ? copia.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : copia.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/* ===========================================================================
 * ADMINISTRACIÓN DEL CATÁLOGO
 *
 * Todo lo que el panel necesita decidir ANTES de escribir vive acá: qué es un
 * precio válido, cuándo un slug choca, cómo se traduce "agotado" a los campos
 * de la base, cuánto stock hay que descontar y cuándo.
 *
 * Está en el dominio y no en los componentes por la misma razón de siempre: un
 * `POST` hecho a mano, otra pantalla o el proveedor de Supabase tienen que
 * chocar contra la MISMA regla que el formulario. Una validación que solo vive
 * en el JSX no es una regla del negocio: es una sugerencia.
 * ======================================================================== */

/** Errores por campo: `{ name: "Poné un nombre." }`. Vacío = válido. */
export type ErroresDeCampo = Record<string, string>;

/* ---------------------------------------------------------------------------
 * Disponibilidad como un solo modo
 * ------------------------------------------------------------------------ */

/**
 * Los dos campos de la base leídos como UNA pregunta.
 *
 * `sold_out` gana: es el interruptor manual, la decisión explícita de alguien
 * que dijo "esto hoy no sale". Un producto con stock en cero NO es `sold_out`
 * sino `limited` sin unidades —sigue llevando la cuenta— y la tienda igual lo
 * muestra como no disponible.
 */
export function modoDisponibilidad(
  producto: Pick<Product, "soldOut" | "stockQuantity">
): ModoDisponibilidad {
  if (producto.soldOut) return "sold_out";
  return producto.stockQuantity !== null ? "limited" : "available";
}

/**
 * El modo elegido en el panel traducido a los campos de la base. Es la ÚNICA
 * traducción: ninguna pantalla escribe `soldOut` a mano.
 */
export function camposDeModo(
  modo: ModoDisponibilidad,
  cantidad?: number | null
): { soldOut: boolean; stockQuantity: number | null } {
  /* Marcar agotado APAGA el control de stock: dejar una cuenta viva detrás de
     un "no hay" es tener dos verdades sobre la misma pregunta. Volver a
     "cantidad limitada" pide el número de nuevo, que es lo honesto. */
  if (modo === "sold_out") return { soldOut: true, stockQuantity: null };
  if (modo === "limited") {
    const n = Math.trunc(Number(cantidad ?? 0));
    return {
      soldOut: false,
      stockQuantity: Number.isFinite(n) ? Math.max(0, n) : 0,
    };
  }
  return { soldOut: false, stockQuantity: null };
}

/* ---------------------------------------------------------------------------
 * Stock: descontar una vez, reponer una vez
 *
 * El descuento ocurre cuando el local ACEPTA el pedido, no cuando el cliente lo
 * manda: hasta ese momento el local no se comprometió a nada, y reservar
 * unidades por pedidos que después se rechazan deja la carta agotada de mentira.
 *
 * `Order.stockApplied` es el pestillo que hace que las dos operaciones sean
 * idempotentes. Estas funciones son puras —reciben productos, devuelven
 * productos— justamente para que el pestillo lo maneje quien escribe.
 * ------------------------------------------------------------------------ */

/** Unidades por producto dentro de un pedido, sumando líneas repetidas. */
function consumoPorProducto(
  items: readonly Pick<OrderItemTipo, "productId" | "quantity">[]
): Map<string, number> {
  const consumo = new Map<string, number>();
  for (const item of items) {
    consumo.set(item.productId, (consumo.get(item.productId) ?? 0) + item.quantity);
  }
  return consumo;
}

export interface FaltanteDeStock {
  productId: string;
  nombre: string;
  pedido: number;
  disponible: number;
}

/**
 * Qué falta para poder aceptar el pedido. Devuelve la lista completa —no el
 * primero— porque al operador hay que decirle TODO lo que le falta, no
 * mandarlo a descubrirlo de a un producto por vez.
 *
 * Un producto que ya no está en el catálogo no cuenta como faltante: el pedido
 * guarda su copia y el local puede cumplirlo igual; lo que no se puede es
 * descontarle stock a algo que no existe.
 */
export function faltantesDeStock(
  items: readonly Pick<OrderItemTipo, "productId" | "productName" | "quantity">[],
  productos: readonly Product[]
): FaltanteDeStock[] {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const faltantes: FaltanteDeStock[] = [];
  for (const [productId, pedido] of consumoPorProducto(items)) {
    const producto = porId.get(productId);
    if (!producto || producto.stockQuantity === null) continue;
    if (producto.stockQuantity < pedido) {
      faltantes.push({
        productId,
        nombre: producto.name,
        pedido,
        disponible: producto.stockQuantity,
      });
    }
  }
  return faltantes;
}

/** Descuenta las unidades del pedido. Nunca baja de cero. */
export function descontarStock(
  productos: readonly Product[],
  items: readonly Pick<OrderItemTipo, "productId" | "quantity">[]
): Product[] {
  const consumo = consumoPorProducto(items);
  return productos.map((p) => {
    const cantidad = consumo.get(p.id);
    if (!cantidad || p.stockQuantity === null) return p;
    /* No se toca `soldOut`: un stock en cero YA muestra agotado en la tienda, y
       encender el interruptor manual además dejaría el producto bloqueado
       cuando el dueño reponga unidades. */
    return { ...p, stockQuantity: Math.max(0, p.stockQuantity - cantidad) };
  });
}

/** Repone las unidades de un pedido que se cayó DESPUÉS de haberse descontado. */
export function reponerStock(
  productos: readonly Product[],
  items: readonly Pick<OrderItemTipo, "productId" | "quantity">[]
): Product[] {
  const consumo = consumoPorProducto(items);
  return productos.map((p) => {
    const cantidad = consumo.get(p.id);
    if (!cantidad || p.stockQuantity === null) return p;
    return { ...p, stockQuantity: p.stockQuantity + cantidad };
  });
}

/* ---------------------------------------------------------------------------
 * Rutas de imagen
 *
 * En modo demo NO hay almacenamiento: no se sube nada, se apunta a un asset que
 * ya existe. Lo único que se valida es la forma de la ruta.
 * ------------------------------------------------------------------------ */

/**
 * Dominios externos que `next/image` puede servir HOY.
 *
 * Es el espejo de `images.remotePatterns` en `web/next.config.ts`, que está
 * vacío a propósito: abrir el allowlist para que una demo pueda pegar un enlace
 * cualquiera convierte al sitio en proxy de imágenes de terceros. Si algún día
 * se habilita un dominio, se agrega en los dos lados.
 */
export const DOMINIOS_IMAGEN_PERMITIDOS: readonly string[] = [];

/**
 * Valida la ruta de una imagen. Devuelve el mensaje de error o `null` si sirve.
 * Una cadena vacía es válida: quitar la imagen es una decisión legítima.
 */
export function validarRutaImagen(ruta: string | undefined): string | null {
  const valor = (ruta ?? "").trim();
  if (!valor) return null;
  if (valor.startsWith("/")) {
    return valor.includes("..")
      ? "La ruta no puede salir de la carpeta pública."
      : null;
  }
  if (/^https:\/\//i.test(valor)) {
    let host = "";
    try {
      host = new URL(valor).hostname;
    } catch {
      return "Esa dirección no es válida.";
    }
    return DOMINIOS_IMAGEN_PERMITIDOS.includes(host)
      ? null
      : "Esta demo todavía no puede mostrar imágenes de otros sitios. Usá una ruta que empiece con “/”.";
  }
  return "Usá una ruta que empiece con “/” (por ejemplo /hamburgueseria/platos/clasica.png).";
}

/* ---------------------------------------------------------------------------
 * Validación de categorías
 * ------------------------------------------------------------------------ */

export interface EntradaCategoria {
  name: string;
  slug: string;
}

export function validarCategoria(
  entrada: EntradaCategoria,
  ctx: { categorias: readonly Category[]; idActual?: string }
): ErroresDeCampo {
  const errores: ErroresDeCampo = {};
  const name = entrada.name.trim();
  const slug = entrada.slug.trim();

  if (!name) errores.name = "Poné un nombre.";
  else if (name.length > LIMITES.largoNombre) {
    errores.name = `Máximo ${LIMITES.largoNombre} caracteres.`;
  }

  if (!slug) errores.slug = "Poné una dirección.";
  else if (slug !== aSlug(slug)) {
    errores.slug = "Usá solo minúsculas, números y guiones.";
  } else if (
    ctx.categorias.some((c) => c.id !== ctx.idActual && c.slug === slug)
  ) {
    errores.slug = "Ya hay otra categoría con esa dirección.";
  }

  return errores;
}

/**
 * ¿Se puede archivar la categoría?
 *
 * NO se borra ni se archiva una categoría que todavía tiene productos vivos: el
 * producto quedaría colgando de un padre invisible, ni en la carta ni en el
 * panel. Primero se mueven o se archivan los productos; recién ahí la categoría
 * se puede guardar.
 */
export function productosVivosDeCategoria(
  categoryId: string,
  productos: readonly Product[]
): Product[] {
  return productos.filter((p) => p.categoryId === categoryId && !p.archived);
}

/* ---------------------------------------------------------------------------
 * Validación de productos
 * ------------------------------------------------------------------------ */

export interface EntradaProducto {
  name: string;
  slug: string;
  categoryId: string;
  description?: string;
  /** Ya en centésimos: la conversión desde pesos la hace `parsearPesos`. */
  priceCents: number | null;
  active: boolean;
  modo: ModoDisponibilidad;
  stockQuantity?: number | null;
  imageUrl?: string;
  stageImageUrl?: string;
}

export function validarProducto(
  entrada: EntradaProducto,
  ctx: {
    productos: readonly Product[];
    categorias: readonly Category[];
    idActual?: string;
  }
): ErroresDeCampo {
  const errores: ErroresDeCampo = {};
  const name = entrada.name.trim();
  const slug = entrada.slug.trim();

  if (!name) errores.name = "Poné un nombre.";
  else if (name.length > LIMITES.largoNombre) {
    errores.name = `Máximo ${LIMITES.largoNombre} caracteres.`;
  }

  if (!slug) errores.slug = "Poné una dirección.";
  else if (slug !== aSlug(slug)) {
    errores.slug = "Usá solo minúsculas, números y guiones.";
  } else if (
    ctx.productos.some((p) => p.id !== ctx.idActual && p.slug === slug)
  ) {
    errores.slug = "Ya hay otro producto con esa dirección.";
  }

  if (!entrada.categoryId) errores.categoryId = "Elegí una categoría.";
  else if (!ctx.categorias.some((c) => c.id === entrada.categoryId)) {
    errores.categoryId = "Esa categoría ya no existe.";
  }

  if ((entrada.description?.trim().length ?? 0) > LIMITES.largoDescripcion) {
    errores.description = `Máximo ${LIMITES.largoDescripcion} caracteres.`;
  }

  /* El precio: `null` es "no se entendió lo que se escribió". Un producto
     apagado puede quedar sin precio —es un borrador—, pero uno publicado no:
     ahí el precio es la promesa que el cliente ve. */
  if (entrada.priceCents === null) {
    errores.priceCents = "Escribí el precio en pesos, por ejemplo 490.";
  } else if (entrada.priceCents < 0) {
    errores.priceCents = "El precio no puede ser negativo.";
  } else if (entrada.priceCents > LIMITES.precioMaximoCents) {
    errores.priceCents = "Ese precio parece un error de tipeo.";
  } else if (entrada.active && entrada.priceCents <= 0) {
    errores.priceCents = "Un producto publicado necesita un precio.";
  }

  if (entrada.modo === "limited") {
    const n = entrada.stockQuantity;
    if (n === null || n === undefined || !Number.isInteger(n) || n < 0) {
      errores.stockQuantity = "Poné una cantidad entera, 0 o más.";
    } else if (n > LIMITES.stockMaximo) {
      errores.stockQuantity = `Máximo ${LIMITES.stockMaximo} unidades.`;
    }
  }

  const imagen = validarRutaImagen(entrada.imageUrl);
  if (imagen) errores.imageUrl = imagen;
  const escena = validarRutaImagen(entrada.stageImageUrl);
  if (escena) errores.stageImageUrl = escena;

  return errores;
}

/* ---------------------------------------------------------------------------
 * Grupos de opciones
 *
 * "Variante" y "extra" son el mismo objeto con otra configuración (ver
 * `types.ts`). El panel muestra un tipo y un interruptor de obligatoriedad; acá
 * se traduce a los mínimos y máximos reales, y al revés.
 * ------------------------------------------------------------------------ */

export type TipoDeGrupo = "unica" | "multiple";

export function tipoDeGrupo(
  grupo: Pick<ProductOptionGroup, "maxSelect">
): TipoDeGrupo {
  return grupo.maxSelect <= 1 ? "unica" : "multiple";
}

/**
 * Tipo + obligatoriedad → mínimo y máximo coherentes.
 *
 * Selección única implica máximo 1; obligatoria implica mínimo 1. Se calcula en
 * vez de dejar que el formulario guarde una combinación imposible como
 * "elegí entre 2 y 1".
 */
export function camposDeGrupo(
  tipo: TipoDeGrupo,
  obligatorio: boolean,
  min = 0,
  max = 1
): { minSelect: number; maxSelect: number } {
  if (tipo === "unica") return { minSelect: obligatorio ? 1 : 0, maxSelect: 1 };
  const maxSelect = Math.max(1, Math.trunc(max));
  const pedido = Math.max(obligatorio ? 1 : 0, Math.trunc(min));
  return { minSelect: Math.min(pedido, maxSelect), maxSelect };
}

/**
 * Valida los grupos de un producto. Las claves de error se indexan por posición
 * (`grupo.0.name`, `grupo.0.opcion.2.name`) para que el formulario pueda pintar
 * cada mensaje al lado de su campo sin inventar identificadores.
 */
export function validarGruposDeOpciones(
  grupos: readonly ProductOptionGroup[]
): ErroresDeCampo {
  const errores: ErroresDeCampo = {};
  if (grupos.length > LIMITES.gruposPorProducto) {
    errores.optionGroups = `Máximo ${LIMITES.gruposPorProducto} grupos.`;
  }

  grupos.forEach((grupo, i) => {
    if (!grupo.name.trim()) errores[`grupo.${i}.name`] = "Poné un nombre.";
    if (grupo.options.length > LIMITES.opcionesPorGrupo) {
      errores[`grupo.${i}.options`] = `Máximo ${LIMITES.opcionesPorGrupo} opciones.`;
    }

    const activas = grupo.options.filter((o) => o.available);
    /* Un grupo encendido y obligatorio sin opciones disponibles bloquea la
       venta del producto entero: nadie puede cumplir el mínimo. */
    if (grupo.active && grupo.minSelect > activas.length) {
      errores[`grupo.${i}.options`] =
        activas.length === 0
          ? "Un grupo obligatorio necesita al menos una opción disponible."
          : `No alcanzan las opciones disponibles para exigir ${grupo.minSelect}.`;
    }

    grupo.options.forEach((opcion, j) => {
      if (!opcion.name.trim()) {
        errores[`grupo.${i}.opcion.${j}.name`] = "Poné un nombre.";
      }
      if (!Number.isInteger(opcion.priceDeltaCents)) {
        errores[`grupo.${i}.opcion.${j}.priceDeltaCents`] =
          "Escribí un importe válido.";
      } else if (Math.abs(opcion.priceDeltaCents) > LIMITES.precioMaximoCents) {
        errores[`grupo.${i}.opcion.${j}.priceDeltaCents`] =
          "Ese importe parece un error de tipeo.";
      }
    });
  });

  return errores;
}

/* ---------------------------------------------------------------------------
 * Zonas de delivery
 * ------------------------------------------------------------------------ */

export interface EntradaZona {
  name: string;
  feeCents: number | null;
  minOrderCents: number | null;
}

export function validarZona(
  entrada: EntradaZona,
  ctx: { zonas: readonly DeliveryZone[]; idActual?: string }
): ErroresDeCampo {
  const errores: ErroresDeCampo = {};
  const name = entrada.name.trim();

  if (!name) errores.name = "Poné un nombre.";
  else if (name.length > LIMITES.largoNombre) {
    errores.name = `Máximo ${LIMITES.largoNombre} caracteres.`;
  } else if (
    ctx.zonas.some(
      (z) =>
        z.id !== ctx.idActual &&
        !z.archived &&
        z.name.trim().toLowerCase() === name.toLowerCase()
    )
  ) {
    errores.name = "Ya hay una zona con ese nombre.";
  }

  if (entrada.feeCents === null) {
    errores.feeCents = "Escribí el costo en pesos, por ejemplo 120.";
  } else if (entrada.feeCents < 0) {
    errores.feeCents = "El costo no puede ser negativo.";
  } else if (entrada.feeCents > LIMITES.precioMaximoCents) {
    errores.feeCents = "Ese costo parece un error de tipeo.";
  }

  if (entrada.minOrderCents === null) {
    errores.minOrderCents = "Escribí el mínimo en pesos, o 0 si no hay.";
  } else if (entrada.minOrderCents < 0) {
    errores.minOrderCents = "El mínimo no puede ser negativo.";
  } else if (entrada.minOrderCents > LIMITES.precioMaximoCents) {
    errores.minOrderCents = "Ese mínimo parece un error de tipeo.";
  }

  return errores;
}

/**
 * ¿El delivery se puede ofrecer?
 *
 * Habilitado en la configuración NO alcanza: sin una zona activa no hay tarifa
 * que cobrar ni lugar a donde ir. Es la misma pregunta en el panel, en el
 * checkout y en el proveedor, así que se contesta una sola vez.
 */
export function deliveryDisponible(
  settings: Pick<RestaurantOperationalSettings, "deliveryEnabled">,
  zonas: readonly DeliveryZone[]
): boolean {
  return (
    settings.deliveryEnabled && zonas.some((z) => z.active && !z.archived)
  );
}
