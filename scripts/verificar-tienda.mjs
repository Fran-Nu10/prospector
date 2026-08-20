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


/* ---------------------------------------------------------------------------
 * GEOMETRÍA DEL ESCENARIO
 *
 * La vitrina es UNA composición: todos los productos apoyan en la misma línea,
 * comparten el eje central y dejan el nombre mayormente legible. Esto no se
 * puede comprobar "mirando bien": se mide.
 *
 * La caja visible de cada burger no es la del `<img>` —el lienzo es cuadrado y
 * transparente alrededor—, así que se calcula con la geometría que dejó
 * anotada el script de normalización.
 * ------------------------------------------------------------------------ */

const GEO = JSON.parse(
  fs.readFileSync('assets/hamburgueseria/geometria-productos.json', 'utf8')
);
const MENU = JSON.parse(fs.readFileSync('data/prospects/_ejemplo.json', 'utf8')).menu;
const aslug = (t) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
   .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

console.log('\n=== assets del menú');
{
  /* WebP de verdad, no un PNG con la extensión cambiada. */
  const esWebp = (ruta) => {
    const c = fs.readFileSync(`web/public${ruta}`).subarray(0, 12);
    return c.subarray(0, 4).toString() === 'RIFF' && c.subarray(8, 12).toString() === 'WEBP';
  };
  const burgers = MENU[0].items;
  const acomp = MENU[1].items;

  chk(
    burgers.every((i) => i.stageImage && esWebp(i.stageImage)),
    `las ${burgers.length} hamburguesas tienen recorte de vitrina en WebP real`
  );
  chk(
    burgers.every((i) => GEO.productos[aslug(i.name)]),
    'y cada una tiene su geometría medida'
  );
  chk(
    acomp.every((i) => i.image && esWebp(i.image)),
    `los ${acomp.length} acompañamientos tienen foto en WebP real`
  );
  /* El archivo se asignó POR NOMBRE: la ruta pública lleva el slug del
     producto, así que un cambio de orden en el JSON no puede reasignarlas. */
  chk(
    acomp.every((i) => i.image.endsWith(`/${aslug(i.name)}.webp`)),
    'cada acompañamiento apunta al archivo con SU nombre, no al que le tocó por orden'
  );

  const altos = Object.values(GEO.productos).map((g) => g.alto);
  chk(
    Object.values(GEO.productos).every((g) => Math.abs(g.y + g.alto - GEO.lineaBase) < 0.002),
    'todos los recortes apoyan en la misma línea del lienzo'
  );
  chk(
    Math.max(...altos) - Math.min(...altos) <= 0.06,
    `las alturas visibles caen en una banda estrecha (${Math.min(...altos).toFixed(3)}–${Math.max(...altos).toFixed(3)} del lienzo)`
  );
}

for (const [w, h, tag] of [[1440, 900, 'd1440'], [390, 844, 'm390']]) {
  console.log(`\n=== escenario ${w}x${h}`);
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(U, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: '*{scroll-behavior:auto!important}' });
  await p.evaluate(() => document.querySelector('#menu').scrollIntoView());
  await p.waitForTimeout(700);

  const medidas = await p.evaluate((geo) => {
    const aslug = (t) =>
      t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
       .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const salida = [];
    for (const li of document.querySelectorAll('#menu li[aria-posinset]')) {
      const h4 = li.querySelector('h4');
      const esc = li.querySelector('[data-escena]');
      const media = li.querySelector('[data-media]');
      const info = li.querySelector('[data-escena] ~ div');
      if (!h4 || !esc) continue;
      const caja = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      const rango = document.createRange();
      rango.selectNodeContents(h4);
      const texto = rango.getBoundingClientRect();
      const g = media ? geo.productos[aslug(h4.textContent.trim())] : null;
      const mc = media ? caja(media) : null;
      salida.push({
        nombre: h4.textContent.trim(),
        variante: esc.dataset.escena,
        tipo: media ? media.dataset.media : null,
        escena: caja(esc),
        h4: caja(h4),
        textoAncho: texto.width,
        info: info ? caja(info) : null,
        visible: g && mc
          ? { x: mc.x + g.x * mc.w, y: mc.y + g.y * mc.h, w: g.ancho * mc.w, h: g.alto * mc.h }
          : mc,
      });
    }
    return salida;
  }, GEO);

  const burgers = medidas.filter((m) => m.variante === 'primary');
  const acompanamientos = medidas.filter((m) => m.variante === 'compact');

  chk(burgers.length === 5, `los cinco productos usan el escenario principal (${burgers.length})`);
  chk(
    burgers.every((m) => m.tipo === 'recorte'),
    'los cinco muestran su recorte transparente, ninguno la foto opaca'
  );

  const dif = (v) => Math.max(...v) - Math.min(...v);
  const bases = burgers.map((m) => m.visible.y + m.visible.h - m.escena.y - m.escena.h);
  chk(dif(bases) < 2, `todos apoyan en la misma línea base (dif ${dif(bases).toFixed(1)}px)`);

  const ejes = burgers.map((m) => m.visible.x + m.visible.w / 2 - (m.escena.x + m.escena.w / 2));
  chk(
    Math.max(...ejes.map(Math.abs)) < 8,
    `todos centrados sobre el eje del escenario (desvío máx ${Math.max(...ejes.map(Math.abs)).toFixed(1)}px)`
  );

  const relAlto = burgers.map((m) => m.visible.h / m.escena.h);
  chk(
    dif(relAlto) < 0.08,
    `misma escala percibida (alto ${(Math.min(...relAlto) * 100).toFixed(0)}–${(Math.max(...relAlto) * 100).toFixed(0)}% del escenario)`
  );

  const basesNombre = burgers.map((m) => (m.escena.y + m.escena.h - (m.h4.y + m.h4.h)) / m.escena.h);
  chk(dif(basesNombre) < 0.01, 'el nombre apoya en la misma altura en todos los slides');

  chk(
    medidas.every((m) => m.textoAncho <= m.h4.w + 1),
    'ningún nombre se sale del escenario: los largos achican con clamp'
  );

  /* Se mide como FRACCIÓN del escenario y no en píxeles: los slides que no
     son el activo están levemente escalados por la animación de cambio, y en
     píxeles crudos esa escala se confunde con un salto de layout. */
  /* Se mide como FRACCIÓN del escenario y por variante. Dos razones: los
     slides que no son el activo están levemente escalados por la animación de
     cambio —en píxeles crudos esa escala se confunde con un salto de layout—, y
     las hamburguesas y los acompañamientos tienen escenarios de distinto alto a
     propósito. Lo que tiene que ser constante es el hueco DENTRO de cada
     variante. */
  const hueco = (lista) =>
    lista.filter((m) => m.info).map((m) => (m.info.y - (m.escena.y + m.escena.h)) / m.escena.h);
  const difInfo = Math.max(dif(hueco(burgers)), dif(hueco(acompanamientos)));
  chk(
    difInfo < 0.005,
    `la información inferior arranca siempre a la misma altura (dif ${(difInfo * 100).toFixed(2)}% del escenario)`
  );

  const bacon = burgers.find((m) => /bacon/i.test(m.nombre));
  chk(bacon?.tipo === 'recorte', 'Bacon Fest ya no muestra el rectángulo opaco');

  chk(
    acompanamientos.length === 3 && acompanamientos.every((m) => m.tipo === 'foto'),
    'los acompañamientos muestran su foto en la variante compacta'
  );
  const ejesAcomp = acompanamientos.map((m) => m.visible.x + m.visible.w / 2 - (m.escena.x + m.escena.w / 2));
  chk(
    Math.max(...ejesAcomp.map(Math.abs)) < 2,
    'y también están centrados sobre el eje'
  );

  /* Transparencia REAL del recorte, leída del píxel: una esquina del lienzo
     tiene que tener alfa 0. Si alguien reemplaza el asset por un JPEG opaco,
     acá se nota. */
  const alfa = await p.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(2, 2, 1, 1).data[3];
  }, MENU[0].items[1].stageImage);
  chk(alfa === 0, `el recorte de Bacon Fest tiene alfa real (esquina = ${alfa})`);

  const overflow = await p.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  chk(overflow <= 1, `sin overflow horizontal (${overflow}px)`);

  await p.locator('#menu').screenshot({ path: `${OUT}/${tag}-menu.png` });
  await p.close();
}


