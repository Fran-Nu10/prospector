# Plantilla `hamburgueseria` — Style Reference

> Póster punk en la oscuridad de la noche. Tipografía condensada gigante que
> sangra sobre un fondo casi negro; un rojo brasa que atraviesa como un cartel
> de neón, y un ámbar de queso derretido que solo aparece cuando hay comida.

**Tema:** oscuro (nocturno)
**Base conceptual:** adaptado del sistema de Impossible Foods (refero.design),
reinterpretado para una hamburguesería nocturna de barrio. La disciplina de color
y la filosofía tipográfica son de Impossible; el ámbar de comida y las fuentes
libres son la adaptación para este negocio.

---

## Concepto

Una hamburguesería que abre cuando el resto cierra. La pantalla es la calle de
noche: negra, con luz que quema. El tipo grita como un cartel. Un solo color de
acción (rojo brasa) hace casi todo el trabajo; un segundo acento (ámbar queso)
aparece únicamente en la comida y en estados de hambre. Sistema plano, sin
sombras: la jerarquía la construyen el contraste y la escala, no la elevación.

---

## Tokens — Colores

| Nombre | Valor | Token | Rol |
|--------|-------|-------|-----|
| Noche | `#0A0A0F` | `--color-noche` | Fondo base de página — el asfalto sobre el que todo se apoya |
| Carbón | `#16121A` | `--color-carbon` | Superficies de sección y cards, apenas levantadas del fondo |
| Brasa | `#E10600` | `--color-brasa` | Acción primaria, estados activos, acentos de titular — la señal cromática que manda |
| Queso | `#FFB000` | `--color-queso` | Segundo acento. SOLO en comida, precios destacados y micro-momentos de hambre |
| Rescoldo | `#FFC7C6` | `--color-rescoldo` | Texto secundario suave, hover de links, contrapunto tonal al rojo |
| Negro | `#000000` | `--color-negro` | Barra de navegación, hairlines, bordes de card, trazos de contraste |
| Hueso | `#F5F3F0` | `--color-hueso` | Texto de cuerpo sobre superficies oscuras (no blanco puro, cansa menos) |

**Disciplina de color (regla dura):** el rojo brasa hace el trabajo de diez
colores — acción, estado activo y acento de titular a la vez. El ámbar queso es
la ÚNICA excepción cromática, y solo entra donde hay comida. Cualquier otro color
rompe el sistema. Nada de gradientes, nada de glows.

---

## Tokens — Tipografía

Las fuentes son gratis (Google Fonts), libres para uso comercial — importante
porque esto se le vende a clientes.

### Anton — Display / titulares
- **Reemplaza a:** la `sans-meat` propietaria de Impossible (sustituto oficial: Druk).
  Anton es la alternativa libre más cercana (~75% match con Druk).
- **Peso:** 400 (peso único, ultra-heavy condensado).
- **Uso:** titulares gigantes. Nunca por debajo de 40px. El hero vive acá.
- **Line-height:** 0.95 (apretado pero sin que las líneas de un mismo
  bloque se pisen — con menos de ~0.95, Anton multilínea se monta).
- **Tracking:** +0.06em en los tamaños más grandes (contraintuitivo pero necesario:
  evita que las letras se pisen y da el efecto de cartel gritado).

### Inter — Cuerpo y UI
- **Pesos:** 400, 500, 700.
- **Uso:** menú, párrafos, navegación, todo lo legible. Limpio en mobile.
- **Line-height:** 1.4 para cuerpo.

### Space Mono — Precios y datos
- **Pesos:** 400, 700.
- **Uso:** precios, horarios, datos tipo "ticket". Le da toque de recibo/plancha.

### Escala de tipo

| Rol | Tamaño | Line height | Tracking | Fuente |
|-----|--------|-------------|----------|--------|
| caption | 10px | 1.4 | 0.02px | Inter |
| body-sm | 14px | 1.4 | 0.02px | Inter |
| body | 18px | 1.4 | 0.02px | Inter |
| subheading | 24px | 1.15 | 0.02px | Inter/Anton |
| heading-sm | 32px | 1.1 | 0.02px | Anton |
| heading | 48px | 0.95 | 0.02px | Anton |
| heading-lg | 103px | 0.95 | 0.03px | Anton |
| display | 160px | 0.95 | 0.06px | Anton |

---

## Tokens — Espaciado y formas

**Unidad base:** 4px · **Densidad:** compacta

Escala: 4, 8, 12, 16, 20, 24, 32, 40, 56, 64, 80, 100, 148 px.

**Border radius:** nav 15px · cards 12px · botones 15px · toggles 15px ·
feature-card destacada 38px.

**Layout:** ancho máx. 1280px · gap de sección 40–64px · padding de card 16–24px.

---

## Estructura de la página (mapeada a la construcción por scroll)

El hero abre con el pan base. Cada sección suma una capa de la hamburguesa:

1. **Hero** — pan base + nombre en Anton gigante rojo brasa. Eyebrow arriba.
   Copy nocturno, no genérico. Ej: "LA QUE TE SALVA A LAS 2 AM".
2. **Historia** — suma el medallón. Texto corto, tono de local.
3. **Menú destacado** — suma queso + bacon. Precios en Space Mono, tag en ámbar.
4. **Galería / ambiente** — suma la cebolla. Fotos en máscaras orgánicas irregulares.
5. **Horarios + ubicación** — pan de arriba: la hamburguesa queda completa y gira suave.
6. **Footer** — botón de WhatsApp fijo para pedidos (usa `data.whatsapp`).

---

## Do's

- Anton a 103px+ en hero y aperturas de sección. Más chico mata el efecto de declaración.
- Line-height de display en 0.95, tracking +0.06em: cartel gritado pero
  legible — las líneas de un bloque nunca deben tocarse.
- Reservá el rojo brasa SOLO para acción, estado activo y el display. Nunca en cuerpo.
- El ámbar queso solo aparece con comida. Es la única segunda voz cromática.
- Botones y pills a 15px de radio: lenguaje de forma unificado.
- Fotos de comida en máscaras orgánicas irregulares cerca del display; rectángulos
  limpios solo dentro de las cards de producto.
- Barra de nav negra sólida con texto blanco en todas las secciones: es el ancla visual.

## Don'ts

- Nada de sombras, glows ni gradientes. El sistema es plano a propósito.
- No sumar colores cromáticos nuevos: noche + brasa + queso + rescoldo + negro + hueso.
  Cualquier otro tono rompe la disciplina.
- Anton no se usa por debajo de 40px ni para párrafos: es display, no lectura.
- Nada de texto de cuerpo en rojo brasa: el rojo es para acción y remate de titular.
- Fondo claro jamás: el negro nocturno es la base innegociable de la marca.

---

## Rendimiento (innegociable)

- La construcción por scroll (imágenes de capas o 3D) carga diferida: el texto entra primero.
- Imágenes de capas comprimidas; en mobile, versión secuenciada liviana o video corto.
- Objetivo LCP < 2.5s en 4G. Si el efecto rompe el rendimiento, degradá a imagen fija.

---

## Quick reference para el agente

- fondo: `#0A0A0F` · superficie: `#16121A` · borde: `#000000`
- texto cuerpo: `#F5F3F0` · texto suave: `#FFC7C6`
- acción primaria: `#E10600` (brasa) · acento comida: `#FFB000` (queso)
- display: Anton · cuerpo/UI: Inter · precios/datos: Space Mono