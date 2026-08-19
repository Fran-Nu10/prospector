#!/usr/bin/env node
/**
 * Verificación de la tienda EN EL NAVEGADOR.
 *
 * Complementa a `verificar-demo-core.mjs`: aquel ejerce el dominio sin DOM,
 * este comprueba lo que solo se ve corriendo la página — que el menú traiga el
 * catálogo real, que la hoja de producto abra y atrape el foco, que el carrito
 * sobreviva a un refresh y que un producto agotado deje de poder comprarse sin
 * romper el total.
 *
 * Necesita un servidor levantado y Playwright disponible en el entorno:
 *
 *     cd web && npm run build && npx next start -p 3100 &
 *     node scripts/verificar-tienda.mjs
 *
 * Playwright NO es dependencia del proyecto: si no está, el script avisa y sale
 * sin fallar, para no romper a quien no lo tenga instalado.
 */

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log("Playwright no está disponible en este entorno: verificación omitida.");
  process.exit(0);
}

import fs from 'fs';

const EJECUTABLE = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';
const b = await chromium.launch({ executablePath: EJECUTABLE });
const U = process.env.URL_DEMO || 'http://localhost:3100/ejemplo-burger-pocitos';
const OUT = process.env.CAPTURAS || '/tmp/tienda';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let fallos = 0;
const chk = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) fallos++; };

for (const [w, h, tag] of [[390, 844, 'm390'], [1440, 900, 'd1440']]) {
  console.log(`\n=== ${w}x${h}`);
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const errs = [], hidr = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('response', (r) => { if (r.status() >= 400) console.log('     [HTTP ' + r.status() + '] ' + r.url()); });
  p.on('console', (m) => {
    const t = m.text();
    if (/hydrat|did not match/i.test(t)) hidr.push(t);
    else if (m.type() === 'error' && !/favicon/.test(t + JSON.stringify(m.location()))) errs.push(t + ' @ ' + JSON.stringify(m.location()));
  });
  await p.goto(U, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: `*{scroll-behavior:auto!important}` });
  await p.evaluate(() => document.querySelector('#menu').scrollIntoView());
  await p.waitForTimeout(700);

  // catálogo real en el menú
  const nombres = await p.$$eval('#menu li[aria-posinset] h4', (e) => e.map((x) => x.textContent));
  chk(nombres.length === 8, `8 productos en la vitrina (${nombres.length})`);
  chk(await p.locator('#menu button[aria-label^="Agregar"]').count() > 0, 'CTA "Agregar" en el menú');
  await p.screenshot({ path: `${OUT}/${tag}-1-menu.png`, fullPage: false });

  // abrir producto
  await p.locator('#menu button[aria-label^="Agregar"]').first().click();
  await p.waitForTimeout(500);
  const hoja = p.locator('[role="dialog"]');
  chk(await hoja.count() === 1, 'la hoja de producto abre');
  chk(await hoja.getAttribute('aria-modal') === 'true', 'aria-modal');
  await p.screenshot({ path: `${OUT}/${tag}-2-producto.png` });

  // cantidad + agregar
  await p.locator('[role="dialog"] button[aria-label^="Sumar uno"]').click();
  await p.waitForTimeout(200);
  const totalHoja = await p.locator('[role="dialog"] footer, [role="dialog"] >> text=/\\$/').first().textContent().catch(() => '');
  await p.locator('[role="dialog"] button', { hasText: 'Agregar' }).click();
  await p.waitForTimeout(600);
  chk(await p.locator('[role="dialog"]').count() === 0, 'la hoja se cierra al agregar');
  chk(await p.locator('[role="status"]').count() === 1, 'aparece la confirmación');
  await p.screenshot({ path: `${OUT}/${tag}-3-agregado.png` });

  const badge = await p.locator('header button[aria-label^="Abrir el pedido"]').getAttribute('aria-label');
  chk(/2 productos/.test(badge ?? ''), `el contador dice 2 (${badge})`);

  // segundo producto
  await p.evaluate(() => document.querySelector('#menu').scrollIntoView());
  await p.waitForTimeout(300);
  await p.locator('#menu [aria-roledescription="carrusel"]').first().locator('button[data-selector-producto]').nth(2).click();
  await p.waitForTimeout(900);
  await p.evaluate(() => document.querySelector('#menu').scrollIntoView());
  await p.waitForTimeout(300);
  await p.locator('#menu [aria-roledescription="carrusel"]').first()
    .locator('li[aria-posinset="3"] button[aria-label^="Agregar"]').click();
  await p.waitForTimeout(400);
  await p.locator('[role="dialog"] button', { hasText: 'Agregar' }).click();
  await p.waitForTimeout(500);

  // carrito
  await p.locator('header button[aria-label^="Abrir el pedido"]').click();
  await p.waitForTimeout(600);
  chk(await p.locator('[role="dialog"]').count() === 1, 'el carrito abre');
  const lineas = await p.locator('[role="dialog"] ul[role="list"] > li').count();
  chk(lineas === 2, `dos líneas en el carrito (${lineas})`);
  await p.screenshot({ path: `${OUT}/${tag}-4-carrito.png` });

  const subtotal = await p.locator('[role="dialog"]').getByText(/Subtotal/).locator('..').textContent();
  console.log(`     subtotal: ${subtotal?.replace(/\s+/g, ' ').trim()}`);

  // teclado: Escape cierra
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  chk(await p.locator('[role="dialog"]').count() === 0, 'Escape cierra el carrito');

  // persistencia
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  const tras = await p.locator('header button[aria-label^="Abrir el pedido"]').getAttribute('aria-label');
  chk(/3 productos/.test(tras ?? ''), `el carrito sobrevive al refresh (${tras})`);

  chk(errs.length === 0, `sin errores JS ${errs.slice(0, 2).join(' | ')}`);
  chk(hidr.length === 0, `sin errores de hidratación ${hidr.slice(0, 1).join(' | ')}`);
  await p.close();
}


