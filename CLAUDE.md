# Prospector — Instrucciones para Claude Code

Este repo automatiza la captación de restaurantes sin web (o con web vieja) en
Montevideo y les genera una demo profesional para cerrarlos como clientes.

## Regla número uno: plantilla ≠ datos

- **Plantilla** = código React reutilizable. Vive en `templates/`. Se escribe UNA vez.
- **Cliente** = un archivo JSON en `data/prospects/<slug>.json`. Uno por prospecto.

NUNCA hardcodees el nombre de un restaurante, su menú, sus fotos o su teléfono
dentro de una plantilla. Todo eso entra por `ClientData` (ver `web/lib/schema.ts`).
Si algo va a variar entre prospectos, va en el JSON. Sin excepción.

## Cómo generar una plantilla nueva (ej. cuando cambio de nicho)

Cuando te pida "creá la plantilla de <vertical>":

1. Leé `web/lib/schema.ts` — es el contrato de datos, respetalo entero.
2. Leé una plantilla existente en `templates/` como referencia de estructura.
3. Leé `/mnt/skills/public/frontend-design/SKILL.md` para el estándar visual.
   Cada vertical tiene identidad propia — NO reuses la misma paleta ni tipografía.
4. La plantilla recibe `data: ClientData` como prop y renderiza solo desde ahí.
5. Rendimiento mobile es requisito, no lujo:
   - 3D en `.glb` comprimido con Draco, carga diferida (después del texto).
   - En mobile, usar `data.hero.videoFallback` en vez del modelo 3D.
   - Objetivo: LCP < 2.5s en 4G. Si el 3D lo rompe, degradá a imagen.

## Cómo generar una demo para un prospecto

Cuando te pase datos de un negocio (o un `<slug>.json`):

1. Validá el JSON contra `ClientData`.
2. Elegí la plantilla según `data.vertical`.
3. La demo queda disponible en `/<slug>` (ruta dinámica en `web/app/[slug]`).
4. En Vercel, cada slug mapea a `<slug>.midominio.com` vía middleware.

## Identidad visual por vertical (guía, no jaula)

- `hamburgueseria`: urbana, oscura, alto contraste. El 3D de la hamburguesa
  abriéndose es el elemento firma. Energía nocturna.
- `parrilla`: cálida, elegante, tradicional. Maderas, brasas, tipografía con peso.
- `cafe`: clara, luminosa, aireada. Brunch, luz natural, minimal.

Cada una debe verse hecha por un estudio distinto. Si dos plantillas se parecen,
está mal.

## Lo que NO debe hacer este proyecto

- No inventar reseñas ni datos falsos del negocio.
- No mandar mensajes automáticos por WhatsApp (el envío es manual y personalizado).
- No spamear: volumen bajo, cada demo revisada antes de enviar.

 

## Estándar de animación y movimiento

Filosofía: movimiento INTENCIONAL, no decorativo. Una landing premium NO tiene
todo animado — tiene base tranquila (mucho negro quieto) y movimiento en los
momentos justos. Si todo se mueve, nada destaca y se ve amateur.

Reglas:
- Librería única: Framer Motion (Motion). Ya está instalada. NO sumar otras
  librerías de animación ni copiar código de animación de terceros.
- Nivel general de las secciones: SUTIL. Fades suaves + leve translateY al entrar
  en viewport (whileInView), hovers finos en elementos interactivos (cards, botones).
- Momentos estrella: MUY pocos. El hero (burger por scroll) ya es uno. Reservar
  como máximo uno o dos momentos de efecto marcado adicionales en toda la página.
  El momento estrella designado además del hero es la sección MENÚ.
- Performance: animar solo con transform y opacity (GPU). Nunca top/margin/height
  animados (causan reflow). Apuntar a 60fps en mobile.
- Accesibilidad: respetar SIEMPRE prefers-reduced-motion → sin animación, estado final directo.
- Mobile: si una animación traba el scroll en celular, degradar a algo más simple.
  El scroll fluido en mobile tiene prioridad sobre el efecto.

## Lecciones aprendidas (no repetir estos errores)

- LINE-HEIGHT: los títulos display (Anton) que pueden ocupar más de una línea NO
  deben tener line-height < 0.95, o las líneas se montan una sobre otra. El token
  --leading-display está en 0.95 por esta razón. No bajarlo.
- Al ajustar algo que ya funciona, el prompt debe decir explícitamente QUÉ NO TOCAR
  (ej: "arreglá mobile, NO toques desktop"). El agente tiende a "mejorar de más".
- VERIFICACIÓN: no confirmar que una tarea visual está lista sin haberla visto en
  screenshot, en desktop Y mobile. El texto engaña, sobre todo con animaciones.
- Una tarea aislada por prompt. No mezclar (ej: no combinar ajuste de layout con
  captura de navegador en el mismo pedido).
- claude-in-chrome tiende a congelarse al capturar tras ejecutar JS. Si pasa, no
  bloquea el trabajo: el usuario verifica en el navegador y trae screenshots.

## Flujo estándar para animar una sección

1. Leer el DESIGN.md de la plantilla y este estándar de animación.
2. Aplicar entrada sutil (fade + translateY con whileInView, una sola vez).
3. Si es la sección estrella (menú), sumar el momento de efecto marcado.
4. Respetar prefers-reduced-motion y performance mobile.
5. Verificar con screenshots (desktop + mobile) antes de confirmar.
6. No tocar otras secciones que ya funcionan.