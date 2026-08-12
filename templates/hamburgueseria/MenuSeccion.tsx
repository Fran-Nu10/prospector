"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type {
  MenuItem,
  MenuSection as MenuSectionData,
} from "../../web/lib/schema";
import BordeVivo from "./BordeVivo";
import { RevelarLineas } from "./RevelarLineas";
import SeccionTitulo from "./SeccionTitulo";
import {
  DURACION_REPOSO,
  EASE_BLOQUE,
  LIFT_HOVER,
  OCULTO,
  VIEWPORT,
  VISIBLE,
  delayStagger,
  transicionCard,
} from "./animacion";

/*
 * Sección MENÚ — el momento estrella de la página (además del hero).
 *
 * Jerarquía data-driven: el primer ítem con tag "destacado" de cada sección
 * rompe la grilla (span mayor, Anton, precio en queso). Sin destacado,
 * grilla pareja. Nada del negocio vive acá: todo entra por `menu`.
 *
 * Foto del plato (si `item.image` existe): full-bleed de fondo con scrim
 * degradado hacia abajo para que nombre/precio lean siempre; zoom sutil
 * en hover. Sin foto, la card cae al diseño tipográfico.
 *
 * El "borde vivo" (arco brasa→queso en hover) vive en BordeVivo.tsx y los
 * tiempos en animacion.ts: los comparte con el resto de la página para que
 * todo se sienta de la misma mano.
 *
 * Todas las animaciones son EXPLÍCITAS por elemento (initial/whileInView/
 * animate directos, sin propagación de variants): la cadena de variants
 * heredados fallaba en frío cuando no había re-render tras el mount.
 *
 * Solo se anima transform/opacity (GPU). Con prefers-reduced-motion se
 * renderiza el estado final sin animación.
 */

const TAG_LABELS: Record<NonNullable<MenuItem["tag"]>, string> = {
  destacado: "Destacado",
  nuevo: "Nuevo",
  vegano: "Vegano",
  sin_tacc: "Sin TACC",
};

/* Scrim funcional sobre la foto: garantiza contraste del texto abajo
 * y deja respirar la foto arriba (las fotos ya son oscuras/moody). */
const SCRIM_FOTO =
  "linear-gradient(to top, rgba(10,10,15,0.95) 0%, rgba(10,10,15,0.62) 36%, rgba(10,10,15,0.16) 64%, rgba(10,10,15,0.03) 100%)";

function ordenarConDestacado(items: MenuItem[]): {
  destacado: MenuItem | null;
  resto: MenuItem[];
} {
  const i = items.findIndex((item) => item.tag === "destacado");
  if (i === -1) return { destacado: null, resto: items };
  return { destacado: items[i], resto: items.filter((_, j) => j !== i) };
}

/* Con foto, la card necesita alto propio: aspecto fijo en las normales,
 * mínimo en la destacada (su alto real lo da el row-span de la grilla). */
function clasesFoto(item: MenuItem, destacada: boolean) {
  if (!item.image) return "";
  return destacada ? "min-h-[380px] lg:min-h-[460px]" : "aspect-[4/3]";
}

function Pill({
  tag,
  grande,
}: {
  tag: NonNullable<MenuItem["tag"]>;
  grande?: boolean;
}) {
  return (
    <span
      className={`rounded-button bg-queso font-bold uppercase tracking-[0.08em] text-negro ${
        grande ? "px-16 py-8 text-body-sm" : "px-12 py-4 text-caption"
      }`}
    >
      {TAG_LABELS[tag]}
    </span>
  );
}

/** Foto full-bleed con zoom sutil en hover + scrim de legibilidad. */
function FotoPlato({
  item,
  hover,
  sizes,
}: {
  item: MenuItem & { image: string };
  hover: boolean;
  sizes: string;
}) {
  return (
    <>
      <motion.div
        aria-hidden
        className="absolute inset-0"
        initial={false}
        animate={{ scale: hover ? 1.05 : 1 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
      >
        <Image
          src={item.image}
          alt={item.name}
          fill
          sizes={sizes}
          className="object-cover"
        />
      </motion.div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: SCRIM_FOTO }}
      />
    </>
  );
}

