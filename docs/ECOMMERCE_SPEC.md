# Especificación — Ecommerce gastronómico sobre la plantilla `hamburgueseria`

> **Estado:** contrato previo a la implementación. Fase 0 (auditoría + especificación).
> Ningún punto de este documento está implementado todavía.
> **Última auditoría del código:** commit `491e524` (`master`), 2026-08-19.

> **Estrategia de implementación (aprobada, 2026-08-19).** Primero se implementa
> un proveedor **demo local** detrás de los repositorios de §4.4, para poder
> mostrar y vender la experiencia completa antes de conectar nada. Supabase
> sustituye ese proveedor una vez validada la experiencia, sin tocar los
> componentes visuales. **El modo demo no es apto para operación real:** guarda
> en el navegador, no sincroniza entre dispositivos y cualquiera con la consola
> abierta puede editarlo.

---

## 1. Objetivo y alcance

Convertir la landing de la hamburguesería en un **ecommerce operativo con checkout
propio y panel de gestión**, sin destruir la experiencia visual existente (hero 3D
ligado al scroll, vitrina de producto, secciones animadas).

El resultado esperado, al terminar todas las fases:

- El cliente arma un pedido real desde el catálogo, elige retiro o delivery, deja
  sus datos sin crear cuenta, confirma y recibe un número de pedido.
- El restaurante ve el pedido entrar, lo **acepta o rechaza manualmente**, informa
  un tiempo estimado y hace avanzar su estado hasta completarlo.
- El dueño administra catálogo, precios, fotos, disponibilidad, zonas de entrega y
  usuarios, y consulta un reporte básico de ventas.
- El pago inicial es **efectivo contra entrega / al retirar**. Mercado Pago queda
  previsto arquitectónicamente pero **desactivado**.

**Modelo comercial:** cada ecommerce es una instalación independiente.

```text
1 restaurante → 1 repositorio/deployment → 1 proyecto Supabase → 1 dominio → 1 base aislada
```

No es un SaaS multiempresa. No hay `businessId`, ni tenants, ni selector de negocios.
La única concesión a la multiplicidad es la que **ya existe** en el repo (`/[slug]`)
y se resuelve en §4.2 sin introducir multi-tenancy en la base.

### Alcance de esta fase (Fase 0)

- Auditoría del repositorio actual.
- Este documento.
- **Nada más.** No se instalan dependencias, no se configura Supabase, no se crean
  tablas ni migraciones, no se toca ningún componente visual.

---

## 2. Fuera de alcance

Explícitamente **no** se construye, ni ahora ni en las fases planificadas:

| Fuera de alcance | Nota |
|---|---|
| Multiempresa / multi-tenant | Una instalación = un restaurante |
| Cuentas de cliente (registro, login, "mis pedidos" con contraseña) | Compra como invitado |
| Inventario de materias primas (panes, gramos de carne, cheddar) | Solo disponible / agotado / cantidad limitada |
| Cupones, descuentos, promociones, combos dinámicos | — |
| Puntos, fidelización, referidos | — |
| Facturación fiscal (CFE, DGI) | El reporte **no** es contabilidad |
| Tracking GPS, mapas, ruteo, app del repartidor | Zonas configurables por nombre |
| App móvil nativa | Web responsive |
| Automatización de WhatsApp (Cloud API, proveedores) | Enlaces `wa.me` con mensaje prearmado |
| Pagos online **activos** | Mercado Pago previsto pero deshabilitado |
| Pedidos programados | El modelo los contempla; la UI del MVP solo ofrece "lo antes posible" |
| Múltiples sucursales | Una dirección, un juego de horarios |
| Impresión automática de comandas | — |

---

## 3. Arquitectura actual auditada

### 3.1 Qué hay

```text
scraper/        Python + Google Places. Produce ClientData parcial. No toca la web.
data/prospects/ Un JSON por prospecto. Hoy: solo `_ejemplo.json`.
web/            Next.js 15.5.22 · React 19 · TypeScript strict · Tailwind v4 · motion 12.43
templates/      Componentes React por vertical. Viven FUERA de web/.
agent/          Prompts para Claude Code.
scripts/        Utilidades Python de assets (recortes con alfa, capas del hero).
```

`web/package.json` — dependencias reales: `next`, `react`, `react-dom`, `motion`.
Dev: `tailwindcss`, `@tailwindcss/postcss`, `typescript`, `@types/*`.
**No hay linter, ni test runner, ni CI.** Scripts disponibles: `dev`, `build`, `start`.

### 3.2 Rutas públicas existentes

| Ruta | Archivo | Naturaleza |
|---|---|---|
| `/` | `web/app/page.tsx` | Índice interno de demos (lista de slugs). Server Component. |
| `/[slug]` | `web/app/[slug]/page.tsx` | La demo. **SSG con `dynamicParams = false`.** |

No existen: `middleware.ts`, Route Handlers, API routes, Server Actions, cookies,
sesión, ni ningún `process.env` fuera de `NEXT_PUBLIC_SITE_URL` (`web/lib/site.ts`).

### 3.3 De dónde salen hoy los productos

```text
data/prospects/_ejemplo.json
  └─ menu: MenuSection[] { title, items: MenuItem[] }
        └─ web/lib/prospects.ts   getAllProspects() → fs.readdir(process.cwd()/../data/prospects)
              └─ web/app/[slug]/page.tsx   getProspectBySlug(slug)   [BUILD TIME]
                    └─ templates/hamburgueseria/Template.tsx   data.menu
                          └─ MenuSeccion.tsx   → Vitrina → ProductoSlide
```

`MenuItem` (contrato en `web/lib/schema.ts`):

```ts
{ name, description?, price?: string, image?, tag?, ingredients?: string[], stageImage? }
```

### 3.4 Cómo se arma el CTA de WhatsApp

Tres constructores **duplicados**, con dos formas distintas:

| Lugar | Función | Salida |
|---|---|---|
| `templates/.../Template.tsx:48` | `waHref(whatsapp)` | `https://wa.me/<num>` (sin texto) |
| `templates/.../ComoPedir.tsx:65` | `waHref(whatsapp)` | idéntica a la anterior |
| `templates/.../menu.ts:51` | `hrefPedirProducto(whatsapp, nombre)` | `https://wa.me/<num>?text=Hola, quiero pedir: <nombre>.` |

Las tres normalizan con `replace(/\D/g, "")` y las tres devuelven `null`/`undefined`
si no hay número — sin número **no se renderiza ningún CTA**, que es el
comportamiento correcto y hay que conservarlo.

El `hrefPedido` se propaga por props desde `Template.tsx` a `Nav`, `HeroExperience`,
`PlanchaViva`, `Horarios` y `PieDePagina`.

### 3.5 Componentes que deberán consumir datos dinámicos

| Componente | Hoy | Con ecommerce |
|---|---|---|
| `MenuSeccion.tsx` | `data.menu` (JSON) | Catálogo de Supabase + "agregar al carrito" |
| `HeroExperience.tsx` | `itemDestacado(menu)` para la ficha del producto firma | Producto destacado del catálogo |
| `Nav.tsx` | CTA `Pedir` → `wa.me` | CTA `Pedir` → `/carrito` + contador de ítems |
| `ComoPedir.tsx` | Pasos editoriales + CTA WhatsApp | Copy editorial adaptado al flujo real |
| `Horarios.tsx` | `hours` del JSON (display) | Sigue siendo display; la validación usa otra fuente (§9.3) |
| `PlanchaViva.tsx`, `Historia.tsx`, `Resenas.tsx`, `Galeria.tsx`, `PieDePagina.tsx` | Editorial | **Sin cambios** |

De los 20 módulos `.ts`/`.tsx` de `templates/hamburgueseria/`, **13 llevan
`"use client"`**. `Template.tsx` y `Nav.tsx` son los únicos componentes de servidor;
`menu.ts`, `horarios.ts`, `tipografia.ts`, `animacion.ts` y `capas.ts` son módulos
neutros que se pueden importar desde ambos lados.

### 3.6 Qué NO existe (verificado)

Búsqueda sobre `templates/`, `web/app`, `web/lib`, `scripts/`, `scraper/`:

- `supabase` → **0 coincidencias** en todo el repo.
- Carrito, checkout, login, sesión, JWT, cookies, RLS → **0 coincidencias**.
- Panel administrativo, roles, usuarios → **0 coincidencias**.

Se parte de cero. No hay código a migrar ni a borrar.

### 3.7 Conflictos concretos entre el contrato actual y el ecommerce

Estos son hallazgos de código, no opiniones. Cada uno tiene una resolución propuesta.

