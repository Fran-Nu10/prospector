"use client";

import { useId } from "react";

/*
 * CAMPOS DEL PANEL — los ladrillos de todos los formularios administrativos.
 *
 * Existen para que las reglas de un formulario usable no dependan de que quien
 * escribe la pantalla se acuerde: cada campo trae SIEMPRE su `<label>` asociado
 * por id, su error al lado —no arriba de todo, no en un `alert()`— y una altura
 * mínima de 44px para que se pueda tocar con el dedo.
 *
 * El error se anuncia con `aria-invalid` + `aria-describedby`: quien navega con
 * lector de pantalla se entera de que el campo está mal cuando entra en él, no
 * cuando llega al final del formulario.
 *
 * Nada acá formatea dinero ni valida: eso es dominio. Estos son controles.
 */

const BASE_CONTROL =
  "min-h-[44px] w-full border border-negro bg-carbon px-12 py-8 text-body-sm text-hueso outline-none placeholder:text-rescoldo focus-visible:border-brasa";

function Etiqueta({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={id}
      className="font-mono text-caption uppercase tracking-[0.18em] text-rescoldo"
    >
      {children}
    </label>
  );
}

function Error({ id, mensaje }: { id: string; mensaje?: string }) {
  if (!mensaje) return null;
  return (
    <span id={id} role="alert" className="text-caption text-brasa">
      {mensaje}
    </span>
  );
}

interface BaseCampo {
  etiqueta: string;
  valor: string;
  onCambio: (valor: string) => void;
  error?: string;
  ayuda?: string;
  placeholder?: string;
  /** Modo del teclado en mobile: `decimal` para precios, `numeric` para stock. */
  inputMode?: "text" | "decimal" | "numeric";
  autoFocus?: boolean;
}

export function Texto({
  etiqueta,
  valor,
  onCambio,
  error,
  ayuda,
  placeholder,
  inputMode = "text",
  autoFocus,
}: BaseCampo) {
  const id = useId();
  return (
    <div className="flex flex-col gap-4">
      <Etiqueta id={id}>{etiqueta}</Etiqueta>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        value={valor}
        autoFocus={autoFocus}
        onChange={(e) => onCambio(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined}
        placeholder={placeholder}
        className={BASE_CONTROL}
      />
      {ayuda && !error && (
        <span id={`${id}-ayuda`} className="text-caption text-rescoldo">
          {ayuda}
        </span>
      )}
      <Error id={`${id}-error`} mensaje={error} />
    </div>
  );
}

export function AreaTexto({
  etiqueta,
  valor,
  onCambio,
  error,
  ayuda,
  placeholder,
  filas = 3,
}: Omit<BaseCampo, "inputMode" | "autoFocus"> & { filas?: number }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-4">
      <Etiqueta id={id}>{etiqueta}</Etiqueta>
      <textarea
        id={id}
        rows={filas}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        placeholder={placeholder}
        className={`${BASE_CONTROL} resize-y leading-body`}
      />
      {ayuda && !error && (
        <span className="text-caption text-rescoldo">{ayuda}</span>
      )}
      <Error id={`${id}-error`} mensaje={error} />
    </div>
  );
}

export function Selector({
  etiqueta,
  valor,
  onCambio,
  opciones,
  error,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (valor: string) => void;
  opciones: readonly { valor: string; titulo: string }[];
  error?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-4">
      <Etiqueta id={id}>{etiqueta}</Etiqueta>
      <select
        id={id}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={BASE_CONTROL}
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor} className="bg-carbon">
            {o.titulo}
          </option>
        ))}
      </select>
      <Error id={`${id}-error`} mensaje={error} />
    </div>
  );
}

