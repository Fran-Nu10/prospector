#!/usr/bin/env node
/**
 * Verificación del PANEL del local.
 *
 * Cierra el circuito: un pedido creado desde la tienda en una pestaña aparece en
 * el panel abierto en otra, se acepta con tiempo estimado, avanza por sus
 * estados, se cobra y se completa — y la página pública del cliente lo refleja
 * sin recargar.
 *
 *     cd web && npm run build && npx next start -p 3100 &
 *     node scripts/verificar-panel.mjs
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
const OUT = process.env.CAPTURAS || '/tmp/panel';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let fallos = 0;
const chk = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) fallos++; };

const nueva = async (ctx, w, h) => {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: w, height: h });
  p.errs = []; p.hidr = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('console', (m) => {
    const t = m.text();
    if (/hydrat|did not match/i.test(t)) p.hidr.push(t);
    else if (m.type() === 'error' && !/favicon/.test(t + JSON.stringify(m.location()))) p.errs.push(t);
  });
  return p;
};

/** Crea un pedido real desde la tienda. Devuelve el token público. */
const comprar = async (p, { delivery = false } = {}) => {
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: `*{scroll-behavior:auto!important}` });
  await p.evaluate(() => document.querySelector('#menu').scrollIntoView());
  await p.waitForTimeout(600);
  await p.locator('#menu button[aria-label^="Agregar"]').first().click();
  await p.waitForTimeout(350);
  await p.locator('[role="dialog"] button', { hasText: 'Agregar' }).click();
  await p.waitForTimeout(450);

  if (delivery) {
    await p.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.includes('ecommerce'));
      const db = JSON.parse(localStorage.getItem(k));
      db.settings.deliveryEnabled = true;
      db.deliveryZones = [{ id: 'z1', name: 'Zona de prueba', feeCents: 12000, minOrderCents: 0, active: true, position: 0 }];
      localStorage.setItem(k, JSON.stringify(db));
    });
  }
  await p.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.fill('#nombre', 'Cliente Prueba');
  await p.fill('#telefono', '099 123 456');
  if (delivery) {
    await p.locator('input[name="entrega"][value="delivery"]').check();
    await p.waitForTimeout(250);
    await p.selectOption('#zona', 'z1');
    await p.fill('#direccion', 'Av. Brasil 2500');
  }
  await p.locator('button', { hasText: 'Revisar el pedido' }).click();
  await p.waitForTimeout(400);
  await p.locator('button', { hasText: 'Confirmar pedido' }).click();
  await p.waitForURL('**/pedido/**', { timeout: 8000 });
  await p.waitForTimeout(500);
  return p.url().split('/pedido/')[1];
};

const entrar = async (p, rol) => {
  await p.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  await p.locator('button', { hasText: rol === 'owner' ? 'Entrar como dueño' : 'Entrar como empleado' }).click();
  await p.waitForURL('**/admin', { timeout: 6000 });
  await p.waitForTimeout(700);
};

const abrirPrimero = async (p) => {
  await p.locator('button[aria-label^="Abrir pedido"]').first().click();
  await p.waitForTimeout(500);
};