| # | Conflicto | Evidencia | Resolución |
|---|---|---|---|
| C1 | **Todo el sitio es SSG de build**. `dynamicParams = false` + `generateStaticParams()` + lectura de filesystem. Un catálogo editable no puede vivir en un HTML congelado en build. | `web/app/[slug]/page.tsx:25-30`; comentario del archivo explicando que en runtime serverless el directorio `data/` no existe | §4.3: la cáscara editorial sigue estática/ISR; el catálogo pasa a fetch en servidor con `revalidateTag`; carrito, checkout y panel son dinámicos |
| C2 | **El precio es un string** (`"$490"`). Sin moneda, sin unidad, sin decimales. No se puede sumar, ni recalcular, ni auditar. | `web/lib/schema.ts:18` | `price_cents integer` + `currency 'UYU'` en Supabase. El string del JSON solo sobrevive como semilla |
| C3 | **El producto no tiene identidad**. No hay `id` ni `slug`; las keys de React usan `item.name`. Dos productos homónimos colisionan y un renombrado rompe cualquier referencia. | `MenuSeccion.tsx` (`key={item.name}`), `schema.ts:15-51` | `product.id uuid` + `slug` único. El carrito referencia `id`, nunca nombre |
| C4 | **`hours` es texto libre** (`day: "Lun a Jue"`, `open: "19:00 – 02:00"`). `horarios.ts` lo parsea con una regex **solo para el número gigante del póster**. No sirve para decidir si la tienda está abierta ahora. | `templates/.../horarios.ts:19-46` | Horarios **operativos** estructurados en `restaurant_settings` (día de semana + apertura/cierre en minutos + TZ). El `hours` del JSON queda como display editorial |
| C5 | **`ingredients` no son opciones**. Es una lista de texto para el desplegable, sin precio, sin obligatoriedad, sin exclusión mutua. | `schema.ts:31` + comentario | Los grupos de opciones son entidades nuevas (`ProductOptionGroup` / `ProductOption`). `ingredients` sigue siendo copy y **no** se convierte automáticamente |
| C6 | **Las fotos son archivos del repo**. El dueño no puede subir una foto sin un deploy. | `web/public/hamburgueseria/**` | Fotos de producto → Supabase Storage. Las editoriales (hero, galería, plancha, capas) siguen en `public/` |
| C7 | **`stageImage` lo genera un script Python local** (recorte con alfa, lienzo 1600², línea de piso 87.5%). El dueño no puede producirlo desde el panel. | `scripts/normalizar_productos_menu.py` | `stageImage` queda como asset de agencia. El panel escribe `image_url`; la vitrina ya degrada honestamente al fallback cuadrado |
| C8 | **`/[slug]` implica N restaurantes por deployment**, el ecommerce implica uno. | `web/app/[slug]/page.tsx`, `web/app/page.tsx`, `lib/prospects.ts` | §4.2: `RESTAURANT_SLUG` fija la instalación a un JSON; `/` sirve la tienda. Sin `businessId` en la base |
| C9 | **Zona horaria implícita**. No hay manejo de TZ en ningún lado. Vercel corre en UTC. | ausencia | `America/Montevideo` explícito en config; `timestamptz` en base; el "día de negocio" se calcula en TZ local |
| C10 | **Los templates viven fuera de `web/`** y resuelven módulos con `webpack.resolve.modules` + `experimental.externalDir`. | `web/next.config.ts` | Todo el código de servidor nuevo (clientes de Supabase, acciones, handlers) vive **dentro de `web/`**. Los templates solo reciben props |
| C11 | **No hay linter ni tests**. | `web/package.json` | Los criterios de aceptación de cada fase se apoyan en `tsc --noEmit`, `next build` y verificación con Playwright headless (ya usada en este repo) |
| C12 | **El `<h1>` y la metadata son de demo** (`robots: noindex`). Una tienda real necesita indexarse. | `web/app/[slug]/page.tsx:57-61` | La instalación de ecommerce invierte `SIN_INDEXAR`. Decisión de Fase 9 |

---

## 4. Arquitectura objetivo

### 4.1 Piezas

```text
Cliente (browser)
   │  HTML editorial estático  +  catálogo revalidado  +  carrito en localStorage
   ▼
Next.js 15 (Vercel)
   ├─ Rutas públicas          Server Components → Supabase (anon, RLS lectura)
   ├─ Route Handlers          checkout, estado de pedido, webhook MP (futuro)
   ├─ Server Actions          mutaciones del panel (sesión + rol)
   └─ Panel /admin            dinámico, nunca prerenderizado
   ▼
Supabase
   ├─ Postgres + RLS          catálogo, pedidos, clientes, configuración
   ├─ Auth                    usuarios administrativos (owner / employee)
   ├─ Storage                 fotos de producto
   └─ Realtime                pedidos nuevos en el panel
```

### 4.2 Rutas

| Ruta | Tipo | Render | Quién entra |
|---|---|---|---|
| `/` | pública | ISR (editorial) + catálogo revalidado | cualquiera |
| `/producto/[slug]` | pública | ISR + fetch | cualquiera |
| `/carrito` | pública | dinámica (cliente) | cualquiera |
| `/checkout` | pública | dinámica | cualquiera |
| `/pedido/[token]` | pública | dinámica, sin caché | quien tenga el token |
| `/api/checkout` | Route Handler `POST` | dinámica | público, con idempotencia |
| `/api/pedidos/[token]` | Route Handler `GET` | dinámica | público, con token |
| `/api/pagos/mercadopago/webhook` | Route Handler `POST` | dinámica | **Fase 7**, inactivo |
| `/admin` … | privada | `force-dynamic` | sesión con rol |
| `/[slug]` | pública | SSG (hoy) | **se conserva**; ver abajo |

**Resolución de C8.** La instalación se ata a un restaurante con una variable de
entorno:

```text
RESTAURANT_SLUG=ejemplo-burger-pocitos
```

`/` deja de ser el índice de demos y pasa a renderizar la tienda de ese slug.
`/[slug]` **no se borra** (el repo sigue siendo Prospector y la demo tiene valor
comercial), pero en una instalación de ecommerce solo hay un JSON en `data/prospects/`,
así que `generateStaticParams()` produce una sola ruta. La base de datos no sabe
nada de slugs: contiene un solo restaurante y por eso **no lleva `businessId`**.

Si en el futuro una instalación necesitara servir dos restaurantes, la decisión
correcta es **duplicar el deployment**, no agregar tenancy.

### 4.3 Estrategia de render y caché (resolución de C1)

| Contenido | Estrategia | Invalidación |
|---|---|---|
| Editorial (hero, historia, galería, reseñas, plancha) | Estático desde JSON, como hoy | redeploy |
| Catálogo (categorías, productos, precios, fotos) | Server Component + `fetch`/`cache` etiquetado `catalogo` | `revalidateTag('catalogo')` en cada mutación del panel |
| Disponibilidad y stock | Igual que catálogo, **pero se revalida al vuelo** en checkout | el backend relee antes de crear el pedido |
| Configuración operativa (horarios, zonas, mínimos) | etiqueta `config` | `revalidateTag('config')` |
| Carrito | `localStorage` del navegador, sin servidor | — |
| Checkout / pedido / panel | dinámico, `no-store` | — |

**Regla dura:** el HTML cacheado puede mostrar un precio viejo durante segundos;
el **pedido nunca se crea con ese precio**. El backend siempre relee (§11.3).

### 4.4 Dónde vive cada cosa

```text
web/lib/supabase/server.ts     cliente con cookies (sesión de usuario admin)
web/lib/supabase/service.ts    cliente con service role — SOLO en servidor
web/lib/supabase/browser.ts    cliente anon para Realtime en el panel
web/lib/catalogo/*.ts          lecturas del catálogo (tipadas)
web/lib/pedidos/*.ts           creación, transiciones, cálculo de totales
web/lib/whatsapp.ts            ÚNICO constructor de enlaces wa.me (unifica §3.4)
web/lib/dinero.ts              enteros en centésimos + formateo UYU
web/lib/horario.ts             apertura/cierre operativo en America/Montevideo
web/app/(tienda)/...           rutas públicas del ecommerce
web/app/admin/...              panel
web/app/api/...                Route Handlers
templates/hamburgueseria/...   SOLO presentación; reciben props, no consultan
```

**Regla dura:** ningún archivo de `templates/` importa Supabase. Los templates son
la capa visual reutilizable del sistema Prospector y deben seguir funcionando con
datos de JSON puro (C10).

---

## 5. Separación JSON vs Supabase

### 5.1 Sigue en el JSON (autoridad: la agencia, versionado en git)

Identidad visual · copy editorial · hero (heading, sub, modelo 3D, video) ·
`planchaViva` · `about` + `highlights` · `gallery` · `reviews` **reales** ·
dirección pública · `mapsUrl` · Instagram · `shareImage` · `ordering` (pasos) ·
`hours` **como texto de exhibición** · `tagline` · `vertical` · `slug`.

### 5.2 Pasa a Supabase (autoridad: el restaurante, editable sin deploy)

Categorías · productos · precios · variantes · extras · disponibilidad · stock ·
horarios **operativos** · zonas de entrega · pedido mínimo · costos de envío ·
clientes · direcciones · pedidos · pagos · usuarios administrativos ·
configuración operativa (abierto/cerrado manual, tiempos estimados por defecto,
número de WhatsApp operativo) · reportes derivados.

### 5.3 Duplicación transitoria y su fin

`data.menu` se usa **una sola vez** como semilla (Fase 2). Después:

- El JSON conserva `menu` únicamente si la demo comercial de Prospector lo sigue
  necesitando; en una instalación de ecommerce se **vacía** (`menu: []`) para que
  no exista una segunda fuente de verdad.
- La plantilla deja de leer `data.menu` y pasa a recibir el catálogo por props.
- **Criterio de cierre de la migración (Fase 2):** `grep -rn "data.menu" templates/ web/`
  devuelve cero coincidencias fuera del seeder.

### 5.4 Campo por campo, del JSON a la base

| `MenuItem` (JSON) | Destino | Nota |
|---|---|---|
| `name` | `products.name` | — |
| `description` | `products.description` | — |
| `price: "$490"` | `products.price_cents: 49000` | parseo en el seeder; falla ruidosa si no matchea |
| `image` | `products.image_url` | se sube a Storage o se referencia la ruta pública existente |
| `stageImage` | `products.stage_image_url` | asset de agencia (C7) |
| `tag` | `products.badge` | enum: `destacado \| nuevo \| vegano \| sin_tacc` |
| `ingredients[]` | `products.ingredients text[]` | **copy**, no opciones (C5) |
| `MenuSection.title` | `categories.name` | orden por posición en el array |

---

## 6. Roles y matriz de permisos