/* ---------------------------------------------------------------------------
 * BASE YA GUARDADA
 *
 * Lo que de verdad importa el día del deploy: un navegador que YA tiene la demo
 * usada —con pedidos y precios propios— tiene que ver los assets nuevos sin que
 * nadie le explique cómo borrar `localStorage`.
 * ------------------------------------------------------------------------ */

console.log('\n=== base guardada de la versión anterior');
{
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(U, { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);

  /* Se fabrica la base ANTERIOR a partir de la actual: versión 2, sin las
     imágenes que este cambio agrega, y con un pedido del dueño adentro. */
  const preparado = await p.evaluate(() => {
    const claveV3 = Object.keys(localStorage).find((k) => /ecommerce.*:v3$/.test(k));
    const db = JSON.parse(localStorage.getItem(claveV3));
    const vieja = {
      ...db,
      version: 2,
      products: db.products.map((prod) => {
        if (prod.name === 'Bacon Fest') return { ...prod, stageImageUrl: undefined };
        if (prod.name === 'Papas de la casa') return { ...prod, imageUrl: undefined };
        return prod;
      }),
      settings: { ...db.settings, defaultPrepMinutes: 42 },
      orders: [{ id: 'viejo', orderNumber: '0009', totalCents: 55500 }],
    };
    localStorage.setItem(claveV3.replace(/:v3$/, ':v2'), JSON.stringify(vieja));
    localStorage.removeItem(claveV3);
    return claveV3;
  });

  await p.reload({ waitUntil: 'networkidle' });
  await p.addStyleTag({ content: '*{scroll-behavior:auto!important}' });
  await p.evaluate(() => document.querySelector('#menu').scrollIntoView());
  await p.waitForTimeout(900);

  /* El segundo slide de la PRIMERA pista es Bacon Fest; la segunda pista son
     los acompañamientos y también tiene un slide 2. */
  const bacon = p
    .locator('#menu [aria-roledescription="carrusel"]')
    .first()
    .locator('li[aria-posinset="2"] [data-media]');
  chk(
    (await bacon.getAttribute('data-media')) === 'recorte',
    'una base vieja recibe los assets nuevos sin borrar nada a mano'
  );

  const estado = await p.evaluate((clave) => {
    const db = JSON.parse(localStorage.getItem(clave) ?? 'null');
    return db && {
      version: db.version,
      pedidos: db.orders.length,
      numero: db.orders[0]?.orderNumber,
      prep: db.settings.defaultPrepMinutes,
    };
  }, preparado);
  chk(
    estado?.version === 3 && estado.pedidos === 1 && estado.numero === '0009' && estado.prep === 42,
    `la migración conservó el pedido y la configuración (${JSON.stringify(estado)})`
  );

  await p.close();
}


await b.close();
console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLO(S)`);
process.exit(fallos === 0 ? 0 : 1);
