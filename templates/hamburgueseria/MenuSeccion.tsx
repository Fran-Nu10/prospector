"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import type {
  ProductoVista,
  SeccionVista,
} from "../../web/lib/ecommerce/vistas";
import { hrefPedirProducto } from "./menu";
import { DURACION_EXPANSION, EASE_BLOQUE } from "./animacion";
import { textoMotivo } from "./ecommerce/copy";
import { useTienda } from "./ecommerce/TiendaProvider";
import { numeral, tamanoNombreProducto } from "./tipografia";

/*
 * MENÚ — vitrina editorial: UN producto por vez.
 *
 * DE DÓNDE VIENE. Primero fue un acordeón: cinco personas lo probaron en el
 * teléfono y ninguna descubrió que había más fotos. Después fue un carrusel de
 * cards —dos productos lado a lado en desktop— y el problema pasó a ser otro:
 * dos fotos cuadradas compitiendo se leen como catálogo, no como vitrina, y
 * ningún producto manda.
 *
 * Ahora hay UN protagonista en todos los anchos, montado como un objeto dentro
 * de una vitrina: el nombre gigante atrás, la burger recortada flotando encima
 * y la información apoyada en los mismos ejes. Cero cards, cero cajas, cero
 * sombras: lo único que separa información son hairlines.
 *
 * CÓMO SE NAVEGA. Tres caminos al mismo estado, nunca dos fuentes de verdad:
 *   · swipe    — scroll horizontal NATIVO con CSS scroll-snap, sin arrastre
 *                sintético, sin secuestrar el scroll vertical de la página;
 *   · flechas  — `scrollTo` sobre la misma pista;
 *   · selector — la lista de nombres de abajo, `scrollTo` sobre la misma pista.
 *
 * El producto activo NO se guarda al tocar un botón: se LEE de la posición real
 * de la pista. Así el swipe, las flechas y el selector no pueden desincronizarse
 * nunca, porque los tres mueven lo mismo y todos leen de lo mismo.
 *
 * EL MOVIMIENTO SALE DE LA POSICIÓN, NO DE UN TIMER. Cada slide deriva su
 * profundidad del progreso horizontal real de la pista: entra desde abajo con
 * una pizca de rotación y sale hacia arriba. No hay autoplay, no hay
 * `setInterval`, y no hay `setState` por frame — el índice solo se guarda
 * cuando efectivamente cambia, para pintar el estado activo y deshabilitar las
 * flechas en los extremos.
 *
 * ASSETS. `stageImage` es el recorte con alfa: la burger flota. Mientras un
 * producto no lo tenga, se muestra su foto cuadrada de siempre — sin fingir
 * transparencia por CSS ni disimular que es un asset viejo.
 */

/* ---------------------------------------------------------------------------
 * Configuración recalibrable
 * ------------------------------------------------------------------------ */

/** Entrada de la vitrina heredando la inercia del hero. Fracción de progreso. */
export const HANDOFF = {
  producto: [0, 0.44],
  nombre: [0.12, 0.42],
  tag: [0.34, 0.5],
  descripcion: [0.4, 0.58],
  precio: [0.46, 0.64],
  controles: [0.54, 0.72],
} as const;

/** Estado inicial del producto al entrar desde el hero. */
export const ENTRADA_PRODUCTO = {
  y: ["18svh", "0svh"],
  scale: [0.86, 1],
  rotateX: [7, 0],
  opacity: [0.7, 1],
} as const;

/** Cambio de producto: entrante → activo → saliente. */
export const CAMBIO = {
  y: [50, 0, -40],
  rotateY: [8, 0, -7],
  scale: [0.9, 1, 0.94],
  opacity: [0, 1, 0],
} as const;

/**
 * Las dos variantes del mismo escenario.
 *
 * `primary` es la experiencia: hamburguesas, tipo enorme, producto grande y el
 * movimiento que hereda del hero. `compact` es la misma máquina con menos
 * volumen —acompañamientos no puede leerse como un segundo hero— y sin
 * ingredientes, que ahí no aportan.
 *
 * Las clases van literales y completas: Tailwind escanea el código fuente, así
 * que una clase armada por concatenación no existiría en el CSS final.
 */