```text
anon      visitante sin sesión (el cliente que compra)
employee  empleado del local
owner     dueño
service   el servidor de Next (service role de Supabase) — nunca el navegador
```

| Acción | anon | employee | owner |
|---|:--:|:--:|:--:|
| Ver catálogo activo | ✅ | ✅ | ✅ |
| Ver productos inactivos / borradores | ❌ | ❌ | ✅ |
| Crear pedido (vía `/api/checkout`) | ✅¹ | ✅ | ✅ |
| Ver **su** pedido por token | ✅ | ✅ | ✅ |
| Listar todos los pedidos | ❌ | ✅ | ✅ |
| Aceptar / rechazar pedido | ❌ | ✅ | ✅ |
| Cambiar estado de preparación | ❌ | ✅ | ✅ |
| Indicar tiempo estimado | ❌ | ✅ | ✅ |
| Cancelar pedido ya confirmado | ❌ | ❌ | ✅ |
| Marcar pago recibido | ❌ | ✅ | ✅ |
| Ver teléfono/dirección del cliente | ❌ | ✅² | ✅ |
| Buscar pedidos históricos | ❌ | ✅ | ✅ |
| Crear/editar/borrar productos y categorías | ❌ | ❌ | ✅ |
| Cambiar precios | ❌ | ❌ | ✅ |
| Marcar agotado / disponible | ❌ | ✅³ | ✅ |
| Ordenar productos | ❌ | ❌ | ✅ |
| Subir fotos | ❌ | ❌ | ✅ |
| Editar zonas, mínimos y costos de envío | ❌ | ❌ | ✅ |
| Abrir/cerrar la tienda manualmente | ❌ | ✅ | ✅ |
| Ver listado de clientes | ❌ | ❌ | ✅ |
| Ver reportes | ❌ | ❌ | ✅ |
| Crear/eliminar usuarios administrativos | ❌ | ❌ | ✅ |

¹ El pedido lo inserta el **servidor** con service role. El rol `anon` **no tiene
INSERT** sobre `orders`: si lo tuviera, cualquiera podría escribir totales.
² El empleado ve los datos de contacto **de los pedidos activos** que debe cumplir;
no accede al listado histórico de clientes.
³ Agotar/reponer es operación de turno, no administración: el empleado puede.

**Invariante:** ninguna ruta pública lee tablas administrativas. El panel vive bajo
`/admin` y está protegido por sesión **y** por RLS — dos barreras, no una.

---

## 7. Flujo completo del cliente

```text
1. Entra a /                        landing editorial intacta + catálogo real
2. Explora el menú                  categorías, productos, badges, agotados visibles
3. Abre un producto                 /producto/[slug] o panel dentro de la vitrina
4. Configura                        variantes (obligatorias) + extras (opcionales)
                                    + cantidad + observaciones (máx. 280 caracteres)
5. Agrega al carrito                el carrito vive en localStorage
6. Revisa el carrito                /carrito: editar cantidad, quitar, vaciar
7. Elige modalidad                  RETIRO o DELIVERY
      DELIVERY → zona → dirección + referencias → costo y mínimo de esa zona
      RETIRO   → sin costo, muestra la dirección del local
8. Deja sus datos                   nombre + teléfono (obligatorios), email (opcional)
9. Elige pago                       Efectivo (activo) · Mercado Pago (visible, deshabilitado)
      Efectivo → "¿con cuánto pagás?" (opcional) → calcula el vuelto informativo
10. Confirma                        POST /api/checkout con idempotency key
11. Recibe                          número de pedido + enlace /pedido/[token]
12. Ve el estado                    "Esperando confirmación del local"
13. El local acepta                 el estado cambia; si hay WhatsApp, el local le escribe
```

**Alternativa siempre disponible:** el botón "Pedir por WhatsApp" no desaparece.
Convive con el checkout y es la vía de escape cuando algo falla (§19).

**El cliente nunca ve "pedido aceptado" antes de que el restaurante lo acepte.**
El copy del paso 12 es explícito: *"Recibimos tu pedido. El local lo va a confirmar
en unos minutos."*

---

## 8. Flujo operativo del restaurante

```text
1. Login en /admin                       email + contraseña (Supabase Auth)
2. Tablero de pedidos                    Realtime: el pedido nuevo aparece solo
                                         + señal sonora/visual (configurable)
3. Abre el pedido                        ítems con opciones, observaciones,
                                         modalidad, dirección o retiro, pago,
                                         teléfono, total
4. Decide                                ACEPTAR → indica minutos estimados
                                         RECHAZAR → motivo obligatorio
5. Prepara                               confirmed → preparing → ready
6. Entrega                               ready → out_for_delivery → completed
                                         ready → ready_for_pickup  → completed
7. Cobra                                 marca el pago recibido (efectivo)
8. Contacta                              botones de WhatsApp prearmados (§13)
```

**Todo cambio de estado queda registrado** en `order_status_events` con autor,
timestamp y motivo. No hay transiciones silenciosas.

**Gestión de catálogo** (solo `owner`): productos, categorías, precios, fotos,
orden, activo/inactivo, agotado, disponibilidad horaria, zonas, mínimos y costos.

---

## 9. Retiro y delivery

### 9.1 Retiro en el local

Sin costo. Muestra la dirección del JSON (`data.address`) y el `mapsUrl`.
No pide dirección al cliente. Estado terminal previo: `ready_for_pickup`.

### 9.2 Delivery por zonas

Cada zona es una fila de `delivery_zones`:

```text
name              "Pocitos"        — texto que el dueño elige
fee_cents         entero            costo del envío en esa zona
min_order_cents   entero            pedido mínimo (0 = sin mínimo)
is_active         boolean
position          orden en el selector
```

El cliente **elige la zona de una lista**. No hay geocodificación, no hay polígonos,
no hay GPS. La dirección y las referencias son texto libre que viaja al pedido.

- Si el subtotal < `min_order_cents` de la zona elegida → **no se puede confirmar**;
  la UI muestra cuánto falta.
- El `fee_cents` se suma al total y queda **congelado** en el pedido (§21.11).
- Si el dueño desactiva una zona con un carrito abierto, el checkout la rechaza
  y pide elegir otra (§19.7).

### 9.3 Horarios y validación (resolución de C4)

El `hours` del JSON **no se usa para validar** — es texto libre pensado para el
póster. La validación usa `restaurant_settings.service_hours`, estructurado:

```text
[{ weekday: 0..6, opens_min: 1140, closes_min: 1560 }, ...]
   opens_min / closes_min en minutos desde 00:00 del día local.
   Un cierre > 1440 significa "después de medianoche" (mismo criterio que horarios.ts).
```

Zona horaria fija: **`America/Montevideo`** (C9). Se guarda en la configuración
para no dejarla implícita.

Sobre eso mandan dos interruptores manuales:

- `is_accepting_orders` — el local puede cerrar aunque el horario diga abierto.
- `closed_message` — texto opcional que se muestra al cliente.

**"Lo antes posible"** es la única opción de tiempo del MVP. El modelo ya contempla
`scheduled_for timestamptz null` para pedidos programados; la UI no lo expone.

---

## 10. Carrito

- **Vive en `localStorage`**, no en la base. Un carrito no es un dato del negocio:
  no ensucia la base con filas que nadie va a mirar, y sobrevive a un refresh.
- Clave versionada: `carrito:v1`. Un cambio de forma invalida y vacía en vez de
  romper (`try/catch` + validación de forma al hidratar).
- Cada línea guarda: `productId`, `quantity`, `optionIds[]`, `notes`, y un
  **snapshot de visualización** (nombre, precio unitario, foto) usado solo para
  pintar el carrito rápido.
- **El snapshot no es autoridad.** Al entrar a `/checkout` y otra vez al confirmar,
  el servidor revalida contra la base: existencia, `is_active`, disponibilidad,
  stock y precio (§11.3).
- Operaciones: agregar, cambiar cantidad, quitar línea, vaciar.
- Dos líneas del mismo producto con **opciones u observaciones distintas** son
  líneas distintas. Con opciones y observaciones idénticas, se suman cantidades.
- **Límites duros:** máx. 50 líneas, máx. 99 unidades por línea, observaciones
  ≤ 280 caracteres. Evitan payloads absurdos en el POST.
- El carrito es **por dispositivo**: no se sincroniza entre navegadores (no hay
  cuentas, §2).

---

## 11. Checkout

### 11.1 Pasos

Una sola página con secciones (mobile-first), no un wizard de 4 pantallas:

```text
[Resumen del pedido]  →  [Modalidad]  →  [Datos]  →  [Pago]  →  [Confirmar]
```

### 11.2 Datos que se piden

| Campo | Obligatorio | Validación |
|---|---|---|
| Nombre | ✅ | 2–80 caracteres |
| Teléfono | ✅ | dígitos normalizados; se guarda también en formato E.164 cuando se puede |
| Email | ❌ | formato válido si viene |
| Modalidad | ✅ | `pickup` \| `delivery` |
| Zona | solo delivery | debe existir y estar activa |
| Dirección | solo delivery | 5–160 caracteres |
| Referencias | ❌ | ≤ 160 caracteres |
| Método de pago | ✅ | solo métodos habilitados |
| Paga con | ❌ | entero ≥ total; solo si efectivo |
| Observaciones del pedido | ❌ | ≤ 280 caracteres |

### 11.3 Recálculo en el servidor — no negociable

`POST /api/checkout` recibe **estructura, no dinero**:

```text
{ idempotencyKey, items: [{ productId, quantity, optionIds[], notes }],
  fulfillment: { type, zoneId?, address?, reference? },
  customer: { name, phone, email? },
  payment: { method, cashAmountCents? },
  notes?, displayedTotalCents }
```

El servidor:

