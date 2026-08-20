#!/usr/bin/env node
/**
 * Verificación del PANEL DE CATÁLOGO en el navegador (fase 5).
 *
 * Lo que este script mira y ningún test de dominio puede mirar: que el dueño
 * entre y el empleado no, que el formulario diga qué está mal al lado del
 * campo, y que un cambio hecho en el panel llegue a la tienda ABIERTA EN OTRA
 * PESTAÑA sin que nadie recargue nada.
 *
 *     cd web && npm run build && npx next start -p 3100 &
 *     node scripts/verificar-panel-catalogo.mjs
 *
 * Playwright no es dependencia del proyecto: si no está, avisa y sale sin fallar.
 */

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log("Playwright no está disponible en este entorno: verificación omitida.");
  process.exit(0);
}

import fs from "fs";

const b = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || "/opt/pw-browsers/chromium",
});
const BASE =
  process.env.URL_DEMO || "http://localhost:3100/ejemplo-burger-pocitos";
const OUT = process.env.CAPTURAS || "/tmp/panel-catalogo";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let fallos = 0;
const chk = (c, m) => {
  console.log(`${c ? "  ✓" : "  ✗"} ${m}`);
  if (!c) fallos++;
};

const nueva = async (ctx, w, h) => {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: w, height: h });
  p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  p.on("console", (m) => {
    const t = m.text();
    /* "Failed to load resource" es ruido del entorno de verificación (sin
       salida a internet, sin favicon): lo que importa son los errores de la
       aplicación. */
    if (m.type() === "error" && !/failed to load resource/i.test(t)) {
      p.errs.push(t);
    }
  });
  return p;
};

const entrar = async (p, rol) => {
  await p.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  await p
    .locator("button", {
      hasText: rol === "owner" ? "Entrar como dueño" : "Entrar como empleado",
    })
    .click();
  await p.waitForURL("**/admin", { timeout: 8000 });
  await p.waitForTimeout(600);
};

const texto = async (p) => (await p.locator("main").innerText()).replace(/\s+/g, " ");