// --- 1. Acceso, roles y estado vacío ---------------------------------------
console.log('\n=== acceso y roles');
{
  const ctx = await b.newContext();
  const p = await nueva(ctx, 1440, 900);

  await p.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  chk(p.url().includes('/admin/login'), 'sin sesión, el panel redirige al acceso');
  chk(
    /no es autenticación real/i.test(await p.locator('main').innerText()),
    'el acceso avisa que no es autenticación real'
  );
  await p.screenshot({ path: `${OUT}/login.png` });

  await entrar(p, 'owner');
  const comoDueño = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
  chk(/dueño/i.test(comoDueño), 'entra como dueño');
  chk(/modo demostración/i.test(comoDueño), 'el panel avisa que es modo demo');
  chk(/todavía no hay pedidos/i.test(comoDueño), 'estado vacío correcto');
  chk(/completados hoy/i.test(comoDueño), 'el dueño ve el total del día');
  await p.screenshot({ path: `${OUT}/vacio.png` });

  await p.locator('button', { hasText: 'Salir' }).click();
  await p.waitForTimeout(700);
  await entrar(p, 'employee');
  const comoEmpleado = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
  chk(/empleado/i.test(comoEmpleado), 'entra como empleado');
  chk(!/completados hoy/i.test(comoEmpleado), 'el empleado NO ve el total del día');

  // sesión vencida
  await p.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('panel'));
    const s = JSON.parse(localStorage.getItem(k));
    s.expiraEn = new Date(Date.now() - 1000).toISOString();
    localStorage.setItem(k, JSON.stringify(s));
  });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  chk(p.url().includes('/admin/login'), 'sesión vencida redirige al acceso');

  chk(p.errs.length === 0, `sin errores JS ${p.errs.slice(0, 1).join('')}`);
  chk(p.hidr.length === 0, `sin errores de hidratación ${p.hidr.slice(0, 1).join('')}`);
  await ctx.close();
}

// --- 2. Circuito completo de retiro + sincronización entre pestañas --------
console.log('\n=== circuito retiro (dos pestañas)');
{
  const ctx = await b.newContext();
  const tienda = await nueva(ctx, 390, 844);
  const token = await comprar(tienda);

  const panel = await nueva(ctx, 1440, 900);
  await entrar(panel, 'owner');
  chk(
    (await panel.locator('button[aria-label^="Abrir pedido"]').count()) === 1,
    'el pedido creado en otra pestaña aparece en el panel'
  );
  await panel.screenshot({ path: `${OUT}/lista.png` });

  await abrirPrimero(panel);
  const detalle = panel.locator('[role="dialog"]');
  chk(await detalle.count() === 1, 'abre el detalle');
  const txt = (await detalle.innerText()).replace(/\s+/g, ' ');
  chk(/Cliente Prueba/.test(txt), 'muestra el cliente');
  chk(/099123456/.test(txt), 'muestra el teléfono');
  chk(/Retira en el local/i.test(txt), 'muestra la modalidad');
  chk(/Historial/i.test(txt), 'muestra el historial');
  chk(!/Salió para entrega/i.test(txt), 'un retiro NO ofrece "salió para entrega"');
  await panel.screenshot({ path: `${OUT}/detalle.png` });

  // aceptar exige tiempo estimado
  await panel.fill('#minutos-manual', '');
  await panel.waitForTimeout(200);
  chk(
    await panel.locator('button', { hasText: 'Aceptar pedido' }).isDisabled(),
    'sin tiempo estimado no se puede aceptar'
  );
  await panel.locator('button', { hasText: '25 min' }).click();
  await panel.waitForTimeout(200);
  await panel.locator('button', { hasText: 'Aceptar pedido' }).click();
  await panel.waitForTimeout(800);

  const guardado = await panel.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('ecommerce'));
    return JSON.parse(localStorage.getItem(k)).orders[0];
  });
  chk(guardado.status === 'confirmed', 'pasa a confirmed');
  chk(guardado.estimatedMinutes === 25, `guarda 25 minutos (${guardado.estimatedMinutes})`);
  chk(guardado.statusHistory.length === 2, `un solo evento nuevo (${guardado.statusHistory.length})`);
  chk(guardado.statusHistory[1].actorRole === 'owner', 'el evento guarda el rol');

  // la página pública del cliente se entera
  await tienda.goto(`${BASE}/pedido/${token}`, { waitUntil: 'networkidle' });
  await tienda.waitForTimeout(800);
  const publico = (await tienda.locator('main').innerText()).replace(/\s+/g, ' ');
  chk(/pedido confirmado/i.test(publico), 'la página pública muestra la aceptación');
  chk(/25 minutos/.test(publico), 'y el tiempo estimado');

  // WhatsApp con el mensaje correcto
  const href = await panel.locator('a', { hasText: 'Aceptado' }).getAttribute('href');
  chk(
    decodeURIComponent(href ?? '').includes('aceptamos tu pedido #0001. El tiempo estimado es de 25 minutos'),
    'el mensaje de WhatsApp es el correcto'
  );
  chk(!/Av\.|Brasil|980/.test(decodeURIComponent(href ?? '')), 'y no lleva datos sensibles');

  // avanzar hasta completar
  await panel.locator('button', { hasText: 'Empezar a preparar' }).click();
  await panel.waitForTimeout(700);
  await panel.locator('button', { hasText: 'Marcar pronto' }).click();
  await panel.waitForTimeout(700);
  const enReady = (await panel.locator('[role="dialog"]').innerText()).replace(/\s+/g, ' ');
  chk(/Listo para retirar/i.test(enReady), 'un retiro ofrece "listo para retirar"');
  chk(!/Salió para entrega/i.test(enReady), 'y sigue sin ofrecer reparto');
  await panel.locator('button', { hasText: 'Listo para retirar' }).click();
  await panel.waitForTimeout(700);

  // completar con pago pendiente → advertencia
  await panel.locator('button', { hasText: 'Completar' }).click();
  await panel.waitForTimeout(500);
  const aviso = (await panel.locator('[role="dialog"]').innerText()).replace(/\s+/g, ' ');
  chk(/todavía figura sin cobrar/i.test(aviso), 'completar con pago pendiente advierte');
  chk(/Cobrar y completar/i.test(aviso), 'ofrece cobrar y completar');
  await panel.screenshot({ path: `${OUT}/aviso-pago.png` });

  await panel.locator('button', { hasText: 'Cobrar y completar' }).click();
  await panel.waitForTimeout(1000);
  const final = await panel.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('ecommerce'));
    return JSON.parse(localStorage.getItem(k)).orders[0];
  });
  chk(final.status === 'completed', 'queda completado');
  chk(final.payment.status === 'approved', 'y cobrado');
  chk(Boolean(final.payment.paidAt), 'con fecha de cobro');
  chk(final.payment.markedByRole === 'owner', 'y el rol que lo cobró');
  chk(final.totalCents === guardado.totalCents, 'cobrar no cambió el total');
  /* creación + confirmed + preparing + ready + ready_for_pickup + completed */
  chk(
    final.statusHistory.length === 6,
    `seis eventos, uno por transición (${final.statusHistory.length})`
  );

  chk(panel.errs.length === 0, `sin errores JS ${panel.errs.slice(0, 1).join('')}`);
  chk(panel.hidr.length === 0, 'sin errores de hidratación');
  await ctx.close();
}

