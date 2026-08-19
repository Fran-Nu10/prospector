/**
 * CHECKOUT — de un carrito del navegador a un pedido real.
 *
 * Es la capa que traduce lo que la persona completó en el formulario a un
 * `OrderDraft`, y nada más. Deliberadamente NO calcula precios ni valida
 * disponibilidad: eso ya lo hace `calcularPedido` dentro del repositorio, que
 * lee el catálogo vivo. Si el checkout recalculara por su cuenta habría dos
 * verdades y la del navegador sería la fácil de falsificar.
 *
 * Lo que sí resuelve acá:
 *   · qué campos faltan ANTES de intentar crear el pedido, para no mandar a la
 *     persona contra un error del servidor por olvidarse el teléfono;
 *   · la clave de idempotencia, que se genera UNA vez por intento de compra y
 *     sobrevive a recargas — es lo que hace que un doble toque o un reintento
 *     devuelvan el mismo pedido en vez de dos;
 *   · guardar el formulario en curso, para que recargar no borre lo escrito.
 */

import { nuevoId, normalizarTelefono, resumenImportes } from "./domain";
import { SLUG_INSTALACION } from "./demo/seed";
import { obtenerEcommerce } from "./service";
import {
  EcommerceError,
  LIMITES,
  type Cents,
  type DeliveryZone,
  type FulfillmentType,
  type LineaCarrito,
  type Order,
  type OrderDraft,
  type PaymentMethod,
} from "./types";

/* ---------------------------------------------------------------------------
 * Formulario
 * ------------------------------------------------------------------------ */

export interface FormularioCheckout {
  nombre: string;
  /** Tal como lo escribió la persona; se guarda además normalizado. */
  telefono: string;
  email: string;
  entrega: FulfillmentType;
  zonaId: string;
  direccion: string;
  referencia: string;
  metodoPago: PaymentMethod;
  /** Vacío = "no necesito cambio". */
  pagaCon: string;
  notas: string;
}

export const FORMULARIO_VACIO: FormularioCheckout = {
  nombre: "",
  telefono: "",
  email: "",
  entrega: "pickup",
  zonaId: "",
  direccion: "",
  referencia: "",
  metodoPago: "cash",
  pagaCon: "",
  notas: "",
};

/** Campos con problema, por nombre de campo. La UI los pinta donde van. */
export type ErroresFormulario = Partial<Record<keyof FormularioCheckout, string>>;

/**
 * Teléfono uruguayo: 8 dígitos fijo, 9 con celular, y hasta 11-12 si viene con
 * el prefijo país. Se valida por CANTIDAD DE DÍGITOS y no con una expresión
 * cerrada: una regex estricta rechaza formatos legítimos que la gente escribe
 * con espacios, guiones o paréntesis, y el costo de equivocarse es perder una
 * venta.
 */
function telefonoPlausible(texto: string): boolean {
  const digitos = normalizarTelefono(texto);
  return digitos.length >= 8 && digitos.length <= 15;
}

/** Monto en pesos escrito a mano → centésimos. `null` si no es un número claro. */
export function montoAEnteros(texto: string): Cents | null {
  const limpio = texto.trim().replace(/^\$\s*/, "").replace(/\./g, "");
  if (!limpio) return null;
  if (!/^\d{1,7}(?:,\d{1,2})?$/.test(limpio)) return null;
  const [enteros, decimales = ""] = limpio.split(",");
  return Number(enteros) * 100 + Number(decimales.padEnd(2, "0"));
}

export interface ContextoFormulario {
  zonas: DeliveryZone[];
  deliveryHabilitado: boolean;
  retiroHabilitado: boolean;
  totalCents: Cents;
  faltaParaMinimoCents: Cents;
}

/**
 * Valida lo que la persona completó. Lo del catálogo —stock, precios, zona
 * activa— no se comprueba acá: lo revisa el repositorio contra los datos vivos
 * en el momento exacto de crear el pedido, que es el único momento que importa.
 */
export function validarFormulario(
  form: FormularioCheckout,
  ctx: ContextoFormulario
): ErroresFormulario {
  const errores: ErroresFormulario = {};

  if (form.nombre.trim().length < 2) errores.nombre = "Poné tu nombre.";
  if (!telefonoPlausible(form.telefono)) {
    errores.telefono = "Necesitamos un teléfono para confirmarte el pedido.";
  }
  if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
    errores.email = "Ese correo no parece válido.";
  }

  if (form.entrega === "delivery") {
    if (!ctx.deliveryHabilitado || ctx.zonas.length === 0) {
      errores.entrega = "El delivery no está disponible.";
    }
    const zona = ctx.zonas.find((z) => z.id === form.zonaId);
    if (!zona) errores.zonaId = "Elegí la zona de entrega.";
    if (form.direccion.trim().length < 5) {
      errores.direccion = "Escribí la dirección completa.";
    }
    if (zona && ctx.faltaParaMinimoCents > 0) {
      errores.zonaId = "El pedido no llega al mínimo de esa zona.";
    }
  } else if (!ctx.retiroHabilitado) {
    errores.entrega = "El retiro no está disponible.";
  }

  if (form.metodoPago !== "cash") {
    errores.metodoPago = "Ese método de pago todavía no está disponible.";
  }

  if (form.pagaCon.trim()) {
    const monto = montoAEnteros(form.pagaCon);
    if (monto === null) errores.pagaCon = "Escribí un monto en números.";
    else if (monto < ctx.totalCents) errores.pagaCon = "Tiene que cubrir el total.";
  }

  if (form.notas.length > LIMITES.largoObservaciones) {
    errores.notas = "La aclaración es muy larga.";
  }

  return errores;
}

