"use client";

import {
  camposDeGrupo,
  nuevoId,
  tipoDeGrupo,
  type TipoDeGrupo,
} from "../../../web/lib/ecommerce/domain";
import {
  formatearPesos,
  parsearPesosConSigno,
} from "../../../web/lib/ecommerce/money";
import type { ProductOptionGroup } from "../../../web/lib/ecommerce/types";
import { Interruptor, Opciones, Texto } from "./campos";

/*
 * EDITOR DE VARIANTES Y EXTRAS — simple a propósito.
 *
 * El dominio no distingue "variante" de "extra": son el mismo grupo con otros
 * mínimos y máximos (ver `types.ts`). Acá el dueño elige "una sola" o "varias"
 * y si es obligatoria; `camposDeGrupo` traduce eso a números coherentes, así
 * que no se puede guardar un grupo que pida "entre 2 y 1".
 *
 * LOS IMPORTES SE ESCRIBEN EN PESOS y se guardan en centésimos, con la misma
 * conversión que el precio del producto. Un incremento puede ser negativo —"sin
 * queso, −20"— y por eso el parser admite signo.
 *
 * El estado se guarda como TEXTO mientras se edita. Si se guardara ya
 * convertido, borrar el último dígito de un importe lo transformaría en otro
 * número delante de los ojos de quien está escribiendo.
 */

export interface OpcionForm {
  id: string;
  name: string;
  /** En pesos, como se tipea. Vacío = sin incremento. */
  precio: string;
  available: boolean;
}

export interface GrupoForm {
  id: string;
  name: string;
  tipo: TipoDeGrupo;
  obligatorio: boolean;
  /** Solo para selección múltiple. */
  min: string;
  max: string;
  active: boolean;
  opciones: OpcionForm[];
}

/** Catálogo → formulario. */
export function aFormulario(grupos: readonly ProductOptionGroup[]): GrupoForm[] {
  return [...grupos]
    .sort((a, b) => a.position - b.position)
    .map((g) => ({
      id: g.id,
      name: g.name,
      tipo: tipoDeGrupo(g),
      obligatorio: g.minSelect > 0,
      min: String(g.minSelect),
      max: String(g.maxSelect),
      active: g.active,
      opciones: [...g.options]
        .sort((a, b) => a.position - b.position)
        .map((o) => ({
          id: o.id,
          name: o.name,
          precio: o.priceDeltaCents === 0 ? "" : formatearPesos(o.priceDeltaCents),
          available: o.available,
        })),
    }));
}

/**
 * Formulario → catálogo. Un importe ilegible se convierte en `NaN` a propósito:
 * `validarGruposDeOpciones` lo rechaza con un mensaje al lado del campo, en vez
 * de guardarse como cero y regalar el extra.
 */
export function aDominio(grupos: readonly GrupoForm[]): ProductOptionGroup[] {
  return grupos.map((g, i) => {
    const { minSelect, maxSelect } = camposDeGrupo(
      g.tipo,
      g.obligatorio,
      Number(g.min) || 0,
      Number(g.max) || 1
    );
    return {
      id: g.id,
      name: g.name.trim(),
      minSelect,
      maxSelect,
      position: i,
      active: g.active,
      options: g.opciones.map((o, j) => {
        const delta = parsearPesosConSigno(o.precio);
        return {
          id: o.id,
          name: o.name.trim(),
          priceDeltaCents: delta === null ? NaN : delta,
          available: o.available,
          position: j,
        };
      }),
    };
  });
}

export function grupoVacio(): GrupoForm {
  return {
    id: nuevoId(),
    name: "",
    tipo: "unica",
    obligatorio: false,
    min: "0",
    max: "1",
    active: true,
    opciones: [{ id: nuevoId(), name: "", precio: "", available: true }],
  };
}

const TIPOS = [
  { valor: "unica", titulo: "Una sola" },
  { valor: "multiple", titulo: "Varias" },
] as const;

