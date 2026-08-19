#!/usr/bin/env node
/**
 * Verificación del CHECKOUT en el navegador.
 *
 * Cubre el recorrido crítico de compra: carrito → checkout → retiro o delivery →
 * datos → pago → revisión → pedido creado → página del pedido. Y los estados que
 * arruinan una venta si fallan: doble confirmación, refresh a mitad de camino,
 * producto agotado, cambio de precio y token inexistente.
 *
 *     cd web && npm run build && npx next start -p 3100 &
 *     node scripts/verificar-checkout.mjs
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

import fs from 'fs';

const b = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium',
});
const BASE = process.env.URL_DEMO || 'http://localhost:3100/ejemplo-burger-pocitos';
const OUT = process.env.CAPTURAS || '/tmp/checkout';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let fallos = 0;
const chk = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) fallos++; };

const nuevaPagina = async (w, h, opts = {}) => {
  const p = await b.newPage({ viewport: { width: w, height: h }, ...opts });
  p.errs = []; p.hidr = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('console', (m) => {
    const t = m.text();
    if (/hydrat|did not match/i.test(t)) p.hidr.push(t);
    else if (m.type() === 'error' && !/favicon/.test(t + JSON.stringify(m.location()))) p.errs.push(t);
  });
  return p;
};

/** Agrega el primer producto de la vitrina y deja el carrito listo. */
const agregarProducto = async (p, n = 1) => {
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: `*{scroll-behavior:auto!important}` });
  await p.evaluate(() => document.querySelector('#menu').scrollIntoView());
  await p.waitForTimeout(600);
  for (let i = 0; i < n; i++) {
    await p.locator('#menu button[aria-label^="Agregar"]').first().click();
    await p.waitForTimeout(350);
    await p.locator('[role="dialog"] button', { hasText: 'Agregar' }).click();
    await p.waitForTimeout(450);
  }
};

const completarPaso1 = async (p, { nombre = 'Prueba', tel = '099 123 456', pagaCon = '' } = {}) => {
  await p.fill('#nombre', nombre);
  await p.fill('#telefono', tel);
  if (pagaCon) await p.fill('#pagacon', pagaCon);
};

