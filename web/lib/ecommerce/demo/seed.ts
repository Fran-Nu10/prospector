/**
 * SEED DEL MODO DEMO.
 *
 * Traduce el prospecto real —el mismo JSON que ya renderiza la landing— al
 * dominio del ecommerce. No inventa nada: lo que el JSON no dice, queda sin
 * configurar y se nota.
 *
 * Qué SÍ sale del JSON: categorías, productos, nombres, descripciones, precios,
 * fotos, ingredientes, destacados y el número de WhatsApp.
 *
 * Qué NO sale de ningún lado y por eso arranca vacío:
 *   · zonas de delivery — el JSON dice "Envíos en Pocitos y Punta Carretas" en
 *     prosa; convertir esa frase en una tarifa sería inventarle un precio al
 *     negocio. Sin zonas, el delivery arranca APAGADO;
 *   · horarios operativos — `hours` es texto libre pensado para el póster
 *     ("Lun a Jue", "19:00 – 02:00"). Sirve para mostrar, no para decidir si se
 *     puede pedir a las 23:47;
 *   · variantes y extras — el JSON no tiene ninguno. Un "sin cebolla" inventado
 *     es una promesa que el local no dio;
 *   · pedidos — arrancan en `[]`, así los reportes empiezan en cero de verdad.
 */

import type { ClientData, MenuItem } from "../../schema";
import { aSlug, ahoraIso } from "../domain";
import { parsearPrecioLegado } from "../money";
import {
  MONEDA,
  ZONA_HORARIA,
  type Category,
  type Product,
  type ProductBadge,
  type RestaurantOperationalSettings,
} from "../types";
import type { DemoDatabase } from "./database";

/* El prospecto se importa en build: el modo demo vive en el navegador y no
   puede leer el filesystem. Es el mismo archivo que consume la landing. */
import prospecto from "../../../../data/prospects/_ejemplo.json";

/** El JSON no está tipado en disco; el contrato es `ClientData`. */
export const DATOS_PROSPECTO = prospecto as unknown as ClientData;

/**
 * Slug de la instalación. Una instalación = un restaurante, así que esto
 * también es lo que aísla la clave de almacenamiento (ver `database.ts`).
 */
export const SLUG_INSTALACION =
  process.env.NEXT_PUBLIC_RESTAURANT_SLUG || DATOS_PROSPECTO.slug;

const BADGES: ReadonlySet<string> = new Set([
  "destacado",
  "nuevo",
  "vegano",
  "sin_tacc",
]);

/**
 * Avisos de migración: lo que no se pudo traducir se dice, no se disimula.
 *
 * `codigo` existe para que una verificación automática pueda detectarlo sin
 * leer prosa. Al comprador nunca se le muestra: en la vitrina, un producto sin
 * precio legible simplemente no se puede pedir.
 */
export interface AvisoSeed {
  codigo: "INVALID_PRICE";
  producto: string;
  motivo: string;
}

function slugUnico(nombre: string, usados: Set<string>): string {
  const base = aSlug(nombre) || "producto";
  let slug = base;
  let n = 2;
  while (usados.has(slug)) slug = `${base}-${n++}`;
  usados.add(slug);
  return slug;
}

function badgeDe(item: MenuItem): ProductBadge | undefined {
  return item.tag && BADGES.has(item.tag) ? item.tag : undefined;
}

/**
 * Construye la base demo a partir de un `ClientData`. Es una función pura: no
 * toca `localStorage`, no lee el reloj más que para las marcas de creación.
 */
export function construirSeed(
  data: ClientData,
  ahora: Date = new Date()
): { db: DemoDatabase; avisos: AvisoSeed[] } {
  const creado = ahoraIso(ahora);
  const avisos: AvisoSeed[] = [];
  const categories: Category[] = [];
  const products: Product[] = [];
  const slugsProducto = new Set<string>();
  const slugsCategoria = new Set<string>();

  (data.menu ?? []).forEach((seccion, iCat) => {
    const slugCat = slugUnico(seccion.title, slugsCategoria);
    const categoria: Category = {
      id: `cat_${slugCat}`,
      slug: slugCat,
      name: seccion.title,
      position: iCat,
      active: true,
      archived: false,
    };
    categories.push(categoria);

    seccion.items.forEach((item, iProd) => {
      const slug = slugUnico(item.name, slugsProducto);
      const precio = parsearPrecioLegado(item.price);

      /* Un producto sin precio legible NO se puede vender. Se conserva —es del
         negocio, no nuestro— pero entra inactivo y con el aviso a la vista, en
         vez de heredar un precio adivinado. */
      if (precio === null) {
        avisos.push({
          codigo: "INVALID_PRICE",
          producto: item.name,
          motivo: `precio ilegible o ausente (${JSON.stringify(item.price)})`,
        });
      }

      products.push({
        id: `prod_${slug}`,
        categoryId: categoria.id,
        slug,
        name: item.name,
        description: item.description,
        priceCents: precio ?? 0,
        active: precio !== null,
        soldOut: false,
        stockQuantity: null,
        position: iProd,
        badge: badgeDe(item),
        ingredients: item.ingredients,
        imageUrl: item.image,
        stageImageUrl: item.stageImage,
        /* El JSON no trae variantes ni extras: el modelo los soporta y el
           catálogo arranca sin ninguno. */
        optionGroups: [],
        availability: [],
        archived: false,
        createdAt: creado,
        updatedAt: creado,
      });
    });
  });

  const settings: RestaurantOperationalSettings = {
    acceptingOrders: true,
    timezone: ZONA_HORARIA,
    currency: MONEDA,
    /* Vacío = sin horarios operativos cargados. La apertura la decide el
       interruptor manual hasta que el dueño los configure. */
    serviceHours: [],
    pickupEnabled: true,
    /* Sin zonas cargadas no hay delivery posible: apagarlo es el valor seguro. */
    deliveryEnabled: false,
    paymentMethods: { cash: true, mercadopago: false },
    /* 0 = sin configurar. El panel pide los minutos al confirmar cada pedido. */
    defaultPrepMinutes: 0,
    noResponseAlertMinutes: 15,
    whatsappNumber: data.whatsapp,
    updatedAt: creado,
  };

  return {
    db: {
      /* Literal y no una constante importada: `database.ts` ya importa este
         archivo, y cerrar el círculo rompía el bundle en producción. El tipo de
         `DemoDatabase["version"]` es el literal de la base, así que subirla allá
         hace fallar esta línea en compilación en vez de en silencio. */
      version: 4,
      categories,
      products,
      deliveryZones: [],
      settings,
      orders: [],
    },
    avisos,
  };
}

/** El seed de esta instalación. */
export function seedPorDefecto(ahora: Date = new Date()): DemoDatabase {
  const { db, avisos } = construirSeed(DATOS_PROSPECTO, ahora);
  if (avisos.length && typeof console !== "undefined") {
    for (const a of avisos) {
      console.warn(
        `[ecommerce demo] ${a.codigo} · ${a.producto}: ${a.motivo} → producto inactivo`
      );
    }
  }
  return db;
}
