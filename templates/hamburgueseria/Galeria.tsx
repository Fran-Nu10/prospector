"use client";

import { useState } from "react";
import { motion } from "motion/react";
import SeccionTitulo from "./SeccionTitulo";
import {
  DURACION_REPOSO,
  EASE_BLOQUE,
  LIFT_HOVER,
  OCULTO,
  VIEWPORT,
  VISIBLE,
  transicionCard,
} from "./animacion";

/*
 * Sección GALERÍA / AMBIENTE.
 *
 * Las fotos van en máscaras orgánicas irregulares (lo pide el DESIGN.md:
 * "fotos de comida en máscaras orgánicas cerca del display; rectángulos
 * limpios solo dentro de las cards de producto"). La primera rompe la grilla
 * ocupando dos columnas — el mismo recurso de ritmo que usa el menú con su
 * ítem destacado.
 *
 * Acá NO se usa CardViva: el borde vivo necesita un borde recto para que el
 * arco se lea, y estas fotos son blobs sin card debajo. El lenguaje se
 * mantiene por los otros tres canales: entrada con stagger, lift en hover y
 * zoom sutil de la foto (el mismo 1.05 / 0.55s que las fotos del menú).
 */

/* Máscaras orgánicas para la galería (rotan por índice). */
const BLOB_MASKS = [
  "58% 42% 55% 45% / 55% 48% 52% 45%",
  "45% 55% 48% 52% / 42% 56% 44% 58%",
  "52% 48% 60% 40% / 55% 45% 55% 45%",
];

function Foto({
  src,
  alt,
  indice,
  destacada,
}: {
  src: string;
  alt: string;
  indice: number;
  destacada: boolean;
}) {
  const [hover, setHover] = useState(false);
  const [entro, setEntro] = useState(false);

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
      className={`overflow-hidden ${destacada ? "col-span-2" : ""}`}
      style={{ borderRadius: BLOB_MASKS[indice % BLOB_MASKS.length] }}
    >
      <motion.img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={`w-full object-cover ${destacada ? "aspect-[2/1]" : "aspect-square"}`}
        initial={false}
        animate={{ scale: hover ? 1.05 : 1 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
      />
    </motion.li>
  );
}

export default function Galeria({
  gallery,
  nombre,
}: {
  gallery: string[];
  /** Nombre del negocio, para el alt de cada foto. */
  nombre: string;
}) {
  return (
    <section className="bg-carbon py-80 md:py-100">
      <div className="mx-auto max-w-[1280px] px-20">
        <SeccionTitulo eyebrow="El ambiente" titulo="El local de noche" />
        <ul className="mt-40 grid grid-cols-2 gap-16 md:grid-cols-3">
          {gallery.map((src, i) => (
            <Foto
              key={src}
              src={src}
              alt={`${nombre} — foto ${i + 1}`}
              indice={i}
              destacada={i === 0}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
