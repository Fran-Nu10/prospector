#!/usr/bin/env node
/**
 * Verificación de la ADMINISTRACIÓN DEL CATÁLOGO (fase 5).
 *
 * Ejerce lo que no se puede comprobar mirando la pantalla: que un slug
 * duplicado se rechace, que el precio escrito en pesos llegue a la base en
 * centésimos, que el stock se descuente UNA vez al aceptar y se reponga UNA vez
 * al cancelar, y que apagar una categoría deje de vender lo que hay adentro.
 *
 * Mismo enfoque que `verificar-demo-core.mjs`: se compila el núcleo con el
 * TypeScript instalado y se lo ejerce con un `localStorage` de mentira.
 *
 *     node scripts/verificar-catalogo.mjs
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = mkdtempSync(path.join(tmpdir(), "catalogo-"));
const require_ = createRequire(import.meta.url);

let fallos = 0;
const ok = (cond, mensaje) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${mensaje}`);
  if (!cond) fallos++;
};
const seccion = (t) => console.log(`\n${t}`);

/**
 * Nombres que crea ESTA verificación. Se anotan para poder distinguirlos de lo
 * que trae el seed: la última comprobación es que el catálogo no tenga ningún
 * producto que el negocio no haya escrito en su JSON.
 */
const creadosAcá = new Set();

/** Corre algo que debe fallar y devuelve el código del error del dominio. */
const codigoDeError = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e?.code ?? e?.message ?? "sin código";
  }
};

/* --- 1. Compilar ---------------------------------------------------------- */

seccion("Compilación");
execFileSync(
  "npx",
  [
    "tsc",
    "lib/ecommerce/service.ts",
    "lib/ecommerce/domain.ts",
    "lib/ecommerce/money.ts",
    "lib/ecommerce/permisos.ts",
    "lib/ecommerce/vistas.ts",
    "lib/ecommerce/carrito.ts",
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

/* --- 2. Navegador simulado ------------------------------------------------ */

const almacen = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
    setItem: (k, v) => almacen.set(k, String(v)),
    removeItem: (k) => almacen.delete(k),
  },
  addEventListener: () => {},
};

const dominio = require_(MOD("domain.js"));
const dinero = require_(MOD("money.js"));
const permisos = require_(MOD("permisos.js"));
const vistas = require_(MOD("vistas.js"));
const { obtenerEcommerce } = require_(MOD("service.js"));
const { catalog, settings, orders } = obtenerEcommerce();

/* --- 3. Permisos por rol -------------------------------------------------- */

seccion("Permisos del panel");
{
  const dueño = { role: "owner", creadaEn: "", expiraEn: "" };
  const empleado = { role: "employee", creadaEn: "", expiraEn: "" };

  ok(
    ["pedidos", "productos", "configuracion"].every((a) =>
      permisos.sesionPuede(dueño, a)
    ),
    "el dueño entra a pedidos, productos y configuración"
  );
  ok(permisos.sesionPuede(empleado, "pedidos"), "el empleado entra a pedidos");
  ok(
    !permisos.sesionPuede(empleado, "productos") &&
      !permisos.sesionPuede(empleado, "configuracion"),
    "el empleado NO entra a productos ni a configuración"
  );
  ok(
    !permisos.sesionPuede(null, "pedidos"),
    "sin sesión no se entra a ningún lado"
  );
  ok(
    permisos.areasDeSesion(empleado).length === 1,
    "la navegación del empleado tiene una sola área"
  );
  ok(
    permisos.rutaDeArea("demo", "productos") === "/demo/admin/productos",
    "las rutas del panel salen de un solo lugar"
  );
}

/* --- 4. Dinero: pesos ⇄ centésimos ---------------------------------------- */

