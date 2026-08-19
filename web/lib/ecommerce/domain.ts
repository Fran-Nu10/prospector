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
  ZONA_HORARIA,
  type Cents,
  type DeliveryZone,
  type OrderCalculation,
  type OrderDraft,
  type OrderItem,
  type OrderItemOption,
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

/** ¿El producto se puede pedir? Junta las tres capas de disponibilidad. */
export function productoPedible(
  producto: Product,
  ahora: Date = new Date(),
  zona: string = ZONA_HORARIA
): boolean {
  return (
    producto.active &&
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
  zona: string
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
    if (!encontrada.opcion.available) {
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
    const elegidas = porGrupo.get(grupo.id) ?? 0;
    if (elegidas < grupo.minSelect || elegidas > grupo.maxSelect) {
      throw new EcommerceError(
        "INVALID_OPTIONS",
        `"${grupo.name}" admite entre ${grupo.minSelect} y ${grupo.maxSelect} opciones.`,
        { productId: producto.id, groupId: grupo.id, elegidas }
      );
    }
  }

  if (!productoPedible(producto, ahora, zona)) {
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

  const unitPriceCents: Cents =
    producto.priceCents + sumarCents(opciones.map((o) => o.priceDeltaCents));

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
      zona
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
 * Número de pedido: secuencial dentro del día LOCAL, con tres dígitos. Es lo
 * que el cliente dice por teléfono, así que tiene que ser corto y no repetirse
 * en la misma jornada.
 */
export function siguienteNumeroDePedido(
  fechasExistentes: readonly string[],
  ahora: Date = new Date(),
  zona: string = ZONA_HORARIA
): string {
  const hoy = momentoLocal(ahora, zona).isoDate;
  const delDia = fechasExistentes.filter(
    (f) => momentoLocal(new Date(f), zona).isoDate === hoy
  ).length;
  return String(delDia + 1).padStart(3, "0");
}