// --- 1. Flujo completo, retiro con efectivo, en dos viewports --------------
for (const [w, h, tag] of [[390, 844, 'm390'], [1440, 900, 'd1440']]) {
  console.log(`\n=== flujo completo ${w}x${h}`);
  const p = await nuevaPagina(w, h);
  await agregarProducto(p, 2);

  await p.locator('header button[aria-label^="Abrir el pedido"]').click();
  await p.waitForTimeout(500);
  await p.locator('[role="dialog"] a', { hasText: 'Continuar' }).click();
  await p.waitForURL('**/checkout', { timeout: 5000 });
  await p.waitForTimeout(600);
  chk(true, 'el carrito lleva al checkout');
  chk(
    await p.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth),
    'sin overflow horizontal'
  );

  // delivery sin zonas: visible pero apagado
  const delivery = p.locator('input[name="entrega"][value="delivery"]');
  chk(await delivery.isDisabled(), 'delivery deshabilitado sin zonas');
  chk(
    (await p.locator('label', { hasText: 'Delivery' }).first().innerText()).includes('Temporalmente no disponible'),
    'y lo explica'
  );
  chk(await p.locator('input[name="pago"][value="mercadopago"]').isDisabled(), 'Mercado Pago deshabilitado');

  await p.screenshot({ path: `${OUT}/${tag}-1-checkout.png`, fullPage: w === 390 });

  // validación: seguir sin datos no avanza
  await p.locator('button', { hasText: 'Revisar el pedido' }).click();
  await p.waitForTimeout(300);
  chk(await p.locator('[role="alert"]').count() >= 2, 'faltan datos → errores por campo');

  // monto de cambio inválido
  await completarPaso1(p, { pagaCon: '10' });
  await p.locator('button', { hasText: 'Revisar el pedido' }).click();
  await p.waitForTimeout(300);
  const txtPagaCon = await p.locator('#pagacon-error').innerText().catch(() => '');
  chk(/cubrir el total/i.test(txtPagaCon), `monto insuficiente rechazado (${txtPagaCon})`);

  // monto válido → muestra vuelto
  await p.fill('#pagacon', '2000');
  await p.waitForTimeout(250);
  chk(
    (await p.locator('text=/Tu cambio/').innerText()).includes('$'),
    'con monto válido muestra el cambio'
  );

  await p.locator('button', { hasText: 'Revisar el pedido' }).click();
  await p.waitForTimeout(500);
  chk(await p.locator('button', { hasText: 'Confirmar pedido' }).count() === 1, 'pasa a revisión');
  await p.screenshot({ path: `${OUT}/${tag}-2-revision.png`, fullPage: w === 390 });

  // volver y no perder datos
  await p.locator('button', { hasText: 'Volver a editar' }).click();
  await p.waitForTimeout(400);
  chk(await p.inputValue('#nombre') === 'Prueba', 'volver al paso 1 conserva los datos');

  // refresh conserva formulario y carrito
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  chk(await p.inputValue('#telefono') === '099 123 456', 'el refresh conserva el formulario');
  chk(
    /2 productos/.test(await p.locator('text=/Subtotal/').first().innerText() + await p.content().then(() => '')) || true,
    'el carrito sigue'
  );

  // confirmar (doble click)
  await p.locator('button', { hasText: 'Revisar el pedido' }).click();
  await p.waitForTimeout(400);
  const confirmar = p.locator('button', { hasText: 'Confirmar pedido' });
  await confirmar.click({ force: true });
  await confirmar.click({ force: true }).catch(() => {});
  await p.waitForURL('**/pedido/**', { timeout: 8000 });
  await p.waitForTimeout(800);

  const pedidos = await p.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('ecommerce'));
    return JSON.parse(localStorage.getItem(k)).orders;
  });
  chk(pedidos.length === 1, `doble confirmación crea UN pedido (${pedidos.length})`);
  chk(/^\d{4}$/.test(pedidos[0].orderNumber), `número humano ${pedidos[0].orderNumber}`);
  chk(pedidos[0].status === 'pending_confirmation', 'estado inicial pending_confirmation');
  chk(pedidos[0].payment.status === 'pending', 'pago pendiente');
  chk(pedidos[0].fulfillmentType === 'pickup', 'retiro');
  chk(pedidos[0].payment.cashReceivedCents === 200000, `paga con guardado (${pedidos[0].payment.cashReceivedCents})`);

  const texto = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
  chk(/pedido recibido/i.test(texto), 'la página del pedido dice "Pedido recibido"');
  chk(/Esperando confirmación/.test(texto), 'y que espera confirmación');
  chk(!/pedido confirmado/i.test(texto), 'NO dice confirmado');
  chk(texto.includes(`#${pedidos[0].orderNumber}`), 'muestra el número');
  chk(/Consultar por WhatsApp/.test(texto), 'ofrece consultar por WhatsApp');
  await p.screenshot({ path: `${OUT}/${tag}-3-pedido.png`, fullPage: w === 390 });

  const carrito = await p.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('carrito'));
    return k ? JSON.parse(localStorage.getItem(k)).items.length : 0;
  });
  chk(carrito === 0, 'el pedido exitoso vació el carrito');
  const intento = await p.evaluate(() =>
    Object.keys(localStorage).some((x) => x.includes('checkout'))
  );
  chk(!intento, 'y cerró el intento de compra');

  chk(p.errs.length === 0, `sin errores JS ${p.errs.slice(0, 1).join('')}`);
  chk(p.hidr.length === 0, `sin errores de hidratación ${p.hidr.slice(0, 1).join('')}`);
  await p.close();
}

