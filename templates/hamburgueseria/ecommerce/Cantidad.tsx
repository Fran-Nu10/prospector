"use client";

/*
 * CANTIDAD — el mismo control en la hoja de producto y en el carrito.
 *
 * Botones de verdad (no divs con onClick) para que funcionen con teclado y con
 * lector de pantalla, área táctil de 44px, y el número se anuncia como texto
 * vivo: quien no ve la pantalla se entera de que pasó de 2 a 3.
 */

export default function Cantidad({
  valor,
  onCambiar,
  minimo = 1,
  maximo = 99,
  etiqueta,
  compacto = false,
}: {
  valor: number;
  onCambiar: (valor: number) => void;
  minimo?: number;
  maximo?: number;
  /** Nombre del producto: sin esto, "Sumar uno" no dice de qué. */
  etiqueta: string;
  compacto?: boolean;
}) {
  const lado = compacto ? "h-[36px] w-[36px]" : "h-[44px] w-[44px]";

  return (
    <div className="inline-flex items-center border border-negro">
      <button
        type="button"
        onClick={() => onCambiar(valor - 1)}
        disabled={valor <= minimo}
        aria-label={`Quitar uno de ${etiqueta}`}
        className={`${lado} inline-flex items-center justify-center font-mono text-body text-hueso disabled:text-rescoldo disabled:opacity-30`}
      >
        −
      </button>
      <span
        aria-live="polite"
        className={`min-w-[36px] text-center font-mono ${
          compacto ? "text-body-sm" : "text-body"
        } font-bold text-hueso`}
      >
        {valor}
      </span>
      <button
        type="button"
        onClick={() => onCambiar(valor + 1)}
        disabled={valor >= maximo}
        aria-label={`Sumar uno de ${etiqueta}`}
        className={`${lado} inline-flex items-center justify-center font-mono text-body text-hueso disabled:text-rescoldo disabled:opacity-30`}
      >
        +
      </button>
    </div>
  );
}
