
# Prospector

Sistema para captar restaurantes sin web en Montevideo y cerrarlos con una demo
profesional ya hecha. El diferencial no es el volumen: es llegar con el trabajo
terminado mientras el resto llega con una propuesta.

## Cómo está pensado

Tres piezas que hablan un mismo contrato de datos (`web/lib/schema.ts`):

    scraper/  →  Google Places: encuentra y filtra prospectos calificados
    data/     →  un JSON por prospecto (el "cliente" como dato)
    web/      →  Next.js: consume el JSON y renderiza la demo
    templates/→  plantillas React por vertical (se escriben una vez)
    agent/    →  prompts y notas para Claude Code

La idea central: **plantilla ≠ datos**. La plantilla es código reutilizable;
el cliente es un archivo JSON. Cambiar de nicho = plantilla nueva. Nuevo
prospecto = JSON nuevo. Nada se reescribe dos veces.

## Fases

**Fase 1 — Validación manual (2 semanas).** Un solo vertical. Sacás ~50 negocios,
hacés 3 demos, mandás los WhatsApp vos mismo. Objetivo: aprender qué mensaje cierra.

**Fase 2 — Recolección automática.** Corrés el scraper. Los prospectos calientes
caen solos en `data/prospects/`.

**Fase 3 — Plantillas premium por vertical.** Hamburguesería, parrilla, café.
Cada una con identidad propia. Acá va tu trabajo fuerte de diseño con Claude Code.

**Fase 4 — Demo automática.** Un cron (Vercel) que junta prospecto + genera demo
+ te deja el link listo. Vos revisás y mandás.

**Fase 5 — Escala.** Otras ciudades y verticales, mismo patrón.

## Comandos

    # Scraper
    cd scraper
    pip install -r requirements.txt
    export GOOGLE_PLACES_API_KEY="tu_clave"
    python scrape.py --query "hamburguesería Pocitos Montevideo" \
                     --vertical hamburgueseria --only-hot

    # Web (una vez que exista el proyecto Next)
    cd web
    npm install
    # Base de las URLs absolutas de la preview social (Open Graph / WhatsApp).
    # Sin definirla usa el dominio de producción; en local conviene apuntarla acá.
    export NEXT_PUBLIC_SITE_URL="http://localhost:3000"
    npm run dev        # ver demos en localhost:3000/<slug>

## Estado de un prospecto

En `_meta.status`: nuevo → demo_lista → enviado → respondio → cerrado.
Sirve para no mandar dos veces al mismo y medir conversión por vertical.
