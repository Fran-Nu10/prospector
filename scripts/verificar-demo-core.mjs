#!/usr/bin/env node
/**
 * Verificación del núcleo demo del ecommerce.
 *
 * No es un framework de tests: es un script que compila `web/lib/ecommerce/**`
 * con el TypeScript que ya está instalado y ejerce lo único que no se puede
 * comprobar leyendo el código —que el seed convierta bien, que un doble envío
 * no duplique, que cambiar un producto no reescriba un pedido viejo y que la
 * base se recupere si el navegador tiene basura guardada.
 *
 *     node scripts/verificar-demo-core.mjs
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = mkdtempSync(path.join(tmpdir(), "demo-core-"));
const require_ = createRequire(import.meta.url);

let fallos = 0;
const ok = (cond, mensaje) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${mensaje}`);
  if (!cond) fallos++;
};
const seccion = (t) => console.log(`\n${t}`);

/* --- 1. Compilar ---------------------------------------------------------- */

seccion("Compilación");
execFileSync(
  "npx",
  [
    "tsc",
    "lib/ecommerce/service.ts",
    "lib/ecommerce/demo/database.ts",
    "lib/ecommerce/domain.ts",
    "lib/ecommerce/money.ts",
    "--outDir", SALIDA,
    "--rootDir", RAIZ,
    "--module", "commonjs",
    "--moduleResolution", "node",
    "--target", "es2022",
    "--resolveJsonModule",
    "--esModuleInterop",
    "--skipLibCheck",
    "--strict",
  ],
  { cwd: path.join(RAIZ, "web"), stdio: "inherit" }
);
ok(true, "TypeScript compiló el núcleo sin errores");

const MOD = (rel) => path.join(SALIDA, "web/lib/ecommerce", rel);

/* --- 2. SSR: nada puede tocar `window` al importar ------------------------ */

seccion("SSR (sin window)");
{
  const { obtenerEcommerce } = require_(MOD("service.js"));
  const { catalog, settings, orders } = obtenerEcommerce();
  const productos = await catalog.listProducts();
  const conf = await settings.getSettings();
  ok(productos.length > 0, `el catálogo se lee en servidor (${productos.length} productos)`);
  ok((await orders.list()).length === 0, "sin pedidos en el servidor");
  ok(conf.timezone === "America/Montevideo", "zona horaria explícita");
}

/* --- 3. Seed contra el JSON real ----------------------------------------- */

seccion("Seed desde data/prospects/_ejemplo.json");
const prospecto = require_(path.join(RAIZ, "data/prospects/_ejemplo.json"));
const { parsearPrecioLegado, formatearDinero } = require_(MOD("money.js"));
{
  const { obtenerEcommerce } = require_(MOD("service.js"));
  const { catalog, settings } = obtenerEcommerce();
  const productos = await catalog.listProducts({ includeInactive: true });
  const categorias = await catalog.listCategories();
  const esperados = prospecto.menu.flatMap((s) => s.items);

  ok(
    categorias.length === prospecto.menu.length,
    `una categoría por sección del menú (${categorias.length})`
  );
  ok(
    productos.length === esperados.length,
    `todos los productos migrados (${productos.length}/${esperados.length})`
  );

  let preciosOk = true;
  let sinIdOSlug = 0;
  for (const item of esperados) {
    const p = productos.find((x) => x.name === item.name);
    if (!p) { preciosOk = false; continue; }
    if (!p.id || !p.slug) sinIdOSlug++;
    const esperado = parsearPrecioLegado(item.price);
    if (p.priceCents !== esperado) {
      preciosOk = false;
      console.log(`      ${item.name}: ${item.price} → ${p.priceCents} (esperado ${esperado})`);
    }
  }
  ok(preciosOk, 'cada precio "$490" quedó convertido a centésimos');
  ok(sinIdOSlug === 0, "todos los productos tienen id y slug estables");
  ok(
    productos.every((p) => p.stageImageUrl === undefined || p.stageImageUrl.endsWith(".webp")),
    "los recortes con alfa se conservan cuando existen"
  );

  const zonas = await settings.listDeliveryZones({ includeInactive: true });
  ok(zonas.length === 0, "cero zonas de delivery inventadas");
  ok(conf0(await settings.getSettings()), "delivery apagado y sin horarios inventados");

  ok(formatearDinero(49000) === "$ 490", `formateo de dinero: ${formatearDinero(49000)}`);
  ok(parsearPrecioLegado("490.5") === null, "el parser rechaza formatos ambiguos");
  ok(parsearPrecioLegado("$1.250") === 125000, "el parser entiende los miles");
}
function conf0(s) {
  return s.deliveryEnabled === false && s.serviceHours.length === 0;
}

/* --- 4. Navegador simulado ------------------------------------------------ */

function instalarNavegador(inicial = new Map()) {
  const almacen = inicial;
  globalThis.window = {
    localStorage: {
      getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
      setItem: (k, v) => almacen.set(k, String(v)),
      removeItem: (k) => almacen.delete(k),
    },
    addEventListener: () => {},
  };
  return almacen;
}

/** Simula una recarga: módulos nuevos, mismo `localStorage`. */
function recargar() {
  for (const k of Object.keys(require_.cache)) {
    if (k.startsWith(SALIDA)) delete require_.cache[k];
  }
  return require_(MOD("service.js")).obtenerEcommerce();
}