1. Verifica que la tienda esté abierta (§9.3).
2. Verifica que `items` no esté vacío.
3. Relee cada producto y cada opción de la base. Rechaza inactivos, agotados y
   opciones que no pertenecen al producto.
4. **Calcula** `unit_price_cents = product.price_cents + Σ option.price_delta_cents`,
   `line_total = unit_price * quantity`, `subtotal = Σ line_total`.
5. Valida el mínimo de la zona y suma `delivery_fee_cents`.
6. `total = subtotal + delivery_fee`.
7. Compara con `displayedTotalCents`. Si difiere → **`409 PRICE_CHANGED`** con el
   detalle; no crea el pedido. El cliente ve qué cambió y reconfirma (§19.3).
8. Inserta pedido + ítems + snapshot de opciones + evento inicial, **en una
   transacción**.

`displayedTotalCents` existe **solo para detectar desincronización**, nunca para
calcular. Si el navegador manda `total: 1`, el pedido se crea con el total real
o se rechaza; jamás con el del navegador.

### 11.4 Idempotencia

El navegador genera un `idempotencyKey` (uuid v4) **al entrar al checkout** y lo
conserva hasta que el pedido se crea. `orders.client_request_id` tiene índice
único: un segundo POST con la misma clave devuelve **el mismo pedido**, no uno
nuevo. Cubre doble click, reintento por timeout y refresh (§19.5).

### 11.5 Resultado

`201` con `{ orderNumber, publicToken, status: "pending_confirmation" }`.
El navegador vacía el carrito y navega a `/pedido/[token]`.

---

## 12. Métodos de pago

| Método | Estado MVP | Comportamiento |
|---|---|---|
| Efectivo contra entrega | **activo** | `payment.status = pending` hasta cobro manual |
| Efectivo al retirar | **activo** | idem |
| Mercado Pago | **visible, deshabilitado** | opción no seleccionable con la leyenda `Temporalmente no disponible` |

**Prohibido** simular un pago aprobado, mostrar "pago procesado" o afirmar que el
sitio acepta pagos online mientras la integración real no exista.

El campo "¿con cuánto pagás?" es informativo para el repartidor. Se guarda como
`payment.cash_received_cents` y el vuelto se calcula al mostrar; **no** se guarda
un vuelto que puede quedar desactualizado si el total cambia.

### 12.1 Qué deja preparado la arquitectura para Mercado Pago (Fase 7)

- `Payment` ya es una entidad separada con su propia máquina de estados (§15).
- `payments.provider` (`cash` \| `mercadopago`), `provider_payment_id`,
  `provider_preference_id`, `raw_payload jsonb`.
- Route Handler `/api/pagos/mercadopago/webhook` **idempotente por
  `provider_payment_id`**.
- Regla: **la confirmación válida es el webhook**, nunca la URL de retorno. El
  retorno solo redirige al usuario a `/pedido/[token]`.
- Reembolsos como transición de estado, no como borrado.
- Sin credenciales cargadas, el método no aparece habilitado: la habilitación es
  una fila de configuración, no un cambio de código.

---

## 13. WhatsApp

**No hay automatización.** Todo es `wa.me` con texto prearmado, abierto por una
persona.

### 13.1 Unificación (deuda técnica de §3.4)

Los tres constructores duplicados se reemplazan por `web/lib/whatsapp.ts`:

```text
enlaceWhatsapp(numero, texto?) → string | null      // null sin número: se oculta el CTA
mensajePedidoNuevo(pedido)                          // cliente → local (alternativa al checkout)
mensajeConfirmacion(pedido, minutos)                // local → cliente
mensajePedidoListo(pedido)
mensajeRechazo(pedido, motivo)
mensajeContacto(pedido)
```

### 13.2 Botones públicos

- "Pedir por WhatsApp" en la nav, el hero y "Cómo pedir" — **se conservan**.
- Desde el carrito: "Mandar este pedido por WhatsApp" arma el texto con las líneas
  reales. Es una salida de emergencia si el checkout falla.

### 13.3 Botones administrativos

En la ficha del pedido: **Confirmar** · **Avisar tiempo** · **Avisar que está listo**
· **Informar rechazo** · **Contactar**. Cada uno abre WhatsApp con el mensaje ya
escrito; el operador puede editarlo antes de enviarlo.

### 13.4 Sin número configurado

Si no hay número operativo, **los botones no se renderizan** — no se muestra un
botón muerto ni un número inventado. Es el comportamiento que ya tiene el repo
(`hrefPedirProducto` devuelve `null`) y se conserva (§19.13).

---

## 14. Máquina de estados del pedido

```text
                          ┌──────────────┐
                          │   rejected   │ ◀── (solo desde pending_confirmation)
                          └──────────────┘
                                  ▲
                                  │ rechazar (motivo obligatorio)
 [crear] ──▶ pending_confirmation ─┼─▶ confirmed ──▶ preparing ──▶ ready
                                  │                                 │
                                  │                    ┌────────────┴────────────┐
                                  │                    ▼                         ▼
                                  │            out_for_delivery          ready_for_pickup
                                  │                    │                         │
                                  │                    └──────────┬──────────────┘
                                  │                               ▼
                                  │                           completed
                                  │
                                  └─▶ cancelled  (desde pending_confirmation,
                                                  confirmed, preparing o ready)
```

### 14.1 Transiciones permitidas

| Desde | Hacia | Quién | Requisitos |
|---|---|---|---|
| — | `pending_confirmation` | service | pedido con ≥1 ítem, tienda abierta |
| `pending_confirmation` | `confirmed` | employee, owner | `estimated_minutes` obligatorio |
| `pending_confirmation` | `rejected` | employee, owner | `reason` obligatorio |
| `pending_confirmation` | `cancelled` | owner | `reason` obligatorio |
| `confirmed` | `preparing` | employee, owner | — |
| `confirmed` | `cancelled` | owner | `reason` |
| `preparing` | `ready` | employee, owner | — |
| `preparing` | `cancelled` | owner | `reason` |
| `ready` | `out_for_delivery` | employee, owner | pedido de tipo `delivery` |
| `ready` | `ready_for_pickup` | employee, owner | pedido de tipo `pickup` |
| `ready` | `cancelled` | owner | `reason` |
| `out_for_delivery` | `completed` | employee, owner | — |
| `ready_for_pickup` | `completed` | employee, owner | — |

### 14.2 Reglas

- **Estados terminales:** `completed`, `rejected`, `cancelled`. No admiten salida.
- La transición es una **función de servidor** que valida origen→destino contra la
  tabla anterior. Un destino no permitido devuelve `409 INVALID_TRANSITION`.
- La escritura es **condicional al estado actual**
  (`UPDATE ... WHERE id = ? AND status = <origen>`): dos empleados haciendo clic
  a la vez no producen doble transición (§19.9).
- Cada transición inserta una fila en `order_status_events`. El historial es
  **append-only**.
- `rejected` desde estados posteriores a `pending_confirmation` **no existe**:
  después de aceptar, lo que corresponde es `cancelled` con motivo, y es
  atribución del `owner`.

---

## 15. Máquina de estados del pago

**Separada del pedido. No se mezclan.** Un pedido puede completarse con el pago
pendiente (efectivo cobrado fuera del sistema) y un pago puede aprobarse con el
pedido rechazado (caso futuro de Mercado Pago, §19.11).

```text
pending ──▶ approved ──▶ refunded
   │
   ├──▶ rejected
   └──▶ cancelled
```

| Desde | Hacia | Quién | Cuándo |
|---|---|---|---|
| — | `pending` | service | al crear el pedido |
| `pending` | `approved` | employee, owner | efectivo cobrado (manual) |
| `pending` | `approved` | service | webhook de MP verificado (Fase 7) |
| `pending` | `rejected` | service | rechazo del proveedor (Fase 7) |
| `pending` | `cancelled` | owner, service | pedido rechazado/cancelado sin cobro |
| `approved` | `refunded` | owner, service | devolución (Fase 7) |

**MVP en efectivo:** el pago queda `pending` hasta que alguien lo marca cobrado, o
hasta que el pedido pasa a `completed` y el operador confirma el cobro. **No se
marca solo**: dar por cobrado un pedido que quizá no se cobró contamina el reporte.

---

## 16. Productos, variantes, extras y disponibilidad

### 16.1 Modelo de opciones

Un producto tiene N **grupos de opciones**; cada grupo tiene M **opciones**.

```text
ProductOptionGroup   "Punto de la carne"  min=1 max=1  required   → variante
ProductOptionGroup   "Extras"             min=0 max=5  opcional   → extras
```

- **Variante** = grupo con `min_select = 1, max_select = 1, is_required = true`.
- **Extra** = grupo con `min_select = 0` y `max_select ≥ 1`.

No son dos conceptos distintos en la base: es la misma estructura con distinta
configuración. Eso evita duplicar validación y reportes.

Cada opción tiene `price_delta_cents` (puede ser 0 o negativo) y su propia
disponibilidad (`is_available`).

### 16.2 Disponibilidad y stock

Tres capas, de la más gruesa a la más fina:

| Capa | Campo | Efecto |
|---|---|---|
| Publicación | `products.is_active` | fuera del catálogo; no se ve |
| Agotado | `products.is_sold_out` | se ve **tachado / "Agotado"**, no se puede agregar |
| Cantidad limitada | `products.stock_quantity int null` | `null` = sin control. Con número, decrece al confirmar |
| Franja horaria | `product_availability` | visible solo en ciertos días/horas |

**El stock se descuenta al crear el pedido**, no al agregar al carrito: un carrito
abandonado no puede secuestrar unidades. Si al descontar el stock queda en 0, el
producto pasa automáticamente a `is_sold_out = true`.