export const VARIANTE = {
  primary: {
    /* Alto del escenario. Es la MEDIDA MADRE: el tamaño del producto, el del
       nombre y el piso del nombre se calculan como fracción de este alto, así
       la composición es la misma en cualquier pantalla. Va como variable CSS
       porque el tamaño del nombre tiene que poder leerla. */
    altoM: "clamp(300px,42svh,360px)",
    altoD: "clamp(400px,52svh,540px)",
    escenario: "h-[var(--esc-m)] lg:h-[var(--esc-d)]",
    /* El producto se mide por ALTO, no por ancho: la caja es cuadrada, y
       atarla al alto del escenario deja fija la relación entre la burger y el
       nombre en cualquier viewport. Medido por ancho, la relación se movía en
       cada breakpoint y el solapamiento se perdía. */
    media: "h-[92%] max-h-[86vw] lg:h-[112%] lg:max-h-[46vw]",
    /* EJE ÚNICO: el producto va centrado en el escenario, en todos los anchos
       y para todos los productos. El nombre queda detrás, alineado a la
       izquierda como el resto de la información, y la burger le cruza la
       franja central: eso es lo que da profundidad. Antes el producto se
       apoyaba en el borde izquierdo y cada slide parecía una composición
       distinta según cuánto ocupara la foto. */
    alineacionMedia: "justify-center",
    /* Foto cuadrada de fallback: NO puede pasar por delante del nombre —es
       opaca y lo borraría—, así que se achica hasta quedar POR DEBAJO de la
       base del nombre (52.5% / 55%) y comparte el mismo eje y la misma línea
       de apoyo que los recortes. */
    mediaFallback: "h-[50%] lg:h-[53%]",
    /* Piso del nombre, medido desde el piso del escenario. El nombre crece
       hacia ARRIBA desde acá: un nombre de dos líneas no empuja su base, así
       que la burger le tapa siempre la misma franja.

       CUÁNTO BAJA. La burger apoya en la hairline y su borde superior llega
       —con los assets normalizados— entre el 60% y el 65% del escenario. El
       pie del nombre se pone por debajo de esa línea a propósito: es lo que
       hace que el producto le cruce la franja baja de las letras y aparezca
       la profundidad. Bajarlo más lo volvería ilegible; subirlo lo despega y
       el nombre deja de estar "detrás" de nada. */
    baseNombre: { m: "43%", d: "45%" },
    nombreMobile: { piso: 64, alto: "var(--esc-m)", factor: 0.242, techo: 104 },
    nombreDesktop: { piso: 96, alto: "var(--esc-d)", factor: 0.369, techo: 190 },
    cambio: CAMBIO,
    conIngredientes: true,
  },
  compact: {
    altoM: "clamp(230px,32svh,280px)",
    altoD: "clamp(310px,44svh,455px)",
    escenario: "h-[var(--esc-m)] lg:h-[var(--esc-d)]",
    media: "h-[103%] max-h-[72vw] lg:h-[124%] lg:max-h-[36vw]",
    alineacionMedia: "justify-center",
    mediaFallback: "h-[60%] lg:h-[67%]",
    baseNombre: { m: "63%", d: "70%" },
    nombreMobile: { piso: 40, alto: "var(--esc-m)", factor: 0.188, techo: 68 },
    nombreDesktop: { piso: 56, alto: "var(--esc-d)", factor: 0.28, techo: 120 },
    cambio: {
      y: [30, 0, -24],
      rotateY: [4, 0, -4],
      scale: [0.94, 1, 0.97],
      opacity: [0, 1, 0],
    },
    conIngredientes: false,
  },
} as const;

export type Variante = keyof typeof VARIANTE;

/** Rango neutro: el motion value queda declarado pero no se mueve. */
const QUIETO: [number, number] = [0, 1];

const TAG_LABELS: Record<NonNullable<ProductoVista["badge"]>, string> = {
  destacado: "La firma",
  nuevo: "Nuevo",
  vegano: "Vegano",
  sin_tacc: "Sin TACC",
};

const useLayoutEffectSeguro =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

type Producto = ProductoVista;

/* ---------------------------------------------------------------------------
 * ProductoMedia — lo único que sabe cómo se ve un producto.
 * ------------------------------------------------------------------------ */