// --- 3. Delivery, rechazo y cobro idempotente ------------------------------
console.log('\n=== delivery, rechazo y cobro');
{
  const ctx = await b.newContext();
  const tienda = await nueva(ctx, 390, 844);
  await comprar(tienda, { delivery: true });

  const panel = await nueva(ctx, 1440, 900);
  await entrar(panel, 'employee');
  await abrirPrimero(panel);
  await panel.locator('button', { hasText: '20 min' }).click();
  await panel.locator('button', { hasText: 'Aceptar pedido' }).click();
  await panel.waitForTimeout(700);
  await panel.locator('button', { hasText: 'Empezar a preparar' }).click();
  await panel.waitForTimeout(700);
  await panel.locator('button', { hasText: 'Marcar pronto' }).click();
  await panel.waitForTimeout(700);
  const enReady = (await panel.locator('[role="dialog"]').innerText()).replace(/\s+/g, ' ');
  chk(/Salió para entrega/i.test(enReady), 'un delivery ofrece "salió para entrega"');
  chk(!/Listo para retirar/i.test(enReady), 'y NO ofrece "listo para retirar"');

  // cobro idempotente
  await panel.locator('button', { hasText: 'Marcar como cobrado' }).click();
  await panel.waitForTimeout(700);
  const cobrado1 = await panel.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('ecommerce'));
    return JSON.parse(localStorage.getItem(k)).orders[0].payment;
  });
  chk(cobrado1.status === 'approved', 'marca cobrado');
  chk(
    await panel.locator('button', { hasText: 'Marcar como cobrado' }).count() === 0,
    'el botón desaparece: no se cobra dos veces'
  );
  const cobrado2 = await panel.evaluate(async () => {
    const k = Object.keys(localStorage).find((x) => x.includes('ecommerce'));
    return JSON.parse(localStorage.getItem(k)).orders[0].payment.paidAt;
  });
  chk(cobrado2 === cobrado1.paidAt, 'la fecha de cobro no se reescribe');

  await panel.locator('button', { hasText: 'Salió para entrega' }).click();
  await panel.waitForTimeout(700);
  const salido = await panel.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('ecommerce'));
    return JSON.parse(localStorage.getItem(k)).orders[0].status;
  });
  chk(salido === 'out_for_delivery', 'delivery termina en out_for_delivery');

  await ctx.close();
}

