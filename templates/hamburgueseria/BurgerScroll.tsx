"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  easeOut,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

/*
 * Construcción de la hamburguesa por scroll.
 *
 * Un track alto (180vh) con un contenedor sticky: mientras el usuario
 * scrollea el track, las 6 capas viajan desde una "exploded view" hasta
 * quedar apiladas. Solo se anima transform (translate/rotate) — nada de
 * top/margin, cero reflow. Con prefers-reduced-motion se muestra la
 * burger ya armada, sin animación.
 *
 * Las capas son assets de la PLANTILLA (no datos del cliente): la misma
 * burger genérica sirve para todos los prospectos del vertical.
 */

// En el servidor no existe layout: useLayoutEffect avisaría por consola.
const useLayoutEffectSeguro =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const ANCHO_DISENO = 1024; // px — ancho original de las capas
const ALTO_ARMADA = 682; // px — alto del stack armado en espacio de diseño

interface Capa {
  src: string;
  alto: number; // alto natural del PNG (px)
  top: number; // posición final apilada (px, espacio de diseño)
  z: number;
  inicialY: string; // translateY inicial (% del alto propio) — exploded
  inicialX: string; // leve dispersión horizontal
  rotacion: number; // grados iniciales
  ventana: [number, number]; // tramo del progress en que esta capa viaja
}

/* Las de abajo llegan antes (ventanas más tempranas): se arma de abajo
 * hacia arriba. */
const CAPAS: Capa[] = [
  // prettier-ignore
  { src: "/hamburgueseria/capas/capa-1-pan-arriba.png", alto: 206, top: 0,   z: 6, inicialY: "-115%", inicialX: "-4%", rotacion: -5, ventana: [0.4, 1.0] },
  { src: "/hamburgueseria/capas/capa-2-bacon.png",      alto: 189, top: 105, z: 5, inicialY: "-72%",  inicialX: "3%",  rotacion: 4,  ventana: [0.32, 0.91] },
  { src: "/hamburgueseria/capas/capa-3-tomate.png",     alto: 157, top: 195, z: 4, inicialY: "-30%",  inicialX: "-2%", rotacion: -3, ventana: [0.24, 0.82] },
  { src: "/hamburgueseria/capas/capa-4-medallon.png",   alto: 232, top: 260, z: 3, inicialY: "22%",   inicialX: "2%",  rotacion: 3,  ventana: [0.16, 0.73] },
  { src: "/hamburgueseria/capas/capa-5-lechuga.png",    alto: 250, top: 365, z: 2, inicialY: "68%",   inicialX: "-3%", rotacion: -4, ventana: [0.08, 0.64] },
  { src: "/hamburgueseria/capas/capa-6-pan-abajo.png",  alto: 207, top: 475, z: 1, inicialY: "140%",  inicialX: "4%",  rotacion: 5,  ventana: [0.0, 0.55] },
];

function estiloPosicion(capa: Capa): React.CSSProperties {
  return {
    top: `${(capa.top / ALTO_ARMADA) * 100}%`,
    zIndex: capa.z,
  };
}

function ImagenCapa({ capa }: { capa: Capa }) {
  return (
    <Image
      src={capa.src}
      width={ANCHO_DISENO}
      height={capa.alto}
      alt=""
      sizes="(min-width: 1024px) 440px, 90vw"
      className="h-auto w-full select-none"
      draggable={false}
      // La burger es el elemento firma del hero y está en el primer
      // viewport: eager (sin preload) para que no quede a merced del
      // lazy loading dentro del contenedor transformado.
      loading="eager"
    />
  );
}

function CapaAnimada({
  capa,
  progreso,
}: {
  capa: Capa;
  progreso: MotionValue<number>;
}) {
  const y = useTransform(progreso, capa.ventana, [capa.inicialY, "0%"], {
    ease: easeOut,
  });
  const x = useTransform(progreso, capa.ventana, [capa.inicialX, "0%"], {
    ease: easeOut,
  });
  const rotate = useTransform(progreso, capa.ventana, [capa.rotacion, 0], {
    ease: easeOut,
  });

  return (
    <motion.div
      className="absolute left-0 w-full"
      style={{ ...estiloPosicion(capa), y, x, rotate }}
    >
      <ImagenCapa capa={capa} />
    </motion.div>
  );
}

/** Burger armada estática (reduced motion o cualquier fallback). */
function BurgerArmada() {
  return (
    <div
      className="relative mx-auto w-full max-w-[440px]"
      style={{ aspectRatio: `${ANCHO_DISENO} / ${ALTO_ARMADA}` }}
    >
      {CAPAS.map((capa) => (
        <div
          key={capa.src}
          className="absolute left-0 w-full"
          style={estiloPosicion(capa)}
        >
          <ImagenCapa capa={capa} />
        </div>
      ))}
    </div>
  );
}

export default function BurgerScroll() {
  const trackRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const reducirMovimiento = useReducedMotion();

  // La preferencia de movimiento no se puede leer en el servidor: si se ramifica
  // en el render, el HTML del SSR (el track) no coincide con el del cliente (la
  // burger armada) y React descarta el árbol. Por eso se decide DESPUÉS del
  // montaje, vía estado, y en un layout effect para que el cambio ocurra antes
  // del primer pintado: nadie llega a ver el track ni el salto de altura.
  const [sinMovimiento, setSinMovimiento] = useState(false);
  useLayoutEffectSeguro(() => {
    if (reducirMovimiento) setSinMovimiento(true);
  }, [reducirMovimiento]);

  // Progreso 0→1 del track calculado a mano (listener pasivo + rAF):
  // una sola lectura de layout por frame, y el movimiento es puro transform.
  const crudo = useMotionValue(0);
  useEffect(() => {
    if (sinMovimiento) return;
    const track = trackRef.current;
    if (!track) return;
    let rafId = 0;
    const medir = () => {
      // El recorrido real del pin es track − sticky (en mobile el stage
      // es más bajo que el viewport, así que no sirve innerHeight).
      const alturaSticky = stickyRef.current?.offsetHeight ?? window.innerHeight;
      const total = track.offsetHeight - alturaSticky;
      const p =
        total > 0
          ? Math.min(1, Math.max(0, -track.getBoundingClientRect().top / total))
          : 1;
      crudo.set(p);
    };
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(medir);
    };
    medir();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [crudo, sinMovimiento]);

  const progreso = useSpring(crudo, {
    stiffness: 90,
    damping: 24,
    restDelta: 0.001,
  });

  if (sinMovimiento) {
    return (
      <div className="flex items-center py-40">
        <BurgerArmada />
      </div>
    );
  }

  return (
    <div
      ref={trackRef}
      id="burger-track"
      className="relative h-[95vh] md:h-[180vh]"
    >
      {/* En mobile el stage es más bajo que el viewport: la burger queda
          encuadrada sin tanto negro y la sección siguiente asoma antes. */}
      <div
        ref={stickyRef}
        // pt = alto del header sticky: que la burger dispersa no quede debajo
        className="sticky top-0 flex h-[58svh] items-center justify-center pt-[68px] md:h-svh md:pt-0"
      >
        <div
          className="relative w-full max-w-[440px]"
          style={{ aspectRatio: `${ANCHO_DISENO} / ${ALTO_ARMADA}` }}
        >
          {CAPAS.map((capa) => (
            <CapaAnimada key={capa.src} capa={capa} progreso={progreso} />
          ))}
        </div>
      </div>
    </div>
  );
}