function ProductoMedia({
  item,
  activo,
}: {
  item: Producto;
  /** Solo el visible pide prioridad de carga; el resto va perezoso. */
  activo: boolean;
}) {
  const src = item.stageImageUrl ?? item.imageUrl;
  if (!src) return null;
  const flotante = Boolean(item.stageImageUrl);

  return (
    <div className="relative h-full w-full">
      <Image
        src={src}
        alt={item.name}
        fill
        /* Dimensiones explícitas por CSS (el contenedor manda) + `fill`: la
           caja existe antes de que baje la imagen, así que no hay salto. */
        sizes="(min-width: 1024px) 52vw, 88vw"
        priority={activo && flotante}
        loading={activo && flotante ? undefined : "lazy"}
        className="object-contain"
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * IngredientesPanel
 *
 * Una foto armada no tiene capas: no se puede abrir de verdad. Así que el
 * panel no finge un despiece —nada de líneas apuntando a un pan que no está
 * recortado—, es una lista editorial de tipografía mono.
 *
 * DÓNDE SE APOYA. Debajo del escenario, en el flujo, en TODOS los anchos.
 * Antes en desktop ocupaba la franja derecha, flotando sobre el escenario: eso
 * funcionaba mientras la burger se apoyaba a la izquierda. Con el producto
 * centrado —que es lo que hace que todos los slides se lean igual— esa franja
 * dejó de estar libre, y una lista de ingredientes pisando el borde de la
 * hamburguesa se ve peor que una lista debajo. En desktop va a dos columnas
 * para no estirar la página.
 * ------------------------------------------------------------------------ */

function IngredientesPanel({
  id,
  ingredientes,
  animado,
}: {
  id: string;
  ingredientes: string[];
  animado: boolean;
}) {
  return (
    <motion.ul
      id={id}
      role="list"
      className="pointer-events-none z-[3] mt-16 flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:gap-x-32"
      initial={animado ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={animado ? { opacity: 0, y: 12 } : undefined}
      transition={
        animado
          ? { duration: DURACION_EXPANSION, ease: EASE_BLOQUE }
          : { duration: 0 }
      }
    >
      {ingredientes.map((ingrediente, i) => (
        <motion.li
          key={ingrediente}
          className="flex items-center gap-12 border-t border-negro pt-8 font-mono text-[11px] uppercase tracking-[0.18em] text-rescoldo lg:text-[12px]"
          initial={animado ? { opacity: 0, x: -8 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={
            animado
              ? {
                  duration: DURACION_EXPANSION,
                  ease: EASE_BLOQUE,
                  delay: i * 0.05,
                }
              : { duration: 0 }
          }
        >
          <span className="text-queso">{numeral(i + 1)}</span>
          {ingrediente}
        </motion.li>
      ))}
    </motion.ul>
  );
}

/* ---------------------------------------------------------------------------
 * ProductoSlide — el objeto dentro de la vitrina.
 * ------------------------------------------------------------------------ */

function ProductoSlide({
  item,
  indice,
  total,
  activo,
  abierto,
  onAlternar,
  whatsapp,
  animado,
  progresoPista,
  entrada,
  variante,
}: {
  item: Producto;
  indice: number;
  total: number;
  activo: boolean;
  abierto: boolean;
  onAlternar: () => void;
  whatsapp?: string;
  animado: boolean;
  /** Progreso horizontal real de la pista, 0→1. */
  progresoPista: MotionValue<number>;
  /** Progreso de la entrada desde el hero; solo lo usa el primer slide. */
  entrada?: MotionValue<number>;
  variante: Variante;
}) {
  const cfg = VARIANTE[variante];
  const tienda = useTienda();
  const idPanel = useId();
  const href = hrefPedirProducto(whatsapp, item.name);
  /* Los ingredientes son de la variante principal: en acompañamientos, una
   * descripción de una línea no se despliega en nada. */
  const ingredientes = cfg.conIngredientes ? (item.ingredients ?? []) : [];
  const etiqueta = item.badge ? TAG_LABELS[item.badge] : null;
  const tieneMedia = Boolean(item.stageImageUrl ?? item.imageUrl);
  /* Solo el recorte con alfa puede pasar POR DELANTE del nombre. La foto
   * cuadrada de fallback es opaca: si se cruzara, borraría la palabra. */
  const flotante = Boolean(item.stageImageUrl);

  /* --- Profundidad derivada de la posición horizontal ---
   * El centro de este slide cae en `indice / (total - 1)` del recorrido de la
   * pista. Antes de eso está entrando (viene de la derecha); después, saliendo. */
  const paso = total > 1 ? 1 / (total - 1) : 1;
  const centro = indice * paso;
  const mueve = animado && total > 1;
  /* Los extremos no llevan los tres puntos: el primero no puede estar
   * "entrando" (no hay recorrido antes de 0) y el último no puede estar
   * "saliendo". Un keyframe fuera de [0,1] hace que Motion falle al construir
   * la animación ("Offsets must be monotonically non-decreasing"). */
  const primero = indice === 0;
  const ultimo = indice === total - 1;
  const ventana = mueve
    ? primero
      ? [centro, centro + paso]
      : ultimo
        ? [centro - paso, centro]
        : [centro - paso, centro, centro + paso]
    : [...QUIETO];
  const tri = <T,>(valores: readonly [T, T, T], quieto: readonly [T, T]) => {
    if (!mueve) return [...quieto];
    if (primero) return [valores[1], valores[2]];
    if (ultimo) return [valores[0], valores[1]];
    return [...valores];
  };

  const yCambio = useTransform(progresoPista, ventana, tri(cfg.cambio.y, [0, 0]));
  const rotateY = useTransform(
    progresoPista,
    ventana,
    tri(cfg.cambio.rotateY, [0, 0])
  );
  const escalaCambio = useTransform(
    progresoPista,
    ventana,
    tri(cfg.cambio.scale, [1, 1])
  );
  const opacidadCambio = useTransform(
    progresoPista,
    ventana,
    tri(cfg.cambio.opacity, [1, 1])
  );

  /* --- Entrada desde el hero (solo el primero) --- */
  const quieto = useMotionValue(1);
  const conEntrada = Boolean(entrada) && animado;
  const reloj = entrada ?? quieto;
  const r = (rango: readonly number[]) => (conEntrada ? [...rango] : [...QUIETO]);
  const par = <T,>(valores: readonly [T, T], neutro: readonly [T, T]) =>
    conEntrada ? [...valores] : [...neutro];

  const opacidadNombre = useTransform(
    reloj,
    r(HANDOFF.nombre),
    par([0, 1], [1, 1])
  );
  const yNombre = useTransform(reloj, r(HANDOFF.nombre), par([48, 0], [0, 0]));
  const opacidadTag = useTransform(reloj, r(HANDOFF.tag), par([0, 1], [1, 1]));
  const opacidadDesc = useTransform(
    reloj,
    r(HANDOFF.descripcion),
    par([0, 1], [1, 1])
  );
  const yDesc = useTransform(
    reloj,
    r(HANDOFF.descripcion),
    par([16, 0], [0, 0])
  );
  const opacidadPrecio = useTransform(
    reloj,
    r(HANDOFF.precio),
    par([0, 1], [1, 1])
  );
  const yPrecio = useTransform(reloj, r(HANDOFF.precio), par([18, 0], [0, 0]));

  return (
    <li
      /* Un slide = una pantalla. Se anuncia como elemento de una colección:
         el lector de pantalla dice "3 de 5" sin depender del contador. */
      aria-posinset={indice + 1}
      aria-setsize={total}
      aria-current={activo ? "true" : undefined}
      /* `overflow-x-auto` en la pista obliga a `overflow-y: auto`: todo lo que
         sobresalga por arriba se recorta. Sin este aire, la tilde de "CLÁSICA"
         queda cortada por el borde del scroller. */
      className="w-full shrink-0 snap-center pt-12"
    >
      <motion.div
        className="relative flex flex-col"
        style={{
          /* La MEDIDA MADRE del slide: el escenario, el producto, el nombre y
             el panel de ingredientes se calculan todos a partir de ella. */
          ["--esc-m" as string]: cfg.altoM,
          ["--esc-d" as string]: cfg.altoD,
          y: yCambio,
          rotateY,
          scale: escalaCambio,
          opacity: opacidadCambio,
        }}
      >
        {/* El tag mantiene jerarquía secundaria: arriba, chico, en ámbar. */}
        {etiqueta && (
          <motion.span
            className="relative z-[3] font-mono text-caption uppercase tracking-[0.22em] text-queso"
            style={{ opacity: opacidadTag }}
          >
            {etiqueta}
          </motion.span>
        )}

        {/* --- ESCENARIO: nombre (z-0) · hairline (z-1) · producto (z-2) ---
            El nombre es el heading REAL del producto, no un adorno: hay una
            sola versión visible y vive acá. Se apoya en un piso propio dentro
            del escenario y la burger sube desde la hairline hasta cruzarle el
            pie: la superposición da profundidad sin comerse la palabra.

            Sin ninguna imagen no hay escenario que armar: el nombre pasa a ser
            un bloque normal y el alto fijo desaparece, porque un hueco de
            350px vacío no es composición, es un error. */}
        <div
          data-escena={variante}
          className={`relative mt-8 ${tieneMedia ? cfg.escenario : ""}`}
        >
          <motion.h4
            /* UNA sola posición del nombre. Antes el ancla dependía de si el
               producto tenía recorte con alfa o foto cuadrada, y el título
               saltaba de arriba abajo al pasar de un slide a otro. Ahora
               siempre apoya en la misma base dentro del escenario —crece hacia
               ARRIBA, así que un nombre de dos líneas no mueve su pie— y lo
               que cambia es el tamaño de la foto, no el lugar de la palabra. */
            className={`z-0 font-display uppercase leading-heading tracking-display text-hueso text-[length:var(--nombre-m)] lg:text-[length:var(--nombre-d)] ${
              tieneMedia
                ? "absolute inset-x-0 bottom-[var(--base-m)] text-center lg:bottom-[var(--base-d)]"
                : "relative pb-16"
            }`}
            style={{
              /* Dos tamaños en variables CSS: el `clamp` depende de cuántos
                 caracteres tiene el nombre, así que no puede salir de una
                 clase estática, y el cambio por breakpoint tampoco puede salir
                 de un estilo inline. Las variables resuelven las dos cosas. */
              ["--nombre-m" as string]: tamanoNombreProducto(
                item.name,
                cfg.nombreMobile
              ),
              ["--nombre-d" as string]: tamanoNombreProducto(
                item.name,
                cfg.nombreDesktop
              ),
              ["--base-m" as string]: cfg.baseNombre.m,
              ["--base-d" as string]: cfg.baseNombre.d,
              opacity: opacidadNombre,
              y: yNombre,
            }}
          >
            {item.name}
          </motion.h4>

          {/* Hairline de apoyo: le da piso óptico al objeto sin dibujar una
              sombra ni un plano falso. */}
          <motion.span
            aria-hidden
            className="absolute inset-x-0 bottom-0 z-[1] h-px bg-negro"
            style={{ opacity: opacidadNombre }}
          />

          {tieneMedia && (
            /* El lienzo de 1600×1600 apoya la base visible del producto en el
               87.5% de su alto (ver el script de normalización). Bajando la
               caja un 12.5% de SU PROPIO alto —no del escenario—, la base real
               del producto cae exactamente sobre la hairline sea cual sea el
               tamaño, y todas las burgers apoyan en la misma línea sin importar
               si son chatas o torres. Lo que sobra arriba es transparente:
               puede pasar por delante del nombre sin taparlo.

               La foto cuadrada de fallback no puede hacer eso —es opaca—, así
               que va más chica, apoyada al pie y sin cruzarse con el nombre. */
            <div
              className={`pointer-events-none absolute inset-0 z-[2] flex items-end ${cfg.alineacionMedia}`}
            >
              <div
                /* Marca para la verificación: dice si lo que se está midiendo
                   es el recorte con alfa o la foto opaca de fallback. */
                data-media={flotante ? "recorte" : "foto"}
                className={`relative aspect-square ${
                  flotante
                    ? `translate-y-[12.5%] ${cfg.media}`
                    : cfg.mediaFallback
                }`}
              >
                <ProductoMedia item={item} activo={activo} />
              </div>
            </div>
          )}
        </div>

        <AnimatePresence initial={false}>
          {abierto && ingredientes.length > 0 && (
            <IngredientesPanel
              key="ingredientes"
              id={idPanel}
              ingredientes={ingredientes}
              animado={animado}
            />
          )}
        </AnimatePresence>

        {/* --- Información: descripción, precio y acción --- */}
        <div className="relative z-[3] mt-16 flex flex-col gap-16 lg:mt-24">
          {item.description && (
            <motion.p
              className="max-w-[46ch] text-body-sm leading-body text-rescoldo lg:text-body"
              style={{ opacity: opacidadDesc, y: yDesc }}
            >
              {item.description}
            </motion.p>
          )}

          {/* Precio y acción son una sola unidad: misma fila, misma hairline. */}
          <motion.div
            className="flex flex-col gap-16"
            style={{ opacity: opacidadPrecio, y: yPrecio }}
          >
            {/* Precio y acción son UNA unidad: misma fila, siempre juntos, y
                nunca los separa un salto de línea. */}
            <div className="flex items-center justify-between gap-16 border-t border-negro pt-16">
              {item.priceLabel && (
                <span className="font-mono text-subheading font-bold text-hueso">
                  {item.priceLabel}
                </span>
              )}
              {/* Con ecommerce detrás, la acción del producto es AGREGAR y abre
                  su hoja; sin ecommerce, la carta sigue pidiendo por WhatsApp
                  exactamente como antes. Un producto que no se puede vender
                  muestra el motivo en el botón y no se deja tocar. */}
              {tienda?.interactivo ? (
                <button
                  type="button"
                  onClick={() => tienda.abrirProducto(item)}
                  disabled={!item.comprable}
                  aria-label={`Agregar ${item.name} al pedido`}
                  className="ml-auto inline-flex min-h-[48px] items-center rounded-button bg-brasa px-32 text-body font-bold text-hueso disabled:bg-carbon disabled:text-rescoldo"
                >
                  {item.comprable ? "Agregar" : (textoMotivo(item.motivo) ?? "No disponible")}
                </button>
              ) : (
                href && (
                  <a
                    href={href}
                    aria-label={`Pedir ${item.name} por WhatsApp`}
                    className="ml-auto inline-flex min-h-[48px] items-center rounded-button bg-brasa px-32 text-body font-bold text-hueso"
                  >
                    Pedir
                  </a>
                )
              )}
            </div>

            {ingredientes.length > 0 && (
              <button
                type="button"
                onClick={onAlternar}
                aria-expanded={abierto}
                aria-controls={idPanel}
                className="inline-flex min-h-[44px] items-center self-start font-mono text-body-sm uppercase tracking-[0.18em] text-rescoldo underline underline-offset-4 hover:text-hueso"
              >
                {abierto ? "Cerrar ×" : "+ Ver ingredientes"}
              </button>
            )}
          </motion.div>
        </div>
      </motion.div>
    </li>
  );
}

/* ---------------------------------------------------------------------------
 * Controles y selector
 * ------------------------------------------------------------------------ */

function BotonFlecha({
  direccion,
  nombreDestino,
  onClick,
  deshabilitado,
}: {
  direccion: "anterior" | "siguiente";
  /** El label dice a qué producto lleva, no solo hacia dónde. */
  nombreDestino?: string;
  onClick: () => void;
  deshabilitado: boolean;
}) {
  const siguiente = direccion === "siguiente";
  const etiqueta = nombreDestino
    ? `Ver ${nombreDestino}`
    : siguiente
      ? "Producto siguiente"
      : "Producto anterior";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={etiqueta}
      /* Medidas literales: la escala del tema no define 48, y `h-48` caería en
         la escala por defecto de Tailwind (192px). */
      className="flex h-[48px] w-[48px] shrink-0 items-center justify-center border border-negro text-hueso disabled:text-rescoldo disabled:opacity-30"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-24 w-24"
        style={siguiente ? undefined : { transform: "scaleX(-1)" }}
      >
        <path d="M4 12h15M13 6l6 6-6 6" />
      </svg>
    </button>
  );
}

function SelectorProductos({
  items,
  indice,
  onIr,
}: {
  items: Producto[];
  indice: number;
  onIr: (i: number) => void;
}) {
  return (
    /* Desborda en horizontal dentro de SU caja, no de la página: el
       `overflow-x-auto` propio es lo que evita que empuje el ancho del
       documento en pantallas angostas. */
    <ul
      role="list"
      className="-mx-20 flex gap-24 overflow-x-auto overscroll-x-contain px-20 [-ms-overflow-style:none] [scrollbar-width:none] md:-mx-40 md:px-40 lg:mx-0 lg:flex-wrap lg:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item, i) => {
        const activo = i === indice;
        return (
          <li key={item.name} className="shrink-0">
            <button
              type="button"
              data-selector-producto=""
              onClick={() => onIr(i)}
              aria-current={activo ? "true" : undefined}
              className={`inline-flex min-h-[44px] items-center gap-8 whitespace-nowrap font-mono text-body-sm uppercase tracking-[0.18em] ${
                activo ? "text-brasa" : "text-rescoldo hover:text-hueso"
              }`}
            >
              <span aria-hidden className={activo ? "text-brasa" : "text-hueso"}>
                {numeral(i + 1)}
              </span>
              {item.name}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------------------------
 * Vitrina — el mismo motor para las dos categorías.
 *
 * `primary` (hamburguesas) y `compact` (acompañamientos) comparten TODO: la
 * pista con scroll nativo, el índice leído de la posición, las flechas, el
 * contador, el selector y la coreografía. Lo único que cambia es el volumen:
 * alto del escenario, tamaño del producto, escala del nombre, intensidad del
 * movimiento y si hay ingredientes. Una sola implementación, dos calibraciones.
 * ------------------------------------------------------------------------ */

function Vitrina({
  section,
  whatsapp,
  animado,
  entrada,
  variante,
}: {
  section: SeccionVista;
  whatsapp?: string;
  animado: boolean;
  /** Solo la vitrina principal hereda la entrada del hero. */
  entrada?: MotionValue<number>;
  variante: Variante;
}) {
  const cfg = VARIANTE[variante];
  const principal = variante === "primary";
  const productos = section.items;
  const total = productos.length;
  const pistaRef = useRef<HTMLUListElement>(null);
  const [indice, setIndice] = useState(0);
  const [abierto, setAbierto] = useState<number | null>(null);

  /* Progreso horizontal REAL de la pista: de acá sale toda la profundidad de
   * los slides, sin un solo `setState` por frame. */
  const { scrollXProgress } = useScroll({ container: pistaRef, axis: "x" });

  /** Paso entre slides, medido del DOM (no asumido). */
  const paso = useCallback(() => {
    const pista = pistaRef.current;
    if (!pista) return 1;
    const slides = pista.children;
    if (slides.length > 1) {
      const a = (slides[0] as HTMLElement).offsetLeft;
      const b = (slides[1] as HTMLElement).offsetLeft;
      if (b > a) return b - a;
    }
    return (slides[0] as HTMLElement)?.offsetWidth || 1;
  }, []);

  /* El índice se LEE de la posición; nunca se guarda al tocar un botón. Así no
   * hay dos fuentes de verdad y el swipe no puede desincronizar el selector. */
  const leerIndice = useCallback(() => {
    const pista = pistaRef.current;
    if (!pista) return;
    const i = Math.max(
      0,
      Math.min(total - 1, Math.round(pista.scrollLeft / paso()))
    );
    setIndice((prev) => (prev === i ? prev : i));
  }, [paso, total]);

  useEffect(() => {
    const pista = pistaRef.current;
    if (!pista) return;
    let raf = 0;
    const alScrollear = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(leerIndice);
    };
    leerIndice();
    /* Pasivo: no bloquea el gesto de scroll del sistema. */
    pista.addEventListener("scroll", alScrollear, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      pista.removeEventListener("scroll", alScrollear);
    };
  }, [leerIndice]);

  /* Al cambiar de ANCHO la pista puede quedar entre dos slides: se realinea con
   * el producto que el usuario estaba mirando.
   *
   * OJO con dos trampas, las dos medidas acá: `ResizeObserver` dispara una vez
   * al observar, y si el efecto dependiera del índice se re-suscribiría en cada
   * cambio de producto — ese disparo inicial cancelaba el scroll suave en vuelo
   * y el carrusel se quedaba a mitad de camino (saltar dos productos desde el
   * selector terminaba en el primero). Por eso el índice va por ref y solo se
   * realinea cuando el ancho cambió DE VERDAD. */
  const indiceRef = useRef(indice);
  useEffect(() => {
    indiceRef.current = indice;
  }, [indice]);

  useEffect(() => {
    const pista = pistaRef.current;
    if (!pista) return;
    let anchoPrevio = pista.clientWidth;
    const observador = new ResizeObserver(() => {
      if (pista.clientWidth === anchoPrevio) return;
      anchoPrevio = pista.clientWidth;
      pista.scrollTo({ left: paso() * indiceRef.current, behavior: "auto" });
      leerIndice();
    });
    observador.observe(pista);
    return () => observador.disconnect();
  }, [leerIndice, paso]);

  /* Cambiar de producto cierra los ingredientes: nadie quiere llegar al
   * siguiente con el anterior desplegado. */
  useEffect(() => setAbierto(null), [indice]);

  const irA = useCallback(
    (destino: number) => {
      const pista = pistaRef.current;
      if (!pista) return;
      const i = Math.max(0, Math.min(total - 1, destino));
      pista.scrollTo({
        left: paso() * i,
        behavior: animado ? "smooth" : "auto",
      });
    },
    [animado, paso, total]
  );

  /* Los controles de la vitrina principal entran con el handoff del hero; los
   * de la compacta ya están en su sitio (la sección no vuelve a presentarse). */
  const quietoControles = useMotionValue(1);
  const relojControles = entrada ?? quietoControles;
  const conEntradaControles = Boolean(entrada) && animado;
  const opacidadControles = useTransform(
    relojControles,
    conEntradaControles ? [...HANDOFF.controles] : [...QUIETO],
    conEntradaControles ? [0, 1] : [1, 1]
  );
  const yControles = useTransform(
    relojControles,
    conEntradaControles ? [...HANDOFF.controles] : [...QUIETO],
    conEntradaControles ? [14, 0] : [0, 0]
  );

  return (
    <div
      role="group"
      aria-roledescription="carrusel"
      aria-label={`${section.title} — ${total} productos`}
      /* Escape cierra los ingredientes sin listeners globales: el foco vive
         dentro de este bloque cuando el panel está abierto. */
      onKeyDown={(e) => {
        if (e.key === "Escape" && abierto !== null) setAbierto(null);
      }}
    >
      <div className="flex items-baseline justify-between gap-24">
        <h3
          className={`font-display uppercase leading-heading tracking-display text-brasa ${
            principal
              ? "text-[clamp(24px,5vw,44px)]"
              : "text-[clamp(20px,3.5vw,32px)]"
          }`}
        >
          {section.title}
        </h3>
        <span
          aria-live="polite"
          className="shrink-0 font-mono text-body-sm tracking-[0.18em] text-hueso"
        >
          {numeral(indice + 1)} / {numeral(total)}
        </span>
      </div>

      {/* La perspectiva vive en un contenedor estático: animarla obligaría a
          recalcular el contexto 3D en cada frame. */}
      <div
        className="mt-24"
        style={animado ? { perspective: "1400px" } : undefined}
      >
        <ul
          ref={pistaRef}
          role="list"
          /* Un slide por pantalla en TODOS los anchos: la hipótesis de dos
             productos visibles quedó descartada. La barra se oculta pero el
             contenedor sigue siendo scrolleable por teclado y por AT. */
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {productos.map((item, i) => (
            <ProductoSlide
              key={item.name}
              item={item}
              indice={i}
              total={total}
              activo={i === indice}
              abierto={abierto === i}
              onAlternar={() => setAbierto((prev) => (prev === i ? null : i))}
              whatsapp={whatsapp}
              animado={animado}
              progresoPista={scrollXProgress}
              entrada={i === 0 ? entrada : undefined}
              variante={variante}
            />
          ))}
        </ul>
      </div>

      <motion.div
        className="mt-24 flex flex-col gap-24"
        style={{ opacity: opacidadControles, y: yControles }}
      >
        <div className="flex items-center gap-16">
          <BotonFlecha
            direccion="anterior"
            nombreDestino={productos[indice - 1]?.name}
            onClick={() => irA(indice - 1)}
            deshabilitado={indice <= 0}
          />
          <BotonFlecha
            direccion="siguiente"
            nombreDestino={productos[indice + 1]?.name}
            onClick={() => irA(indice + 1)}
            deshabilitado={indice >= total - 1}
          />
          <span aria-hidden className="ml-8 h-px flex-1 bg-negro" />
        </div>

        <SelectorProductos items={productos} indice={indice} onIr={irA} />
      </motion.div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Sección
 * ------------------------------------------------------------------------ */

export default function MenuSeccion({
  numero,
  whatsapp,
}: {
  numero: number;
  /** Número del prospecto. Sin él no se renderiza ningún CTA de pedido. */
  whatsapp?: string;
}) {
  /* El menú NO lee el JSON: lee el catálogo de la tienda, que en el servidor ya
     viene resuelto y en el cliente se refresca solo. Una sola fuente. */
  const tienda = useTienda();
  const secciones = tienda?.secciones ?? [];
  const reducirMovimiento = useReducedMotion();
  const [sinMovimiento, setSinMovimiento] = useState(false);
  useLayoutEffectSeguro(() => {
    if (reducirMovimiento) setSinMovimiento(true);
  }, [reducirMovimiento]);
  const animado = !sinMovimiento;

  /* Reloj de la entrada: el viewport que el hero tarda en soltar su sticky.
   * Ese offset no coincide con ningún preset de Motion, así que no hay
   * traspaso a ViewTimeline nativa — lo mueve JS (verificado midiendo). */
  const seccionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: seccionRef,
    offset: ["start end", "start start"],
  });

  const indiceVitrina = secciones.findIndex((s) =>
    s.items.some((i) => i.imageUrl ?? i.stageImageUrl)
  );
  const vitrina = indiceVitrina >= 0 ? secciones[indiceVitrina] : null;
  const resto = secciones.filter((_, i) => i !== indiceVitrina);

  return (
    <section
      ref={seccionRef}
      id="menu"
      /* `scroll-mt` = alto de la nav sticky + aire: al entrar por #menu el
         encabezado tiene que quedar POR DEBAJO de la barra, no tapado. */
      className="scroll-mt-[100px] bg-noche px-20 pb-100 pt-40 md:px-40 md:pb-148 md:pt-56"
    >
      <div className="mx-auto max-w-[1360px]">
        {/* El título de la sección existe una sola vez y da estructura; el peso
            tipográfico visible ahora lo lleva el nombre del producto. */}
        <h2 className="sr-only">El menú</h2>

        <span className="flex items-center gap-16 font-mono text-body-sm uppercase tracking-[0.22em] text-rescoldo">
          {numeral(numero)} — Menú
          <span aria-hidden className="h-px flex-1 bg-negro" />
        </span>

        <div className="mt-24">
          {vitrina && (
            <Vitrina
              section={vitrina}
              whatsapp={whatsapp}
              animado={animado}
              entrada={scrollYProgress}
              variante="primary"
            />
          )}

          {/* Las demás categorías usan el MISMO escenario en versión compacta:
              acompañamientos no puede leerse como un segundo hero, pero
              tampoco merece volver a ser una lista de texto plano. */}
          {resto.map((section) => (
            <div key={section.id} className="mt-64 md:mt-80">
              <Vitrina
                section={section}
                whatsapp={whatsapp}
                animado={animado}
                variante="compact"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
