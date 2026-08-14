"use client";

import Image from "next/image";
import { useEffect, useId, useLayoutEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type {
  MenuItem,
  MenuSection as MenuSectionData,
} from "../../web/lib/schema";
import SeccionTitulo from "./SeccionTitulo";
import { hrefPedirProducto, indiceInicial } from "./menu";
import { useEsAngosto } from "./scroll";
import {
  DESPLAZAMIENTO_FOTO,
  DURACION_EXPANSION,
  DURACION_FILA,
  DURACION_FOTO,
  EASE_BLOQUE,
  OCULTO_FILA,
  VIEWPORT,
  VISIBLE_FILA,
  delayFila,
} from "./animacion";
import { numeral } from "./tipografia";

/*
 * MENÚ — tracklist de la plancha.
 *
 * La carta NO es una grilla de cards. Es una lista numerada, con hairlines por
 * separación y una sola fotografía a la vez: la del producto activo. Esa es
 * toda la novedad de la composición, y no cuesta nada de comprensión — nombre,
 * contenido, precio y cómo pedirlo están siempre a la vista, sin hover, sin
 * abrir nada, sin aprender una interacción.
 *
 * DESKTOP (`lg`+): pantalla partida. Columna izquierda con la foto pegada
 * (sticky) mientras la lista de la derecha pasa por delante; hover o foco
 * sobre una fila cambia la foto con un crossfade corto.
 *
 * MOBILE: la misma lista, plana. El producto activo se muestra expandido con
 * su foto y su descripción; tocar otro cierra el anterior. El CTA chico vive
 * en la fila cerrada: comprar NUNCA depende de expandir primero.
 *
 * UN SOLO ESTADO para las dos variantes (`activo`), y una sola lista en el
 * DOM. Las piezas que solo corresponden a un ancho se ocultan por CSS, así que
 * el lector de pantalla nunca escucha el contenido dos veces (`display:none`
 * no llega al árbol de accesibilidad).
 *
 * SIN fotos inventadas: si un producto no tiene `image`, su lugar lo ocupa un
 * fallback tipográfico con su numeral y su nombre. Si la sección entera no
 * tiene fotos, no se renderiza columna visual: cae a lista compacta.
 */

const TAG_LABELS: Record<NonNullable<MenuItem["tag"]>, string> = {
  destacado: "La firma",
  nuevo: "Nuevo",
  vegano: "Vegano",
  sin_tacc: "Sin TACC",
};

/** Alto de la nav sticky + aire, para que la foto no se pegue a la barra. */
const TOP_FOTO = 101;

/** A partir de acá el CTA largo no entra y se cae a una fórmula neutra. */
const LARGO_NOMBRE_CTA = 16;

const useLayoutEffectSeguro =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Numeral y nombre en grande: lo que ve el producto activo cuando no hay foto. */
function FallbackTipografico({
  item,
  indice,
}: {
  item: MenuItem;
  indice: number;
}) {
  return (
    <div className="flex h-full w-full flex-col justify-between bg-carbon p-32">
      <span className="font-mono text-body-sm tracking-[0.22em] text-rescoldo">
        {numeral(indice + 1)}
      </span>
      <span className="font-display uppercase leading-heading tracking-display text-hueso text-[clamp(40px,4vw,64px)]">
        {item.name}
      </span>
    </div>
  );
}

function Tag({ item }: { item: MenuItem }) {
  if (!item.tag) return null;
  return (
    <span className="font-mono text-caption uppercase tracking-[0.22em] text-queso">
      {TAG_LABELS[item.tag]}
    </span>
  );
}

/* --------------------------------------------------------------------------
 * Fotografía activa (desktop)
 * ----------------------------------------------------------------------- */

function FotoActiva({
  items,
  activo,
  animado,
}: {
  items: MenuItem[];
  activo: number;
  animado: boolean;
}) {
  const transicion = animado
    ? { duration: DURACION_FOTO, ease: EASE_BLOQUE }
    : { duration: 0 };

  return (
    <div className="hidden lg:block">
      <div className="sticky" style={{ top: TOP_FOTO }}>
        {/* El techo de alto evita que en una pantalla baja la foto cuadrada
            empuje la lista fuera del viewport. */}
        <div
          className="relative w-full overflow-hidden bg-carbon"
          style={{
            aspectRatio: "1 / 1",
            maxHeight: `calc(100svh - ${TOP_FOTO + 40}px)`,
          }}
        >
          {/* Las fotos de la sección se apilan y solo cambia su opacidad. Con
              AnimatePresence la saliente se desmontaba y la entrante todavía
              no había cargado: el crossfade mostraba un hueco. Apiladas, el
              navegador ya las tiene y el cambio es instantáneo. No agrega
              descargas respecto de la grilla anterior, que mostraba todas las
              fotos del menú a la vez. */}
          {items.map((item, i) => (
            <motion.div
              key={item.name}
              aria-hidden={i !== activo}
              className="absolute inset-0"
              initial={false}
              animate={{
                opacity: i === activo ? 1 : 0,
                y: i === activo ? 0 : DESPLAZAMIENTO_FOTO,
              }}
              transition={transicion}
            >
              {item.image ? (
                <Image
                  src={item.image}
                  alt={item.name}
                  fill
                  sizes="(min-width: 1360px) 660px, 52vw"
                  className="object-cover"
                />
              ) : (
                <FallbackTipografico item={item} indice={i} />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Fila de producto
 * ----------------------------------------------------------------------- */

function Fila({
  item,
  indice,
  activo,
  onActivar,
  whatsapp,
  animado,
  compacta,
  esAngosto,
}: {
  item: MenuItem;
  indice: number;
  activo: boolean;
  onActivar: () => void;
  whatsapp?: string;
  animado: boolean;
  /** Sección sin fotos: no hay panel que expandir ni columna visual. */
  compacta: boolean;
  /** Por debajo de `lg`. Solo ahí existe la expansión. */
  esAngosto: boolean;
}) {
  const idPanel = useId();
  const href = hrefPedirProducto(whatsapp, item.name);
  const ctaLargo =
    item.name.length > LARGO_NOMBRE_CTA
      ? "Pedir este producto"
      : `Pedir ${item.name}`;
  /* El botón solo existe donde hace algo: en una sección compacta no hay foto
   * que cambiar ni panel que abrir, así que el numeral y el nombre van en un
   * div y no se suma un control inerte al orden de foco. */
  const interactivo = !compacta;
  /* La expansión es exclusiva de mobile: anunciar `aria-expanded` en desktop
   * describiría un panel que está en `display:none`. */
  const expandible = interactivo && esAngosto;

  const encabezado = (
    <>
      <span className="flex flex-wrap items-baseline gap-x-12 gap-y-4">
        <span className="font-mono text-body-sm text-rescoldo">
          {numeral(indice + 1)}
        </span>
        <Tag item={item} />
      </span>
      <span className="break-words font-display uppercase leading-heading tracking-display text-hueso text-[clamp(28px,7vw,32px)] lg:text-[clamp(36px,3vw,44px)]">
        {item.name}
      </span>
    </>
  );

  return (
    <motion.li
      /* Gancho de la red de seguridad de `globals.css`: con
         prefers-reduced-motion fuerza opacidad 1 aunque el observer no haya
         corrido todavía, así la fila nunca queda invisible. */
      data-revelar=""
      initial={OCULTO_FILA}
      whileInView={VISIBLE_FILA}
      viewport={VIEWPORT}
      transition={
        animado
          ? { duration: DURACION_FILA, ease: EASE_BLOQUE, delay: delayFila(indice) }
          : { duration: 0 }
      }
      /* El hover cambia la foto en desktop. El FOCO no se escucha acá sino en
         el botón: si burbujeara desde el CTA, tabular hasta el enlace de una
         fila cerrada en mobile abriría esa fila y colapsaría la anterior,
         moviendo el layout bajo el foco del usuario. */
      onMouseEnter={onActivar}
      className={`relative border-t border-negro transition-colors ${
        activo && !compacta ? "lg:bg-carbon" : ""
      }`}
    >
      {/* Indicador de fila activa: 4px de brasa contra el borde izquierdo. */}
      {!compacta && (
        <span
          aria-hidden
          className={`absolute bottom-0 left-0 top-0 hidden w-[4px] bg-brasa lg:block ${
            activo ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      {/* py-12 en mobile: con py-20 la fila cerrada se iba a ~113px, por
          encima del rango de la carta. Desktop conserva su respiro. */}
      <div
        className={`flex flex-col gap-8 py-12 lg:py-20 ${
          compacta ? "" : "min-h-[88px] lg:min-h-[112px] lg:pl-24 lg:pr-8"
        }`}
      >
        <div className="flex items-start gap-16">
          {/* El botón selecciona el producto: en mobile abre su panel, en
              desktop cambia la fotografía de la izquierda. El CTA es un
              enlace HERMANO, nunca anidado dentro del botón. */}
          {interactivo ? (
            <button
              type="button"
              onClick={onActivar}
              onFocus={onActivar}
              aria-expanded={expandible ? activo : undefined}
              aria-controls={expandible ? idPanel : undefined}
              className="flex min-w-0 flex-1 flex-col items-start gap-4 text-left"
            >
              {encabezado}
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 flex-col items-start gap-4">
              {encabezado}
            </div>
          )}

          <div className="flex shrink-0 flex-col items-end gap-8">
            {item.price && (
              <span className="font-mono text-body-sm font-bold text-hueso lg:text-body">
                {item.price}
              </span>
            )}
            {/* CTA chico: visible SIEMPRE, también con la fila cerrada.
                Comprar no puede depender de expandir primero. */}
            {href && (
              <a
                href={href}
                /* Sin el aria-label, la lista de enlaces del lector de
                   pantalla queda con ocho "Pedir" idénticos apuntando a
                   productos distintos. */
                aria-label={`Pedir ${item.name} por WhatsApp`}
                className="inline-flex min-h-[44px] items-center rounded-button bg-brasa px-16 text-body-sm font-bold text-hueso lg:min-h-0 lg:bg-transparent lg:px-0 lg:text-rescoldo lg:underline lg:underline-offset-4 lg:hover:text-hueso"
              >
                <span className="lg:hidden">Pedir</span>
                <span className="hidden lg:inline">Pedir esta</span>
              </a>
            )}
          </div>
        </div>

        {/* La descripción es UN SOLO nodo: en desktop siempre visible, en
            mobile solo con la fila abierta. Duplicarla rompería la lectura. */}
        {item.description && (
          <p
            className={`max-w-[52ch] text-body-sm leading-body text-rescoldo ${
              compacta || activo ? "block" : "hidden"
            } lg:block ${compacta ? "" : "lg:pl-24"}`}
          >
            {item.description}
          </p>
        )}
      </div>

      {/* Panel de mobile: foto + CTA ancho. En desktop la foto vive en la
          columna pegada, así que el panel NO SE MONTA: ocultarlo por CSS
          bastaba para la vista, pero cada hover de escritorio montaba y
          desmontaba un `<Image>` y una animación de altura que nadie iba a
          ver, dentro de un subárbol invisible. */}
      {expandible && (
        <div id={idPanel}>
          <AnimatePresence initial={false}>
            {activo && (
              <motion.div
                key="panel"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={
                  animado
                    ? { duration: DURACION_EXPANSION, ease: EASE_BLOQUE }
                    : { duration: 0 }
                }
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-16 pb-24">
                  <div className="relative aspect-[3/2] w-full overflow-hidden bg-carbon">
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        sizes="92vw"
                        className="object-cover"
                      />
                    ) : (
                      <FallbackTipografico item={item} indice={indice} />
                    )}
                  </div>
                  {href && (
                    <a
                      href={href}
                      className="flex min-h-[44px] w-full items-center justify-center rounded-button bg-brasa px-24 text-body font-bold text-hueso"
                    >
                      {ctaLargo}
                    </a>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.li>
  );
}

/* --------------------------------------------------------------------------
 * Sección (una categoría del JSON)
 * ----------------------------------------------------------------------- */

function SeccionCategoria({
  section,
  whatsapp,
  animado,
}: {
  section: MenuSectionData;
  whatsapp?: string;
  animado: boolean;
}) {
  /* Un solo estado para las dos variantes: en desktop decide qué foto se ve,
   * en mobile qué producto está abierto. Arranca en el destacado del JSON. */
  const [activo, setActivo] = useState(() => indiceInicial(section.items));
  const conFotos = section.items.some((item) => item.image);
  /* Decide solo ARIA y montaje del panel, nunca el layout: el layout lo
   * resuelve CSS por breakpoint. */
  const esAngosto = useEsAngosto();

  const filas = section.items.map((item, i) => (
    <Fila
      key={item.name}
      item={item}
      indice={i}
      activo={i === activo}
      onActivar={() => setActivo(i)}
      whatsapp={whatsapp}
      animado={animado}
      compacta={!conFotos}
      esAngosto={esAngosto}
    />
  ));

  return (
    <div className="mt-80 md:mt-100">
      <h3 className="font-display uppercase leading-heading tracking-display text-brasa text-[clamp(40px,5vw,48px)]">
        {section.title}
      </h3>

      {conFotos ? (
        /* SIN `items-start`: la columna de la foto tiene que ESTIRARSE hasta
           el alto de la lista. Si el ítem de grilla se encoge al alto de su
           contenido, el sticky se queda sin recorrido y la foto se va con el
           scroll en vez de quedarse pegada — que es todo el concepto. */
        <div className="mt-32 lg:grid lg:grid-cols-[52fr_48fr] lg:gap-40">
          <FotoActiva
            items={section.items}
            activo={activo}
            animado={animado}
          />
          {/* border-b: la última fila también cierra con hairline. */}
          <ul role="list" className="border-b border-negro">{filas}</ul>
        </div>
      ) : (
        /* Sin fotos no hay columna visual que mostrar: lista compacta, hasta
           dos columnas en desktop. */
        <ul role="list" className="mt-32 border-b border-negro lg:grid lg:grid-cols-2 lg:gap-x-40">
          {filas}
        </ul>
      )}
    </div>
  );
}

export default function MenuSeccion({
  menu,
  numero,
  whatsapp,
}: {
  menu: MenuSectionData[];
  numero: number;
  /** Número del prospecto. Sin él no se renderiza ningún CTA de pedido. */
  whatsapp?: string;
}) {
  const reducirMovimiento = useReducedMotion();
  /* La preferencia no existe en el servidor: se decide tras el montaje para
   * no romper la hidratación (ver RevelarLineas). */
  const [sinMovimiento, setSinMovimiento] = useState(false);
  useLayoutEffectSeguro(() => {
    if (reducirMovimiento) setSinMovimiento(true);
  }, [reducirMovimiento]);

  return (
    <section
      id="menu"
      className="scroll-mt-64 bg-noche px-20 py-100 md:px-40 md:pb-148"
    >
      <div className="mx-auto max-w-[1360px]">
        <SeccionTitulo
          numero={numero}
          eyebrow="Menú"
          titulo="El menú"
          sangrado
        />
        {menu.map((section) => (
          <SeccionCategoria
            key={section.title}
            section={section}
            whatsapp={whatsapp}
            animado={!sinMovimiento}
          />
        ))}
      </div>
    </section>
  );
}
