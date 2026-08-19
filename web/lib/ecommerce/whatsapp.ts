/**
 * WHATSAPP — el ÚNICO lugar donde se arma un enlace de WhatsApp.
 *
 * Había cuatro constructores repartidos (la nav, "cómo pedir", el menú y la
 * página del pedido). Cuatro implementaciones son cuatro formas de equivocarse:
 * una normaliza el número, otra no; una escapa el texto, otra lo rompe.
 *
 * DOS REGLAS QUE NO SE NEGOCIAN:
 *
 * · SIN NÚMERO NO HAY BOTÓN. Todas las funciones devuelven `null` si el
 *   prospecto no tiene WhatsApp cargado. Inventar un teléfono está prohibido
 *   (CLAUDE.md) y un botón muerto es peor que ninguno.
 *
 * · LA URL NO LLEVA DATOS SENSIBLES. Queda en el historial del teléfono, en el
 *   portapapeles y a veces en un log. Va el número de pedido y nada más: ni
 *   dirección, ni total, ni teléfono del cliente.
 *
 * Nada se envía solo: estas funciones devuelven un enlace que una persona toca.
 */

/** Deja solo los dígitos. `null` si no queda un número usable. */
export function normalizarNumeroWhatsapp(numero?: string): string | null {
  const digitos = numero?.replace(/\D/g, "") ?? "";
  /* Menos de 8 dígitos no es un teléfono: es un campo mal cargado. */
  return digitos.length >= 8 ? digitos : null;
}

/** Enlace a WhatsApp con texto opcional. `null` sin número utilizable. */
export function enlaceWhatsapp(numero?: string, texto?: string): string | null {
  const destino = normalizarNumeroWhatsapp(numero);
  if (!destino) return null;
  const base = `https://wa.me/${destino}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

/** `0001` → `#0001`. El numeral se agrega al escribir, no se guarda. */
export function numeroVisible(orderNumber: string): string {
  return orderNumber.startsWith("#") ? orderNumber : `#${orderNumber}`;
}

/* ---------------------------------------------------------------------------
 * Mensajes del CLIENTE hacia el local
 * ------------------------------------------------------------------------ */

/** Pedir un producto suelto desde la carta (demo sin ecommerce). */
export function enlacePedirProducto(
  numero: string | undefined,
  nombreProducto: string
): string | null {
  return enlaceWhatsapp(numero, `Hola, quiero pedir: ${nombreProducto}.`);
}

/** Consulta del cliente por un pedido ya hecho. */
export function enlaceConsultarPedido(
  numero: string | undefined,
  orderNumber: string
): string | null {
  return enlaceWhatsapp(
    numero,
    `Hola, quiero consultar por mi pedido ${numeroVisible(orderNumber)}.`
  );
}

/* ---------------------------------------------------------------------------
 * Mensajes del LOCAL hacia el cliente
 *
 * Los escribe el operador desde el panel: se abre WhatsApp con el texto puesto
 * y la persona decide si lo manda, lo edita o lo descarta.
 * ------------------------------------------------------------------------ */

export type MensajeDelLocal =
  | { tipo: "aceptado"; orderNumber: string; minutos: number }
  | { tipo: "listo_retiro"; orderNumber: string }
  | { tipo: "en_reparto"; orderNumber: string }
  | { tipo: "rechazado"; orderNumber: string }
  | { tipo: "consulta"; orderNumber: string };

export function textoDelLocal(mensaje: MensajeDelLocal): string {
  const n = numeroVisible(mensaje.orderNumber);
  switch (mensaje.tipo) {
    case "aceptado":
      return `Hola, aceptamos tu pedido ${n}. El tiempo estimado es de ${mensaje.minutos} minutos.`;
    case "listo_retiro":
      return `Hola, tu pedido ${n} ya está listo para retirar.`;
    case "en_reparto":
      return `Hola, tu pedido ${n} salió para entrega.`;
    case "rechazado":
      return `Hola, no pudimos aceptar tu pedido ${n}. Disculpá las molestias.`;
    case "consulta":
      return `Hola, te escribimos por tu pedido ${n}.`;
  }
}

/** Enlace listo para que el operador toque. `null` sin teléfono utilizable. */
export function enlaceDelLocal(
  telefonoCliente: string | undefined,
  mensaje: MensajeDelLocal
): string | null {
  return enlaceWhatsapp(telefonoCliente, textoDelLocal(mensaje));
}
