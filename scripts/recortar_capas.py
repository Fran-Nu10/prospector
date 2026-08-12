"""
Recorta una imagen de "exploded burger" en sus capas individuales.

Entrada:  web/public/hamburgueseria/burger-completa.png
          (capas flotando separadas verticalmente sobre fondo negro puro)
Salida:   web/public/hamburgueseria/capas/capa-N-<nombre>.png
          (una por capa, fondo transparente, ancho original preservado
          para mantener la alineación horizontal al reapilarlas)

Uso: python scripts/recortar_capas.py
"""

from pathlib import Path

import numpy as np
from PIL import Image

# --- Parámetros ajustables ---
UMBRAL_NEGRO = 30   # R, G y B por debajo de esto => fondo => alpha 0
MIN_GAP = 4         # filas transparentes seguidas para separar dos capas
MIN_BANDA = 10      # alto mínimo de una banda para contarla como capa (filtra ruido)

RAIZ = Path(__file__).resolve().parent.parent
ENTRADA = RAIZ / "web" / "public" / "hamburgueseria" / "burger-completa.png"
SALIDA = RAIZ / "web" / "public" / "hamburgueseria" / "capas"

NOMBRES = [
    "capa-1-pan-arriba.png",
    "capa-2-bacon.png",
    "capa-3-tomate.png",
    "capa-4-medallon.png",
    "capa-5-lechuga.png",
    "capa-6-pan-abajo.png",
]


def detectar_bandas(filas_con_contenido: np.ndarray) -> list[tuple[int, int]]:
    """Devuelve [(fila_inicio, fila_fin_exclusiva), ...] de cada banda de
    contenido, ignorando gaps menores a MIN_GAP y bandas menores a MIN_BANDA."""
    bandas: list[tuple[int, int]] = []
    inicio = None
    gap = 0
    for y, tiene in enumerate(filas_con_contenido):
        if tiene:
            if inicio is None:
                inicio = y
            gap = 0
        elif inicio is not None:
            gap += 1
            if gap >= MIN_GAP:
                bandas.append((inicio, y - gap + 1))
                inicio = None
                gap = 0
    if inicio is not None:
        bandas.append((inicio, len(filas_con_contenido) - gap))
    return [(a, b) for a, b in bandas if b - a >= MIN_BANDA]


def main() -> None:
    img = Image.open(ENTRADA).convert("RGBA")
    px = np.array(img)  # (alto, ancho, 4)

    # Fondo negro/casi negro -> transparente (vectorizado)
    fondo = (px[:, :, :3] < UMBRAL_NEGRO).all(axis=2)
    px[fondo, 3] = 0

    filas_con_contenido = (px[:, :, 3] > 0).any(axis=1)
    bandas = detectar_bandas(filas_con_contenido)

    print(f"Imagen: {ENTRADA.name} ({img.width}x{img.height})")
    print(f"Capas detectadas: {len(bandas)}")
    if len(bandas) != 6:
        print(
            f"  AVISO: se esperaban 6 capas y se detectaron {len(bandas)}. "
            f"Ajustá UMBRAL_NEGRO ({UMBRAL_NEGRO}), MIN_GAP ({MIN_GAP}) "
            f"o MIN_BANDA ({MIN_BANDA})."
        )
        for i, (a, b) in enumerate(bandas, 1):
            print(f"  banda {i}: filas {a}-{b} (alto {b - a})")

    SALIDA.mkdir(parents=True, exist_ok=True)
    for i, (a, b) in enumerate(bandas):
        nombre = NOMBRES[i] if len(bandas) == 6 else f"capa-{i + 1}.png"
        # Solo se recorta arriba/abajo: el ancho completo preserva la
        # posición horizontal relativa de la capa respecto al original.
        capa = Image.fromarray(px[a:b])
        ruta = SALIDA / nombre
        capa.save(ruta)
        kb = ruta.stat().st_size / 1024
        print(f"  {nombre}: {capa.width}x{capa.height}px, {kb:.0f} KB")


if __name__ == "__main__":
    main()
