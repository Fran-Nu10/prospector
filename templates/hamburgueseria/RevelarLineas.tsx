"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { DURACION_TEXTO, EASE_TEXTO, VIEWPORT } from "./animacion";

/*
 * Reveal de texto línea por línea (referencia: Vivid+Co — vividand.co).
 *
 * Cada línea VISUAL del bloque sube unos px y hace fade, con un stagger corto
 * entre líneas. El timing es el de la referencia: 0.5s con curva `ease`, y solo
 * se animan transform (translateY) y opacity — cero reflow, todo en GPU.
 *
 * Las líneas no se pueden conocer sin layout, así que el primer render (y el
 * SSR) pinta el texto plano y en `useLayoutEffect` se miden los cortes reales
 * con la Range API; recién ahí se parte en un span por línea. Si el ancho
 * cambia (rotación / resize) se vuelve a medir, ya sin re-animar.
 *
 * prefers-reduced-motion: no se parte ni se anima nada, el texto se pinta
 * directo en su estado final (y el CSS de `theme.css` cubre el HTML del SSR,
 * que no puede conocer la preferencia del usuario).
 */

const useLayoutEffectSeguro =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

type Etiqueta = "p" | "h1" | "h2" | "h3" | "span";

/**
 * Devuelve el texto cortado en sus líneas visuales reales. Recorre palabra por
 * palabra con un Range: cuando el `top` del rect salta, arrancó una línea nueva.
 * Devuelve null si el elemento no contiene un único nodo de texto.
 */
function medirLineas(el: HTMLElement): string[] | null {
  const nodo = el.firstChild;
  if (!nodo || nodo.nodeType !== Node.TEXT_NODE) return null;

  const texto = nodo.textContent ?? "";
  if (!texto.trim()) return null;

  const rango = document.createRange();
  const lineas: string[] = [];
  const palabra = /\S+/g;
  let inicioLinea = 0;
  let topLinea: number | null = null;
  let m: RegExpExecArray | null;

  while ((m = palabra.exec(texto)) !== null) {
    rango.setStart(nodo, m.index);
    rango.setEnd(nodo, m.index + m[0].length);
    const rects = rango.getClientRects();
    if (rects.length === 0) continue;

    const top = rects[0].top;
    if (topLinea === null) {
      topLinea = top;
    } else if (top - topLinea > 1) {
      lineas.push(texto.slice(inicioLinea, m.index).trim());
      inicioLinea = m.index;
      topLinea = top;
    }
  }

  lineas.push(texto.slice(inicioLinea).trim());
  const limpias = lineas.filter(Boolean);
  return limpias.length > 0 ? limpias : null;
}

export function RevelarLineas({
  texto,
  as: Tag = "p",
  className,
  retraso = 0,
  paso = 0.06,
  desplazamiento = 14,
  enVista = false,
}: {
  texto: string;
  as?: Etiqueta;
  className?: string;
  /** Retraso base del bloque, en segundos. */
  retraso?: number;
  /** Stagger entre líneas, en segundos. */
  paso?: number;
  /** Cuántos px sube cada línea al entrar. */
  desplazamiento?: number;
  /** Dispara al entrar en viewport (secciones) en vez de al montar (hero). */
  enVista?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [lineas, setLineas] = useState<string[] | null>(null);
  // La preferencia de movimiento no se puede leer en el servidor: si se ramifica
  // en el render, el HTML del SSR no coincide con el del cliente y React tira el
  // árbol. Por eso se decide DESPUÉS del montaje, vía estado.
  const [sinMovimiento, setSinMovimiento] = useState(false);
  const yaEntro = useRef(false);
  const anchoMedido = useRef(0);
  const reducirMovimiento = useReducedMotion();

  useLayoutEffectSeguro(() => {
    if (reducirMovimiento) {
      setSinMovimiento(true);
      return;
    }
    if (lineas !== null) return;
    const el = ref.current;
    if (!el) return;
    anchoMedido.current = el.clientWidth;
    setLineas(medirLineas(el) ?? [texto]);
  }, [lineas, reducirMovimiento, texto]);

  // Si cambia el ancho, los cortes medidos dejan de valer: se vuelve al texto
  // plano y el layout effect los recalcula en el frame siguiente.
  useEffect(() => {
    if (reducirMovimiento) return;
    let id = 0;
    const alRedimensionar = () => {
      window.clearTimeout(id);
      id = window.setTimeout(() => {
        const el = ref.current;
        if (!el || el.clientWidth === anchoMedido.current) return;
        setLineas(null);
      }, 150);
    };
    window.addEventListener("resize", alRedimensionar);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", alRedimensionar);
    };
  }, [reducirMovimiento]);

  if (sinMovimiento) {
    return <Tag className={className}>{texto}</Tag>;
  }

  // Render de medición (y el que sale por SSR, idéntico en cliente y servidor).
  // Arranca oculto para que el texto no aparezca de golpe antes de animar; si ya
  // entró (remedición por resize) se mantiene visible. Para quien pidió menos
  // movimiento, el CSS de globals.css lo fuerza visible hasta que monta.
  if (lineas === null) {
    return (
      <Tag
        ref={ref as React.Ref<never>}
        data-revelar=""
        className={className}
        style={{ opacity: yaEntro.current ? 1 : 0 }}
      >
        {texto}
      </Tag>
    );
  }

  const oculto = yaEntro.current
    ? { opacity: 1, y: 0 }
    : { opacity: 0, y: desplazamiento };
  const visible = { opacity: 1, y: 0 };

  return (
    <Tag ref={ref as React.Ref<never>} className={className}>
      {lineas.map((linea, i) => (
        <motion.span
          key={`${i}-${linea}`}
          data-revelar=""
          className="block"
          initial={oculto}
          {...(enVista
            ? {
                whileInView: visible,
                viewport: VIEWPORT,
              }
            : { animate: visible })}
          transition={{
            duration: DURACION_TEXTO,
            ease: EASE_TEXTO,
            delay: retraso + i * paso,
          }}
          onAnimationComplete={
            i === lineas.length - 1
              ? () => {
                  yaEntro.current = true;
                }
              : undefined
          }
        >
          {linea}
        </motion.span>
      ))}
    </Tag>
  );
}

/**
 * Misma entrada (fade + subida) para un bloque que no es texto — los CTA del
 * hero, que cierran la cascada.
 */
export function RevelarBloque({
  children,
  className,
  retraso = 0,
  desplazamiento = 14,
  enVista = false,
}: {
  children: ReactNode;
  className?: string;
  retraso?: number;
  desplazamiento?: number;
  enVista?: boolean;
}) {
  const reducirMovimiento = useReducedMotion();

  // Mismo markup en servidor y cliente (ver nota de hidratación en
  // RevelarLineas): con menos movimiento no se ramifica el render, solo se
  // colapsa la duración a 0 — y el CSS cubre el rato previo al montaje.
  return (
    <motion.div
      data-revelar=""
      className={className}
      initial={{ opacity: 0, y: desplazamiento }}
      {...(enVista
        ? {
            whileInView: { opacity: 1, y: 0 },
            viewport: VIEWPORT,
          }
        : { animate: { opacity: 1, y: 0 } })}
      transition={
        reducirMovimiento
          ? { duration: 0, delay: 0 }
          : { duration: DURACION_TEXTO, ease: EASE_TEXTO, delay: retraso }
      }
    >
      {children}
    </motion.div>
  );
}