seccion("Precio escrito en pesos");
{
  ok(dinero.parsearPesos("490") === 49000, "490 → 49000");
  ok(dinero.parsearPesos(" 490 ") === 49000, "se ignoran los espacios");
  ok(dinero.parsearPesos("490,50") === 49050, "490,50 → 49050");
  ok(dinero.parsearPesos("490.5") === 49050, "el punto también es decimal");
  ok(dinero.parsearPesos("1.250") === null, "1.250 es ambiguo y se rechaza");
  ok(dinero.parsearPesos("-5") === null, "no se aceptan negativos");
  ok(dinero.parsearPesos("gratis") === null, "no se acepta texto");
  ok(dinero.parsearPesos("") === null, "vacío no es cero");
  ok(dinero.formatearPesos(49000) === "490", "49000 → 490 dentro del campo");
  ok(dinero.formatearPesos(49050) === "490,50", "49050 → 490,50");
  ok(
    dinero.parsearPesos(dinero.formatearPesos(49050)) === 49050,
    "ida y vuelta sin pérdida"
  );
  ok(
    dinero.parsearPesosConSigno("-60") === -6000,
    "un extra puede restar (−60)"
  );
  ok(dinero.parsearPesosConSigno("") === 0, "sin importe = sin incremento");
}

/* --- 5. Validación de productos ------------------------------------------- */

seccion("Validación de productos");
{
  const categorias = await catalog.listCategories();
  const productos = await catalog.listProducts({ includeInactive: true });
  const base = {
    name: "Nueva",
    slug: "nueva",
    categoryId: categorias[0].id,
    priceCents: 49000,
    active: true,
    modo: "available",
  };
  const ctx = { productos, categorias };
  const errores = (cambio) => dominio.validarProducto({ ...base, ...cambio }, ctx);

  ok(Object.keys(errores({})).length === 0, "un producto bien cargado no da errores");
  ok(errores({ name: "  " }).name, "nombre vacío se rechaza");
  ok(errores({ slug: productos[0].slug }).slug, "slug duplicado se rechaza");
  ok(errores({ slug: "Con Mayúsculas" }).slug, "slug con formato inválido se rechaza");
  ok(errores({ categoryId: "no-existe" }).categoryId, "categoría inexistente se rechaza");
  ok(errores({ priceCents: null }).priceCents, "precio ilegible se rechaza");
  ok(errores({ priceCents: -1 }).priceCents, "precio negativo se rechaza");
  ok(
    errores({ priceCents: 0, active: true }).priceCents,
    "no se publica un producto sin precio"
  );
  ok(
    Object.keys(errores({ priceCents: 0, active: false })).length === 0,
    "pero un borrador apagado sí puede quedar sin precio"
  );
  ok(
    errores({ modo: "limited", stockQuantity: -2 }).stockQuantity,
    "cantidad limitada negativa se rechaza"
  );
  ok(
    errores({ imageUrl: "https://cualquiera.com/foto.jpg" }).imageUrl,
    "una imagen de otro dominio se rechaza en vez de ampliar el allowlist"
  );
  ok(
    errores({ imageUrl: "hamburgueseria/foto.png" }).imageUrl,
    "una ruta que no empieza con / se rechaza"
  );
  ok(
    Object.keys(errores({ imageUrl: "/hamburgueseria/platos/clasica.png" })).length === 0,
    "una ruta local válida se acepta"
  );
}

/* --- 6. Modos de disponibilidad ------------------------------------------- */

seccion("Disponibilidad como un solo modo");
{
  const { modoDisponibilidad: modo, camposDeModo } = dominio;
  ok(
    modo({ soldOut: false, stockQuantity: null }) === "available",
    "sin control de stock y sin agotar: disponible"
  );
  ok(modo({ soldOut: true, stockQuantity: null }) === "sold_out", "agotado a mano");
  ok(modo({ soldOut: false, stockQuantity: 3 }) === "limited", "con cuenta: limitado");
  ok(
    modo({ soldOut: false, stockQuantity: 0 }) === "limited",
    "en cero sigue siendo limitado, no se pierde el control de stock"
  );
  ok(
    camposDeModo("available").stockQuantity === null &&
      camposDeModo("available").soldOut === false,
    "disponible apaga las dos banderas"
  );
  ok(camposDeModo("sold_out").soldOut === true, "agotado enciende el interruptor");
  ok(camposDeModo("limited", 7).stockQuantity === 7, "limitado guarda la cantidad");
  ok(
    camposDeModo("limited", -3).stockQuantity === 0,
    "una cantidad negativa se corta en cero"
  );
}