// --- breakpoints intermedios ------------------------------------------------
for (const [w, h] of [[360, 800], [768, 1024], [1024, 768]]) {
  console.log(`\n=== ${w}x${h}`);
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(U, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: `*{scroll-behavior:auto!important}` });
  await p.evaluate(() => document.querySelector('#menu').scrollIntoView());
  await p.waitForTimeout(600);
  chk(
    await p.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth),
    'sin overflow horizontal'
  );
  const nav = await p.evaluate(() => document.querySelector('header').getBoundingClientRect().height);
  chk(nav <= 76, `la nav no crece (${Math.round(nav)}px)`);
  await p.locator('#menu button[aria-label^="Agregar"]').first().click();
  await p.waitForTimeout(500);
  const caja = await p.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const r = d.getBoundingClientRect();
    return { w: r.width, h: r.height, dentro: r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 };
  });
  chk(caja.dentro, `la hoja entra en pantalla (${Math.round(caja.w)}x${Math.round(caja.h)})`);
  await p.screenshot({ path: `${OUT}/${w}-producto.png` });
  chk(errs.length === 0, `sin errores JS ${errs.slice(0, 1).join('')}`);
  await p.close();
}

// --- accesibilidad ----------------------------------------------------------
console.log('\n=== accesibilidad');
{
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(U, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: `*{scroll-behavior:auto!important}` });
  await p.evaluate(() => document.querySelector('#menu').scrollIntoView());
  await p.waitForTimeout(500);

  const abridor = p.locator('#menu button[aria-label^="Agregar"]').first();
  await abridor.click();
  await p.waitForTimeout(500);
  chk(
    await p.evaluate(() => document.activeElement?.getAttribute('role') === 'dialog'),
    'el foco entra al diálogo'
  );
  chk(
    await p.evaluate(() => getComputedStyle(document.body).overflow === 'hidden'),
    'el scroll del fondo queda bloqueado'
  );
  // Tab no se escapa del diálogo
  for (let i = 0; i < 14; i++) await p.keyboard.press('Tab');
  chk(
    await p.evaluate(() => document.querySelector('[role="dialog"]').contains(document.activeElement)),
    'Tab queda atrapado dentro del diálogo'
  );
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  chk(
    await p.evaluate(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Agregar') ?? false),
    'el foco vuelve al botón que abrió'
  );
  chk(
    await p.evaluate(() => getComputedStyle(document.body).overflow !== 'hidden'),
    'el scroll del fondo se restituye'
  );
  await p.close();
}

