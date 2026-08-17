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
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type {
  MenuItem,
  MenuSection as MenuSectionData,
} from "../../web/lib/schema";
import SeccionTitulo from "./SeccionTitulo";
import { hrefPedirProducto } from "./menu";
import {
  DURACION_EXPANSION,
  DURACION_FILA,
  EASE_BLOQUE,
  OCULTO_FILA,
  VIEWPORT,
  VISIBLE_FILA,
  delayFila,
} from "./animacion";
import { numeral } from "./tipografia";

/*
 * MENÚ — vitrina de hamburguesas.
 *
 * POR QUÉ ESTO Y NO UN ACORDEÓN. Cinco personas probaron la versión anterior
 * en el teléfono: las cinco entendieron que el primer producto estaba abierto,
 * y ninguna descubrió que tocando "02" o "03" aparecían las demás fotos.
 * Leyeron que los otros productos no tenían más contenido. El problema no era
 * de énfasis ni de instrucciones: era que la única puerta a la foto estaba
 * escondida detrás de un gesto que nadie iba a intentar.
 *
 * Acá no hay nada escondido. Cada producto muestra SIEMPRE su foto, su nombre,
 * su precio y cómo pedirlo, y para pasar al siguiente hay un carrusel
 * explícito con flechas y contador: la flecha derecha se ve desde el primer
 * producto y es la que comunica que hay más.
 *
 * La única expansión que queda —"Ver ingredientes"— es contenido opcional.
 * Nunca hace falta abrirla para descubrir la foto, el nombre, el precio ni
 * para pedir.
 *
 * IMPLEMENTACIÓN: scroll horizontal NATIVO con CSS scroll snap. Sin librería
 * de carrusel, sin arrastre sintético; el swipe es el del sistema operativo y
 * el scroll vertical de la página nunca queda secuestrado. Las flechas solo
 * llaman a `scrollTo`.
 *
 * Las categorías sin fotografías no entran al carrusel: caen a la lista
 * compacta, que para acompañamientos es la lectura correcta.
 */

const TAG_LABELS: Record<NonNullable<MenuItem["tag"]>, string> = {
  destacado: "La firma",
  nuevo: "Nuevo",
  vegano: "Vegano",
  sin_tacc: "Sin TACC",
};

/** Etiquetas que rodean la burger; el resto pasa a la lista de abajo. */
const MAX_ETIQUETAS_ALREDEDOR = 6;

/** Gap entre slides, en px. Debe coincidir con la clase `gap-24`. */
const GAP_SLIDES = 24;

const useLayoutEffectSeguro =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function Tag({ item }: { item: MenuItem }) {
  if (!item.tag) return null;
  return (
    <span className="font-mono text-caption uppercase tracking-[0.22em] text-queso">
      {TAG_LABELS[item.tag]}
    </span>
  );
}

/* --------------------------------------------------------------------------
 * ProductoVisual — el bloque de la fotografía, aislado a propósito.
 *
 * Todo lo que sepa de cómo se muestra el producto vive acá: si mañana esto
 * pasa a ser un render con profundidad o un modelo 3D, se reemplaza este
 * componente y el carrusel no se entera.
 * ----------------------------------------------------------------------- */

function ProductoVisual({
  item,
  encogido,
  animado,
}: {
  item: MenuItem & { image: string };
  /** Con los ingredientes abiertos la burger cede espacio a las etiquetas. */
  encogido: boolean;
  animado: boolean;
}) {
  return (
    <motion.div
      className="absolute inset-0"
      initial={false}
      animate={{ scale: encogido ? 0.88 : 1, y: encogido ? -22 : 0 }}
      transition={
        animado ? { duration: DURACION_EXPANSION, ease: EASE_BLOQUE } : { duration: 0 }
      }
    >
      {/* object-contain: la foto no se recorta ni se deforma nunca. */}
      <Image
        src={item.image}
        alt={item.name}
        fill
        sizes="(min-width: 1024px) 46vw, 88vw"
        className="object-contain"
      />
    </motion.div>
  );
}

/* --------------------------------------------------------------------------
 * AnatomiaIngredientes — etiquetas alrededor de la burger.
 *
 * La distribución es DETERMINISTA por índice: alterna izquierda y derecha y
 * reparte las alturas por igual. No hay coordenadas guardadas por prospecto —
 * eso sería datos visuales en el JSON— ni pretensión de apuntar a un píxel
 * exacto: la hairline llega al perímetro de la imagen y ahí se corta.
 * ----------------------------------------------------------------------- */