/* --- 7. Grupos de opciones ------------------------------------------------ */

seccion("Variantes y extras");
{
  const { camposDeGrupo, tipoDeGrupo, validarGruposDeOpciones } = dominio;

  ok(camposDeGrupo("unica", true).maxSelect === 1, "selección única: máximo 1");
  ok(camposDeGrupo("unica", true).minSelect === 1, "obligatoria: mínimo 1");
  ok(camposDeGrupo("unica", false).minSelect === 0, "opcional: mínimo 0");
  const multiple = camposDeGrupo("multiple", true, 5, 3);
  ok(
    multiple.minSelect <= multiple.maxSelect,
    "un mínimo mayor que el máximo se corrige en vez de guardarse"
  );
  ok(tipoDeGrupo({ maxSelect: 1 }) === "unica", "el tipo se deduce del máximo");

  const grupo = (cambio) => ({
    id: "g1",
    name: "Punto",
    minSelect: 0,
    maxSelect: 1,
    position: 0,
    active: true,
    options: [
      {
        id: "o1",
        name: "A punto",
        priceDeltaCents: 0,
        available: true,
        position: 0,
      },
    ],
    ...cambio,
  });

  ok(
    Object.keys(validarGruposDeOpciones([grupo()])).length === 0,
    "un grupo bien armado no da errores"
  );
  ok(
    validarGruposDeOpciones([grupo({ name: " " })])["grupo.0.name"],
    "grupo sin nombre se rechaza"
  );
  ok(
    validarGruposDeOpciones([
      grupo({ options: [{ ...grupo().options[0], name: "" }] }),
    ])["grupo.0.opcion.0.name"],
    "opción sin nombre se rechaza"
  );
  ok(
    validarGruposDeOpciones([
      grupo({ options: [{ ...grupo().options[0], priceDeltaCents: NaN }] }),
    ])["grupo.0.opcion.0.priceDeltaCents"],
    "un incremento ilegible se rechaza en vez de guardarse como cero"
  );
  ok(
    validarGruposDeOpciones([
      grupo({
        minSelect: 1,
        options: [{ ...grupo().options[0], available: false }],
      }),
    ])["grupo.0.options"],
    "un grupo obligatorio sin opciones disponibles se rechaza"
  );
}

/* --- 8. Categorías -------------------------------------------------------- */

seccion("Categorías");
let categoriaNueva;
{
  const antes = await catalog.listCategories();
  categoriaNueva = await catalog.createCategory({ name: "Para probar" });
  ok(categoriaNueva.slug === "para-probar", "el slug sale del nombre");
  ok(categoriaNueva.archived === false, "nace sin archivar");
  ok(
    (await catalog.listCategories()).length === antes.length + 1,
    "aparece en la lista"
  );

  ok(
    (await codigoDeError(() =>
      catalog.createCategory({ name: "Otra", slug: antes[0].slug })
    )) === "DUPLICATE_SLUG",
    "no se pueden repetir dos slugs de categoría"
  );

  const editada = await catalog.updateCategory(categoriaNueva.id, {
    name: "Renombrada",
    slug: "renombrada",
  });
  ok(editada.name === "Renombrada" && editada.slug === "renombrada", "se edita nombre y slug");
  ok(editada.id === categoriaNueva.id, "el id no cambia al renombrar");

  ok(
    (await codigoDeError(() =>
      catalog.updateCategory(antes[0].id, { archived: true })
    )) === "CATEGORY_NOT_EMPTY",
    "no se archiva una categoría que todavía tiene productos"
  );

  /* Reordenar: la lista invertida vuelve invertida. */
  const orden = (await catalog.listCategories()).map((c) => c.id);
  await catalog.reorderCategories([...orden].reverse());
  const despues = (await catalog.listCategories()).map((c) => c.id);
  ok(
    despues[0] === orden[orden.length - 1],
    "reordenar cambia el orden de la carta"
  );
  await catalog.reorderCategories(orden);
}

/* --- 9. Productos: alta, edición, duplicado, archivado -------------------- */

