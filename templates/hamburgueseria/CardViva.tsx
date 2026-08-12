"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import BordeVivo from "./BordeVivo";
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
 * Card con el lenguaje de interacción de la plantilla: entra con stagger,
 * levanta en hover y enciende el borde vivo. Es el envoltorio que usan
 * horarios, reseñas y "cómo pedir" para verse hermanas de las del menú.
 *
 * El menú NO usa este componente: su Card tiene lógica propia de foto y de
 * ítem destacado. Lo que comparten —y lo que importa que no se desincronice—
 * es BordeVivo y los tiempos de animacion.ts.
 */

export default function CardViva({
  children,
  indice = 0,
  destacada = false,
  className = "",
  as = "div",
}: {
  children: ReactNode;
  /** Posición en la grilla, define el stagger de entrada. */
  indice?: number;
  /** Radio grande (38px) en vez del de card (12px). */
  destacada?: boolean;
  className?: string;
  as?: "div" | "li";
}) {
  const [hover, setHover] = useState(false);
  /* El delay de stagger vale SOLO para la entrada: si quedara fijo como
   * transición por defecto, también retrasaría la vuelta del lift al salir
   * del hover y la card quedaría colgada hasta 0.6s. */
  const [entro, setEntro] = useState(false);
  /* Sin hover real (táctil), el borde vivo se enciende una vez al entrar al
   * viewport en lugar de esperar un hover que nunca llega. */
  const [tactil, setTactil] = useState(false);
  useEffect(() => {
    setTactil(window.matchMedia("(hover: none)").matches);
  }, []);

  const Etiqueta = as === "li" ? motion.li : motion.div;

  return (
    <Etiqueta
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
      } ${className}`}
    >
      <BordeVivo tactil={tactil} hover={hover} delay={delayStagger(indice)} />
      <div
        className={`relative z-[1] h-full bg-carbon ${
          destacada ? "rounded-[37px]" : "rounded-[11px]"
        }`}
      >
        {children}
      </div>
    </Etiqueta>
  );
}