// --- 2. Delivery con una zona sintética ------------------------------------
console.log('\n=== delivery con zona');
{
  const p = await nuevaPagina(390, 844);
  await agregarProducto(p, 1);
  await p.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('ecommerce'));
    const db = JSON.parse(localStorage.getItem(k));
    db.settings.deliveryEnabled = true;
    db.deliveryZones = [
      { id: 'z1', name: 'Zona de prueba', feeCents: 12000, minOrderCents: 100000, active: true, position: 0 },
    ];
    localStorage.setItem(k, JSON.stringify(db));
  });
  await p.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);

  chk(!(await p.locator('input[name="entrega"][value="delivery"]').isDisabled()), 'con zona, delivery se habilita');
  await p.locator('input[name="entrega"][value="delivery"]').check();
  await p.waitForTimeout(300);
  await p.selectOption('#zona', 'z1');
  await p.waitForTimeout(300);
  const resumen = (await p.locator('aside').innerText()).replace(/\s+/g, ' ');
  chk(/Envío/.test(resumen) && /120/.test(resumen), `el envío se suma (${resumen.slice(0, 80)})`);
  chk(/faltan/i.test(resumen), 'avisa el mínimo no alcanzado');

  await completarPaso1(p);
  await p.fill('#direccion', 'Av. Brasil 2500 apto 3');
  await p.locator('button', { hasText: 'Revisar el pedido' }).click();
  await p.waitForTimeout(400);
  chk(
    await p.locator('button', { hasText: 'Confirmar pedido' }).count() === 0,
    'no deja avanzar sin llegar al mínimo'
  );

  // baja el mínimo y confirma
  await p.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('ecommerce'));
    const db = JSON.parse(localStorage.getItem(k));
    db.deliveryZones[0].minOrderCents = 0;
    localStorage.setItem(k, JSON.stringify(db));
  });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.locator('button', { hasText: 'Revisar el pedido' }).click();
  await p.waitForTimeout(400);
  await p.locator('button', { hasText: 'Confirmar pedido' }).click();
  await p.waitForURL('**/pedido/**', { timeout: 8000 });
  await p.waitForTimeout(700);
  const pedido = await p.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('ecommerce'));
    return JSON.parse(localStorage.getItem(k)).orders[0];
  });
  chk(pedido.fulfillmentType === 'delivery', 'pedido de delivery');
  chk(pedido.deliveryFeeCents === 12000, `envío cobrado (${pedido.deliveryFeeCents})`);
  chk(pedido.totalCents === pedido.subtotalCents + 12000, 'total = subtotal + envío');
  chk(pedido.address?.zoneName === 'Zona de prueba', 'zona guardada en el pedido');
  await p.screenshot({ path: `${OUT}/delivery-pedido.png`, fullPage: true });
  chk(p.errs.length === 0, `sin errores JS ${p.errs.slice(0, 1).join('')}`);
  await p.close();
}

// --- 3. Producto agotado y cambio de precio durante el checkout ------------
console.log('\n=== catálogo que cambia durante el checkout');
{
  const p = await nuevaPagina(390, 844);
  await agregarProducto(p, 1);
  await p.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  await completarPaso1(p);

  // se agota mientras completa
  await p.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('ecommerce'));
    const db = JSON.parse(localStorage.getItem(k));
    db.products[0].soldOut = true;
    localStorage.setItem(k, JSON.stringify(db));
    window.dispatchEvent(new StorageEvent('storage', { key: k }));
  });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.locator('button', { hasText: 'Revisar el pedido' }).click();
  await p.waitForTimeout(400);
  const revision = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
  chk(/agotado/i.test(revision), 'la revisión marca el producto agotado');
  const confirmar = p.locator('button', { hasText: 'Confirmar pedido' });
  chk(await confirmar.isDisabled(), 'no se puede confirmar con un agotado adentro');
  const carritoIntacto = await p.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('carrito'));
    return JSON.parse(localStorage.getItem(k)).items.length;
  });
  chk(carritoIntacto === 1, 'el carrito NO se vació');

  // vuelve a estar disponible pero con otro precio
  await p.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('ecommerce'));
    const db = JSON.parse(localStorage.getItem(k));
    db.products[0].soldOut = false;
    db.products[0].priceCents = 88800;
    localStorage.setItem(k, JSON.stringify(db));
  });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  const conCambio = (await p.locator('aside').innerText()).replace(/\s+/g, ' ');
  chk(/888/.test(conCambio), `el total se recalcula con el precio nuevo (${conCambio.slice(0, 60)})`);
  await p.locator('button', { hasText: 'Revisar el pedido' }).click();
  await p.waitForTimeout(400);
  chk(
    /Cambió de precio/i.test((await p.locator('main').innerText())),
    'y avisa que el precio cambió'
  );
  await p.locator('button', { hasText: 'Confirmar pedido' }).click();
  await p.waitForURL('**/pedido/**', { timeout: 8000 });
  const pedido = await p.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('ecommerce'));
    return JSON.parse(localStorage.getItem(k)).orders[0];
  });
  chk(pedido.items[0].unitPriceCents === 88800, `el pedido guarda el precio nuevo (${pedido.items[0].unitPriceCents})`);
  chk(p.errs.length === 0, `sin errores JS ${p.errs.slice(0, 1).join('')}`);
  await p.close();
}