seccion("Productos");
let producto;
{
  const categorias = await catalog.listCategories();
  creadosAcá.add("Prueba de fase 5").add("Prueba de fase 5 (copia)");
  creadosAcá.add("Prueba editada").add("Prueba editada (copia)");
  producto = await catalog.createProduct({
    categoryId: categorias[0].id,
    name: "Prueba de fase 5",
    priceCents: dinero.parsearPesos("490"),
  });
  ok(producto.priceCents === 49000, "lo escrito en pesos se guarda en centésimos");
  ok(producto.archived === false, "nace sin archivar");

  ok(
    (await codigoDeError(() =>
      catalog.createProduct({
        categoryId: categorias[0].id,
        name: "Otro",
        slug: producto.slug,
        priceCents: 1000,
      })
    )) === "DUPLICATE_SLUG",
    "el proveedor rechaza el slug duplicado aunque el formulario lo deje pasar"
  );

  const editado = await catalog.updateProduct(producto.id, {
    name: "Prueba editada",
    priceCents: 55000,
  });
  ok(editado.name === "Prueba editada" && editado.priceCents === 55000, "se edita");
  ok(editado.createdAt === producto.createdAt, "la fecha de alta no se reescribe");

  const copia = await catalog.duplicateProduct(producto.id);
  ok(copia.id !== producto.id, "duplicar crea otro producto");
  ok(copia.slug !== producto.slug, "con otra dirección");
  ok(copia.active === false, "y entra apagado para revisarlo antes de publicar");

  await catalog.updateProduct(copia.id, { archived: true });
  const listaPublica = await catalog.listProducts({ includeInactive: true });
  ok(
    !listaPublica.some((p) => p.id === copia.id),
    "lo archivado no sale en el catálogo"
  );
  ok(
    (await catalog.listProducts({ includeInactive: true, includeArchived: true })).some(
      (p) => p.id === copia.id
    ),
    "pero el panel lo sigue viendo: no se borró nada"
  );

  ok(
    (await codigoDeError(() =>
      catalog.updateProduct(producto.id, { categoryId: "no-existe" })
    )) === "NOT_FOUND",
    "no se puede mover un producto a una categoría inexistente"
  );
}

/* --- 10. Carrito degradado ------------------------------------------------ */

seccion("El carrito no miente");
{
  const productos = await catalog.listProducts({
    includeInactive: true,
    includeArchived: true,
  });
  const categorias = await catalog.listCategories();
  const vivo = productos.find((p) => p.active && p.priceCents > 0 && !p.archived);

  const linea = (p, cantidad = 1) => ({
    lineId: `l-${p.id}`,
    productId: p.id,
    quantity: cantidad,
    optionIds: [],
    vista: { nombre: p.name, precioUnitarioCents: p.priceCents },
    agregadoEn: new Date().toISOString(),
  });

  const conArchivado = await catalog.updateProduct(producto.id, { archived: true });
  const resuelto = dominio.resolverCarrito(
    [linea(vivo), linea(conArchivado)],
    productos.map((p) => (p.id === conArchivado.id ? conArchivado : p)),
    new Date(),
    "America/Montevideo",
    categorias
  );
  const degradada = resuelto.lineas.find((l) => l.productId === conArchivado.id);
  ok(resuelto.lineas.length === 2, "la línea archivada sigue visible");
  ok(degradada.motivo === "ARCHIVED", "y dice por qué no se puede pedir");
  ok(degradada.disponible === false, "no es comprable");
  ok(
    resuelto.subtotalCents === vivo.priceCents,
    "no suma al total (solo cuenta el producto vivo)"
  );
  await catalog.updateProduct(producto.id, { archived: false });

  /* Categoría apagada: el producto sigue activo y aun así no se puede pedir. */
  const categoria = categorias.find((c) => c.id === vivo.categoryId);
  const apagadas = categorias.filter((c) => c.id !== categoria.id);
  const conCategoriaApagada = dominio.resolverCarrito(
    [linea(vivo)],
    productos,
    new Date(),
    "America/Montevideo",
    apagadas
  );
  ok(
    conCategoriaApagada.lineas[0].motivo === "CATEGORY_INACTIVE",
    "una categoría apagada vuelve no comprables a sus productos"
  );
  ok(
    conCategoriaApagada.subtotalCents === 0,
    "y esa línea tampoco suma"
  );

  /* La vitrina: la categoría apagada desaparece de la carta. */
  const seccionesTodas = vistas.seccionesDeCatalogo(categorias, productos);
  const seccionesSinUna = vistas.seccionesDeCatalogo(apagadas, productos);
  ok(
    seccionesTodas.length > seccionesSinUna.length,
    "la sección de la categoría apagada no se pinta"
  );
  ok(
    !seccionesTodas.some((s) => s.items.some((i) => i.id === producto.id && i.name === undefined)),
    "las secciones no muestran productos archivados"
  );
}