function AnatomiaIngredientes({
  ingredientes,
  animado,
}: {
  ingredientes: string[];
  animado: boolean;
}) {
  const alrededor = ingredientes.slice(0, MAX_ETIQUETAS_ALREDEDOR);
  const porLado = Math.ceil(alrededor.length / 2);

  return (
    <>
      {alrededor.map((ingrediente, i) => {
        const derecha = i % 2 === 1;
        const fila = Math.floor(i / 2);
        /* Repartidas verticalmente en la mitad central del cuadro: arriba y
           abajo la burger no llega a los bordes y la línea colgaría en el aire. */
        const top = `${18 + ((fila + 0.5) / porLado) * 64}%`;

        return (
          <motion.div
            key={ingrediente}
            className={`absolute flex items-center gap-8 ${
              derecha ? "right-0 justify-end" : "left-0"
            }`}
            style={{ top, width: "46%" }}
            initial={animado ? { opacity: 0, x: derecha ? 8 : -8 } : false}
            animate={{ opacity: 1, x: 0 }}
            exit={animado ? { opacity: 0, x: derecha ? 8 : -8 } : undefined}
            transition={
              animado
                ? {
                    duration: DURACION_EXPANSION,
                    ease: EASE_BLOQUE,
                    delay: i * 0.04,
                  }
                : { duration: 0 }
            }
          >
            {derecha && <span aria-hidden className="h-px flex-1 bg-rescoldo/40" />}
            <span className="max-w-[62%] font-mono text-[10px] uppercase leading-[1.3] tracking-[0.18em] text-rescoldo">
              {ingrediente}
            </span>
            {!derecha && <span aria-hidden className="h-px flex-1 bg-rescoldo/40" />}
          </motion.div>
        );
      })}
    </>
  );
}

/* --------------------------------------------------------------------------
 * Ficha de producto (un slide)
 * ----------------------------------------------------------------------- */