/** Contenido interior de una card normal (compartido con reduced motion). */
function ContenidoCard({
  item,
  hover = false,
}: {
  item: MenuItem;
  hover?: boolean;
}) {
  const fila = (
    <div className="flex items-baseline justify-between gap-16">
      {/* min-w-0 + break-words: nombres largos quiebran en vez de
          desbordar (el overflow-hidden de la card recorta en silencio) */}
      <span className="flex min-w-0 flex-wrap items-center gap-12">
        <span className="min-w-0 break-words text-body font-bold">
          {item.name}
        </span>
        {item.tag && <Pill tag={item.tag} />}
      </span>
      {item.price && (
        <span className="shrink-0 font-mono text-body font-bold">
          {item.price}
        </span>
      )}
    </div>
  );
  const descripcion = item.description && (
    <p className="text-body-sm leading-body-sm text-rescoldo">
      {item.description}
    </p>
  );

  if (!item.image) {
    return (
      <div className="relative z-[1] flex h-full flex-col gap-8 rounded-[11px] bg-carbon p-24">
        {fila}
        {descripcion}
      </div>
    );
  }

  return (
    <div className="relative z-[1] h-full overflow-hidden rounded-[11px] bg-carbon">
      <FotoPlato
        item={item as MenuItem & { image: string }}
        hover={hover}
        sizes="(min-width: 1024px) 420px, (min-width: 768px) 50vw, 92vw"
      />
      <div className="relative flex h-full flex-col justify-end gap-8 p-24">
        {fila}
        {descripcion}
      </div>
    </div>
  );
}