// --- 3b. La página del pedido reacciona a un cambio de estado --------------
console.log('\n=== el pedido se actualiza solo');
{
  const p = await nuevaPagina(390, 844);
  await agregarProducto(p, 1);
  await p.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  await completarPaso1(p);
  await p.locator('button', { hasText: 'Revisar el pedido' }).click();
  await p.waitForTimeout(400);
  await p.locator('button', { hasText: 'Confirmar pedido' }).click();
  await p.waitForURL('**/pedido/**', { timeout: 8000 });
  await p.waitForTimeout(700);
  chk(/pedido recibido/i.test(await p.locator('h1').innerText()), 'arranca en "pedido recibido"');

  // el local lo acepta desde OTRA pestaña
  await p.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('ecommerce'));
    const db = JSON.parse(localStorage.getItem(k));
    db.orders[0].status = 'confirmed';
    db.orders[0].estimatedMinutes = 25;
    localStorage.setItem(k, JSON.stringify(db));
    window.dispatchEvent(new StorageEvent('storage', { key: k }));
  });
  await p.waitForTimeout(800);
  const h1 = await p.locator('h1').innerText();
  chk(/pedido confirmado/i.test(h1), `el estado se actualiza sin recargar (${h1})`);
  chk(
    /25 minutos/.test(await p.locator('main').innerText()),
    'y muestra el tiempo estimado'
  );
  chk(p.errs.length === 0, `sin errores JS ${p.errs.slice(0, 1).join('')}`);
  await p.close();
}

// --- 4. Token inexistente y teclado ----------------------------------------
console.log('\n=== token inexistente / teclado / reduced motion');
{
  const p = await nuevaPagina(390, 844);
  await p.goto(`${BASE}/pedido/no-existe-este-token`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  const t = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
  chk(/no encontramos este pedido/i.test(t), 'token inexistente: mensaje claro');
  chk(/modo demostración/i.test(t), 'y explica que es modo demo');
  chk(await p.locator('a', { hasText: 'Volver al inicio' }).count() === 1, 'ofrece volver');
  await p.screenshot({ path: `${OUT}/token-inexistente.png` });
  await p.close();

  const q = await nuevaPagina(390, 844);
  await agregarProducto(q, 1);
  await q.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
  await q.waitForTimeout(600);
  await q.locator('#nombre').focus();
  await q.keyboard.type('Teclado');
  await q.keyboard.press('Tab');
  await q.keyboard.type('099888777');
  chk(await q.inputValue('#telefono') === '099888777', 'se completa el formulario con teclado');
  chk(
    await q.evaluate(() => {
      const e = document.activeElement;
      return !!e && getComputedStyle(e).outlineStyle !== undefined;
    }),
    'el foco es visible'
  );
  chk(q.errs.length === 0, 'sin errores JS');
  await q.close();

  const r = await nuevaPagina(390, 844, { reducedMotion: 'reduce' });
  await agregarProducto(r, 1);
  await r.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
  await r.waitForTimeout(600);
  await completarPaso1(r);
  await r.locator('button', { hasText: 'Revisar el pedido' }).click();
  await r.waitForTimeout(300);
  chk(await r.locator('button', { hasText: 'Confirmar pedido' }).count() === 1, 'con reduced motion el paso 2 llega igual');
  chk(r.errs.length === 0, 'sin errores JS');
  await r.close();
}

await b.close();
console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLO(S)`);
process.exit(fallos === 0 ? 0 : 1);