Al rechazar o cancelar un pedido, el stock **se repone** en la misma transacción.

**No hay inventario de ingredientes** (§2).

### 16.3 Fotos

`image_url` apunta a Supabase Storage (bucket público de solo lectura, escritura
por `owner`). `stage_image_url` sigue siendo asset de agencia (C7): la vitrina ya
degrada al cuadrado cuando falta, y ese comportamiento es correcto y visible.

---

## 17. Clientes

- **No hay cuentas.** El cliente es un registro que **nace de una compra real**.
- Identidad: **teléfono normalizado**. Es la clave natural del rubro.
- Al confirmar un pedido: si el teléfono existe → se reutiliza el cliente y se
  actualiza el nombre si cambió; si no existe → se crea.
- El cliente **nunca** se crea desde el panel a mano: se prohíbe inventar clientes.
- Las direcciones se guardan por cliente para poder repetir un pedido (`CustomerAddress`),
  pero **el pedido guarda su propia copia** (§21.11): cambiar la dirección hoy no
  reescribe a dónde se entregó un pedido de marzo.
- `orders_count` y `total_spent_cents` son **derivados** de pedidos válidos, no
  contadores mantenidos a mano (que se desincronizan siempre).

---

## 18. Reportes

Solo `owner`. Rango de fechas, por defecto los últimos 30 días, en hora local.

| Métrica | Definición exacta |
|---|---|
| Ventas brutas | Σ `total_cents` de pedidos `completed` |
| Pedidos completados | count(`completed`) |
| Pedidos cancelados | count(`cancelled`) + count(`rejected`), desglosados |
| Ticket promedio | ventas brutas / pedidos completados (0 si no hay) |
| Ventas por día | agrupado por fecha local (`America/Montevideo`) |
| Delivery vs retiro | count y monto por `fulfillment_type` |
| Ventas por método de pago | agrupado por `payments.provider` |
| Productos más vendidos | Σ `quantity` de `order_items` de pedidos `completed` |
| Extras más vendidos | Σ de `order_item_options` de pedidos `completed` |
| Clientes recurrentes | clientes con ≥2 pedidos `completed` |
| Ingreso neto estimado | ventas brutas − comisiones **conocidas**. Sin comisiones cargadas, **no se muestra** |

**Reglas:**

- Las métricas financieras usan **exclusivamente pedidos `completed`**. Un pedido
  en preparación no es una venta.
- Los productos se agrupan por el **snapshot de nombre** del ítem, no por el
  producto vivo: un producto renombrado no reescribe la historia.
- El reporte **no se llama** contabilidad, balance ni ganancia real. El rótulo es
  "Reporte de ventas" y lleva una nota: *"Estimación operativa. No es información
  contable ni fiscal."*

---

## 19. Manejo de errores y flujos excepcionales

Formato: **qué ve el cliente · qué ve el restaurante · qué guarda el sistema · cómo se recupera.**

### 19.1 La tienda está cerrada

- **Cliente:** el catálogo se ve completo, pero el CTA dice `Cerrado ahora` con el
  próximo horario de apertura. El checkout está bloqueado. Sigue disponible "Pedir
  por WhatsApp" (queda a criterio del local responder).
- **Restaurante:** nada; es el estado esperado.
- **Sistema:** no crea nada. `POST /api/checkout` responde `409 STORE_CLOSED`.
- **Recuperación:** el carrito **se conserva**. Al abrir, el mismo carrito confirma.

### 19.2 El producto se agota mientras está en el carrito

- **Cliente:** al entrar al checkout, la línea aparece marcada `Agotado` con la
  opción de quitarla; el total se recalcula. Si queda vacío, vuelve al catálogo.
- **Restaurante:** nada.
- **Sistema:** no crea el pedido. `409 ITEM_UNAVAILABLE` con los `productId` caídos.
- **Recuperación:** el cliente quita o cambia y confirma. **Nunca** se elimina
  silenciosamente un ítem del carrito.

### 19.3 El precio cambia antes de confirmar

- **Cliente:** aviso explícito que nombra el producto y los dos montos reales
  (*"El precio de &lt;producto&gt; cambió de &lt;antes&gt; a &lt;ahora&gt;"*), con el total
  nuevo y un botón `Confirmar con el precio actualizado`.
- **Restaurante:** nada.
- **Sistema:** `409 PRICE_CHANGED`. No se crea el pedido. Se registra la
  discrepancia en logs para detectar edición de precios en hora pico.
- **Recuperación:** un solo clic. El pedido se crea con el precio **de la base**.

### 19.4 El restaurante rechaza el pedido

- **Cliente:** `/pedido/[token]` muestra `Rechazado` y el motivo. Si hay WhatsApp,
  botón para escribir al local.
- **Restaurante:** el pedido sale del tablero activo y queda en el histórico.
- **Sistema:** `orders.status = rejected` + evento con autor y motivo; `payment`
  pasa a `cancelled`; **el stock se repone**.
- **Recuperación:** el cliente puede armar otro pedido; el carrito ya estaba vacío,
  así que se ofrece "Repetir este pedido" que lo rearma desde el snapshot.

### 19.5 El cliente duplica el envío (doble click, refresh, reintento)

- **Cliente:** ve **un** pedido. La segunda respuesta es idéntica a la primera.
- **Restaurante:** ve **un** pedido.
- **Sistema:** `orders.client_request_id` único. El segundo INSERT viola la
  restricción y el handler devuelve el pedido existente con `200` en vez de `201`.
- **Recuperación:** automática, sin intervención.

### 19.6 Se pierde la conexión

- **Cliente:** el botón queda en estado de carga y luego muestra
  *"No pudimos confirmar si el pedido llegó"*, con `Reintentar` (misma clave de
  idempotencia) y el enlace de WhatsApp como alternativa.
- **Restaurante:** o le entró el pedido, o no. Nunca dos.
- **Sistema:** el POST es atómico: o se creó todo (pedido + ítems + evento) o nada.
- **Recuperación:** reintento idempotente. Si el pedido ya se había creado, el
  reintento devuelve ese mismo pedido y el cliente ve su número.

### 19.7 Zona de delivery inválida o desactivada

- **Cliente:** *"Esa zona ya no está disponible"* + selector para elegir otra. Si no
  queda ninguna activa: *"El delivery está pausado"* y se ofrece retiro.
- **Restaurante:** nada; es consecuencia de su propia edición.
- **Sistema:** `409 ZONE_UNAVAILABLE`. No crea el pedido.
- **Recuperación:** elegir otra zona o cambiar a retiro, sin perder el carrito.

### 19.8 El restaurante no responde

- **Cliente:** a los **N minutos** (configurable, por defecto 15) el estado agrega
  *"El local todavía no confirmó"* con el botón de WhatsApp.
- **Restaurante:** el pedido se resalta en el tablero cuando supera el umbral.
- **Sistema:** no cambia el estado por sí solo. **No hay auto-rechazo**: cancelar un
  pedido que el local iba a aceptar es peor que esperar.
- **Recuperación:** manual, por WhatsApp o teléfono. El `owner` puede cancelar.

### 19.9 El empleado cambia dos veces el mismo estado

- **Cliente:** nada; el estado es el que corresponde.
- **Restaurante:** el segundo clic muestra *"Ese pedido ya está en preparación"* y
  la vista se refresca.
- **Sistema:** el UPDATE condicional (`WHERE status = <origen>`) afecta 0 filas;
  se devuelve `409 INVALID_TRANSITION`; **no** se inserta un segundo evento.
- **Recuperación:** automática; el historial queda sin duplicados.

### 19.10 Mercado Pago está desactivado

- **Cliente:** la opción se ve, deshabilitada, con la leyenda
  `Mercado Pago — Temporalmente no disponible`. No es seleccionable.
- **Restaurante:** nada.
- **Sistema:** el checkout **rechaza** `payment.method = "mercadopago"` con
  `400 PAYMENT_METHOD_DISABLED` aunque alguien lo fuerce por API.
- **Recuperación:** elegir efectivo.

### 19.11 (Futuro) El pago se aprueba pero el restaurante rechaza el pedido

- **Cliente:** ve `Rechazado` **y** `Pago aprobado — devolución en curso`. Nunca ve
  el pedido como válido.
- **Restaurante:** alerta destacada: *"Este pedido tiene un pago aprobado. Hay que
  reembolsar."* con el ID del pago.
- **Sistema:** `order.status = rejected`, `payment.status = approved` y una tarea
  pendiente de reembolso. **Los dos estados conviven**: por eso son máquinas
  separadas.
- **Recuperación:** reembolso desde el panel (Fase 7) → `payment.status = refunded`.
  Mientras no exista MP, este caso **no puede ocurrir**.

### 19.12 Un usuario sin permisos intenta entrar al panel

- **Cliente:** redirección a `/` (si no hay sesión, a `/admin/login`). Sin mensaje
  que revele qué existe del otro lado.
- **Restaurante:** el intento no aparece en la UI.
- **Sistema:** dos barreras: el layout de `/admin` corta por sesión+rol, y **RLS
  rechaza la consulta igual** aunque la ruta fallara. Se registra el intento.
- **Recuperación:** el `owner` da acceso desde la gestión de usuarios.

### 19.13 El número de WhatsApp no está configurado

- **Cliente:** **no ve ningún botón de WhatsApp**. El checkout propio sigue
  funcionando completo.
- **Restaurante:** en la ficha del pedido, los botones prearmados no se renderizan;
  aparece una nota: *"Configurá el número de WhatsApp para escribirle al cliente."*
- **Sistema:** `enlaceWhatsapp()` devuelve `null`; ningún componente lo fuerza.
- **Recuperación:** el `owner` carga el número en configuración; los botones
  aparecen sin deploy.