/** Contenido interior de la card destacada. */
function ContenidoDestacada({
  item,
  hover = false,
}: {
  item: MenuItem;
  hover?: boolean;
}) {
  if (!item.image) {
    return (
      <div className="relative z-[1] flex h-full flex-col rounded-[37px] bg-carbon p-32 md:p-40">
        <div>
          <Pill tag="destacado" grande />
        </div>
        <h4 className="mt-24 break-words font-display uppercase leading-heading text-hueso text-[clamp(40px,5vw,64px)]">
          {item.name}
        </h4>
        {item.description && (
          <p className="mt-16 max-w-[480px] text-body leading-body text-rescoldo">
            {item.description}
          </p>
        )}
        {item.price && (
          <p className="mt-auto pt-32 font-mono font-bold text-queso text-[clamp(28px,3vw,40px)]">
            {item.price}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="relative z-[1] h-full overflow-hidden rounded-[37px] bg-carbon">
      <FotoPlato
        item={item as MenuItem & { image: string }}
        hover={hover}
        sizes="(min-width: 1024px) 830px, 92vw"
      />
      <div className="relative flex h-full flex-col p-32 md:p-40">
        <div>
          <Pill tag="destacado" grande />
        </div>
        <h4 className="mt-auto break-words pt-24 font-display uppercase leading-heading text-hueso text-[clamp(40px,5vw,64px)]">
          {item.name}
        </h4>
        {item.description && (
          <p className="mt-12 max-w-[480px] text-body leading-body text-rescoldo">
            {item.description}
          </p>
        )}
        {item.price && (
          <p className="mt-20 font-mono font-bold text-queso text-[clamp(28px,3vw,40px)]">
            {item.price}
          </p>
        )}
      </div>
    </div>
  );
}

/** Card con entrada, lift + zoom de foto en hover y borde vivo. */
function Card({
  item,
  destacada = false,
  indice,
  tactil,
  className = "",
}: {
  item: MenuItem;
  destacada?: boolean;
  indice: number;
  tactil: boolean;
  className?: string;
}) {
  const [hover, setHover] = useState(false);
  /* El delay de stagger solo vale para la ENTRADA: como es la transición
   * por defecto del componente, si quedara fijo también retrasaría la
   * vuelta del lift al salir del hover (card colgada hasta 0.6s). */
  const [entro, setEntro] = useState(false);
  const delay = delayStagger(indice);

  return (
    <motion.li
      initial={OCULTO}
      whileInView={VISIBLE}
      viewport={VIEWPORT}
      onAnimationComplete={() => setEntro(true)}
      transition={
        entro
          ? { duration: DURACION_REPOSO, ease: EASE_BLOQUE }
          : transicionCard(indice)
      }
      whileHover={LIFT_HOVER}
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      className={`relative overflow-hidden bg-negro p-px ${
        destacada ? "rounded-feature" : "rounded-card"
      } ${clasesFoto(item, destacada)} ${className}`}
    >
      <BordeVivo tactil={tactil} hover={hover} delay={delay} />
      {destacada ? (
        <ContenidoDestacada item={item} hover={hover} />
      ) : (
        <ContenidoCard item={item} hover={hover} />
      )}
    </motion.li>
  );
}

function GrillaSeccion({
  section,
  tactil,
}: {
  section: MenuSectionData;
  tactil: boolean;
}) {
  const { destacado, resto } = ordenarConDestacado(section.items);
  /* Con pocos ítems restantes el row-span-2 deja huecos: solo rompe la
   * grilla en dos filas cuando hay con qué llenar la columna de al lado. */
  const spanFilas = destacado && resto.length >= 2;

  return (
    <div className="mt-56">
      <RevelarLineas
        enVista
        as="h3"
        texto={section.title}
        className="font-display uppercase leading-heading text-brasa text-[40px]"
      />
      <ul className="mt-24 grid gap-16 md:grid-cols-2 lg:grid-cols-3">
        {destacado && (
          <Card
            item={destacado}
            destacada
            indice={0}
            tactil={tactil}
            className={`md:col-span-2 ${spanFilas ? "lg:row-span-2" : ""}`}
          />
        )}
        {resto.map((item, i) => (
          <Card
            key={item.name}
            item={item}
            indice={destacado ? i + 1 : i}
            tactil={tactil}
          />
        ))}
      </ul>
    </div>
  );
}

/** Fallback estático: mismo layout, sin animación (reduced motion). */
function MenuEstatico({ menu }: { menu: MenuSectionData[] }) {
  return (
    <>
      {menu.map((section) => {
        const { destacado, resto } = ordenarConDestacado(section.items);
        const spanFilas = destacado && resto.length >= 2;
        return (
          <div key={section.title} className="mt-56">
            <h3 className="font-display uppercase leading-heading text-brasa text-[40px]">
              {section.title}
            </h3>
            <ul className="mt-24 grid gap-16 md:grid-cols-2 lg:grid-cols-3">
              {destacado && (
                <li
                  className={`relative overflow-hidden rounded-feature bg-negro p-px transition-colors duration-300 hover:bg-brasa md:col-span-2 ${
                    spanFilas ? "lg:row-span-2" : ""
                  } ${clasesFoto(destacado, true)}`}
                >
                  <ContenidoDestacada item={destacado} />
                </li>
              )}
              {resto.map((item) => (
                <li
                  key={item.name}
                  className={`relative overflow-hidden rounded-card bg-negro p-px transition-colors duration-300 hover:bg-brasa ${clasesFoto(item, false)}`}
                >
                  <ContenidoCard item={item} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

export default function MenuSeccion({ menu }: { menu: MenuSectionData[] }) {
  const reducirMovimiento = useReducedMotion();

  /* Sin hover real (táctil), el borde vivo se enciende una vez al entrar
   * la card al viewport en lugar de esperar un hover que nunca llega. */
  const [tactil, setTactil] = useState(false);
  /* El branch estático recién puede decidirse tras el mount: el server
   * siempre manda la rama animada, y cambiar de rama durante la
   * hidratación rompe el HTML (hydration mismatch). */
  const [hidratado, setHidratado] = useState(false);
  useEffect(() => {
    setTactil(window.matchMedia("(hover: none)").matches);
    setHidratado(true);
  }, []);

  return (
    <section id="menu" className="scroll-mt-64 py-80 md:py-100">
      <div className="mx-auto max-w-[1280px] px-20">
        {/* La apertura es la misma de toda la página y resuelve reduced-motion
            por dentro, así que va fuera de la bifurcación. */}
        <SeccionTitulo
          titulo="El menú"
          sub="Lo que sale de la plancha cuando cae la noche."
        />
        {hidratado && reducirMovimiento ? (
          <MenuEstatico menu={menu} />
        ) : (
          menu.map((section) => (
            <GrillaSeccion
              key={section.title}
              section={section}
              tactil={tactil}
            />
          ))
        )}
      </div>
    </section>
  );
}