/* ---------------------------------------------------------------------------
 * Persistencia del intento de compra
 *
 * Recargar en medio del checkout no puede borrar lo escrito. Se guarda el
 * formulario junto con la CLAVE DE IDEMPOTENCIA: las dos cosas pertenecen al
 * mismo intento y separarlas rompería la protección contra el doble envío.
 * ------------------------------------------------------------------------ */

const VERSION = 1 as const;
export const CLAVE_CHECKOUT = `prospector:checkout:${SLUG_INSTALACION}:v${VERSION}`;

interface IntentoGuardado {
  version: typeof VERSION;
  form: FormularioCheckout;
  clientRequestId: string;
}

function enNavegador(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/** Formulario y clave del intento en curso. Crea uno nuevo si no había. */
export function leerIntento(): { form: FormularioCheckout; clientRequestId: string } {
  if (!enNavegador()) {
    return { form: FORMULARIO_VACIO, clientRequestId: "" };
  }
  const crudo = window.localStorage.getItem(CLAVE_CHECKOUT);
  if (crudo) {
    try {
      const guardado = JSON.parse(crudo) as Partial<IntentoGuardado>;
      if (
        guardado?.version === VERSION &&
        guardado.form &&
        typeof guardado.clientRequestId === "string" &&
        guardado.clientRequestId
      ) {
        /* Se completa con los valores por defecto: un formulario guardado por
           una versión anterior puede no tener todos los campos. */
        return {
          form: { ...FORMULARIO_VACIO, ...guardado.form },
          clientRequestId: guardado.clientRequestId,
        };
      }
      console.warn("[checkout] el intento guardado no tiene la forma esperada.");
    } catch {
      console.warn("[checkout] intento guardado ilegible; se empieza de cero.");
    }
  }
  const nuevo = { form: FORMULARIO_VACIO, clientRequestId: nuevoId() };
  guardarIntento(nuevo.form, nuevo.clientRequestId);
  return nuevo;
}

export function guardarIntento(
  form: FormularioCheckout,
  clientRequestId: string
): void {
  if (!enNavegador()) return;
  try {
    const dato: IntentoGuardado = { version: VERSION, form, clientRequestId };
    window.localStorage.setItem(CLAVE_CHECKOUT, JSON.stringify(dato));
  } catch {
    /* Sin almacenamiento el checkout sigue andando; solo no sobrevive a un
       refresh. Preferible a caerse. */
  }
}

/**
 * Cierra el intento. Se llama SOLO después de que el pedido quedó creado: si se
 * limpiara antes, un fallo de escritura dejaría a la persona sin formulario y
 * sin pedido.
 */
export function cerrarIntento(): void {
  if (!enNavegador()) return;
  try {
    window.localStorage.removeItem(CLAVE_CHECKOUT);
  } catch {
    /* Da igual: el intento siguiente genera una clave nueva. */
  }
}

/* ---------------------------------------------------------------------------
 * Creación del pedido
 * ------------------------------------------------------------------------ */

export interface ResultadoCheckout {
  order: Order;
  /** El pedido ya existía con este `clientRequestId`: no se creó otro. */
  duplicado: boolean;
}

/**
 * Arma el draft y se lo da al repositorio.
 *
 * Lo que viaja es ESTRUCTURA: qué producto, cuántos y con qué opciones. Ningún
 * importe sale de acá — el repositorio los resuelve contra el catálogo y, si el
 * total que la persona vio ya no coincide, corta con `PRICE_CHANGED` en vez de
 * cobrarle otra cosa.
 */
export async function crearPedido(
  lineas: readonly LineaCarrito[],
  form: FormularioCheckout,
  clientRequestId: string,
  totalMostradoCents: Cents
): Promise<ResultadoCheckout> {
  if (!clientRequestId) {
    throw new EcommerceError("INVALID_INPUT", "Falta la clave del intento.");
  }

  const pagaCon = form.pagaCon.trim() ? montoAEnteros(form.pagaCon) : null;

  const draft: OrderDraft = {
    clientRequestId,
    items: lineas.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      optionIds: l.optionIds,
      notes: l.notes,
    })),
    fulfillment:
      form.entrega === "delivery"
        ? {
            type: "delivery",
            zoneId: form.zonaId,
            address: form.direccion.trim(),
            reference: form.referencia.trim() || undefined,
          }
        : { type: "pickup" },
    customer: {
      name: form.nombre.trim(),
      /* Se guarda normalizado: el teléfono es la identidad del cliente y dos
         formatos del mismo número no pueden ser dos personas. */
      phone: normalizarTelefono(form.telefono),
      email: form.email.trim() || undefined,
    },
    payment: {
      method: form.metodoPago,
      cashReceivedCents: pagaCon ?? undefined,
    },
    notes: form.notas.trim() || undefined,
    expectedTotalCents: totalMostradoCents,
  };

  const { orders } = obtenerEcommerce();
  const { order, duplicated } = await orders.create(draft);
  return { order, duplicado: duplicated };
}

/** Resumen de importes para la pantalla, con la misma cuenta que el pedido. */
export function resumenCheckout(
  subtotalCents: Cents,
  zona: DeliveryZone | null
): ReturnType<typeof resumenImportes> {
  return resumenImportes(subtotalCents, zona);
}