// --- 1. Acceso por rol ------------------------------------------------------
console.log("\n=== acceso por rol");
{
  const ctx = await b.newContext();
  const p = await nueva(ctx, 1440, 900);
  await entrar(p, "owner");

  const nav = await p.locator('nav[aria-label="Secciones del panel"]').innerText();
  chk(/productos/i.test(nav), "el dueño ve la pestaña Productos");
  chk(/configuraci/i.test(nav), "y la de Configuración");

  await p.goto(`${BASE}/admin/productos`, { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  chk(/nuevo producto/i.test(await texto(p)), "el dueño entra a productos");
  chk(
    (await p.locator("[data-acceso-denegado]").count()) === 0,
    "sin cartel de acceso denegado"
  );
  await p.screenshot({ path: `${OUT}/productos-desktop.png`, fullPage: true });

  await p.goto(`${BASE}/admin/configuracion`, { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  chk(/aceptar pedidos/i.test(await texto(p)), "el dueño entra a configuración");
  await p.screenshot({ path: `${OUT}/configuracion-desktop.png`, fullPage: true });
  chk(p.errs.length === 0, `sin errores JS ${p.errs.join(" | ")}`);
  await ctx.close();
}

{
  const ctx = await b.newContext();
  const p = await nueva(ctx, 1440, 900);
  await entrar(p, "employee");

  const nav = await p.locator('nav[aria-label="Secciones del panel"]').innerText();
  chk(!/productos/i.test(nav), "el empleado no ve la pestaña Productos");

  /* Lo importante: escribir la URL a mano tampoco sirve. */
  await p.goto(`${BASE}/admin/productos`, { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  chk(
    (await p.locator("[data-acceso-denegado]").count()) === 1,
    "por URL directa, el empleado ve acceso denegado"
  );
  chk(
    !/nuevo producto/i.test(await texto(p)),
    "y no se renderiza nada del catálogo"
  );

  await p.goto(`${BASE}/admin/configuracion`, { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  chk(
    (await p.locator("[data-acceso-denegado]").count()) === 1,
    "tampoco entra a configuración"
  );
  chk(
    !/aceptar pedidos/i.test(await texto(p)),
    "y no ve los interruptores del local"
  );
  await p.screenshot({ path: `${OUT}/empleado-denegado.png` });
  chk(p.errs.length === 0, `sin errores JS ${p.errs.join(" | ")}`);
  await ctx.close();
}

// --- 2. Alta, validación y edición de producto ------------------------------
console.log("\n=== alta y edición de producto");
const ctx = await b.newContext();
const panel = await nueva(ctx, 1440, 900);
await entrar(panel, "owner");
await panel.goto(`${BASE}/admin/productos`, { waitUntil: "networkidle" });
await panel.waitForTimeout(600);

const dialogo = () => panel.locator('[role="dialog"]');
const campo = (etiqueta) => dialogo().getByLabel(etiqueta, { exact: true });

{
  await panel.locator("button", { hasText: "Nuevo producto" }).click();
  await panel.waitForTimeout(500);
  chk((await dialogo().count()) === 1, "se abre el formulario de alta");

  await campo("Nombre").fill("Prueba de panel");
  await panel.waitForTimeout(150);
  chk(
    (await campo("Dirección (slug)").inputValue()) === "prueba-de-panel",
    "la dirección se deriva sola del nombre"
  );

  /* Guardar sin precio: el error va al lado del campo, no en un alert. */
  await dialogo().locator("button", { hasText: "Guardar" }).click();
  await panel.waitForTimeout(400);
  chk(
    /escrib(í|i) el precio/i.test(await dialogo().innerText()),
    "sin precio no se guarda y se dice por qué"
  );
  chk(
    (await campo("Precio en pesos").getAttribute("aria-invalid")) === "true",
    "el campo del precio queda marcado como inválido"
  );

  await campo("Precio en pesos").fill("490");
  await campo("Imagen principal").fill("https://otro-sitio.com/foto.jpg");
  await dialogo().locator("button", { hasText: "Guardar" }).click();
  await panel.waitForTimeout(400);
  chk(
    /no puede mostrar imágenes de otros sitios/i.test(await dialogo().innerText()),
    "una imagen de otro dominio se rechaza con una explicación"
  );

  await campo("Imagen principal").fill("/hamburgueseria/platos/clasica.png");
  await panel.waitForTimeout(250);
  const previa = dialogo().locator(
    'img[src="/hamburgueseria/platos/clasica.png"]'
  );
  chk((await previa.count()) > 0, "una ruta local válida muestra la vista previa");

  await dialogo().locator("button", { hasText: "Guardar" }).click();
  await panel.waitForTimeout(700);
  chk((await dialogo().count()) === 0, "se guarda y la hoja se cierra");
  const lista = await texto(panel);
  chk(/prueba de panel/i.test(lista), "el producto aparece en la lista");
  chk(/\$ 490/.test(lista), "con el precio convertido a pesos uruguayos");
}

{
  /* Slug duplicado: lo rechaza el formulario con el mensaje en el campo. */
  await panel.locator("button", { hasText: "Nuevo producto" }).click();
  await panel.waitForTimeout(400);
  await campo("Nombre").fill("Otra cosa");
  await campo("Dirección (slug)").fill("prueba-de-panel");
  await campo("Precio en pesos").fill("300");
  await dialogo().locator("button", { hasText: "Guardar" }).click();
  await panel.waitForTimeout(400);
  chk(
    /ya hay otro producto/i.test(await dialogo().innerText()),
    "un slug repetido se rechaza"
  );
  /* El formulario quedó a medio llenar: cerrar pregunta, y hay que contestar
     ANTES de que el diálogo aparezca o Playwright lo descarta por su cuenta. */
  panel.once("dialog", (d) => d.accept());
  await dialogo().locator("button", { hasText: "Cancelar" }).click();
  await panel.waitForTimeout(600);
  chk((await dialogo().count()) === 0, "y se puede descartar el borrador");
}

{
  /* Edición: cambiar el precio se ve en la lista. */
  const fila = panel.locator("li", { hasText: "Prueba de panel" }).first();
  await fila.locator("button", { hasText: "Editar" }).click();
  await panel.waitForTimeout(500);
  chk(
    (await campo("Precio en pesos").inputValue()) === "490",
    "el formulario abre con el precio en pesos, no en centésimos"
  );
  await campo("Precio en pesos").fill("520,50");
  await dialogo().locator("button", { hasText: "Guardar" }).click();
  await panel.waitForTimeout(700);
  chk(/520,50/.test(await texto(panel)), "el precio editado se refleja");
}

// --- 3. El cambio llega a la tienda sin recargar ---------------------------
console.log("\n=== sincronización entre pestañas");
const tienda = await nueva(ctx, 1440, 900);
await tienda.goto(BASE, { waitUntil: "networkidle" });
await tienda.addStyleTag({ content: "*{scroll-behavior:auto!important}" });
await tienda.evaluate(() => document.querySelector("#menu").scrollIntoView());
await tienda.waitForTimeout(700);

let nombreEnCarrito = "";
{
  await tienda.locator('#menu button[aria-label^="Agregar"]').first().click();
  await tienda.waitForTimeout(400);
  await tienda
    .locator('[role="dialog"] button', { hasText: "Agregar" })
    .click();
  await tienda.waitForTimeout(600);
  await tienda.locator('header button[aria-label^="Abrir el pedido"]').first().click();
  await tienda.waitForTimeout(600);
  const carrito = await tienda.locator('[role="dialog"]').innerText();
  nombreEnCarrito = carrito.split("\n").find((l) => /\$/.test(l) === false) ?? "";
  chk(/\$/.test(carrito), "hay un producto en el carrito de la tienda");
  await tienda.keyboard.press("Escape");
  await tienda.waitForTimeout(400);
}

{
  /* El panel marca agotado el PRIMER producto de la carta, que es el que la
     tienda acaba de agregar al carrito. */
  const fila = panel.locator("li").filter({ hasText: "Agotado" }).first();
  const primera = panel
    .locator("section ul[role=list] li")
    .first();
  const nombre = (await primera.innerText()).split("\n")[0];
  await primera.locator("button", { hasText: "Agotado" }).click();
  await panel.waitForTimeout(800);
  chk(
    /agotado/i.test(await primera.innerText()),
    `el panel marca agotado ${nombre}`
  );

  await tienda.waitForTimeout(1200);
  const menu = await tienda.locator("#menu").innerText();
  chk(/agotado/i.test(menu), "la tienda muestra el agotado sin recargar");

  await tienda.locator('header button[aria-label^="Abrir el pedido"]').first().click();
  await tienda.waitForTimeout(600);
  const carrito = await tienda.locator('[role="dialog"]').innerText();
  chk(/agotado/i.test(carrito), "la línea del carrito queda degradada");
  chk(/\$ 0/.test(carrito), "y deja de sumar al subtotal");
  await tienda.screenshot({ path: `${OUT}/tienda-degradada.png` });
  await tienda.keyboard.press("Escape");
  await tienda.waitForTimeout(300);

  /* Se lo devuelve a la carta para no dejar la demo rota. */
  await primera.locator("button", { hasText: "Hay" }).click();
  await panel.waitForTimeout(700);
  await tienda.waitForTimeout(1000);
  chk(
    !/agotado/i.test(await tienda.locator("#menu").innerText()),
    "y volver a habilitarlo también se ve al instante"
  );
  chk(fila !== null, "la lista del panel refleja el estado de cada producto");
}

{
  /* Archivar: la línea sigue visible, con otro motivo, y no se puede pedir. */
  const primera = panel.locator("section ul[role=list] li").first();
  await primera.locator("button", { hasText: "Archivar" }).click();
  await panel.waitForTimeout(800);
  await tienda.waitForTimeout(1200);
  await tienda.locator('header button[aria-label^="Abrir el pedido"]').first().click();
  await tienda.waitForTimeout(600);
  const carrito = await tienda.locator('[role="dialog"]').innerText();
  chk(
    /ya no está en la carta/i.test(carrito),
    "un producto archivado degrada la línea del carrito"
  );
  chk(/\$ 0/.test(carrito), "y tampoco suma");
  await tienda.keyboard.press("Escape");
  await tienda.waitForTimeout(300);

  await panel.getByLabel("Estado", { exact: true }).selectOption("archivados");
  await panel.waitForTimeout(500);
  const archivados = await texto(panel);
  chk(/archivados/i.test(archivados), "el panel puede listar lo archivado");
  await panel
    .locator("section ul[role=list] li")
    .first()
    .locator("button", { hasText: "Restaurar" })
    .click();
  await panel.waitForTimeout(700);
  await panel.getByLabel("Estado", { exact: true }).selectOption("todos");
  await panel.waitForTimeout(400);
  chk(true, "y restaurarlo (apagado, para revisarlo antes de publicar)");
}

// --- 4. Categorías ----------------------------------------------------------
console.log("\n=== categorías");
{
  await panel.locator("button", { hasText: "Categorías" }).first().click();
  await panel.waitForTimeout(500);
  await panel.locator("button", { hasText: "Nueva categoría" }).click();
  await panel.waitForTimeout(500);
  await campo("Nombre").fill("Categoría de prueba");
  await dialogo().locator("button", { hasText: "Guardar" }).click();
  await panel.waitForTimeout(700);
  chk(
    /categoría de prueba/i.test(await texto(panel)),
    "se crea una categoría desde el panel"
  );
  chk(
    /0 productos/i.test(await texto(panel)),
    "y dice cuántos productos tiene"
  );

  const fila = panel.locator("li", { hasText: "Categoría de prueba" }).first();
  chk(
    await fila.locator("button", { hasText: "Archivar" }).isEnabled(),
    "una categoría vacía se puede archivar"
  );
  const conProductos = panel.locator("section ul[role=list] li").first();
  chk(
    !(await conProductos.locator("button", { hasText: "Archivar" }).isEnabled()),
    "una con productos, no"
  );

  await fila.locator("button", { hasText: "Apagar" }).click();
  await panel.waitForTimeout(800);
  chk(/apagada/i.test(await fila.innerText()), "se puede apagar una categoría");
  await fila.locator("button", { hasText: "Archivar" }).click();
  await panel.waitForTimeout(700);
  chk(
    !/categoría de prueba/i.test(await texto(panel)),
    "y archivarla la saca de la lista"
  );
  await panel.locator("button", { hasText: "Productos" }).first().click();
  await panel.waitForTimeout(400);
}

// --- 5. Zonas, delivery y pausa --------------------------------------------
console.log("\n=== zonas, delivery y pausa del local");
{
  const checkout = await nueva(ctx, 1440, 900);
  await checkout.goto(`${BASE}/checkout`, { waitUntil: "networkidle" });
  await checkout.waitForTimeout(900);
  chk(
    !(await checkout
      .locator('input[name="entrega"][value="delivery"]')
      .isEnabled()
      .catch(() => false)),
    "sin zonas cargadas, el checkout no ofrece delivery"
  );

  await panel.goto(`${BASE}/admin/configuracion`, { waitUntil: "networkidle" });
  await panel.waitForTimeout(700);
  await panel.getByLabel("Delivery", { exact: true }).check();
  await panel.waitForTimeout(600);
  await panel.locator("button", { hasText: "Nueva zona" }).click();
  await panel.waitForTimeout(500);
  await campo("Nombre de la zona").fill("Zona de prueba");
  await campo("Costo de envío en pesos").fill("120");
  await campo("Pedido mínimo en pesos").fill("0");
  await dialogo().locator("button", { hasText: "Guardar" }).click();
  await panel.waitForTimeout(800);
  chk(/zona de prueba/i.test(await texto(panel)), "se crea la zona");
  chk(/\$ 120/.test(await texto(panel)), "con el costo en pesos");

  await checkout.waitForTimeout(1500);
  chk(
    await checkout
      .locator('input[name="entrega"][value="delivery"]')
      .isEnabled(),
    "el checkout habilita delivery sin recargar"
  );

  /* Apagar la zona vuelve a bloquearlo. */
  const filaZona = panel.locator("li", { hasText: "Zona de prueba" }).first();
  await filaZona.locator("button", { hasText: "Apagar" }).click();
  await panel.waitForTimeout(800);
  await checkout.waitForTimeout(1500);
  chk(
    !(await checkout
      .locator('input[name="entrega"][value="delivery"]')
      .isEnabled()),
    "apagar la única zona vuelve a bloquear el delivery"
  );

  /* Pausar el local: la carta se ve, confirmar no. */
  await panel.getByLabel("Aceptar pedidos", { exact: true }).uncheck();
  await panel.waitForTimeout(800);
  chk(
    /pedidos pausados/i.test(await texto(panel)),
    "el panel confirma que se guardó"
  );

  await checkout.waitForTimeout(1500);
  await checkout.fill("#nombre", "Cliente Prueba");
  await checkout.fill("#telefono", "099 123 456");
  await checkout.locator("button", { hasText: "Revisar el pedido" }).click();
  await checkout.waitForTimeout(700);
  chk(
    (await checkout.locator("[data-tienda-pausada]").count()) === 1,
    "el checkout avisa que el local no está tomando pedidos"
  );
  chk(
    await checkout
      .locator("button", { hasText: "Confirmar pedido" })
      .isDisabled(),
    "y no deja confirmar"
  );
  await checkout.screenshot({ path: `${OUT}/checkout-pausado.png` });

  await panel.getByLabel("Aceptar pedidos", { exact: true }).check();
  await panel.waitForTimeout(700);
  await checkout.waitForTimeout(1500);
  chk(
    (await checkout.locator("[data-tienda-pausada]").count()) === 0,
    "reabrir el local saca el aviso sin recargar"
  );
  chk(checkout.errs.length === 0, `sin errores JS ${checkout.errs.join(" | ")}`);
}

// --- 6. Mobile, teclado y reduced motion -----------------------------------
console.log("\n=== mobile, teclado y movimiento reducido");
{
  const m = await nueva(ctx, 390, 844);
  await m.goto(`${BASE}/admin/productos`, { waitUntil: "networkidle" });
  await m.waitForTimeout(900);
  const overflow = await m.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  chk(overflow <= 1, `sin overflow horizontal en mobile (${overflow}px)`);
  await m.screenshot({ path: `${OUT}/productos-mobile.png`, fullPage: true });

  await m.goto(`${BASE}/admin/configuracion`, { waitUntil: "networkidle" });
  await m.waitForTimeout(900);
  const overflowConf = await m.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  chk(overflowConf <= 1, `configuración sin overflow en mobile (${overflowConf}px)`);
  await m.screenshot({ path: `${OUT}/configuracion-mobile.png`, fullPage: true });
  chk(m.errs.length === 0, `sin errores JS ${m.errs.join(" | ")}`);

  /* Teclado: llegar al alta y abrirla sin mouse. */
  await panel.goto(`${BASE}/admin/productos`, { waitUntil: "networkidle" });
  await panel.waitForTimeout(700);
  await panel.locator("button", { hasText: "Nuevo producto" }).focus();
  await panel.keyboard.press("Enter");
  await panel.waitForTimeout(600);
  chk((await dialogo().count()) === 1, "el formulario abre con el teclado");
  const dentro = await panel.evaluate(
    () => !!document.activeElement?.closest('[role="dialog"]')
  );
  chk(dentro, "el foco entra a la hoja");
  await panel.keyboard.press("Escape");
  await panel.waitForTimeout(500);
  chk((await dialogo().count()) === 0, "Escape la cierra");

  /* Cambios sin guardar: cerrar pregunta antes de descartar. */
  await panel.locator("button", { hasText: "Nuevo producto" }).click();
  await panel.waitForTimeout(500);
  await campo("Nombre").fill("Algo a medio escribir");
  let pregunto = false;
  panel.once("dialog", (d) => {
    pregunto = true;
    d.dismiss();
  });
  await dialogo().locator("button", { hasText: "Cancelar" }).click();
  await panel.waitForTimeout(500);
  chk(pregunto, "con cambios sin guardar, cerrar pregunta antes de descartar");
  chk(
    (await dialogo().count()) === 1,
    "y si se dice que no, el formulario sigue abierto"
  );
  panel.once("dialog", (d) => d.accept());
  await dialogo().locator("button", { hasText: "Cancelar" }).click();
  await panel.waitForTimeout(500);
}

{
  const ctxR = await b.newContext({ reducedMotion: "reduce" });
  const r = await nueva(ctxR, 1440, 900);
  await entrar(r, "owner");
  await r.goto(`${BASE}/admin/productos`, { waitUntil: "networkidle" });
  await r.waitForTimeout(700);
  await r.locator("button", { hasText: "Nuevo producto" }).click();
  await r.waitForTimeout(500);
  chk(
    (await r.locator('[role="dialog"]').count()) === 1,
    "con movimiento reducido el formulario igual abre"
  );
  chk(r.errs.length === 0, `sin errores JS ${r.errs.join(" | ")}`);
  await ctxR.close();
}

chk(panel.errs.length === 0, `panel sin errores JS ${panel.errs.join(" | ")}`);
chk(tienda.errs.length === 0, `tienda sin errores JS ${tienda.errs.join(" | ")}`);

await ctx.close();
await b.close();
console.log(
  fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLO(S) · capturas en ${OUT}`
);
process.exit(fallos === 0 ? 0 : 1);