/* --- 11. Stock: una sola vez ---------------------------------------------- */

seccion("Stock limitado");
{
  const categorias = await catalog.listCategories();
  creadosAcá.add("Con stock limitado");
  const limitado = await catalog.createProduct({
    categoryId: categorias[0].id,
    name: "Con stock limitado",
    priceCents: 30000,
    ...dominio.camposDeModo("limited", 2),
  });
  await settings.updateSettings({
    acceptingOrders: true,
    pickupEnabled: true,
    deliveryEnabled: false,
    paymentMethods: { cash: true, mercadopago: false },
  });

  const draft = (clientRequestId, cantidad) => ({
    clientRequestId,
    items: [{ productId: limitado.id, quantity: cantidad, optionIds: [] }],
    fulfillment: { type: "pickup" },
    customer: { name: "Cliente", phone: "099111222" },
    payment: { method: "cash" },
  });

  const { order } = await orders.create(draft("stock-1", 1));
  ok(order.stockApplied === false, "crear el pedido NO descuenta stock");
  ok(
    (await catalog.getProduct({ id: limitado.id })).stockQuantity === 2,
    "el stock sigue intacto mientras el pedido espera confirmación"
  );

  const aceptado = await orders.changeStatus(order.id, "confirmed", {
    estimatedMinutes: 20,
  });
  ok(aceptado.stockApplied === true, "aceptar descuenta y deja la marca");
  ok(
    (await catalog.getProduct({ id: limitado.id })).stockQuantity === 1,
    "queda una unidad"
  );

  /* Segunda aceptación: la máquina de estados la rechaza y NO vuelve a
     descontar. Repetir una acción no puede ajustar dos veces. */
  ok(
    (await codigoDeError(() =>
      orders.changeStatus(order.id, "confirmed", { estimatedMinutes: 20 })
    )) === "INVALID_TRANSITION",
    "aceptar dos veces se rechaza"
  );
  ok(
    (await catalog.getProduct({ id: limitado.id })).stockQuantity === 1,
    "y el stock no se descontó dos veces"
  );

  await orders.changeStatus(order.id, "cancelled", { reason: "Prueba" });
  ok(
    (await catalog.getProduct({ id: limitado.id })).stockQuantity === 2,
    "cancelar repone exactamente lo descontado"
  );
  ok(
    (await codigoDeError(() =>
      orders.changeStatus(order.id, "cancelled", { reason: "Otra vez" })
    )) === "INVALID_TRANSITION",
    "cancelar dos veces se rechaza"
  );
  ok(
    (await catalog.getProduct({ id: limitado.id })).stockQuantity === 2,
    "y no repone dos veces"
  );

  /* Rechazar ANTES de aceptar no toca el stock. */
  const { order: segundo } = await orders.create(draft("stock-2", 1));
  await orders.changeStatus(segundo.id, "rejected", { reason: "Prueba" });
  ok(
    (await catalog.getProduct({ id: limitado.id })).stockQuantity === 2,
    "rechazar sin haber aceptado no repone nada"
  );

  /* Sin stock suficiente, la aceptación se bloquea y NOMBRA el producto. */
  await catalog.setAvailability(limitado.id, { stockQuantity: 1 });
  const { order: tercero } = await orders.create(draft("stock-3", 1));
  await catalog.setAvailability(limitado.id, { stockQuantity: 0 });
  const error = await codigoDeError(() =>
    orders.changeStatus(tercero.id, "confirmed", { estimatedMinutes: 15 })
  );
  ok(error === "STOCK_INSUFFICIENT", "sin stock no se puede aceptar");
  let mensaje = "";
  try {
    await orders.changeStatus(tercero.id, "confirmed", { estimatedMinutes: 15 });
  } catch (e) {
    mensaje = e.message;
  }
  ok(
    mensaje.includes("Con stock limitado"),
    "y el mensaje dice QUÉ producto falta"
  );

  /* Con stock en cero el producto deja de poder pedirse. */
  const agotado = await catalog.getProduct({ id: limitado.id });
  ok(
    vistas.vistaDeProducto(agotado).motivo === "OUT_OF_STOCK",
    "un producto en cero se muestra sin disponibilidad"
  );
  ok(
    dominio.productoPedible(agotado) === false,
    "y el dominio no lo deja pedir"
  );
}