export function Interruptor({
  etiqueta,
  detalle,
  valor,
  onCambio,
}: {
  etiqueta: string;
  detalle?: string;
  valor: boolean;
  onCambio: (valor: boolean) => void;
}) {
  const id = useId();
  /* El detalle va como DESCRIPCIÓN, no dentro del `<label>`: si formara parte
     del nombre accesible, el lector de pantalla anunciaría el interruptor
     leyendo dos renglones de explicación antes de decir si está encendido. */
  return (
    <div className="flex items-start gap-12">
      <input
        id={id}
        type="checkbox"
        checked={valor}
        onChange={(e) => onCambio(e.target.checked)}
        aria-describedby={detalle ? `${id}-detalle` : undefined}
        className="mt-4 h-20 w-20 shrink-0 accent-[color:var(--color-brasa)]"
      />
      <div className="flex flex-col gap-4">
        <label htmlFor={id} className="text-body-sm text-hueso">
          {etiqueta}
        </label>
        {detalle && (
          <span
            id={`${id}-detalle`}
            className="text-caption leading-body text-rescoldo"
          >
            {detalle}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Elección entre pocas opciones excluyentes, en botones.
 *
 * Es un `radiogroup` de verdad —no tres botones sueltos— para que las flechas
 * del teclado funcionen como la gente espera y el lector de pantalla anuncie
 * "1 de 3".
 */
export function Opciones({
  etiqueta,
  valor,
  onCambio,
  opciones,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (valor: string) => void;
  opciones: readonly { valor: string; titulo: string }[];
}) {
  return (
    <div className="flex flex-col gap-8" role="radiogroup" aria-label={etiqueta}>
      <span className="font-mono text-caption uppercase tracking-[0.18em] text-rescoldo">
        {etiqueta}
      </span>
      <div className="flex flex-wrap gap-8">
        {opciones.map((o) => {
          const activo = o.valor === valor;
          return (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => onCambio(o.valor)}
              className={`inline-flex min-h-[44px] items-center border px-16 font-mono text-caption uppercase tracking-[0.18em] ${
                activo
                  ? "border-brasa bg-carbon text-hueso"
                  : "border-negro text-rescoldo hover:text-hueso"
              }`}
            >
              {o.titulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Ruta de imagen con vista previa.
 *
 * NO hay subida de archivos: en modo demo no existe almacenamiento, y simular
 * uno —base64, blobs, un "guardado" que se pierde al recargar— sería prometer
 * algo que el producto no hace. Se escribe o se elige una ruta que ya existe, y
 * se dice con todas las letras cuándo va a haber carga de verdad.
 *
 * La vista previa usa `<img>` y no `next/image` a propósito: es una miniatura
 * de trabajo dentro del panel, no una imagen de la tienda, y no tiene por qué
 * pasar por el optimizador ni depender de la lista de dominios.
 */
export function CampoImagen({
  etiqueta,
  valor,
  onCambio,
  error,
  ayuda,
  sugerencias = [],
}: {
  etiqueta: string;
  valor: string;
  onCambio: (valor: string) => void;
  error?: string;
  ayuda?: string;
  /** Rutas que ya usa el catálogo: elegir es más rápido y seguro que tipear. */
  sugerencias?: readonly string[];
}) {
  const listaId = useId();
  const id = useId();
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Etiqueta id={id}>{etiqueta}</Etiqueta>
        <div className="flex items-start gap-12">
          <span className="flex h-56 w-56 shrink-0 items-center justify-center overflow-hidden border border-negro bg-carbon">
            {valor.trim() && !error ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={valor}
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
            ) : (
              <span className="font-mono text-caption text-rescoldo">—</span>
            )}
          </span>
          <div className="flex flex-1 flex-col gap-4">
            <input
              id={id}
              type="text"
              value={valor}
              list={sugerencias.length ? listaId : undefined}
              onChange={(e) => onCambio(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              placeholder="/hamburgueseria/platos/clasica.png"
              className={BASE_CONTROL}
            />
            {sugerencias.length > 0 && (
              <datalist id={listaId}>
                {sugerencias.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            )}
            {valor.trim() && (
              <button
                type="button"
                onClick={() => onCambio("")}
                className="self-start min-h-[32px] font-mono text-caption uppercase tracking-[0.18em] text-rescoldo underline underline-offset-4 hover:text-hueso"
              >
                Quitar
              </button>
            )}
            {ayuda && !error && (
              <span className="text-caption leading-body text-rescoldo">
                {ayuda}
              </span>
            )}
            <Error id={`${id}-error`} mensaje={error} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** La nota de almacenamiento. Solo dentro del panel; en la tienda, nunca. */
export function NotaDeArchivos() {
  return (
    <p className="border-l-2 border-queso pl-12 text-caption leading-body text-rescoldo">
      La carga de archivos se habilitará al conectar el almacenamiento
      definitivo. Por ahora se usa la ruta de una imagen que ya está en el
      sitio.
    </p>
  );
}
