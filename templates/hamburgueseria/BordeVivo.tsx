"use client";

import { motion } from "motion/react";
import { VIEWPORT } from "./animacion";

/*
 * "BORDE VIVO" — la firma de interacción de la plantilla.
 *
 * En reposo la card es plana (carbón sobre hairline negra). Al hover, un arco
 * de luz brasa→queso recorre el borde como un neón encendiéndose. Es el ÚNICO
 * brillo permitido en el sistema (ver DESIGN.md: "nada de sombras, glows ni
 * gradientes" — esta es la excepción explícita).
 *
 * En táctil no hay hover: el arco da una sola vuelta cuando la card entra al
 * viewport y deja un rim tenue encendido.
 *
 * Se usa envolviendo el contenido en un contenedor `relative overflow-hidden
 * bg-negro p-px`: el padding de 1px es lo que deja ver el borde por debajo.
 *
 * Extraído de MenuSeccion.tsx sin cambios de comportamiento para que reseñas,
 * galería, horarios y "cómo pedir" usen exactamente el mismo efecto.
 */

/* Arco de luz que recorre el borde: cola brasa → cabeza queso. */
const ARCO_NEON =
  "conic-gradient(from 0deg, transparent 0deg, transparent 245deg, var(--color-brasa) 300deg, var(--color-queso) 348deg, transparent 360deg)";

/* Rim completo, tenue — estado encendido que queda tras el arco. */
const RIM_NEON =
  "linear-gradient(120deg, var(--color-brasa), var(--color-queso))";

export default function BordeVivo({
  tactil,
  hover,
  delay,
}: {
  /** Sin hover real: el arco se dispara al entrar al viewport. */
  tactil: boolean;
  /** Puntero encima (ignorado en táctil). */
  hover: boolean;
  /** Stagger de la card, para que el arco siga a su entrada. */
  delay: number;
}) {
  const claseArco =
    "pointer-events-none absolute left-1/2 top-1/2 block aspect-square w-[250%]";
  const claseRim = "pointer-events-none absolute inset-0 block";
  const estiloArco = {
    x: "-50%",
    y: "-50%",
    background: ARCO_NEON,
  } as const;

  if (tactil) {
    return (
      <>
        <motion.span
          aria-hidden
          className={claseArco}
          style={estiloArco}
          initial={{ opacity: 0, rotate: 0 }}
          whileInView={{ opacity: [0, 1, 1, 0], rotate: 360 }}
          viewport={VIEWPORT}
          transition={{
            delay: delay + 0.25,
            duration: 1.8,
            ease: "linear",
            opacity: {
              delay: delay + 0.25,
              duration: 1.8,
              times: [0, 0.15, 0.7, 1],
            },
          }}
        />
        <motion.span
          aria-hidden
          className={claseRim}
          style={{ background: RIM_NEON }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 0.45 }}
          viewport={VIEWPORT}
          transition={{ delay: delay + 1.6, duration: 0.5, ease: "easeOut" }}
        />
      </>
    );
  }

  return (
    <>
      <motion.span
        aria-hidden
        className={claseArco}
        style={estiloArco}
        initial={{ opacity: 0, rotate: 0 }}
        animate={
          hover
            ? {
                opacity: 1,
                /* Keyframes explícitos: cada hover arranca la vuelta en 0°
                 * (sin ellos, un re-hover rápido loopea desde media vuelta). */
                rotate: [0, 360],
                transition: {
                  opacity: { duration: 0.35, ease: "easeOut" },
                  rotate: { duration: 2.2, ease: "linear", repeat: Infinity },
                },
              }
            : {
                opacity: 0,
                rotate: 0,
                transition: {
                  opacity: { duration: 0.25 },
                  /* El reset a 0° espera a que termine el fade: si no, el
                   * arco salta de ángulo mientras todavía se ve. */
                  rotate: { duration: 0, delay: 0.25 },
                },
              }
        }
      />
      <motion.span
        aria-hidden
        className={claseRim}
        style={{ background: RIM_NEON }}
        initial={{ opacity: 0 }}
        animate={{
          opacity: hover ? 0.4 : 0,
          transition: { duration: 0.35, ease: "easeOut" },
        }}
      />
    </>
  );
}