// --- reduced motion ---------------------------------------------------------
console.log('\n=== prefers-reduced-motion');
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(U, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.querySelector('#menu').scrollIntoView());
  await p.waitForTimeout(500);
  await p.locator('#menu button[aria-label^="Agregar"]').first().click();
  await p.waitForTimeout(300);
  const t = await p.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return { visible: !!d, transform: getComputedStyle(d).transform };
  });
  chk(t.visible, 'la hoja abre igual sin movimiento');
  chk(
    ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(t.transform),
    `la hoja queda en su sitio sin transform residual (${t.transform})`
  );
  await p.locator('[role="dialog"] button', { hasText: 'Agregar' }).click();
  await p.waitForTimeout(400);
  chk(await p.locator('[role="status"]').count() === 1, 'la confirmación aparece igual');
  chk(errs.length === 0, 'sin errores JS');
  await p.screenshot({ path: `${OUT}/reduced-motion.png` });
  await p.close();
}

// --- producto agotado / desactivado en vivo --------------------------------
console.log('\n=== catálogo cambiante');
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(U, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: `*{scroll-behavior:auto!important}` });
  await p.evaluate(() => document.querySelector('#menu').scrollIntoView());
  await p.waitForTimeout(600);

  // agregar Clásica
  await p.locator('#menu button[aria-label^="Agregar"]').first().click();
  await p.waitForTimeout(400);
  await p.locator('[role="dialog"] button', { hasText: 'Agregar' }).click();
  await p.waitForTimeout(500);

  // el dueño lo agota: se escribe en la base demo por la MISMA clave versionada
  const cambio = await p.evaluate(() => {
    const clave = Object.keys(localStorage).find((k) => k.includes('ecommerce'));
    const db = JSON.parse(localStorage.getItem(clave));
    db.products[0].soldOut = true;
    db.products[1].priceCents = 99900; // sube de precio otro producto
    localStorage.setItem(clave, JSON.stringify(db));
    return { clave, producto: db.products[0].name };
  });
  await p.reload({ waitUntil: 'networkidle' });
  await p.evaluate(() => document.querySelector('#menu').scrollIntoView());
  await p.waitForTimeout(800);

  const boton = await p.locator('#menu li[aria-posinset="1"] button[aria-label^="Agregar"]').first();
  chk(await boton.isDisabled(), `el producto agotado no se puede agregar (${cambio.producto})`);
  chk((await boton.textContent())?.includes('Agotado') ?? false, 'el botón dice por qué');
  await p.screenshot({ path: `${OUT}/agotado.png` });

  await p.locator('header button[aria-label^="Abrir el pedido"]').click();
  await p.waitForTimeout(600);
  const texto = (await p.locator('[role="dialog"]').innerText()).replace(/\s+/g, ' ');
  chk(/agotado/i.test(texto), 'la línea del carrito muestra el motivo');
  chk(/ya no se pueden pedir/i.test(texto), 'y el carrito lo explica arriba');
  const subtotal = await p.locator('[role="dialog"]').getByText(/Subtotal/).locator('..').innerText();
  chk(/\$\s*0/.test(subtotal.replace(/\s+/g, ' ')), `el agotado no suma al subtotal (${subtotal.replace(/\n/g, ' ')})`);
  await p.screenshot({ path: `${OUT}/carrito-agotado.png` });

  chk(errs.length === 0, `sin errores JS ${errs.slice(0, 1).join('')}`);
  await p.close();
}


await b.close();
console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLO(S)`);
process.exit(fallos === 0 ? 0 : 1);