### 19.14 Errores no previstos

Todo handler devuelve un error **tipado** (`{ code, message, details? }`), nunca un
stack. La UI traduce el `code` a un texto en español. Un `500` inesperado muestra
*"Algo falló de nuestro lado"* + el CTA de WhatsApp: el negocio no puede quedarse
sin canal de venta porque falló una consulta.

---

## 20. Seguridad y privacidad

### 20.1 Claves

| Clave | Dónde vive | Expuesta al navegador |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | env | ✅ (es pública por diseño) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | env | ✅ (protegida por RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | env, **solo servidor** | ❌ **nunca** |
| `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` (Fase 7) | env, solo servidor | ❌ |

El `.gitignore` ya cubre `.env*`, `*.key`, `*.pem`, `credentials.json`, `*secret*.json`.
**Ningún import de `service.ts` puede aparecer en un archivo con `"use client"`.**
Criterio de aceptación de Fase 1: un grep automatizado lo verifica.

### 20.2 RLS

Se activa en **todas** las tablas. Política por defecto: **denegar**.

| Tabla | anon | employee | owner |
|---|---|---|---|
| `categories`, `products`, `product_option_groups`, `product_options`, `product_availability` | SELECT solo `is_active` | SELECT | ALL |
| `delivery_zones`, `restaurant_settings` | SELECT solo campos públicos | SELECT | ALL |
| `orders`, `order_items`, `order_item_options`, `order_status_events` | **ninguno** | SELECT + UPDATE de estado | ALL |
| `customers`, `customer_addresses` | **ninguno** | SELECT limitado a pedidos activos | ALL |
| `payments` | **ninguno** | SELECT + marcar cobrado | ALL |
| `profiles` | **ninguno** | SELECT propio | ALL |

El pedido del cliente se lee por **Route Handler con service role**, validando el
`public_token`. El navegador nunca consulta `orders` directamente.

### 20.3 Datos personales

- Se guarda lo mínimo: nombre, teléfono, email opcional, dirección de entrega.
- **No** se guardan datos de tarjeta. Con Mercado Pago, el cobro ocurre del lado
  del proveedor y solo se persisten identificadores.
- El `public_token` del pedido es un uuid v4 no adivinable y **no** aparece en
  ningún listado público.
- Retención: los pedidos se conservan para el reporte; el `owner` puede borrar un
  cliente, lo que **anonimiza** sus datos de contacto conservando los pedidos
  (necesarios para las métricas) — un `DELETE` en cascada rompería el histórico.

### 20.4 Abuso

- Rate limit por IP en `/api/checkout` (a definir en Fase 9; arranca con un límite
  conservador en memoria del edge).
- Validación de forma **en el servidor**, no solo en el formulario.
- Límites de tamaño del carrito (§10) aplicados también en el handler.

---

## 21. Entidades y relaciones (modelo de dominio)

Convenciones: `id uuid pk default gen_random_uuid()`, `created_at timestamptz not null default now()`,
`updated_at timestamptz`. Todo el dinero es **entero en centésimos de peso uruguayo**.
Sin `businessId` en ninguna tabla (§1).

```text
Profile ─┐
         └── OrderStatusEvent.actor
RestaurantSettings (fila única)
Category 1─N Product 1─N ProductOptionGroup 1─N ProductOption
                 └─N ProductAvailability
DeliveryZone 1─N Order
Customer 1─N CustomerAddress
Customer 1─N Order 1─N OrderItem 1─N OrderItemOption
                 ├─N OrderStatusEvent
                 └─1 Payment
```

### 21.1 `Profile`

- **Responsabilidad:** extender `auth.users` con el rol operativo.
- **Requeridos:** `id uuid pk` (= `auth.users.id`), `role enum('owner','employee')`, `full_name`.
- **Opcionales:** `phone`, `is_active bool default true`, `last_seen_at`.
- **Relaciones:** 1–1 con `auth.users`; 1–N con `order_status_events`.
- **Restricciones:** debe existir **al menos un** `owner` activo (se valida al
  desactivar/borrar).
- **Índices:** pk; `role`.
- **Inmutable:** `id`.
- **Lee/escribe:** owner ALL; employee lee el propio.

### 21.2 `RestaurantSettings`

- **Responsabilidad:** configuración operativa del local. **Una sola fila.**
- **Requeridos:** `id`, `is_accepting_orders bool`, `timezone text default 'America/Montevideo'`,
  `currency char(3) default 'UYU'`, `service_hours jsonb`, `default_prep_minutes int`.
- **Opcionales:** `closed_message`, `whatsapp_number`, `pickup_enabled bool default true`,
  `delivery_enabled bool default true`, `no_response_alert_minutes int default 15`,
  `payment_methods jsonb` (`{"cash": true, "mercadopago": false}`),
  `commission_rates jsonb` (para el ingreso neto estimado).
- **Restricciones:** `check (id = 1)` o singleton por constraint — **no puede haber dos**.
- **Inmutable:** nada.
- **Lee/escribe:** anon lee campos públicos (horarios, si acepta pedidos); owner escribe.

### 21.3 `Category`

- **Responsabilidad:** agrupar productos en la carta.
- **Requeridos:** `id`, `name`, `slug unique`, `position int`, `is_active bool`.
- **Opcionales:** `description`.
- **Relaciones:** 1–N `Product`.
- **Restricciones:** `slug` único; borrar una categoría con productos **se bloquea**
  (`on delete restrict`) — se desactiva, no se borra.
- **Índices:** `slug` unique; `(is_active, position)`.
- **Lee/escribe:** anon lee activas; owner ALL.

### 21.4 `Product`

- **Responsabilidad:** el ítem vendible y su precio **actual**.
- **Requeridos:** `id`, `category_id fk`, `name`, `slug unique`, `price_cents int`,
  `is_active bool`, `is_sold_out bool`, `position int`.
- **Opcionales:** `description`, `ingredients text[]`, `image_url`, `stage_image_url`,
  `badge enum('destacado','nuevo','vegano','sin_tacc')`, `stock_quantity int null`,
  `max_per_order int null`.
- **Relaciones:** N–1 `Category`; 1–N `ProductOptionGroup`, `ProductAvailability`,
  `OrderItem` (histórico, `on delete restrict`).
- **Restricciones:** `price_cents >= 0`; `stock_quantity is null or >= 0`;
  **no se puede borrar** un producto con pedidos — se desactiva.
- **Índices:** `slug` unique; `(category_id, position)`; `(is_active, is_sold_out)`.
- **Inmutable:** nada (por eso existe el snapshot de `OrderItem`).
- **Lee/escribe:** anon lee `is_active`; employee marca `is_sold_out`; owner ALL.

### 21.5 `ProductOptionGroup`

- **Responsabilidad:** definir una decisión del cliente (variante o extras).
- **Requeridos:** `id`, `product_id fk`, `name`, `min_select int`, `max_select int`,
  `is_required bool`, `position int`.
- **Relaciones:** N–1 `Product` (`on delete cascade`); 1–N `ProductOption`.
- **Restricciones:** `min_select >= 0`, `max_select >= min_select`,
  `is_required = (min_select >= 1)`.
- **Índices:** `(product_id, position)`.
- **Lee/escribe:** anon lee; owner ALL.

### 21.6 `ProductOption`

- **Responsabilidad:** una alternativa concreta con su diferencia de precio.
- **Requeridos:** `id`, `group_id fk`, `name`, `price_delta_cents int default 0`,
  `is_available bool`, `position int`.
- **Relaciones:** N–1 `ProductOptionGroup` (`on delete cascade`); 1–N `OrderItemOption`.
- **Restricciones:** no se borra si tiene historial — se marca no disponible.
- **Índices:** `(group_id, position)`.
- **Lee/escribe:** anon lee; owner ALL.

### 21.7 `ProductAvailability`

- **Responsabilidad:** franjas en las que el producto se ofrece.
- **Requeridos:** `id`, `product_id fk`, `weekday int 0..6`, `starts_min int`, `ends_min int`.
- **Relaciones:** N–1 `Product` (`on delete cascade`).
- **Restricciones:** `0 <= starts_min < ends_min <= 2880` (permite pasar medianoche).
  **Sin filas = disponible siempre.**
- **Índices:** `(product_id, weekday)`.
- **Lee/escribe:** anon lee; owner ALL.

### 21.8 `DeliveryZone`

- **Responsabilidad:** dónde se entrega, cuánto cuesta y cuál es el mínimo.
- **Requeridos:** `id`, `name`, `fee_cents int`, `min_order_cents int default 0`,
  `is_active bool`, `position int`.
- **Opcionales:** `estimated_minutes int`, `notes`.
- **Relaciones:** 1–N `Order` (`on delete restrict`).
- **Restricciones:** `fee_cents >= 0`, `min_order_cents >= 0`; `name` único.
- **Índices:** `(is_active, position)`.
- **Lee/escribe:** anon lee activas; owner ALL.

### 21.9 `Customer`

- **Responsabilidad:** la persona que ya compró. **Nace de un pedido real.**
- **Requeridos:** `id`, `phone_normalized text unique`, `name`.
- **Opcionales:** `email`, `phone_e164`, `notes` (internas), `first_order_at`,
  `last_order_at`, `is_blocked bool default false`.
- **Relaciones:** 1–N `CustomerAddress`, `Order`.
- **Restricciones:** `phone_normalized` único (clave natural).
  `orders_count`/`total_spent_cents` **no se persisten**: se calculan (§17).
- **Índices:** `phone_normalized` unique; `last_order_at desc`.
- **Inmutable:** `id`, `first_order_at`.
- **Lee/escribe:** anon nada; employee solo lo asociado a pedidos activos; owner ALL.

### 21.10 `CustomerAddress`

- **Responsabilidad:** dirección reutilizable para repetir pedidos.
- **Requeridos:** `id`, `customer_id fk`, `address`, `zone_id fk`.
- **Opcionales:** `reference`, `label`, `is_default bool`.
- **Relaciones:** N–1 `Customer` (`on delete cascade`), N–1 `DeliveryZone`.
- **Restricciones:** una sola `is_default` por cliente.
- **Índices:** `(customer_id, is_default)`.
- **Lee/escribe:** igual que `Customer`.

### 21.11 `Order`

- **Responsabilidad:** el pedido, **congelado** en el momento de crearse.
- **Requeridos:** `id`, `order_number text unique`, `public_token uuid unique`,
  `client_request_id uuid unique`, `customer_id fk`, `status`,
  `fulfillment_type enum('pickup','delivery')`, `subtotal_cents`,
  `delivery_fee_cents`, `total_cents`, `created_at`.
- **Opcionales:** `zone_id fk`, `delivery_address` **(copia)**,
  `delivery_reference` **(copia)**, `zone_name_snapshot`, `customer_name_snapshot`,
  `customer_phone_snapshot`, `notes`, `estimated_minutes`, `rejection_reason`,
  `scheduled_for timestamptz` (previsto, sin UI), `confirmed_at`, `completed_at`.
- **Relaciones:** N–1 `Customer`, N–1 `DeliveryZone`; 1–N `OrderItem`,
  `OrderStatusEvent`; 1–1 `Payment`.
- **Restricciones:**
  - `total_cents = subtotal_cents + delivery_fee_cents` (check).
  - `fulfillment_type = 'delivery'` ⇒ `zone_id` y `delivery_address` no nulos.
  - `fulfillment_type = 'pickup'` ⇒ `delivery_fee_cents = 0`.
  - **Debe tener al menos un `OrderItem`** (se garantiza en la transacción de creación).
  - `status = 'rejected'` ⇒ `rejection_reason` no nulo.
- **Índices:** `order_number` unique; `public_token` unique; `client_request_id` unique;
  `(status, created_at desc)`; `customer_id`; `created_at` (reportes).
- **Inmutable tras la creación:** montos, snapshots de cliente/zona/dirección,
  `fulfillment_type`, `order_number`, `public_token`, `client_request_id`.
  Solo mutan `status`, `estimated_minutes`, `rejection_reason` y las marcas de tiempo.
- **Lee/escribe:** anon solo por token vía handler; employee lee y transiciona;
  owner ALL.

### 21.12 `OrderItem`

- **Responsabilidad:** **snapshot** de lo comprado. Es historia, no catálogo.
- **Requeridos:** `id`, `order_id fk`, `product_id fk (restrict)`,
  `product_name_snapshot`, `unit_price_cents`, `quantity`, `line_total_cents`.
- **Opcionales:** `notes`, `product_image_snapshot`.
- **Relaciones:** N–1 `Order` (`on delete cascade`), N–1 `Product`; 1–N `OrderItemOption`.
- **Restricciones:** `quantity between 1 and 99`;
  `line_total_cents = unit_price_cents * quantity` (check).
- **Índices:** `order_id`; `product_id` (reportes).
- **Inmutable:** **todo**. Cambiar un producto no modifica pedidos históricos.
- **Lee/escribe:** service escribe; employee/owner leen.

### 21.13 `OrderItemOption`

- **Responsabilidad:** snapshot de cada opción elegida.
- **Requeridos:** `id`, `order_item_id fk`, `option_id fk (restrict)`,
  `group_name_snapshot`, `option_name_snapshot`, `price_delta_cents`.
- **Relaciones:** N–1 `OrderItem` (`on delete cascade`), N–1 `ProductOption`.
- **Índices:** `order_item_id`; `option_id` (reporte de extras).
- **Inmutable:** todo.

### 21.14 `OrderStatusEvent`

- **Responsabilidad:** historial **append-only** de transiciones.
- **Requeridos:** `id`, `order_id fk`, `from_status`, `to_status`, `created_at`.
- **Opcionales:** `actor_id fk Profile` (null = sistema), `reason`, `metadata jsonb`.
- **Relaciones:** N–1 `Order` (`on delete cascade`), N–1 `Profile`.
- **Restricciones:** **sin UPDATE ni DELETE** (política RLS y revocación de permisos).
  El primer evento tiene `from_status = null`.
- **Índices:** `(order_id, created_at)`.
- **Inmutable:** todo.

### 21.15 `Payment`

- **Responsabilidad:** el cobro, con **ciclo de vida propio** (§15).
- **Requeridos:** `id`, `order_id fk unique`, `provider enum('cash','mercadopago')`,
  `status`, `amount_cents`.
- **Opcionales:** `cash_received_cents`, `provider_payment_id unique`,
  `provider_preference_id`, `raw_payload jsonb`, `paid_at`, `refunded_at`,
  `marked_by fk Profile`.
- **Relaciones:** 1–1 `Order`.
- **Restricciones:** un pago por pedido; `amount_cents = order.total_cents` al crear;
  `provider_payment_id` único → **idempotencia del webhook**;
  `cash_received_cents >= amount_cents` cuando existe.
- **Índices:** `order_id` unique; `provider_payment_id` unique; `(status, created_at)`.
- **Inmutable:** `order_id`, `provider`, `amount_cents`.
- **Lee/escribe:** anon nada; employee marca cobrado; owner ALL; service escribe
  desde el webhook.

---

## 22. Fases posteriores de implementación

### Fase 1 — Fundación técnica y autenticación

- **Objetivo:** proyecto Supabase conectado, esquema base, RLS activa, login del
  panel y layout protegido. Sin catálogo todavía.
- **Dependencias:** aprobación de este documento; credenciales de Supabase.
- **Áreas afectadas:** `web/package.json`, `web/lib/supabase/*`, `web/lib/dinero.ts`,
  `web/app/admin/(login|layout)`, `supabase/migrations/`, `.env.example`, `README.md`.
- **Entregable:** `/admin/login` funcional; un `owner` entra y ve un tablero vacío;
  un `employee` entra y ve menos opciones; sin sesión, redirección.
- **Aceptación:** `tsc --noEmit` y `next build` en verde · RLS activa en todas las
  tablas creadas · `grep` confirma que la service role key no aparece en ningún
  módulo cliente · la landing pública sigue idéntica (comparación de capturas).
- **Riesgos:** `outputFileTracingRoot`/`externalDir` (C10) puede complicar el
  bundling de `@supabase/ssr`; el manejo de cookies en Next 15 cambió respecto a 14.
- **Fuera:** catálogo, carrito, checkout, pedidos.

### Fase 2 — Productos y disponibilidad

- **Objetivo:** catálogo en Supabase como fuente de verdad, CRUD en el panel y
  vitrina pública alimentada por la base.
- **Dependencias:** Fase 1.
- **Áreas afectadas:** migraciones (`categories`, `products`, `product_option_groups`,
  `product_options`, `product_availability`), `web/lib/catalogo/*`,
  `web/app/admin/productos/*`, Storage, seeder desde `data.menu`,
  `templates/.../MenuSeccion.tsx` y `HeroExperience.tsx` (cambia el **origen** de
  los datos, no el diseño).
- **Entregable:** el dueño crea un producto con foto, variantes y extras, y aparece
  en la landing sin deploy.
- **Aceptación:** `grep -rn "data.menu" templates/ web/` = 0 fuera del seeder ·
  `revalidateTag('catalogo')` refleja el cambio en < 5 s · un producto agotado se
  ve tachado y no se puede pedir · sin `stage_image_url` la vitrina cae al cuadrado
  · captura comparada de la vitrina antes/después: sin diferencias visuales.
- **Riesgos:** perder la calibración de la vitrina (la superposición nombre/producto
  está medida y documentada); parseo de `"$490"` en el seeder.
- **Fuera:** carrito, precios en el checkout, stock descontado.

### Fase 3 — Carrito

- **Objetivo:** agregar, editar y quitar productos con opciones, persistido en el
  navegador.
- **Dependencias:** Fase 2.
- **Áreas afectadas:** `web/lib/carrito/*`, `web/app/(tienda)/carrito`,
  panel de producto, `Nav.tsx` (contador).
- **Entregable:** `/carrito` completo, sobrevive al refresh, revalida contra la base
  al abrirse.
- **Aceptación:** dos líneas del mismo producto con extras distintos no se fusionan ·
  un producto desactivado aparece marcado, no desaparece · límites de §10 aplicados ·
  `localStorage` corrupto no rompe la página.
- **Riesgos:** desincronización carrito/catálogo; SSR y `localStorage` (hidratación).
- **Fuera:** creación de pedidos.

### Fase 4 — Checkout y creación de pedidos

- **Objetivo:** el pedido existe en la base, con recálculo de servidor e idempotencia.
- **Dependencias:** Fase 3 + `delivery_zones` + `restaurant_settings`.
- **Áreas afectadas:** migraciones (`orders`, `order_items`, `order_item_options`,
  `order_status_events`, `payments`, `customers`, `customer_addresses`,
  `delivery_zones`), `web/app/api/checkout`, `web/app/(tienda)/checkout`,
  `web/app/(tienda)/pedido/[token]`, `web/lib/pedidos/*`, `web/lib/horario.ts`.
- **Entregable:** un pedido real completo, con número, token y estado inicial.
- **Aceptación:** un total manipulado en el navegador **no** afecta el pedido ·
  doble POST con la misma clave crea **un** pedido · pedido vacío rechazado ·
  producto inactivo/agotado rechazado · tienda cerrada rechaza · mínimo de zona
  aplicado · el stock se descuenta · los snapshots quedan escritos.
- **Riesgos:** transacción parcial (pedido sin ítems) si no se hace atómica —
  se resuelve con una función `rpc` en Postgres; zona horaria (C9).
- **Fuera:** panel de pedidos, WhatsApp, pagos online.

### Fase 5 — Central administrativa de pedidos

- **Objetivo:** operar pedidos en tiempo real.
- **Dependencias:** Fase 4.
- **Áreas afectadas:** `web/app/admin/pedidos/*`, `web/lib/pedidos/transiciones.ts`,
  Realtime, `web/lib/supabase/browser.ts`.
- **Entregable:** tablero con pedidos nuevos en vivo, aceptar/rechazar con tiempo
  estimado y motivo, avance de estado, búsqueda histórica.
- **Aceptación:** máquina de estados de §14 respetada (transición inválida = `409`) ·
  doble clic no duplica eventos · el pedido nuevo aparece sin refrescar ·
  el `employee` no ve las acciones de `owner` **y** RLS se lo impide igual ·
  rechazar repone el stock.
- **Riesgos:** Realtime y RLS (las suscripciones respetan políticas: hay que
  probarlo con un `employee` real); reconexión del websocket.
- **Fuera:** mensajes de WhatsApp, reportes.

### Fase 6 — WhatsApp manual

- **Objetivo:** unificar los enlaces y sumar los botones prearmados.
- **Dependencias:** Fase 5.
- **Áreas afectadas:** `web/lib/whatsapp.ts` (nuevo), `templates/.../Template.tsx`,
  `ComoPedir.tsx`, `menu.ts` (eliminar los tres duplicados), ficha de pedido del panel,
  botón "mandar por WhatsApp" del carrito.
- **Entregable:** un solo constructor de enlaces y cinco mensajes prearmados.
- **Aceptación:** sin número configurado no se renderiza ningún botón (público ni
  administrativo) · los textos incluyen número de pedido y datos reales, nunca
  inventados · el CTA público sigue funcionando igual que hoy.
- **Riesgos:** longitud de URL con pedidos largos (se recorta el detalle);
  codificación de acentos y emojis.
- **Fuera:** cualquier envío automático.

### Fase 7 — Preparación de Mercado Pago

- **Objetivo:** dejar la integración **lista y apagada**.
- **Dependencias:** Fase 4; credenciales reales para activarla.
- **Áreas afectadas:** `web/lib/pagos/*`, `web/app/api/pagos/mercadopago/webhook`,
  configuración de métodos de pago, UI del checkout.
- **Entregable:** creación de preferencia, retorno y webhook idempotente,
  **detrás de un flag apagado**.
- **Aceptación:** con el flag apagado el método no es seleccionable y la API lo
  rechaza · el webhook procesa dos veces el mismo `provider_payment_id` sin
  duplicar · la aprobación **solo** ocurre por webhook, nunca por la URL de retorno ·
  nada afirma que se aceptan pagos online.
- **Riesgos:** verificación de firma del webhook; pagos aprobados con pedido
  rechazado (§19.11); reintentos del proveedor.
- **Fuera:** activación real, reembolsos automáticos.

### Fase 8 — Clientes y reportes

- **Objetivo:** ficha de clientes y reporte de ventas.
- **Dependencias:** Fase 5 con pedidos completados reales.
- **Áreas afectadas:** `web/app/admin/clientes/*`, `web/app/admin/reportes/*`,
  vistas SQL agregadas.
- **Entregable:** listado de clientes derivado de compras y las métricas de §18.
- **Aceptación:** solo pedidos `completed` en las métricas financieras · los
  productos se agrupan por snapshot · sin comisiones cargadas, el ingreso neto **no**
  aparece · el reporte lleva la nota de "no es información contable" · con base
  vacía muestra ceros, no datos de ejemplo.
- **Riesgos:** agregaciones en zona horaria equivocada (día de negocio ≠ día UTC);
  performance sin índices de `created_at`.
- **Fuera:** exportar a Excel, gráficos avanzados, proyecciones.

### Fase 9 — Seguridad, pruebas y producción

- **Objetivo:** endurecer y salir a producción.
- **Dependencias:** todas las anteriores.
- **Áreas afectadas:** políticas RLS, rate limiting, `robots`/metadata (C12),
  dominio, variables de entorno de producción, `README.md`, runbook operativo.
- **Entregable:** instalación productiva con dominio propio, indexable, con backup
  y un manual de uso para el local.
- **Aceptación:** auditoría de RLS tabla por tabla con un usuario `anon` real ·
  ninguna clave privada en el bundle cliente · rate limit en checkout ·
  la tienda se indexa (se invierte `noindex`) · prueba de punta a punta en 5
  viewports · plan de backup documentado.
- **Riesgos:** una política RLS mal escrita expone pedidos; el cambio de indexación
  afecta la estrategia de demos de Prospector.
- **Fuera:** automatización de WhatsApp, app móvil, multiempresa.

---

## 23. Decisiones abiertas y riesgos

### 23.1 Decisiones cerradas en este documento

Se adoptan las decisiones predeterminadas del encargo. Adicionalmente se cierran,
por necesidad técnica y sin contradecirlas:

| Decisión | Motivo |
|---|---|
| Dinero como **entero en centésimos** + `currency 'UYU'` | C2: no se puede recalcular con strings |
| Productos y opciones con **uuid**; el carrito referencia ids | C3 |
| Horarios **operativos** estructurados en la base, separados del `hours` editorial | C4 |
| `America/Montevideo` explícito | C9 |
| Carrito en `localStorage`, no en base | Un carrito no es dato del negocio |
| `public_token` uuid para ver el pedido sin cuenta | Coherente con "compra como invitado" |
| `client_request_id` único para idempotencia | Evita pedidos duplicados |
| `RESTAURANT_SLUG` para atar la instalación a un restaurante | C8, sin introducir tenancy |
| Route Handlers para checkout/webhook; Server Actions para el panel | Idempotencia y semántica HTTP explícitas del lado público |
| Variantes y extras son **la misma estructura** con distinta configuración | Menos validación duplicada |
| Borrado lógico (`is_active`) en todo lo que tenga historial | Un `DELETE` rompe pedidos viejos |

### 23.2 Decisiones abiertas (necesitan respuesta del dueño del proyecto)

| # | Pregunta | Impacto | Propuesta por defecto |
|---|---|---|---|
| A1 | ¿La instalación de ecommerce mantiene `/[slug]` o colapsa a `/`? | Rutas, SEO, demo comercial | Mantener ambas; `/` sirve la tienda |
| A2 | ¿Formato del número de pedido? | Comunicación con el cliente | Secuencial diario `#014` reiniciando cada día local |
| A3 | ¿El `employee` puede ver totales y reportes del día? | Permisos §6 | No (solo pedidos) |
| A4 | ¿Se piden datos de facturación? | Modelo `Order` | No (§2) |
| A5 | ¿Costo de envío fijo por zona o escalonado por monto? | `DeliveryZone` | Fijo por zona |
| A6 | ¿Cuántos minutos hasta la alerta de "no responde"? | §19.8 | 15, configurable |
| A7 | ¿Notificación sonora en el panel? ¿Push? | Fase 5 | Sonido en la pestaña abierta; sin push |
| A8 | ¿Se conserva el `menu` en el JSON tras migrar? | §5.3 | Se vacía en la instalación de ecommerce |
| A9 | ¿Comisiones conocidas para el ingreso neto? | §18 | Sin cargar ⇒ métrica oculta |
| A10 | ¿Idioma/moneda distintos a es-UY / UYU? | Formateo | No |

### 23.3 Riesgos principales

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| **Romper la vitrina del menú al cambiar el origen de datos** — la superposición nombre/producto está calibrada y medida | media | alto | Fase 2 mantiene props y estructura; verificación por captura y por la medición de tapado ya existente |
| **RLS mal escrita expone pedidos o clientes** | media | crítico | Denegar por defecto; auditoría con usuario `anon` real en Fase 9; el navegador nunca consulta `orders` |
| **Service role key filtrada al bundle** | baja | crítico | Módulo separado, `import 'server-only'`, grep automatizado como criterio de aceptación |
| **Pedidos duplicados en hora pico** | media | alto | Idempotencia por `client_request_id` desde la Fase 4, no como parche posterior |
| **Precios desactualizados por caché** | alta | medio | El total del pedido **siempre** se recalcula leyendo la base |
| **Zona horaria: reportes y horarios corridos** | alta | medio | TZ explícita en configuración, `timestamptz` y agregación por día local |
| **El local no adopta el panel y sigue con WhatsApp** | media | alto (comercial) | El flujo de WhatsApp se conserva íntegro; el panel no obliga a abandonarlo |
| **Transacción parcial (pedido sin ítems)** | baja | alto | Creación en una función de Postgres, no en tres inserts sueltos |
| **`externalDir` + Supabase SSR** | media | medio | Todo el código de servidor dentro de `web/`; se valida en Fase 1 antes de seguir |
| **Sin tests ni linter** (C11) | alta | medio | Criterios de aceptación por fase basados en `tsc`, `build` y Playwright headless |
| **Fotos subidas por el dueño sin recorte con alfa** (C7) | alta | bajo | La vitrina ya degrada honestamente al cuadrado |

---

## Apéndice — Glosario de estados

```text
PEDIDO   pending_confirmation · confirmed · preparing · ready ·
         out_for_delivery · ready_for_pickup · completed ·
         rejected · cancelled

PAGO     pending · approved · rejected · cancelled · refunded
```

Un pedido `completed` con pago `pending` es un estado **válido y esperado** en el
MVP en efectivo. Un pago `approved` con pedido `rejected` es un estado **válido y
excepcional** que exige reembolso (§19.11). Por eso son dos máquinas.