// --- 4. Rechazo con motivo -------------------------------------------------
console.log('\n=== rechazo');
{
  const ctx = await b.newContext();
  const tienda = await nueva(ctx, 390, 844);
  const token = await comprar(tienda);

  const panel = await nueva(ctx, 390, 844);
  await entrar(panel, 'owner');
  await abrirPrimero(panel);
  await panel.locator('button', { hasText: 'Rechazar' }).first().click();
  await panel.waitForTimeout(400);
  await panel.selectOption('#motivo', 'Producto agotado');
  await panel.fill('#nota-motivo', 'se terminó el cheddar');
  await panel.locator('button', { hasText: 'Confirmar' }).click();
  await panel.waitForTimeout(900);

  const rechazado = await panel.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('ecommerce'));
    return JSON.parse(localStorage.getItem(k)).orders[0];
  });
  chk(rechazado.status === 'rejected', 'queda rechazado');
  chk(
    /Producto agotado — se terminó el cheddar/.test(rechazado.rejectionReason ?? ''),
    `guarda el motivo (${rechazado.rejectionReason})`
  );
  chk(rechazado.payment.status === 'cancelled', 'el pago se cancela');
  await panel.screenshot({ path: `${OUT}/mobile-panel.png`, fullPage: true });
  chk(
    await panel.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth),
    'sin overflow horizontal en mobile'
  );

  await tienda.goto(`${BASE}/pedido/${token}`, { waitUntil: 'networkidle' });
  await tienda.waitForTimeout(700);
  const publico = (await tienda.locator('main').innerText()).replace(/\s+/g, ' ');
  chk(/pedido rechazado/i.test(publico), 'la página pública muestra el rechazo');
  chk(!/preparación|esperando confirmación/i.test(publico), 'y no habla de preparación');

  await ctx.close();
}

// --- 5. Teclado y reduced motion -------------------------------------------
console.log('\n=== teclado y reduced motion');
{
  const ctx = await b.newContext({ reducedMotion: 'reduce' });
  const tienda = await nueva(ctx, 390, 844);
  await comprar(tienda);
  const panel = await nueva(ctx, 1440, 900);
  await entrar(panel, 'owner');
  await panel.locator('button[aria-label^="Abrir pedido"]').first().focus();
  await panel.keyboard.press('Enter');
  await panel.waitForTimeout(500);
  chk(await panel.locator('[role="dialog"]').count() === 1, 'el detalle abre con teclado');
  chk(
    await panel.evaluate(() => document.activeElement?.getAttribute('role') === 'dialog'),
    'el foco entra al diálogo'
  );
  await panel.keyboard.press('Escape');
  await panel.waitForTimeout(400);
  chk(await panel.locator('[role="dialog"]').count() === 0, 'Escape cierra');
  chk(
    await panel.evaluate(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Abrir pedido') ?? false),
    'el foco vuelve a la tarjeta'
  );
  chk(panel.errs.length === 0, `sin errores JS ${panel.errs.slice(0, 1).join('')}`);
  await ctx.close();
}

await b.close();
console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLO(S)`);
process.exit(fallos === 0 ? 0 : 1);