/* --- 11 bis. Un extra con precio se cobra ---------------------------------- */

seccion("El incremento de una opción llega al pedido");
{
  const categorias = await catalog.listCategories();
  creadosAcá.add("Producto con extra");
  const conExtra = await catalog.createProduct({
    categoryId: categorias[0].id,
    name: "Producto con extra",
    priceCents: dinero.parsearPesos("400"),
    optionGroups: [
      {
        id: "g-extra",
        name: "Agregados",
        minSelect: 0,
        maxSelect: 2,
        position: 0,
        active: true,
        options: [
          {
            id: "o-cheddar",
            name: "Cheddar",
            priceDeltaCents: dinero.parsearPesosConSigno("60"),
            available: true,
            position: 0,
          },
          {
            id: "o-apagada",
            name: "Retirada",
            priceDeltaCents: 5000,
            available: false,
            position: 1,
          },
        ],
      },
    ],
  });

  ok(
    dominio.precioUnitario(conExtra, [{ priceDeltaCents: 6000 }]) === 46000,
    "el precio unitario suma el incremento del extra"
  );

  await settings.updateSettings({ acceptingOrders: true, pickupEnabled: true });
  const { order } = await orders.create({
    clientRequestId: "extra-1",
    items: [
      { productId: conExtra.id, quantity: 1, optionIds: ["o-cheddar"] },
    ],
    fulfillment: { type: "pickup" },
    customer: { name: "Cliente", phone: "099111222" },
    payment: { method: "cash" },
  });
  ok(order.totalCents === 46000, "y el pedido se cobra con el extra adentro");
  ok(
    order.items[0].options[0].optionName === "Cheddar",
    "la opción queda congelada en el pedido con su nombre"
  );

  ok(
    (await codigoDeError(() =>
      orders.create({
        clientRequestId: "extra-2",
        items: [
          { productId: conExtra.id, quantity: 1, optionIds: ["o-apagada"] },
        ],
        fulfillment: { type: "pickup" },
        customer: { name: "Cliente", phone: "099111222" },
        payment: { method: "cash" },
      })
    )) === "ITEM_UNAVAILABLE",
    "una opción desactivada no se puede pedir"
  );

  /* Grupo apagado: sus opciones dejan de ofrecerse y de exigirse. */
  const apagado = await catalog.updateProduct(conExtra.id, {
    optionGroups: conExtra.optionGroups.map((g) => ({
      ...g,
      minSelect: 1,
      active: false,
    })),
  });
  ok(
    vistas.vistaDeProducto(apagado).optionGroups.length === 0,
    "un grupo apagado no se le muestra al cliente"
  );
  const conGrupoApagado = await orders.create({
    clientRequestId: "extra-3",
    items: [{ productId: conExtra.id, quantity: 1, optionIds: [] }],
    fulfillment: { type: "pickup" },
    customer: { name: "Cliente", phone: "099111222" },
    payment: { method: "cash" },
  });
  ok(
    conGrupoApagado.order.totalCents === 40000,
    "y su mínimo deja de bloquear la venta del producto"
  );
}

/* --- 12. Zonas y configuración -------------------------------------------- */

