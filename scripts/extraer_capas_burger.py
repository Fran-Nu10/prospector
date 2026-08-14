#!/usr/bin/env python3
"""Extrae las seis capas de la burger desde el render explotado.

Entrada:  assets/hamburgueseria/source/burger-explotada.png  (RGBA)
Salida:   web/public/hamburgueseria/capas-v2/capa-0N-<nombre>.png

Se apoya SOLO en el canal alfa: binariza, etiqueta los componentes conectados,
descarta el ruido chico y ordena de arriba hacia abajo. No reescala, no
convierte de formato, no toca color ni halos — cada capa sale con su
resolución original y su transparencia intacta.

Etiquetado por runs con union-find: no hace falta scipy ni OpenCV, que no
están instalados, y sobre una imagen de este tamaño es instantáneo.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "assets/hamburgueseria/source/burger-explotada.png"
DESTINO = RAIZ / "web/public/hamburgueseria/capas-v2"

# Nombres en orden visual, de arriba hacia abajo.
NOMBRES = [
    "capa-01-pan-superior",
    "capa-02-bacon",
    "capa-03-smash-superior",
    "capa-04-cebolla",
    "capa-05-smash-inferior",
    "capa-06-pan-inferior",
]

# Un píxel cuenta como opaco a partir de acá. Bajo a propósito: preserva el
# borde antialiaseado, que es lo que evita que las capas se vean recortadas.
UMBRAL_ALFA = 8
# Todo componente por debajo de esta fracción del área es ruido (motas sueltas).
AREA_MINIMA = 0.001
PADDING = 12


def etiquetar(mascara: np.ndarray) -> tuple[np.ndarray, int]:
    """Componentes conectados (4-vecinos) por runs + union-find."""
    alto, ancho = mascara.shape
    padre: list[int] = [0]

    def raiz(x: int) -> int:
        while padre[x] != x:
            padre[x] = padre[padre[x]]
            x = padre[x]
        return x

    def unir(a: int, b: int) -> None:
        ra, rb = raiz(a), raiz(b)
        if ra != rb:
            padre[max(ra, rb)] = min(ra, rb)

    etiquetas = np.zeros((alto, ancho), dtype=np.int32)
    runs_previos: list[tuple[int, int, int]] = []

    for y in range(alto):
        fila = mascara[y]
        if not fila.any():
            runs_previos = []
            continue
        # Bordes de cada run de True en la fila.
        cambios = np.flatnonzero(np.diff(np.concatenate(([0], fila.view(np.int8), [0]))))
        runs_actuales: list[tuple[int, int, int]] = []
        for inicio, fin in zip(cambios[::2], cambios[1::2]):
            vecinos = [e for (i, f, e) in runs_previos if i < fin and inicio < f]
            if vecinos:
                etiqueta = min(raiz(v) for v in vecinos)
                for v in vecinos:
                    unir(etiqueta, v)
            else:
                etiqueta = len(padre)
                padre.append(etiqueta)
            etiquetas[y, inicio:fin] = etiqueta
            runs_actuales.append((inicio, fin, etiqueta))
        runs_previos = runs_actuales

    # Aplana la jerarquía y renumera de forma contigua.
    tabla = np.array([raiz(i) for i in range(len(padre))], dtype=np.int32)
    etiquetas = tabla[etiquetas]
    finales = np.unique(etiquetas)
    finales = finales[finales != 0]
    renumerado = np.zeros(tabla.max() + 1, dtype=np.int32)
    renumerado[finales] = np.arange(1, len(finales) + 1)
    return renumerado[etiquetas], len(finales)


def dilatar(mascara: np.ndarray, radio: int) -> np.ndarray:
    """Engorda la máscara unos píxeles, con desplazamientos puros de numpy.

    Recupera el borde antialiaseado que quedó por debajo del umbral: sin esto
    la capa sale con el contorno mordido.
    """
    salida = mascara.copy()
    for _ in range(radio):
        crecida = salida.copy()
        crecida[1:, :] |= salida[:-1, :]
        crecida[:-1, :] |= salida[1:, :]
        crecida[:, 1:] |= salida[:, :-1]
        crecida[:, :-1] |= salida[:, 1:]
        salida = crecida
    return salida


def main() -> int:
    if not ORIGEN.exists():
        print(f"ERROR: no existe {ORIGEN}", file=sys.stderr)
        return 1

    imagen = Image.open(ORIGEN).convert("RGBA")
    pixeles = np.array(imagen)
    alfa = pixeles[:, :, 3]
    etiquetas, total = etiquetar(alfa >= UMBRAL_ALFA)

    areas = np.bincount(etiquetas.ravel())
    minima = AREA_MINIMA * alfa.size
    grandes = [i for i in range(1, total + 1) if areas[i] >= minima]
    print(f"componentes: {total} detectados, {len(grandes)} grandes "
          f"(descartados {total - len(grandes)} por ruido)")

    if len(grandes) != len(NOMBRES):
        print(f"ERROR: se esperaban {len(NOMBRES)} componentes y hay {len(grandes)}",
              file=sys.stderr)
        return 1

    # Ordena de arriba hacia abajo por el borde superior de su bounding box.
    cajas = []
    for etiqueta in grandes:
        ys, xs = np.nonzero(etiquetas == etiqueta)
        cajas.append((ys.min(), ys.max(), xs.min(), xs.max(), etiqueta))
    cajas.sort(key=lambda c: c[0])

    DESTINO.mkdir(parents=True, exist_ok=True)
    alto, ancho = alfa.shape
    for nombre, (y0, y1, x0, x1, etiqueta) in zip(NOMBRES, cajas):
        ry0, ry1 = max(0, y0 - PADDING), min(alto, y1 + 1 + PADDING)
        rx0, rx1 = max(0, x0 - PADDING), min(ancho, x1 + 1 + PADDING)
        recorte = pixeles[ry0:ry1, rx0:rx1].copy()

        # Las bounding boxes se solapan —el bacon es ancho y ondulado y su caja
        # invade la del medallón—, así que recortar la caja a secas arrastraría
        # pedazos de la capa vecina. Se conserva SOLO este componente.
        propio = dilatar(etiquetas[ry0:ry1, rx0:rx1] == etiqueta, 2)
        recorte[:, :, 3] = np.where(propio, recorte[:, :, 3], 0)

        Image.fromarray(recorte).save(DESTINO / f"{nombre}.png")
        opacos = int((recorte[:, :, 3] >= UMBRAL_ALFA).sum())
        print(f"{nombre}.png  {rx1 - rx0}x{ry1 - ry0}  "
              f"({opacos / areas[etiqueta]:.2f}× del componente)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
