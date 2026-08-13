"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type {
  MenuItem,
  MenuSection as MenuSectionData,
} from "../../web/lib/schema";
import BordeVivo from "./BordeVivo";
import SeccionTitulo from "./SeccionTitulo";
import { ordenarConDestacado } from "./menu";
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
 * MENÚ — la segunda sección estrella.
 *
 * La grilla NO es pareja, y esa es toda la idea: un producto destacado ocupa
 * una columna entera con el radio de 38px —el único lugar del sistema donde
 * se usa—, dos cards lo acompañan en la columna angosta, y las siguientes van
 * en filas de anchos distintos (5/4/4) con la del medio DESCOLGADA 56px. Sin
 * ese desfasaje la grilla vuelve a leerse como una tabla.
 *
 * La jerarquía es data-driven: el destacado es el primer ítem con tag
 * "destacado" de la sección. Sin destacado, la sección cae a filas de tres
 * —y la del medio sigue descolgada, que es lo que sostiene el ritmo.
 *
 * La foto va ARRIBA y el texto abajo sobre carbón plano: nada de scrims ni
 * degradados sobre la imagen (el sistema es plano). El único brillo permitido
 * sigue siendo el borde vivo en hover (ver BordeVivo.tsx).
 */

const useLayoutEffectSeguro =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const TAG_LABELS: Record<NonNullable<MenuItem["tag"]>, string> = {
  destacado: "La firma",
  nuevo: "Nuevo",
  vegano: "Vegano",
  sin_tacc: "Sin TACC",
};

/** Cuántas cards entran en una fila de la grilla asimétrica. */
const POR_FILA = 3;

function enFilas<T>(items: T[], tamano: number): T[][] {
  const filas: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) {
    filas.push(items.slice(i, i + tamano));
  }
  return filas;
}

/** Kicker en ámbar: el acento de comida, y solo acá. */
function Kicker({ item, grande }: { item: MenuItem; grande?: boolean }) {
  if (!item.tag) return null;
  return (
    <span
      className={`font-mono uppercase tracking-[0.22em] text-queso ${
        grande ? "text-[12px]" : "text-caption"
      }`}
    >
      {TAG_LABELS[item.tag]}
    </span>
  );
}

function Foto({
  item,
  destacada,
}: {
  item: MenuItem & { image: string };
  destacada: boolean;
}) {
  return (
    <div
      className={`relative w-full overflow-hidden ${
        destacada
          ? "aspect-[3/2] lg:aspect-[824/460]"
          : "aspect-[3/2] lg:aspect-[515/200]"
      }`}
    >
      <Image
        src={item.image}
        alt={item.name}
        fill
        sizes={
          destacada
            ? "(min-width: 1024px) 824px, 92vw"
            : "(min-width: 1024px) 420px, (min-width: 768px) 50vw, 92vw"
        }
        className="object-cover"
      />
    </div>
  );
}

function Contenido({ item, destacada }: { item: MenuItem; destacada: boolean }) {
  return (
    <div
      className={`flex flex-1 flex-col ${
        destacada ? "gap-12 p-32" : "gap-8 p-24"
      }`}
    >
      <Kicker item={item} grande={destacada} />
      <h4
        className={`break-words font-display uppercase leading-heading tracking-display text-hueso ${
          destacada ? "text-[clamp(40px,4vw,48px)]" : "text-[40px]"
        }`}
      >
        {item.name}
      </h4>
      {item.description && (
        <p className="max-w-[480px] text-body-sm leading-body text-rescoldo">
          {item.description}
        </p>
      )}
      {item.price && (
        <span
          className={`mt-auto pt-16 font-mono font-bold text-hueso ${
            destacada ? "text-subheading" : "text-body"
          }`}
        >
          {item.price}
        </span>
      )}
    </div>
  );
}