seccion("Zonas de delivery y configuración");
{
  const zonasIniciales = await settings.listDeliveryZones();
  ok(zonasIniciales.length === 0, "la instalación arranca sin zonas inventadas");

  const ajustes = await settings.getSettings();
  ok(
    dominio.deliveryDisponible({ deliveryEnabled: true }, []) === false,
    "habilitar delivery sin zonas NO lo hace disponible"
  );

  const zona = await settings.upsertDeliveryZone({
    name: "Zona de prueba",
    feeCents: dinero.parsearPesos("120"),
    minOrderCents: dinero.parsearPesos("500"),
  });
  ok(zona.feeCents === 12000, "el costo se guarda en centésimos");
  ok(zona.archived === false, "la zona nace sin archivar");

  await settings.updateSettings({ deliveryEnabled: true });
  const conZona = await settings.listDeliveryZones();
  ok(
    dominio.deliveryDisponible(await settings.getSettings(), conZona),
    "con una zona activa y el interruptor encendido, hay delivery"
  );

  const errores = dominio.validarZona(
    { name: "", feeCents: -1, minOrderCents: null },
    { zonas: conZona }
  );
  ok(errores.name, "zona sin nombre se rechaza");
  ok(errores.feeCents, "costo negativo se rechaza");
  ok(errores.minOrderCents, "mínimo ilegible se rechaza");
  ok(
    dominio.validarZona(
      { name: "Zona de prueba", feeCents: 0, minOrderCents: 0 },
      { zonas: conZona }
    ).name,
    "no se repite el nombre de una zona existente"
  );

  /* Zona desactivada durante el checkout: la confirmación se corta. */
  const productos = await catalog.listProducts();
  const vendible = productos.find((p) => p.active && p.priceCents > 0);
  await settings.upsertDeliveryZone({
    id: zona.id,
    name: zona.name,
    feeCents: zona.feeCents,
    active: false,
  });
  const codigo = await codigoDeError(() =>
    orders.create({
      clientRequestId: "zona-apagada",
      items: [{ productId: vendible.id, quantity: 1, optionIds: [] }],
      fulfillment: { type: "delivery", zoneId: zona.id, address: "Calle 123" },
      customer: { name: "Cliente", phone: "099111222" },
      payment: { method: "cash" },
    })
  );
  ok(codigo === "ZONE_UNAVAILABLE", "una zona apagada bloquea la confirmación");

  /* Tienda pausada: la carta se ve, el pedido no se confirma. */
  await settings.updateSettings({ acceptingOrders: false });
  const pausada = await codigoDeError(() =>
    orders.create({
      clientRequestId: "pausada",
      items: [{ productId: vendible.id, quantity: 1, optionIds: [] }],
      fulfillment: { type: "pickup" },
      customer: { name: "Cliente", phone: "099111222" },
      payment: { method: "cash" },
    })
  );
  ok(pausada === "STORE_CLOSED", "con los pedidos pausados no se confirma");
  ok(
    (await catalog.listProducts()).length > 0,
    "pero el catálogo se sigue pudiendo mirar"
  );
  await settings.updateSettings({
    acceptingOrders: true,
    deliveryEnabled: ajustes.deliveryEnabled,
  });
}

/* --- 13 bis. Migración de una base ya guardada ----------------------------- */

