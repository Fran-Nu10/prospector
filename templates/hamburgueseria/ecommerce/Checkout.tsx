"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  FORMULARIO_VACIO,
  cerrarIntento,
  crearPedido,
  guardarIntento,
  leerIntento,
  montoAEnteros,
  resumenCheckout,
  validarFormulario,
  type ErroresFormulario,
  type FormularioCheckout,
} from "../../../web/lib/ecommerce/checkout";
import { formatearDinero } from "../../../web/lib/ecommerce/money";
import {
  EcommerceError,
  LIMITES,
  type DeliveryZone,
} from "../../../web/lib/ecommerce/types";
import { DURACION_EXPANSION, EASE_BLOQUE } from "../animacion";
import { textoError, textoMotivo } from "./copy";
import { useTienda } from "./TiendaProvider";

/*
 * CHECKOUT — el único lugar donde un carrito se convierte en pedido.
 *
 * Es una PÁGINA y no una tercera hoja apilada sobre producto y carrito: así
 * andan atrás y adelante del navegador, una recarga no borra lo escrito, y en
 * mobile el teclado no pelea contra un panel flotante.
 *
 * DOS PASOS, uno solo visible por vez: "entrega y datos" y "revisar". Volver al
 * primero no pierde nada — el formulario vive en un store aparte, no en el DOM.
 *
 * LO QUE ACÁ NO PASA:
 *   · no se calcula ningún importe. El subtotal viene resuelto del dominio y el
 *     total sale de `resumenCheckout`, la misma cuenta que usa el pedido;
 *   · no se decide si un producto se puede vender. Eso lo revisa el repositorio
 *     contra el catálogo vivo en el momento exacto de crear el pedido;
 *   · no se limpia el carrito hasta que el pedido EXISTE. Si la escritura falla,
 *     la persona conserva su carrito y su formulario y puede reintentar.
 */

/* ---------------------------------------------------------------------------
 * Piezas de formulario
 * ------------------------------------------------------------------------ */

function Campo({
  id,
  etiqueta,
  error,
  children,
  opcional,
}: {
  id: string;
  etiqueta: string;
  error?: string;
  children: React.ReactNode;
  opcional?: boolean;
}) {
  return (
    <div className="flex flex-col gap-8">
      <label
        htmlFor={id}
        className="font-mono text-caption uppercase tracking-[0.22em] text-rescoldo"
      >
        {etiqueta}
        {opcional && <span className="text-rescoldo/60"> · opcional</span>}
      </label>
      {children}
      {error && (
        <span
          id={`${id}-error`}
          role="alert"
          className="font-mono text-caption uppercase tracking-[0.18em] text-brasa"
        >
          {error}
        </span>
      )}
    </div>
  );
}

const CLASE_INPUT =
  "min-h-[48px] w-full border border-negro bg-carbon px-16 text-body text-hueso outline-none placeholder:text-rescoldo/40 focus-visible:border-brasa";

