# Prompt: generar una plantilla nueva por vertical

Pegá esto en Claude Code cuando quieras una plantilla para un nicho nuevo.
Reemplazá <VERTICAL> y el brief. El resto ya está resuelto por el contrato de datos.

---

Necesito una plantilla de landing para el vertical `<VERTICAL>` (ej. parrilla).

Contexto obligatorio antes de escribir código:
1. Leé `web/lib/schema.ts` — la plantilla recibe `data: ClientData` y renderiza
   SOLO desde ahí. Nada hardcodeado.
2. Leé `/mnt/skills/public/frontend-design/SKILL.md` y seguilo.
3. Mirá las plantillas existentes en `templates/` como referencia de estructura,
   pero esta debe tener identidad visual PROPIA — otra paleta, otra tipografía,
   otro elemento firma. Si se parece a las demás, está mal.

Requisitos:
- Componente en `templates/<VERTICAL>/Template.tsx`, export default que recibe
  `{ data }: { data: ClientData }`.
- Secciones: hero, about, menú (mapeando data.menu), horarios, contacto con
  botón de WhatsApp que use data.whatsapp, footer.
- Rendimiento mobile primero: 3D con carga diferida y fallback a video en mobile.
  LCP < 2.5s. Si el efecto rompe el rendimiento, degradá.
- Accesibilidad: foco visible por teclado, `prefers-reduced-motion` respetado.

Brief de identidad para este vertical:
<describí acá el mood: colores, sensación, referencia si tenés una>

Cuando termines, mostrame cómo se ve con el prospecto de ejemplo en data/prospects/.