seccion("Migración no destructiva (v2 → v3)");
{
  const { seedPorDefecto } = require_(MOD("demo/seed.js"));
  const { migrarBase, completarImagenesDelSeed } = require_(MOD("demo/migraciones.js"));
  const semilla = seedPorDefecto();

  /* Una v2 realista: la de alguien que ya usó la demo. Tiene un pedido, un
     precio corregido, un producto creado desde el panel y una foto cambiada a
     mano; y le faltan las imágenes que este cambio agrega. */
  const conImagenViejaPropia = {
    ...semilla.products[0],
    priceCents: 61000,
    imageUrl: "/hamburgueseria/galeria/local-05-frente.jpg",
  };
  const delPanel = {
    ...semilla.products[0],
    id: "prod_creado_en_el_panel",
    slug: "creado-en-el-panel",
    name: "Creado desde el panel",
    imageUrl: undefined,
    stageImageUrl: undefined,
  };
  const sinRecorte = semilla.products.find((p) => p.name === "Bacon Fest");
  const sinFoto = semilla.products.find((p) => p.name === "Papas de la casa");

  const guardada = {
    ...semilla,
    version: 2,
    products: [
      conImagenViejaPropia,
      { ...sinRecorte, stageImageUrl: undefined },
      { ...sinFoto, imageUrl: undefined },
      delPanel,
    ],
    deliveryZones: [
      {
        id: "z-guardada",
        name: "Zona del dueño",
        feeCents: 15000,
        minOrderCents: 0,
        active: true,
        position: 0,
        archived: false,
      },
    ],
    settings: { ...semilla.settings, acceptingOrders: false, defaultPrepMinutes: 35 },
    orders: [{ id: "pedido-viejo", orderNumber: "0007", totalCents: 123400 }],
  };

  const migrada = migrarBase(guardada);
  ok(migrada !== null, "una base v2 guardada se puede migrar");
  ok(migrada.version === 3, "queda en la versión nueva");
  ok(
    migrada.orders.length === 1 && migrada.orders[0].orderNumber === "0007",
    "el pedido viejo sigue ahí"
  );
  ok(
    migrada.deliveryZones[0].name === "Zona del dueño" &&
      migrada.settings.acceptingOrders === false &&
      migrada.settings.defaultPrepMinutes === 35 &&
      migrada.categories.length === semilla.categories.length,
    "zonas, configuración y categorías quedan intactas"
  );

  const buscar = (id) => migrada.products.find((p) => p.id === id);
  ok(
    buscar(conImagenViejaPropia.id).priceCents === 61000,
    "un precio corregido a mano no se pisa"
  );
  ok(
    buscar(conImagenViejaPropia.id).imageUrl ===
      "/hamburgueseria/galeria/local-05-frente.jpg",
    "una imagen elegida desde el panel tampoco"
  );
  ok(
    buscar(sinRecorte.id).stageImageUrl === sinRecorte.stageImageUrl,
    "al producto sin recorte se le completa el de vitrina (Bacon Fest)"
  );
  ok(
    buscar(sinFoto.id).imageUrl === sinFoto.imageUrl,
    "y al acompañamiento sin foto, la suya"
  );
  const creado = buscar("prod_creado_en_el_panel");
  ok(
    creado.imageUrl === undefined && creado.stageImageUrl === undefined,
    "un producto creado desde el panel no recibe imágenes que nadie le puso"
  );
  ok(
    migrarBase({ ...guardada, version: 1 }) === null,
    "una versión que la migración no conoce no se da por buena"
  );

  const { completados } = completarImagenesDelSeed(semilla.products, semilla);
  ok(
    completados.length === 0,
    "sobre una base ya al día, la migración no toca nada"
  );
}

/* --- 13. Nada inventado --------------------------------------------------- */

seccion("Sin datos inventados y sin Supabase");
{
  const productos = await catalog.listProducts({
    includeInactive: true,
    includeArchived: true,
  });
  const prospecto = require_(path.join(RAIZ, "data/prospects/_ejemplo.json"));
  const delJson = new Set(prospecto.menu.flatMap((s) => s.items.map((i) => i.name)));
  const inventados = productos.filter(
    (p) => !delJson.has(p.name) && !creadosAcá.has(p.name)
  );
  if (inventados.length) {
    console.log(`      sobran: ${inventados.map((p) => p.name).join(", ")}`);
  }
  ok(
    inventados.length === 0,
    "el seed no trae ningún producto que no esté en el JSON del prospecto"
  );
  ok(
    productos
      .filter((p) => delJson.has(p.name))
      .every((p) => p.optionGroups.length === 0),
    "a los productos del negocio no se les inventaron variantes"
  );
  ok(dominio.DOMINIOS_IMAGEN_PERMITIDOS.length === 0, "no se amplió el allowlist de imágenes");
}

/* --- Resultado ------------------------------------------------------------ */

console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLO(S)`);
process.exit(fallos === 0 ? 0 : 1);