function Bloque({
  numero,
  titulo,
  children,
}: {
  numero: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-16 border-t border-negro pt-24">
      <h2 className="flex items-center gap-12 font-mono text-body-sm uppercase tracking-[0.22em] text-rescoldo">
        <span className="text-queso">{numero}</span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

/** Opción grande y tocable: retiro/delivery y método de pago comparten forma. */
function Opcion({
  nombre,
  valor,
  actual,
  onElegir,
  titulo,
  detalle,
  deshabilitada,
}: {
  nombre: string;
  valor: string;
  actual: string;
  onElegir: (v: string) => void;
  titulo: string;
  detalle?: string;
  deshabilitada?: boolean;
}) {
  const activa = actual === valor && !deshabilitada;
  return (
    <label
      className={`flex min-h-[56px] cursor-pointer items-center gap-16 border px-16 py-12 ${
        activa ? "border-brasa bg-carbon" : "border-negro"
      } ${deshabilitada ? "cursor-not-allowed opacity-40" : ""}`}
    >
      <input
        type="radio"
        name={nombre}
        value={valor}
        checked={activa}
        disabled={deshabilitada}
        onChange={() => onElegir(valor)}
        className="h-[18px] w-[18px] shrink-0 accent-[var(--color-brasa)]"
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-body text-hueso">{titulo}</span>
        {detalle && (
          <span className="text-body-sm text-rescoldo">{detalle}</span>
        )}
      </span>
    </label>
  );
}

/* ---------------------------------------------------------------------------
 * Resumen
 * ------------------------------------------------------------------------ */

function Resumen({
  subtotalCents,
  envioCents,
  totalCents,
  entrega,
  faltaCents,
}: {
  subtotalCents: number;
  envioCents: number;
  totalCents: number;
  entrega: "pickup" | "delivery";
  faltaCents: number;
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-baseline justify-between gap-16 text-body-sm">
        <span className="text-rescoldo">Subtotal</span>
        <span className="font-mono text-hueso">
          {formatearDinero(subtotalCents)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-16 text-body-sm">
        <span className="text-rescoldo">
          {entrega === "delivery" ? "Envío" : "Retiro en el local"}
        </span>
        <span className="font-mono text-hueso">
          {entrega === "delivery" ? formatearDinero(envioCents) : "Sin costo"}
        </span>
      </div>
      <div className="mt-8 flex items-baseline justify-between gap-16 border-t border-negro pt-16">
        <span className="font-mono text-caption uppercase tracking-[0.22em] text-rescoldo">
          Total
        </span>
        <span className="font-mono text-subheading font-bold text-hueso">
          {formatearDinero(totalCents)}
        </span>
      </div>
      {faltaCents > 0 && (
        <p className="font-mono text-caption uppercase tracking-[0.18em] text-brasa">
          Faltan {formatearDinero(faltaCents)} para el mínimo de la zona
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Checkout
 * ------------------------------------------------------------------------ */

export default function Checkout({
  nombreNegocio,
  direccion,
}: {
  nombreNegocio: string;
  /** Dirección pública del prospecto: es lo que se muestra para el retiro. */
  direccion?: string;
}) {
  const tienda = useTienda();
  const reducir = useReducedMotion();

  const [listo, setListo] = useState(false);
  const [form, setForm] = useState<FormularioCheckout>(FORMULARIO_VACIO);
  const [clientRequestId, setClientRequestId] = useState("");
  const [paso, setPaso] = useState<1 | 2>(1);
  const [errores, setErrores] = useState<ErroresFormulario>({});
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  /* El intento vive en el navegador: se lee después de montar para que el HTML
     del servidor y el primer render del cliente sean iguales. */
  useEffect(() => {
    const intento = leerIntento();
    setForm(intento.form);
    setClientRequestId(intento.clientRequestId);
    setListo(true);
  }, []);

  useEffect(() => {
    if (listo && clientRequestId) guardarIntento(form, clientRequestId);
  }, [form, clientRequestId, listo]);

  const zonas = tienda?.zonas ?? [];
  const ajustes = tienda?.ajustes ?? null;
  const cargado = tienda?.cargado ?? false;
  const carrito = tienda?.carrito;

  /* Lo decide el dominio: habilitado NO alcanza, tiene que haber una zona
     activa a la que ir. Misma pregunta en el panel, en el checkout y en el
     proveedor, contestada en un solo lugar. */
  const deliveryDisponible = tienda?.hayDelivery ?? false;
  const retiroDisponible = ajustes?.pickupEnabled !== false;
  /* El local apagó "aceptar pedidos": la carta se sigue viendo y el checkout
     también, pero confirmar queda bloqueado y se dice por qué. */
  const pausada = cargado && !(tienda?.aceptandoPedidos ?? true);

  const zonaElegida: DeliveryZone | null =
    form.entrega === "delivery"
      ? (zonas.find((z) => z.id === form.zonaId) ?? null)
      : null;

  const resumen = useMemo(
    () => resumenCheckout(carrito?.subtotalCents ?? 0, zonaElegida),
    [carrito?.subtotalCents, zonaElegida]
  );

  /* Si el delivery deja de estar disponible, el formulario vuelve a retiro en
     vez de quedarse en un estado imposible.
     OJO: solo cuando el catálogo del navegador YA se leyó. El servidor renderiza
     con el seed —que no tiene zonas—, así que sin esperar a `cargado` esto
     pisaba un delivery legítimo apenas se recargaba la página. */
  useEffect(() => {
    if (listo && cargado && form.entrega === "delivery" && !deliveryDisponible) {
      setForm((f) => ({ ...f, entrega: "pickup", zonaId: "" }));
    }
  }, [listo, cargado, form.entrega, deliveryDisponible]);

  if (!tienda) return null;

  const lineas = carrito?.lineas ?? [];
  const hayProblemas = carrito?.hayProblemas ?? false;
  const vacio = listo && lineas.length === 0;

  const contexto = {
    zonas,
    deliveryHabilitado: deliveryDisponible,
    retiroHabilitado: retiroDisponible,
    totalCents: resumen.totalCents,
    faltaParaMinimoCents: resumen.faltaParaMinimoCents,
  };

  const irARevisar = () => {
    const nuevos = validarFormulario(form, contexto);
    setErrores(nuevos);
    if (Object.keys(nuevos).length === 0) {
      setPaso(2);
      window.scrollTo({ top: 0, behavior: reducir ? "auto" : "smooth" });
    }
  };

  const confirmar = async () => {
    if (enviando || pausada) return;
    setErrorGlobal(null);

    const nuevos = validarFormulario(form, contexto);
    if (Object.keys(nuevos).length > 0) {
      setErrores(nuevos);
      setPaso(1);
      return;
    }
    if (hayProblemas || lineas.length === 0) {
      setErrorGlobal(
        "Hay productos que ya no se pueden pedir. Revisá el carrito."
      );
      return;
    }

    setEnviando(true);
    try {
      const { order } = await crearPedido(
        lineas.map((l) => ({
          lineId: l.lineId,
          productId: l.productId,
          quantity: l.quantity,
          optionIds: l.optionIds,
          notes: l.notes,
          vista: {
            nombre: l.nombre,
            precioUnitarioCents: l.unitPriceCents ?? 0,
            imagenUrl: l.imagenUrl,
          },
          agregadoEn: new Date().toISOString(),
        })),
        form,
        clientRequestId,
        resumen.totalCents
      );

      /* Recién ACÁ se limpia: el pedido ya existe. Si se limpiara antes, un
         fallo de escritura dejaría a la persona sin carrito y sin pedido. */
      cerrarIntento();
      tienda.vaciar();
      window.location.assign(`/${tienda.slug}/pedido/${order.publicToken}`);
    } catch (error) {
      setEnviando(false);
      setErrorGlobal(
        error instanceof EcommerceError
          ? textoError(error.code, error.message)
          : "No pudimos confirmar el pedido. Probá de nuevo."
      );
    }
  };

  const transicion = reducir
    ? { duration: 0 }
    : { duration: DURACION_EXPANSION, ease: EASE_BLOQUE };

  /* --- estados que no son el formulario --- */
  if (!listo) {
    return (
      <p className="py-100 text-center font-mono text-body-sm uppercase tracking-[0.22em] text-rescoldo">
        Cargando tu pedido…
      </p>
    );
  }

  if (vacio) {
    return (
      <div className="flex flex-col items-start gap-16 py-64">
        <h1 className="font-display uppercase leading-heading tracking-display text-hueso text-[clamp(32px,8vw,56px)]">
          Tu pedido está vacío
        </h1>
        <p className="text-body-sm leading-body text-rescoldo">
          Elegí algo del menú y volvé para confirmarlo.
        </p>
        <a
          href={`/${tienda.slug}#menu`}
          className="inline-flex min-h-[48px] items-center rounded-button bg-brasa px-32 text-body font-bold text-hueso"
        >
          Ver el menú
        </a>
      </div>
    );
  }

  const etiquetaPago =
    form.entrega === "delivery" ? "Efectivo al recibir" : "Pago al retirar";
  const pagaConCents = form.pagaCon.trim() ? montoAEnteros(form.pagaCon) : null;
  const vuelto =
    pagaConCents !== null && pagaConCents >= resumen.totalCents
      ? pagaConCents - resumen.totalCents
      : null;

  return (
    <div className="flex flex-col gap-32 lg:grid lg:grid-cols-12 lg:gap-40">
      <div className="lg:col-span-7">
        <ol
          aria-label="Pasos del pedido"
          className="mb-24 flex gap-24 font-mono text-caption uppercase tracking-[0.22em]"
        >
          {["Entrega y datos", "Revisar"].map((t, i) => (
            <li
              key={t}
              aria-current={paso === i + 1 ? "step" : undefined}
              className={paso === i + 1 ? "text-brasa" : "text-rescoldo"}
            >
              {String(i + 1).padStart(2, "0")} — {t}
            </li>
          ))}
        </ol>

        <motion.div
          key={paso}
          initial={reducir ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transicion}
          className="flex flex-col gap-24"
        >
          {paso === 1 ? (
            <>
              <Bloque numero="01" titulo="Cómo lo recibís">
                <div className="flex flex-col gap-12">
                  <Opcion
                    nombre="entrega"
                    valor="pickup"
                    actual={form.entrega}
                    onElegir={(v) =>
                      setForm((f) => ({ ...f, entrega: v as "pickup" }))
                    }
                    titulo="Retiro en el local"
                    detalle={direccion ?? "Sin costo · lo antes posible"}
                    deshabilitada={!retiroDisponible}
                  />
                  <Opcion
                    nombre="entrega"
                    valor="delivery"
                    actual={form.entrega}
                    onElegir={(v) =>
                      setForm((f) => ({ ...f, entrega: v as "delivery" }))
                    }
                    titulo="Delivery"
                    detalle={
                      deliveryDisponible
                        ? "Elegí tu zona"
                        : "Temporalmente no disponible"
                    }
                    deshabilitada={!deliveryDisponible}
                  />
                </div>
                {errores.entrega && (
                  <p role="alert" className="font-mono text-caption uppercase tracking-[0.18em] text-brasa">
                    {errores.entrega}
                  </p>
                )}

                {form.entrega === "delivery" && deliveryDisponible && (
                  <div className="flex flex-col gap-16">
                    <Campo id="zona" etiqueta="Zona" error={errores.zonaId}>
                      <select
                        id="zona"
                        value={form.zonaId}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, zonaId: e.target.value }))
                        }
                        className={CLASE_INPUT}
                      >
                        <option value="">Elegí una zona…</option>
                        {zonas.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.name} · {formatearDinero(z.feeCents)}
                            {z.minOrderCents > 0
                              ? ` · mínimo ${formatearDinero(z.minOrderCents)}`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </Campo>
                    <Campo id="direccion" etiqueta="Dirección" error={errores.direccion}>
                      <input
                        id="direccion"
                        type="text"
                        autoComplete="street-address"
                        value={form.direccion}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, direccion: e.target.value }))
                        }
                        placeholder="Calle, número, apartamento"
                        className={CLASE_INPUT}
                      />
                    </Campo>
                    <Campo id="referencia" etiqueta="Referencias" opcional>
                      <input
                        id="referencia"
                        type="text"
                        value={form.referencia}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, referencia: e.target.value }))
                        }
                        placeholder="Timbre, esquina, portón negro…"
                        className={CLASE_INPUT}
                      />
                    </Campo>
                  </div>
                )}
              </Bloque>

              <Bloque numero="02" titulo="Tus datos">
                <Campo id="nombre" etiqueta="Nombre" error={errores.nombre}>
                  <input
                    id="nombre"
                    type="text"
                    autoComplete="name"
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    className={CLASE_INPUT}
                  />
                </Campo>
                <Campo id="telefono" etiqueta="Teléfono" error={errores.telefono}>
                  <input
                    id="telefono"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={form.telefono}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, telefono: e.target.value }))
                    }
                    placeholder="099 123 456"
                    className={CLASE_INPUT}
                  />
                </Campo>
                <Campo id="email" etiqueta="Email" opcional error={errores.email}>
                  <input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className={CLASE_INPUT}
                  />
                </Campo>
                <Campo id="notas" etiqueta="Aclaración para el pedido" opcional>
                  <input
                    id="notas"
                    type="text"
                    maxLength={LIMITES.largoObservaciones}
                    value={form.notas}
                    onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                    placeholder="Tocar timbre, sin sal…"
                    className={CLASE_INPUT}
                  />
                </Campo>
              </Bloque>

              <Bloque numero="03" titulo="Pago">
                <div className="flex flex-col gap-12">
                  <Opcion
                    nombre="pago"
                    valor="cash"
                    actual={form.metodoPago}
                    onElegir={() => setForm((f) => ({ ...f, metodoPago: "cash" }))}
                    titulo={etiquetaPago}
                    detalle="Se abona al recibir el pedido"
                  />
                  {/* Previsto en la arquitectura, apagado sin credenciales. No se
                      simula una aprobación ni se promete un pago online. */}
                  <Opcion
                    nombre="pago"
                    valor="mercadopago"
                    actual={form.metodoPago}
                    onElegir={() => undefined}
                    titulo="Mercado Pago"
                    detalle="Temporalmente no disponible"
                    deshabilitada
                  />
                </div>

                <Campo
                  id="pagacon"
                  etiqueta="¿Con cuánto pagás?"
                  opcional
                  error={errores.pagaCon}
                >
                  <input
                    id="pagacon"
                    type="text"
                    inputMode="numeric"
                    value={form.pagaCon}
                    onChange={(e) => setForm((f) => ({ ...f, pagaCon: e.target.value }))}
                    placeholder="Dejalo vacío si no necesitás cambio"
                    className={CLASE_INPUT}
                  />
                </Campo>
                {vuelto !== null && (
                  <p className="font-mono text-body-sm text-queso">
                    Tu cambio: {formatearDinero(vuelto)}
                  </p>
                )}
              </Bloque>

              <button
                type="button"
                onClick={irARevisar}
                className="inline-flex min-h-[52px] items-center justify-center rounded-button bg-brasa px-32 text-body font-bold text-hueso"
              >
                Revisar el pedido
              </button>
            </>
          ) : (
            <>
              <Bloque numero="01" titulo="Lo que pediste">
                <ul role="list" className="flex flex-col">
                  {lineas.map((l) => (
                    <li
                      key={l.lineId}
                      className="flex items-start justify-between gap-16 border-b border-negro py-12"
                    >
                      <span className="flex min-w-0 flex-col gap-4">
                        <span className="font-mono text-body-sm uppercase tracking-[0.12em] text-hueso">
                          {l.quantity} × {l.nombre}
                        </span>
                        {l.opciones.length > 0 && (
                          <span className="text-caption text-rescoldo">
                            {l.opciones.map((o) => o.optionName).join(" · ")}
                          </span>
                        )}
                        {l.notes && (
                          <span className="text-caption italic text-rescoldo">
                            “{l.notes}”
                          </span>
                        )}
                        {!l.disponible && (
                          <span className="font-mono text-caption uppercase tracking-[0.18em] text-brasa">
                            {textoMotivo(l.motivo)}
                          </span>
                        )}
                        {l.precioCambio && l.disponible && (
                          <span className="font-mono text-caption uppercase tracking-[0.18em] text-queso">
                            Cambió de precio
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-mono text-body-sm text-hueso">
                        {l.lineTotalCents === null
                          ? "—"
                          : formatearDinero(l.lineTotalCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Bloque>

              <Bloque numero="02" titulo="Entrega y contacto">
                <dl className="flex flex-col gap-8 text-body-sm">
                  <div className="flex justify-between gap-16">
                    <dt className="text-rescoldo">Modalidad</dt>
                    <dd className="text-right text-hueso">
                      {form.entrega === "delivery"
                        ? `Delivery · ${zonaElegida?.name ?? ""}`
                        : "Retiro en el local"}
                    </dd>
                  </div>
                  {form.entrega === "delivery" && (
                    <div className="flex justify-between gap-16">
                      <dt className="text-rescoldo">Dirección</dt>
                      <dd className="text-right text-hueso">
                        {form.direccion}
                        {form.referencia && ` · ${form.referencia}`}
                      </dd>
                    </div>
                  )}
                  {form.entrega === "pickup" && direccion && (
                    <div className="flex justify-between gap-16">
                      <dt className="text-rescoldo">Retirás en</dt>
                      <dd className="text-right text-hueso">{direccion}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-16">
                    <dt className="text-rescoldo">Nombre</dt>
                    <dd className="text-right text-hueso">{form.nombre}</dd>
                  </div>
                  <div className="flex justify-between gap-16">
                    <dt className="text-rescoldo">Teléfono</dt>
                    <dd className="text-right text-hueso">{form.telefono}</dd>
                  </div>
                  {form.email && (
                    <div className="flex justify-between gap-16">
                      <dt className="text-rescoldo">Email</dt>
                      <dd className="text-right text-hueso">{form.email}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-16">
                    <dt className="text-rescoldo">Pago</dt>
                    <dd className="text-right text-hueso">
                      {etiquetaPago}
                      {pagaConCents !== null &&
                        ` · paga con ${formatearDinero(pagaConCents)}`}
                    </dd>
                  </div>
                  {form.notas && (
                    <div className="flex justify-between gap-16">
                      <dt className="text-rescoldo">Aclaración</dt>
                      <dd className="text-right text-hueso">{form.notas}</dd>
                    </div>
                  )}
                </dl>
              </Bloque>

              {pausada && (
                <p
                  role="status"
                  data-tienda-pausada
                  className="border-l-2 border-brasa pl-12 text-body-sm leading-body text-rescoldo"
                >
                  <strong className="text-hueso">
                    El local no está tomando pedidos en este momento.
                  </strong>{" "}
                  {ajustes?.closedMessage?.trim() ||
                    "Podés ver el menú y escribirnos por WhatsApp."}
                </p>
              )}

              {errorGlobal && (
                <p
                  role="alert"
                  className="border-l-2 border-brasa pl-12 text-body-sm leading-body text-rescoldo"
                >
                  {errorGlobal}
                </p>
              )}

              <div className="flex flex-col gap-12">
                <button
                  type="button"
                  onClick={confirmar}
                  disabled={enviando || hayProblemas || pausada}
                  aria-busy={enviando}
                  className="inline-flex min-h-[52px] items-center justify-center rounded-button bg-brasa px-32 text-body font-bold text-hueso disabled:bg-carbon disabled:text-rescoldo"
                >
                  {enviando ? "Enviando…" : "Confirmar pedido"}
                </button>
                <button
                  type="button"
                  onClick={() => setPaso(1)}
                  disabled={enviando}
                  className="min-h-[44px] font-mono text-body-sm uppercase tracking-[0.18em] text-rescoldo underline underline-offset-4 hover:text-hueso"
                >
                  Volver a editar
                </button>
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* Resumen: en desktop acompaña el scroll, en mobile va al final. */}
      <aside className="lg:col-span-5">
        <div className="flex flex-col gap-16 border-t border-negro pt-24 lg:sticky lg:top-[100px]">
          <h2 className="font-mono text-body-sm uppercase tracking-[0.22em] text-rescoldo">
            {nombreNegocio}
          </h2>
          <Resumen
            subtotalCents={resumen.subtotalCents}
            envioCents={resumen.deliveryFeeCents}
            totalCents={resumen.totalCents}
            entrega={form.entrega}
            faltaCents={resumen.faltaParaMinimoCents}
          />
          {hayProblemas && (
            <p className="text-body-sm leading-body text-rescoldo">
              Hay líneas que ya no se pueden pedir: quitalas desde el carrito
              para poder confirmar.
            </p>
          )}
          <a
            href={`/${tienda.slug}#menu`}
            className="min-h-[44px] font-mono text-caption uppercase tracking-[0.18em] text-rescoldo underline underline-offset-4 hover:text-hueso"
          >
            Seguir agregando
          </a>
        </div>
      </aside>
    </div>
  );
}