function Ficha({
  item,
  indice,
  total,
  abierto,
  onAlternar,
  whatsapp,
  animado,
}: {
  item: MenuItem & { image: string };
  indice: number;
  total: number;
  abierto: boolean;
  onAlternar: () => void;
  whatsapp?: string;
  animado: boolean;
}) {
  const idPanel = useId();
  const href = hrefPedirProducto(whatsapp, item.name);
  const ingredientes = item.ingredients ?? [];
  const tieneIngredientes = ingredientes.length > 0;
  const extras = ingredientes.slice(MAX_ETIQUETAS_ALREDEDOR);

  return (
    <li
      /* Cada slide se anuncia como elemento de una colección: el lector de
         pantalla dice "3 de 5" sin depender del contador visual. */
      aria-posinset={indice + 1}
      aria-setsize={total}
      className="w-full shrink-0 snap-center lg:w-[calc((100%-24px)/2)]"
    >
      {/* Ficha fundida con el fondo: sin caja, sin sombra, sin radio grande.
          Lo único que separa información son hairlines de 1px. */}
      <div className="flex h-full flex-col">
        <div id={idPanel} className="relative">
          {/* La foto manda: ~57% del alto visual de la ficha. */}
          <div className="relative aspect-square w-full">
            <ProductoVisual item={item} encogido={abierto} animado={animado} />
            <AnimatePresence initial={false}>
              {abierto && (
                <AnatomiaIngredientes
                  key="anatomia"
                  ingredientes={ingredientes}
                  animado={animado}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Si hay más de seis, las que sobran no se apiñan alrededor. */}
          <AnimatePresence initial={false}>
            {abierto && extras.length > 0 && (
              <motion.ul
                key="extras"
                role="list"
                className="mt-16 flex flex-wrap gap-x-16 gap-y-8"
                initial={animado ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={animado ? { opacity: 0 } : undefined}
                transition={{ duration: animado ? DURACION_EXPANSION : 0 }}
              >
                {extras.map((extra) => (
                  <li
                    key={extra}
                    className="font-mono text-[10px] uppercase tracking-[0.18em] text-rescoldo"
                  >
                    {extra}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-24 flex flex-col gap-12">
          <Tag item={item} />
          <h4 className="break-words font-display uppercase leading-heading tracking-display text-hueso text-[clamp(40px,11vw,48px)] lg:text-[clamp(48px,3.6vw,64px)]">
            {item.name}
          </h4>

          {/* Precio y CTA son una unidad de conversión: viven en la misma
              fila y no dependen de abrir nada. */}
          <div className="flex flex-wrap items-center justify-between gap-16 border-t border-negro pt-16">
            {item.price && (
              <span className="font-mono text-subheading font-bold text-hueso">
                {item.price}
              </span>
            )}
            {href && (
              <a
                href={href}
                aria-label={`Pedir ${item.name} por WhatsApp`}
                className="inline-flex min-h-[48px] items-center rounded-button bg-brasa px-32 text-body font-bold text-hueso"
              >
                Pedir
              </a>
            )}
          </div>

          {tieneIngredientes && (
            <button
              type="button"
              onClick={onAlternar}
              aria-expanded={abierto}
              aria-controls={idPanel}
              className="inline-flex min-h-[44px] items-center self-start font-mono text-body-sm uppercase tracking-[0.18em] text-rescoldo underline underline-offset-4 hover:text-hueso"
            >
              {abierto ? "Cerrar ×" : "Ver ingredientes +"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/* --------------------------------------------------------------------------
 * Carrusel
 * ----------------------------------------------------------------------- */

function Carrusel({
  section,
  whatsapp,
  animado,
}: {
  section: MenuSectionData;
  whatsapp?: string;
  animado: boolean;
}) {
  const conFoto = section.items.filter(
    (item): item is MenuItem & { image: string } => Boolean(item.image)
  );
  const pistaRef = useRef<HTMLUListElement>(null);
  /* Solo dos datos de estado, y ninguno se toca durante el arrastre salvo que
   * cambie de verdad: el índice del primer producto visible y cuántos entran. */
  const [vista, setVista] = useState({ indice: 0, visibles: 1 });
  const [abierto, setAbierto] = useState<number | null>(null);

  /** Paso real entre slides (ancho + gap), medido del DOM. */
  const paso = useCallback(() => {
    const pista = pistaRef.current;
    if (!pista) return 1;
    const slides = pista.children;
    if (slides.length > 1) {
      const a = (slides[0] as HTMLElement).offsetLeft;
      const b = (slides[1] as HTMLElement).offsetLeft;
      if (b > a) return b - a;
    }
    return (slides[0] as HTMLElement)?.offsetWidth + GAP_SLIDES || 1;
  }, []);

  const leerVista = useCallback(() => {
    const pista = pistaRef.current;
    if (!pista) return;
    const p = paso();
    const indice = Math.max(
      0,
      Math.min(conFoto.length - 1, Math.round(pista.scrollLeft / p))
    );
    const visibles = Math.max(1, Math.round(pista.clientWidth / p));
    /* Devolver el mismo objeto cuando nada cambió evita el re-render: el
     * scroll dispara decenas de veces por gesto. */
    setVista((prev) =>
      prev.indice === indice && prev.visibles === visibles
        ? prev
        : { indice, visibles }
    );
  }, [conFoto.length, paso]);

  useEffect(() => {
    const pista = pistaRef.current;
    if (!pista) return;
    let raf = 0;
    const alScrollear = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(leerVista);
    };
    leerVista();
    /* Pasivo: no bloquea el gesto de scroll del sistema. */
    pista.addEventListener("scroll", alScrollear, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      pista.removeEventListener("scroll", alScrollear);
    };
  }, [leerVista]);

  /* Al cambiar de ancho, el carrusel puede quedar entre dos slides: se vuelve
   * a alinear con el producto que el usuario estaba mirando. */
  useEffect(() => {
    const pista = pistaRef.current;
    if (!pista) return;
    const observador = new ResizeObserver(() => {
      pista.scrollTo({ left: paso() * vista.indice, behavior: "auto" });
      leerVista();
    });
    observador.observe(pista);
    return () => observador.disconnect();
  }, [leerVista, paso, vista.indice]);

  const irA = (destino: number) => {
    const pista = pistaRef.current;
    if (!pista) return;
    const i = Math.max(0, Math.min(conFoto.length - 1, destino));
    /* Cambiar de producto cierra la anatomía abierta: nadie quiere llegar al
     * siguiente con el anterior desplegado. */
    setAbierto(null);
    pista.scrollTo({ left: paso() * i, behavior: animado ? "smooth" : "auto" });
  };

  const { indice, visibles } = vista;
  const total = conFoto.length;
  const ultimoVisible = Math.min(indice + visibles, total);
  const alPrincipio = indice <= 0;
  const alFinal = indice >= total - visibles;

  /* El swipe también cierra la anatomía; se detecta por cambio de índice. */
  const indicePrevio = useRef(indice);
  useEffect(() => {
    if (indicePrevio.current !== indice) {
      indicePrevio.current = indice;
      setAbierto(null);
    }
  }, [indice]);

  return (
    <div
      role="group"
      aria-roledescription="carrusel"
      aria-label={`${section.title} — ${total} productos`}
      className="mt-32"
    >
      <ul
        ref={pistaRef}
        role="list"
        /* La barra se oculta a la vista pero el contenedor sigue siendo
           scrolleable por teclado y por AT. */
        className="flex snap-x snap-mandatory gap-24 overflow-x-auto overscroll-x-contain pb-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {conFoto.map((item, i) => (
          <Ficha
            key={item.name}
            item={item}
            indice={i}
            total={total}
            abierto={abierto === i}
            onAlternar={() => setAbierto((prev) => (prev === i ? null : i))}
            whatsapp={whatsapp}
            animado={animado}
          />
        ))}
      </ul>

      {/* Control: la flecha derecha se ve desde el primer producto y es lo que
          comunica que hay más. Sin dots y sin "deslizá". */}
      <div className="mt-24 flex items-center justify-center gap-24">
        <BotonFlecha
          direccion="anterior"
          onClick={() => irA(indice - 1)}
          deshabilitado={alPrincipio}
        />
        <span
          aria-live="polite"
          className="min-w-[104px] text-center font-mono text-body-sm tracking-[0.18em] text-hueso"
        >
          {visibles > 1 && ultimoVisible > indice + 1
            ? `${numeral(indice + 1)}–${numeral(ultimoVisible)}`
            : numeral(indice + 1)}{" "}
          / {numeral(total)}
        </span>
        <BotonFlecha
          direccion="siguiente"
          onClick={() => irA(indice + 1)}
          deshabilitado={alFinal}
        />
      </div>
    </div>
  );
}

function BotonFlecha({
  direccion,
  onClick,
  deshabilitado,
}: {
  direccion: "anterior" | "siguiente";
  onClick: () => void;
  deshabilitado: boolean;
}) {
  const siguiente = direccion === "siguiente";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={siguiente ? "Producto siguiente" : "Producto anterior"}
      /* Medidas literales: la escala del tema no define 48, y `h-48` caería en
         la escala por defecto de Tailwind (192px). */
      className="flex h-[48px] w-[48px] items-center justify-center border border-negro text-hueso disabled:text-rescoldo disabled:opacity-30"
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

/* --------------------------------------------------------------------------
 * Lista compacta — categorías sin fotografía
 * ----------------------------------------------------------------------- */

function ListaCompacta({
  section,
  whatsapp,
  animado,
}: {
  section: MenuSectionData;
  whatsapp?: string;
  animado: boolean;
}) {
  return (
    <ul role="list" className="mt-32 border-b border-negro lg:grid lg:grid-cols-2 lg:gap-x-40">
      {section.items.map((item, i) => {
        const href = hrefPedirProducto(whatsapp, item.name);
        return (
          <motion.li
            key={item.name}
            data-revelar=""
            initial={OCULTO_FILA}
            whileInView={VISIBLE_FILA}
            viewport={VIEWPORT}
            transition={
              animado
                ? { duration: DURACION_FILA, ease: EASE_BLOQUE, delay: delayFila(i) }
                : { duration: 0 }
            }
            className="border-t border-negro"
          >
            <div className="flex flex-col gap-8 py-12 lg:py-20">
              <div className="flex items-start gap-16">
                <div className="flex min-w-0 flex-1 flex-col items-start gap-4">
                  <span className="font-mono text-body-sm text-rescoldo">
                    {numeral(i + 1)}
                  </span>
                  <span className="break-words font-display uppercase leading-heading tracking-display text-hueso text-[clamp(28px,7vw,32px)] lg:text-[clamp(36px,3vw,44px)]">
                    {item.name}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-8">
                  {item.price && (
                    <span className="font-mono text-body-sm font-bold text-hueso lg:text-body">
                      {item.price}
                    </span>
                  )}
                  {href && (
                    <a
                      href={href}
                      aria-label={`Pedir ${item.name} por WhatsApp`}
                      className="inline-flex min-h-[44px] items-center rounded-button bg-brasa px-16 text-body-sm font-bold text-hueso lg:min-h-0 lg:bg-transparent lg:px-0 lg:text-rescoldo lg:underline lg:underline-offset-4 lg:hover:text-hueso"
                    >
                      <span className="lg:hidden">Pedir</span>
                      <span className="hidden lg:inline">Pedir esta</span>
                    </a>
                  )}
                </div>
              </div>
              {item.description && (
                <p className="max-w-[52ch] text-body-sm leading-body text-rescoldo">
                  {item.description}
                </p>
              )}
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}

/* --------------------------------------------------------------------------
 * Sección
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
  /* La forma la decide el dato, no el nombre de la categoría: con fotos, la
   * vitrina; sin fotos, la lista. Nada de comparar contra "Acompañamientos". */
  const conFotos = section.items.some((item) => item.image);

  return (
    <div className="mt-80 md:mt-100">
      <h3 className="font-display uppercase leading-heading tracking-display text-brasa text-[clamp(40px,5vw,48px)]">
        {section.title}
      </h3>
      {conFotos ? (
        <Carrusel section={section} whatsapp={whatsapp} animado={animado} />
      ) : (
        <ListaCompacta section={section} whatsapp={whatsapp} animado={animado} />
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