const almacen = instalarNavegador();

seccion("Persistencia y recuperación");
{
  let { catalog } = recargar();
  const antes = await catalog.listProducts();
  await catalog.updateProduct(antes[0].id, { name: "Clásica editada" });

  ({ catalog } = recargar());
  const despues = await catalog.getProduct({ id: antes[0].id });
  ok(despues.name === "Clásica editada", "el cambio sobrevive a la recarga");
  ok(
    (await catalog.listProducts()).length === antes.length,
    "no se re-siembra encima de los cambios"
  );

  /* Contenido corrupto: no puede dejar la página en blanco. */
  const clave = [...almacen.keys()][0];
  almacen.set(clave, "{esto no es json");
  ({ catalog } = recargar());
  const recuperado = await catalog.listProducts();
  ok(recuperado.length === antes.length, "se regenera desde el seed si está corrupto");
  ok(recuperado[0].name !== "Clásica editada", "el seed vuelve limpio tras la corrupción");

  /* Estructura válida como JSON pero ajena. */
  almacen.set(clave, JSON.stringify({ version: 99, hola: true }));
  ({ catalog } = recargar());
  ok(
    (await catalog.listProducts()).length === antes.length,
    "se regenera si la versión no coincide"
  );
}

seccion("Pedidos");
{
  const { catalog, settings, orders } = recargar();
  const productos = await catalog.listProducts();
  const clasica = productos[0];

  await settings.updateSettings({ deliveryEnabled: false, pickupEnabled: true });

  const draft = {
    clientRequestId: "req-fijo-1",
    items: [{ productId: clasica.id, quantity: 2, optionIds: [], notes: "sin cebolla" }],
    fulfillment: { type: "pickup" },
    customer: { name: "Prueba", phone: "099 123 456" },
    payment: { method: "cash" },
  };

  const primero = await orders.create(draft);
  ok(!primero.duplicated && primero.order.items.length === 1, "se crea el pedido");
  ok(
    primero.order.totalCents === clasica.priceCents * 2,
    `el total lo calcula el proveedor (${primero.order.totalCents})`
  );
  ok(primero.order.status === "pending_confirmation", "arranca esperando confirmación");
  ok(primero.order.payment.status === "pending", "el pago arranca pendiente y aparte");
  ok(!!primero.order.publicToken && !!primero.order.orderNumber, "tiene token y número");

  const segundo = await orders.create(draft);
  ok(segundo.duplicated, "el mismo clientRequestId no crea otro pedido");
  ok(segundo.order.id === primero.order.id, "devuelve el pedido original");
  ok((await orders.list()).length === 1, "queda un solo pedido en la base");

  /* El total del navegador no manda: solo delata un cambio de precio. */
  const mentiroso = await orders
    .create({ ...draft, clientRequestId: "req-fijo-2", expectedTotalCents: 1 })
    .then(() => null)
    .catch((e) => e.code);
  ok(mentiroso === "PRICE_CHANGED", "un total manipulado se rechaza");

  /* Snapshot inmutable. */
  await catalog.updateProduct(clasica.id, { name: "OTRO NOMBRE", priceCents: 999900 });
  const guardado = await orders.getById(primero.order.id);
  ok(
    guardado.items[0].productName === clasica.name &&
      guardado.items[0].unitPriceCents === clasica.priceCents &&
      guardado.totalCents === primero.order.totalCents,
    "cambiar el producto no toca el pedido ya hecho"
  );

  /* Máquina de estados. */
  const confirmado = await orders.changeStatus(primero.order.id, "confirmed", {
    estimatedMinutes: 25,
  });
  ok(confirmado.status === "confirmed", "pending_confirmation → confirmed");
  ok(confirmado.statusHistory.length === 2, "queda historial de la transición");

  const invalida = await orders
    .changeStatus(primero.order.id, "confirmed", { estimatedMinutes: 25 })
    .then(() => null)
    .catch((e) => e.code);
  ok(invalida === "INVALID_TRANSITION", "el segundo clic no vuelve a transicionar");
  ok(
    (await orders.listStatusEvents(primero.order.id)).length === 2,
    "y no duplica el evento"
  );

  const sinMotivo = await orders
    .changeStatus(primero.order.id, "cancelled")
    .then(() => null)
    .catch((e) => e.code);
  ok(sinMotivo === "INVALID_INPUT", "cancelar exige motivo");

  const porToken = await orders.getByPublicToken(primero.order.publicToken);
  ok(porToken?.id === primero.order.id, "el pedido se consulta por publicToken");

  /* Pedido vacío y tienda cerrada. */
  const vacio = await orders
    .create({ ...draft, clientRequestId: "req-3", items: [] })
    .then(() => null)
    .catch((e) => e.code);
  ok(vacio === "EMPTY_ORDER", "no se crea un pedido vacío");

  await settings.updateSettings({ acceptingOrders: false });
  const cerrado = await orders
    .create({ ...draft, clientRequestId: "req-4" })
    .then(() => null)
    .catch((e) => e.code);
  ok(cerrado === "STORE_CLOSED", "con la tienda cerrada no se toman pedidos");
}

/* --- 5. Limpieza ---------------------------------------------------------- */

rmSync(SALIDA, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLO(S)`);
process.exit(fallos === 0 ? 0 : 1);
