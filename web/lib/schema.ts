/**
 * CONTRATO DE DATOS — el corazón del sistema.
 *
 * Todo el pipeline habla este idioma:
 *   - El scraper produce objetos ClientData (parcialmente completos).
 *   - Las plantillas consumen ClientData y NUNCA hardcodean contenido.
 *   - Claude Code, al crear una plantilla nueva, respeta este contrato.
 *
 * Regla de oro: si un dato del negocio va a variar entre prospectos,
 * VIVE ACÁ, nunca en el JSX de la plantilla.
 */

export type Vertical = "hamburgueseria" | "parrilla" | "cafe" | "generico";

export interface MenuItem {
  name: string;
  description?: string;
  price?: string;        // ej. "$450" — string para respetar formato local
  image?: string;        // ruta relativa o URL
  tag?: "destacado" | "nuevo" | "vegano" | "sin_tacc";
  /**
   * Ingredientes del producto, uno por entrada y con el nombre tal como lo
   * dice el negocio ("Cheddar fundido", no "cheddar").
   *
   * Es contenido OPCIONAL: la plantilla lo muestra como anatomía desplegable
   * y nunca esconde ahí nada esencial —foto, nombre, precio y pedido están
   * siempre a la vista—. Sin este campo, el producto simplemente no ofrece el
   * despliegue. No se deduce partiendo `description`: separar por comas
   * inventaría ingredientes donde hay una frase.
   */
  ingredients?: string[];
}

export interface MenuSection {
  title: string;         // ej. "Hamburguesas", "Entradas"
  items: MenuItem[];
}

/** Dato duro del negocio, para la fila de la sección "La historia". */
export interface Highlight {
  value: string;         // ej. "2021", "100%", "2 AM"
  label: string;         // ej. "Desde", "Carne fresca", "Hasta"
}

/**
 * Reseña de un cliente. OJO: el CLAUDE.md prohíbe inventar reseñas — este
 * campo solo se completa con reseñas REALES (Google, Instagram, o pasadas a
 * mano por el dueño). Las de `_ejemplo.json` son de muestra y no se copian a
 * un prospecto real.
 */
export interface Review {
  author: string;
  text: string;
  rating?: number;       // 1–5
  date?: string;         // ej. "Marzo 2026" — string para respetar formato local
}

/** Paso de la sección "Cómo pedir". */
export interface OrderStep {
  title: string;
  description?: string;
  icon?: "menu" | "whatsapp" | "entrega" | "local";
}

export interface ClientData {
  // --- Identidad (lo saca el scraper de Google Maps) ---
  slug: string;                 // ej. "lapasiva-pocitos" — define el subdominio
  name: string;                 // "La Pasiva Pocitos"
  vertical: Vertical;           // decide qué plantilla se usa
  tagline?: string;             // frase corta bajo el nombre

  // --- Contacto y ubicación ---
  phone?: string;               // teléfono de Maps
  whatsapp?: string;            // número para el botón de pedidos
  address?: string;
  mapsUrl?: string;
  instagram?: string;

  // --- Branding (se completa manual o con IA) ---
  logo?: string;
  /**
   * Imagen de vista previa social: la que muestran WhatsApp, Open Graph y
   * Twitter cuando se comparte el link de la demo.
   *
   * - Relación preferente 1.91:1 — 1200 × 630 px es la medida recomendada.
   * - Puede ser una ruta pública local (`/hamburgueseria/...`, servida desde
   *   `web/public/`) o una URL absoluta.
   * - Se resuelve a absoluta contra `NEXT_PUBLIC_SITE_URL` (ver `lib/site.ts`).
   *
   * NO se infiere sola desde otra ruta del JSON: si el campo falta, la demo
   * se comparte sin imagen. Es preferible una preview sin foto que una con el
   * ícono de imagen rota, que es exactamente lo que delata una demo.
   */
  shareImage?: string;
  hero?: {
    heading: string;
    sub?: string;
    image?: string;             // foto principal o poster del 3D
    model3d?: string;           // .glb comprimido con Draco (opcional)
    videoFallback?: string;     // video para mobile en vez del 3D
  };

  /**
   * Sección "Plancha viva": la ventana de video que se abre a pantalla
   * completa después del menú.
   *
   * Es OPCIONAL y su ausencia hace desaparecer la sección entera — no hay
   * versión degradada con texto genérico. Todo lo que varía entre negocios
   * (titular, claims, videos, poster, rótulo del CTA) vive acá y nunca en el
   * JSX de la plantilla.
   *
   * Los videos se declaran por viewport y se pide UNO SOLO: la plantilla
   * elige según el ancho, nunca descarga los dos. Sin videos cargados, la
   * sección muestra un placeholder explícito de desarrollo.
   */
  planchaViva?: {
    /** Kicker en mono sobre el titular. */
    eyebrow?: string;
    /** Titular editorial de la sección. Obligatorio si la sección existe. */
    headline: string;
    /** Bajada opcional en cuerpo. */
    body?: string;
    /** Hasta tres frases cortas. Deben salir de lo que el negocio ya dice. */
    claims?: string[];
    /** Video ancho (`lg`+). Loop corto, sin audio. */
    desktopVideo?: string;
    /** Video vertical para pantallas angostas. */
    mobileVideo?: string;
    /** Primer cuadro del video ancho; es lo que se ve con reduced motion. */
    desktopPoster?: string;
    /** Primer cuadro del video vertical. */
    mobilePoster?: string;
    /** Texto del CTA. Sin él, la plantilla usa su rótulo por defecto. */
    ctaLabel?: string;
  };

  // --- Contenido ---
  about?: string;
  highlights?: Highlight[];     // datos duros que acompañan a `about`
  menu?: MenuSection[];
  reviews?: Review[];           // SOLO reseñas reales (ver interface Review)
  hours?: { day: string; open: string }[];
  gallery?: string[];
  ordering?: {                  // sección "Cómo pedir"
    steps: OrderStep[];
    note?: string;              // ej. "Envíos en Pocitos y Punta Carretas"
  };

  // --- Metadatos del prospecto (uso interno) ---
  // Excepción: `rating` y `reviewCount` SÍ se renderizan (sección de reseñas).
  // Son dato real de Google que trae el scraper, no contenido inventado.
  _meta?: {
    hasWebsite: boolean;        // false = prospecto caliente
    currentSiteUrl?: string;    // si tiene web vieja, su URL
    screenshot?: string;        // captura del sitio actual
    rating?: number;            // ⬅ renderizable
    reviewCount?: number;       // ⬅ renderizable
    scrapedAt?: string;
    status?: "nuevo" | "demo_lista" | "enviado" | "respondio" | "cerrado";
  };
}
