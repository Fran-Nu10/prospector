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

## Las siete palancas del póster

La página no mejora agregando elementos: el vacío es parte del diseño. Todo lo
que sigue sale de estas siete palancas, y cualquier cambio futuro debería
poder justificarse con alguna de ellas.

1. **Contraste de escala.** La distancia entre lo más grande y lo más chico de
   cada sección tiene que ser brutal. Si un titular puede ser más grande, lo es.
2. **Composición asimétrica.** Nada centrado por defecto: bloques desplazados,
   alineaciones a un borde, columnas de anchos distintos.
3. **Sangrado.** El display sale del ancho de contenido y se corta contra el
   borde del viewport. Es deliberado, no un error.
4. **Ritmo.** Secciones densas alternadas con secciones casi vacías. Dos
   densas seguidas son un error de ritmo.
5. **Superposición.** Tipo sobre imagen, imagen sobre bloque de color. Capas,
   no cajas apiladas.
6. **Lenguaje de póster.** Hairlines negras, numeración de sección, etiquetas
   rotadas, reglas horizontales. Vocabulario de cartel de calle.
7. **Espaciado agresivo.** En los respiros grandes, 100 y 148 antes que 40 y 56.

---

## Estructura de la página

Orden fijo, con la densidad de cada sección — el ritmo es parte del diseño.
Todas las secciones salvo el hero y la firma dependen de que el JSON traiga su
dato: si falta, la sección no se renderiza y la numeración se recalcula sola
(la calcula `Template.tsx`, no está escrita en cada componente).

| # | Sección | Densidad | Qué la define |
|---|---------|----------|---------------|
| 01 | **Hero** | densa | El nombre partido en dos líneas que cortan contra los dos bordes, con la burger armada cruzando el corredor entre ellas — por el hueco y los contrafuertes, nunca por el centro de los caracteres. El CTA no flota: baja a una franja inferior con hairline, junto a horario y dirección en mono. |
| 02 | **La firma** | densa | El despiece en 6 capas. Título por delante del pan, etiquetas de ingrediente colgadas de hairlines que apuntan a su capa, card del destacado abajo a la izquierda. **Es el momento estrella**: el scroll abre el despiece. |
| 03 | **Menú** | densa | Grilla asimétrica: destacado con radio 38 (único lugar del sistema), dos cards en la columna angosta, y filas de 5/4/4 con la del medio descolgada 56px. |
| 04 | **Historia** | **vacía** | El respiro. Titular de 103px con remate en brasa, relato chico y desplazado abajo a la derecha, y nada en el medio. Va pegada al menú a propósito. |
| 05 | **Reseñas** | media | El rating en Anton gigante contra los testimonios en cuerpo; hairlines en vez de cards, con sangría creciente. |
| 06 | **Galería** | imagen | Bloque de color plano sangrado y fotos superpuestas a distintas alturas, numeradas como lámina. El bloque alterna de lado cada tres fotos. |
| 07 | **Cómo pedir** | media | Filas a ancho completo separadas por hairlines, con el numeral gigante haciendo de gráfico. |
| 08 | **Horarios y ubicación** | datos | La hora de cierre a 160px contra la tabla en mono. Ese número se **deriva** de `hours` (ver `horarios.ts`), no se carga a mano. |
| — | **Footer** | cierre | El nombre a tamaño de cartel recortado contra el borde inferior. |

### Movimiento

El hero está QUIETO: solo la cascada de entrada del texto. El único momento de
efecto marcado es la firma, que se pinea y abre el despiece con el scroll; el
resto de la página son entradas sutiles y el parallax corto de la galería.

En ≤1023px el póster se recompone: la firma pierde el pin y la inclinación
—las capas se separan de una vez al entrar en viewport, con menos recorrido— y
la galería cae a una columna con el parallax reducido a un tercio.

---

## Do's

- Anton a 103px+ en hero y aperturas de sección. Más chico mata el efecto de declaración.
- Line-height de display en 0.95, tracking +0.06em: cartel gritado pero
  legible — las líneas de un bloque nunca deben tocarse.
- Reservá el rojo brasa SOLO para acción, estado activo y el display. Nunca en cuerpo.
- El ámbar queso solo aparece con comida. Es la única segunda voz cromática.
- Botones y pills a 15px de radio: lenguaje de forma unificado. Sobre brasa
  (el nombre del footer), con borde negro de 1px para que la pastilla no se funda.
- Rectángulos limpios: la foto va arriba de la card y el texto abajo sobre
  carbón plano. Nada de scrims ni degradados encima de la imagen.
- Barra de nav negra sólida con texto blanco en todas las secciones: es el ancla visual.
- El tipo display se dimensiona por CANTIDAD DE CARACTERES, no por breakpoint
  (ver `tipografia.ts`): el nombre viene del JSON y tiene que sangrar igual
  con 6 letras que con 26.

## Don'ts

- Nada de sombras, glows ni gradientes. El sistema es plano a propósito.
- No sumar colores cromáticos nuevos: noche + brasa + queso + rescoldo + negro + hueso.
  Cualquier otro tono rompe la disciplina.
- Anton no se usa por debajo de 40px ni para párrafos: es display, no lectura.
- Nada de texto de cuerpo en rojo brasa: el rojo es para acción y remate de titular.
- Fondo claro jamás: el negro nocturno es la base innegociable de la marca.
- Nada de simular profundidad con blur ni sombras: la dan la superposición y
  el recorte. Si hay que separar un objeto del fondo, va un bloque de color plano.
- Nada de secciones nuevas. La mejora se busca recomponiendo, no agregando.
- Nada de afirmar cosas del negocio que el JSON no respalde: el titular
  nocturno de la historia, por ejemplo, solo aparece si los horarios muestran
  que cierra después de medianoche.

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