export default function EditorOpciones({
  grupos,
  onCambio,
  errores,
}: {
  grupos: GrupoForm[];
  onCambio: (grupos: GrupoForm[]) => void;
  errores: Record<string, string>;
}) {
  const cambiarGrupo = (i: number, cambio: Partial<GrupoForm>) =>
    onCambio(grupos.map((g, k) => (k === i ? { ...g, ...cambio } : g)));

  const cambiarOpcion = (i: number, j: number, cambio: Partial<OpcionForm>) =>
    cambiarGrupo(i, {
      opciones: grupos[i].opciones.map((o, k) =>
        k === j ? { ...o, ...cambio } : o
      ),
    });

  return (
    <div className="flex flex-col gap-16">
      <div className="flex flex-col gap-4">
        <span className="font-mono text-caption uppercase tracking-[0.18em] text-queso">
          Variantes y extras
        </span>
        <p className="text-caption leading-body text-rescoldo">
          Una sola = el cliente elige una opción (punto de cocción). Varias =
          puede sumar las que quiera (agregados).
        </p>
      </div>

      {errores.optionGroups && (
        <p role="alert" className="text-caption text-brasa">
          {errores.optionGroups}
        </p>
      )}

      {grupos.map((grupo, i) => (
        <fieldset
          key={grupo.id}
          className="flex flex-col gap-12 border border-negro p-12"
        >
          <legend className="px-4 font-mono text-caption uppercase tracking-[0.18em] text-rescoldo">
            Grupo {i + 1}
          </legend>

          <Texto
            etiqueta="Nombre del grupo"
            valor={grupo.name}
            onCambio={(v) => cambiarGrupo(i, { name: v })}
            error={errores[`grupo.${i}.name`]}
            placeholder="Punto de cocción"
          />

          <Opciones
            etiqueta="Cuántas puede elegir"
            valor={grupo.tipo}
            onCambio={(v) => cambiarGrupo(i, { tipo: v as TipoDeGrupo })}
            opciones={TIPOS}
          />

          <Interruptor
            etiqueta="Obligatorio"
            detalle="El cliente no puede pedir el producto sin elegir."
            valor={grupo.obligatorio}
            onCambio={(v) => cambiarGrupo(i, { obligatorio: v })}
          />

          {grupo.tipo === "multiple" && (
            <div className="grid grid-cols-2 gap-12">
              <Texto
                etiqueta="Mínimo"
                inputMode="numeric"
                valor={grupo.min}
                onCambio={(v) => cambiarGrupo(i, { min: v })}
              />
              <Texto
                etiqueta="Máximo"
                inputMode="numeric"
                valor={grupo.max}
                onCambio={(v) => cambiarGrupo(i, { max: v })}
              />
            </div>
          )}

          <Interruptor
            etiqueta="Grupo activo"
            detalle="Apagado no se ofrece y deja de ser obligatorio."
            valor={grupo.active}
            onCambio={(v) => cambiarGrupo(i, { active: v })}
          />

          <div className="flex flex-col gap-8">
            <span className="font-mono text-caption uppercase tracking-[0.18em] text-rescoldo">
              Opciones
            </span>
            {errores[`grupo.${i}.options`] && (
              <p role="alert" className="text-caption text-brasa">
                {errores[`grupo.${i}.options`]}
              </p>
            )}

            {grupo.opciones.map((opcion, j) => (
              <div
                key={opcion.id}
                className="flex flex-col gap-8 border-l border-negro pl-12"
              >
                <Texto
                  etiqueta="Nombre"
                  valor={opcion.name}
                  onCambio={(v) => cambiarOpcion(i, j, { name: v })}
                  error={errores[`grupo.${i}.opcion.${j}.name`]}
                  placeholder="A punto"
                />
                <Texto
                  etiqueta="Incremento en pesos"
                  inputMode="decimal"
                  valor={opcion.precio}
                  onCambio={(v) => cambiarOpcion(i, j, { precio: v })}
                  error={errores[`grupo.${i}.opcion.${j}.priceDeltaCents`]}
                  ayuda="Vacío = sin costo. Puede ser negativo."
                  placeholder="60"
                />
                <div className="flex items-center justify-between gap-12">
                  <Interruptor
                    etiqueta="Disponible"
                    valor={opcion.available}
                    onCambio={(v) => cambiarOpcion(i, j, { available: v })}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      cambiarGrupo(i, {
                        opciones: grupo.opciones.filter((_, k) => k !== j),
                      })
                    }
                    className="min-h-[44px] font-mono text-caption uppercase tracking-[0.18em] text-rescoldo underline underline-offset-4 hover:text-hueso"
                  >
                    Quitar opción
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() =>
                cambiarGrupo(i, {
                  opciones: [
                    ...grupo.opciones,
                    { id: nuevoId(), name: "", precio: "", available: true },
                  ],
                })
              }
              className="self-start min-h-[44px] border border-negro px-16 font-mono text-caption uppercase tracking-[0.18em] text-rescoldo hover:text-hueso"
            >
              Agregar opción
            </button>
          </div>

          <button
            type="button"
            onClick={() => onCambio(grupos.filter((_, k) => k !== i))}
            className="self-start min-h-[44px] font-mono text-caption uppercase tracking-[0.18em] text-brasa underline underline-offset-4"
          >
            Quitar grupo
          </button>
        </fieldset>
      ))}

      <button
        type="button"
        onClick={() => onCambio([...grupos, grupoVacio()])}
        className="self-start min-h-[44px] border border-negro px-16 font-mono text-caption uppercase tracking-[0.18em] text-rescoldo hover:text-hueso"
      >
        Agregar grupo
      </button>
    </div>
  );
}