function Card({
  item,
  indice,
  tactil,
  animado,
  destacada = false,
  className = "",
}: {
  item: MenuItem;
  indice: number;
  tactil: boolean;
  animado: boolean;
  destacada?: boolean;
  className?: string;
}) {
  const [hover, setHover] = useState(false);
  /* El delay de stagger solo vale para la ENTRADA: como es la transición por
   * defecto del componente, si quedara fijo también retrasaría la vuelta del
   * lift al salir del hover (card colgada hasta 0.6s). */
  const [entro, setEntro] = useState(false);

  return (
    /* La entrada se declara SIEMPRE, aunque no haya movimiento: con reduced
     * motion la duración cae a 0 y la card aparece directo en su estado
     * final. Si en cambio se quitara `whileInView`, la card quedaría clavada
     * en el estado inicial (opacidad 0) para siempre. */
    <motion.li
      initial={OCULTO}
      whileInView={VISIBLE}
      viewport={VIEWPORT}
      onAnimationComplete={() => setEntro(true)}
      transition={
        !animado
          ? { duration: 0 }
          : entro
            ? { duration: DURACION_REPOSO, ease: EASE_BLOQUE }
            : transicionCard(indice)
      }
      whileHover={animado ? LIFT_HOVER : undefined}
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      className={`relative overflow-hidden bg-negro p-px ${
        destacada ? "rounded-feature" : "rounded-card"
      } ${className}`}
    >
      {animado && (
        <BordeVivo
          tactil={tactil}
          hover={hover}
          delay={delayStagger(indice)}
        />
      )}
      <div
        className={`relative z-[1] flex h-full flex-col overflow-hidden bg-carbon ${
          destacada ? "rounded-[37px]" : "rounded-[11px]"
        }`}
      >
        {item.image && (
          <Foto item={item as MenuItem & { image: string }} destacada={destacada} />
        )}
        <Contenido item={item} destacada={destacada} />
      </div>
    </motion.li>
  );
}

function GrillaSeccion({
  section,
  tactil,
  animado,
}: {
  section: MenuSectionData;
  tactil: boolean;
  animado: boolean;
}) {
  const { destacado, resto } = ordenarConDestacado(section.items);
  /* La columna angosta lleva dos cards apiladas contra la destacada; el
   * row-span solo tiene sentido si hay con qué llenarla. */
  const columna = destacado ? resto.slice(0, 2) : [];
  const filas = enFilas(destacado ? resto.slice(2) : resto, POR_FILA);
  let indice = 0;

  return (
    <div className="mt-64">
      <h3 className="font-display uppercase leading-heading tracking-display text-brasa text-[40px]">
        {section.title}
      </h3>

      {destacado && (
        <ul className="mt-24 grid gap-20 lg:grid-cols-[8fr_5fr]">
          <Card
            item={destacado}
            destacada
            indice={indice++}
            tactil={tactil}
            animado={animado}
            className={columna.length === 2 ? "lg:row-span-2" : ""}
          />
          {columna.map((item) => (
            <Card
              key={item.name}
              item={item}
              indice={indice++}
              tactil={tactil}
              animado={animado}
            />
          ))}
        </ul>
      )}

      {filas.map((fila, f) => (
        <ul
          key={f}
          className="mt-20 grid gap-20 lg:grid-cols-[5fr_4fr_4fr]"
        >
          {fila.map((item, i) => (
            <Card
              key={item.name}
              item={item}
              indice={indice++}
              tactil={tactil}
              animado={animado}
              /* La del medio cuelga: es el desfasaje que rompe la tabla. */
              className={i === 1 ? "lg:mt-56" : ""}
            />
          ))}
        </ul>
      ))}
    </div>
  );
}

export default function MenuSeccion({
  menu,
  numero,
}: {
  menu: MenuSectionData[];
  numero: number;
}) {
  const reducirMovimiento = useReducedMotion();

  /* Sin hover real (táctil), el borde vivo se enciende una vez al entrar la
   * card al viewport en lugar de esperar un hover que nunca llega. */
  const [tactil, setTactil] = useState(false);
  /* La preferencia de movimiento no existe en el servidor: se decide después
   * del montaje para no romper la hidratación (ver RevelarLineas). */
  const [sinMovimiento, setSinMovimiento] = useState(false);
  useLayoutEffectSeguro(() => {
    if (reducirMovimiento) setSinMovimiento(true);
  }, [reducirMovimiento]);
  useEffect(() => {
    setTactil(window.matchMedia("(hover: none)").matches);
  }, []);

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
          <GrillaSeccion
            key={section.title}
            section={section}
            tactil={tactil}
            animado={!sinMovimiento}
          />
        ))}
      </div>
    </section>
  );
}
