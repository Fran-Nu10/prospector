"use client";

import Image from "next/image";
import type { ClientData } from "../../web/lib/schema";
import { RevelarBloque, RevelarLineas } from "./RevelarLineas";
import { ALTO_ARMADO, ANCHO_CAPAS, CAPAS } from "./capas";
import { dividirNombre, tamanoSangrado } from "./tipografia";

/*
 * HERO — el póster.
 *
 * Tres decisiones que definen la composición:
 *
 * 1. SANGRADO. El nombre parte en dos líneas que cortan contra los dos bordes
 *    del viewport. No hay ancho de contenido acá: la tinta manda. El tamaño
 *    sale de la cantidad de caracteres de cada línea (ver tipografia.ts), así
 *    "Ejemplo Burger" y "Parrilla Don Aníbal" sangran igual.
 *
 * 2. CORREDOR. Entre las dos líneas queda un espacio vacío —`--corredor`— por
 *    el que cruza la burger. Cruza por el hueco y por los contrafuertes de las
 *    letras, nunca por el centro de los caracteres: el nombre tiene que
 *    leerse entero. Toda la geometría de la burger se deriva del corredor y
 *    del tamaño de la primera línea, así que la relación se mantiene a
 *    cualquier ancho.
 *
 * 3. ANCLAJE. El CTA no flota sobre el tipo: baja a una franja inferior con
 *    hairline negra arriba, junto a los datos en mono. Es el pie del cartel.
 *
 * La burger de acá está QUIETA y armada. El movimiento vive en la firma.
 */

/* Proporciones derivadas del corredor y de la primera línea. La burger
 * sobresale del corredor un 11.7% del cuerpo de la línea 1 por arriba y por
 * abajo: entra en el espacio interlineal sin tocar los caracteres. */
const ASOMO = 0.117;
const ASPECTO_BURGER = ANCHO_CAPAS / ALTO_ARMADO;

function Franja({
  children,
  numero,
}: {
  children: React.ReactNode;
  numero: string;
}) {
  return (
    <RevelarBloque
      retraso={0.46}
      className="flex flex-wrap items-center gap-x-24 gap-y-16 border-t border-negro px-20 py-20 md:gap-x-40 md:px-40"
    >
      {children}
      <span className="ml-auto font-mono text-body-sm font-bold text-hueso">
        {numero}
      </span>
    </RevelarBloque>
  );
}

export default function Hero({
  data,
  numero,
  hrefPedido,
}: {
  data: ClientData;
  /** Numeral de la sección, calculado por la plantilla. */
  numero: string;
  /** Acción primaria de la página (WhatsApp si el prospecto lo tiene). */
  hrefPedido?: string;
}) {
  const lineas = dividirNombre(data.name);
  const tamano1 = tamanoSangrado(lineas[0], 28);
  const tamano2 = lineas[1] ? tamanoSangrado(lineas[1], 28) : null;

  /* El alto de la caja de la burger es el corredor más lo que asoma a cada
   * lado; el ancho sale del aspecto del stack armado; y el top la sube hasta
   * que ese asomo muerda el final de la primera línea. */
  const altoBurger = `var(--corredor) + ${(2 * ASOMO).toFixed(3)} * ${tamano1}`;
  const topBurger = `calc(${(0.95 - ASOMO).toFixed(3)} * ${tamano1})`;

  /* Resumen de horario para la franja: el último tramo cargado es el que
   * interesa en una hamburguesería nocturna (el del fin de semana). */
  const ultimoHorario = data.hours?.[data.hours.length - 1];

  return (
    <section className="relative bg-noche [--corredor:26vw] md:[--corredor:18vw]">
      {/* Cabecera de cartel: de qué es y dónde queda. */}
      <RevelarBloque
        retraso={0.04}
        className="flex items-baseline justify-between gap-16 px-20 py-24 md:px-40"
      >
        {data.tagline && (
          <span className="font-mono text-body-sm uppercase tracking-[0.22em] text-rescoldo">
            {data.tagline}
          </span>
        )}
        <span className="ml-auto shrink-0 font-mono text-body-sm tracking-[0.22em] text-rescoldo">
          MVD · UY
        </span>
      </RevelarBloque>

      {/* El nombre, sangrado, con la burger cruzando el corredor. */}
      <div className="relative mt-12">
        {/* El nombre partido se lee dos veces si se deja al alcance del
            lector de pantalla: la versión visual va oculta a accesibilidad y
            el nombre entero viaja en un span solo para AT. */}
        <h1 className="relative z-[1]">
          <span className="sr-only">{data.name}</span>
          <span aria-hidden>
            <RevelarLineas
              as="span"
              texto={lineas[0]}
              retraso={0.1}
              desplazamiento={18}
              className="block whitespace-nowrap text-center font-display uppercase leading-heading tracking-display text-hueso"
              style={{ fontSize: tamano1 }}
            />
            <span className="block h-[var(--corredor)]" />
            {lineas[1] && tamano2 && (
              <RevelarLineas
                as="span"
                texto={lineas[1]}
                retraso={0.2}
                desplazamiento={18}
                className="block whitespace-nowrap text-center font-display uppercase leading-heading tracking-display text-brasa"
                style={{ fontSize: tamano2 }}
              />
            )}
          </span>
        </h1>

        {/* Corrida del centro: el eje desplazado es lo que le da tensión al
            conjunto. z-[2] la deja por delante del tipo. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-[46%] z-[2] -translate-x-1/2"
          style={{
            top: topBurger,
            height: `calc(${altoBurger})`,
            width: `calc(${ASPECTO_BURGER.toFixed(4)} * (${altoBurger}))`,
          }}
        >
          {CAPAS.map((capa) => (
            <Image
              key={capa.src}
              src={capa.src}
              width={ANCHO_CAPAS}
              height={capa.alto}
              alt=""
              sizes="(min-width: 768px) 30vw, 40vw"
              draggable={false}
              /* La burger es el elemento firma y está en el primer viewport:
                 eager para que no dependa del lazy loading. */
              loading="eager"
              className="absolute left-0 h-auto w-full select-none"
              style={{
                top: `${((capa.topArmado / ALTO_ARMADO) * 100).toFixed(3)}%`,
                zIndex: capa.z,
              }}
            />
          ))}
        </div>
      </div>

      {/* Copy nocturno: secundario, alineado al borde derecho. El nombre
          manda; esto lo remata. */}
      {data.hero?.heading && (
        <div className="flex justify-end px-20 pb-56 pt-32 md:px-40">
          <div className="max-w-[560px] text-right">
            <RevelarLineas
              texto={data.hero.heading}
              retraso={0.34}
              desplazamiento={16}
              className="font-display uppercase leading-heading tracking-display text-rescoldo text-[clamp(40px,5vw,48px)]"
            />
            {data.hero.sub && (
              <RevelarLineas
                texto={data.hero.sub}
                retraso={0.42}
                className="mt-16 text-body-sm leading-body text-rescoldo"
              />
            )}
          </div>
        </div>
      )}

      <Franja numero={numero}>
        {hrefPedido && (
          <a
            href={hrefPedido}
            className="inline-block rounded-button border border-negro bg-brasa px-32 py-16 text-body font-bold text-hueso"
          >
            Pedir por WhatsApp
          </a>
        )}
        {ultimoHorario && (
          <span className="font-mono text-body-sm uppercase text-hueso">
            {ultimoHorario.day} · {ultimoHorario.open}
          </span>
        )}
        {data.address && (
          <span className="font-mono text-body-sm uppercase text-rescoldo">
            {data.address}
          </span>
        )}
      </Franja>
    </section>
  );
}
