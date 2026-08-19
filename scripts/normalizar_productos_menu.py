#!/usr/bin/env python3
"""
Normaliza los recortes transparentes de producto para la vitrina del menú.

ENTRADA   assets/hamburgueseria/productos-source/*.png   (RGBA con alfa real)
SALIDA    web/public/hamburgueseria/productos-v2/*.webp  (RGBA, calidad 84)

Qué hace y por qué:

1. Verifica que el PNG tenga alfa REAL. Un PNG "con transparencia" que en
   realidad trae fondo pintado arruina la vitrina: la burger tiene que flotar
   sobre el negro de la página, no traer su propio rectángulo.
2. Recorta SOLO transparencia. No toca la fotografía: ni curvas, ni recorte de
   fondo extra, ni realce. Lo que llega es lo que sale.
3. Centra ópticamente en un lienzo cuadrado de 1600×1600 con ~10% de margen.
   El centrado NO es geométrico: usa el centro de masa del alfa, que es donde
   el ojo ve el centro del objeto. Una burger con sombra abajo o un pan más
   ancho arriba queda torcida si se centra por caja.
4. NUNCA agranda: si el recorte es más chico que la caja útil, se deja a su
   tamaño real y el margen crece. Escalar hacia arriba una foto es perder
   nitidez para ganar nada.

Uso:
    python3 scripts/normalizar_productos_menu.py            # todos
    python3 scripts/normalizar_productos_menu.py clasica    # uno
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "assets/hamburgueseria/productos-source"
DESTINO = RAIZ / "web/public/hamburgueseria/productos-v2"

#: Firmas reales de archivo. El nombre y la extensión no prueban nada: un
#: "transparente.png" puede ser un JPEG opaco renombrado.
FIRMAS = {
    b"\x89PNG\r\n\x1a\n": "PNG",
    b"\xff\xd8\xff": "JPEG",
}

#: Lado del lienzo cuadrado de salida.
LIENZO = 1600
#: Margen mínimo a cada lado, en fracción del lienzo.
MARGEN = 0.10
#: Calidad WebP. 84 es donde el degradé del pan deja de romperse.
CALIDAD = 84
#: Alfa a partir del cual un píxel cuenta como visible (descarta el halo de 1-2).
UMBRAL_ALFA = 8
#: Línea de piso: TODOS los productos apoyan la base de su caja visible acá.
#: Es lo que hace que al pasar de una burger a otra no salten de tamaño ni
#: floten a distinta altura — están sobre la misma repisa invisible.
LINEA_BASE = 0.875
#: Lado máximo de la caja visible. Por encima de esto se reduce (nunca al revés).
LADO_VISIBLE_MAX = 1280


@dataclass
class Informe:
    nombre: str
    original: tuple[int, int]
    peso_png: int
    esquinas: list[int]
    bbox: tuple[int, int, int, int]
    recorte: tuple[int, int]
    escala: float
    dentro: tuple[int, int]
    margen_real: float
    peso_webp: int

    def imprimir(self) -> None:
        bw, bh = self.recorte
        print(f"\n{self.nombre}")
        print(f"  original      {self.original[0]}×{self.original[1]} px · {self.peso_png / 1024:.0f} KB PNG")
        print(f"  alfa esquinas {self.esquinas}  (0 = transparente)")
        print(f"  bounding box  {self.bbox} → {bw}×{bh} px")
        print(f"  escala        ×{self.escala:.3f} (1.000 = sin tocar; nunca >1)")
        print(f"  en el lienzo  {self.dentro[0]}×{self.dentro[1]} px dentro de {LIENZO}×{LIENZO}")
        print(f"  margen real   {self.margen_real * 100:.1f}% (mínimo pedido {MARGEN * 100:.0f}%)")
        print(f"  salida        {self.peso_webp / 1024:.0f} KB WebP calidad {CALIDAD}")


def firma_real(ruta: Path) -> str:
    """Formato REAL, leído de los primeros bytes."""
    cabecera = ruta.read_bytes()[:16]
    for magia, nombre in FIRMAS.items():
        if cabecera.startswith(magia):
            return nombre
    if cabecera[:4] == b"RIFF" and cabecera[8:12] == b"WEBP":
        return "WEBP"
    return "desconocido"


def alfa_real(imagen: Image.Image) -> bool:
    """Un alfa útil tiene transparencia de verdad, no un canal lleno de 255."""
    if imagen.mode != "RGBA":
        return False
    extremos = imagen.getchannel("A").getextrema()
    return extremos[0] < UMBRAL_ALFA


def caja_visible(imagen: Image.Image) -> tuple[int, int, int, int]:
    """Bounding box de lo que se ve, ignorando el halo casi transparente."""
    mascara = imagen.getchannel("A").point(lambda v: 255 if v > UMBRAL_ALFA else 0)
    caja = mascara.getbbox()
    if caja is None:
        raise ValueError("la imagen no tiene ningún píxel visible")
    return caja


def centro_de_masa(imagen: Image.Image) -> tuple[float, float]:
    """Centro de masa del alfa, en píxeles de la imagen recortada."""
    alfa = imagen.getchannel("A")
    ancho, alto = alfa.size
    datos = alfa.tobytes()
    total = 0
    suma_x = 0
    suma_y = 0
    for y in range(alto):
        fila = datos[y * ancho : (y + 1) * ancho]
        peso_fila = sum(fila)
        if not peso_fila:
            continue
        total += peso_fila
        suma_y += peso_fila * y
        suma_x += sum(v * x for x, v in enumerate(fila))
    if total == 0:
        return ancho / 2, alto / 2
    return suma_x / total, suma_y / total


def normalizar(ruta: Path, destino: Path = DESTINO, salida_nombre: str | None = None) -> Informe:
    formato = firma_real(ruta)
    if formato == "JPEG":
        raise ValueError(
            f"{ruta.name}: es un JPEG de verdad (lo diga o no el nombre). Un "
            "JPEG no tiene canal alfa, así que no hay recorte que integrar: el "
            "producto se queda con su foto de fallback hasta que llegue un PNG "
            "o WebP con transparencia real."
        )
    if formato == "desconocido":
        raise ValueError(f"{ruta.name}: formato no reconocido por su firma.")

    imagen = Image.open(ruta)
    original = imagen.size
    peso_png = ruta.stat().st_size

    if imagen.mode != "RGBA":
        imagen = imagen.convert("RGBA")
    if not alfa_real(imagen):
        raise ValueError(
            f"{ruta.name}: {formato} sin transparencia real — el alfa está "
            "opaco de punta a punta. Este pipeline no recorta fondos: el "
            "recorte tiene que venir hecho."
        )

    ancho, alto = imagen.size
    esquinas = [
        imagen.getpixel(punto)[3]
        for punto in ((0, 0), (ancho - 1, 0), (0, alto - 1), (ancho - 1, alto - 1))
    ]

    caja = caja_visible(imagen)
    recorte = imagen.crop(caja)
    rw, rh = recorte.size

    util = min(LADO_VISIBLE_MAX, int(LIENZO * (1 - 2 * MARGEN)))
    escala = min(util / rw, util / rh, 1.0)  # el 1.0 es el techo: nunca agranda
    if escala < 1.0:
        recorte = recorte.resize((round(rw * escala), round(rh * escala)), Image.LANCZOS)

    cw, ch = recorte.size
    cx, _ = centro_de_masa(recorte)

    # Horizontal: centro de MASA, no de caja — una burger con el pan corrido a
    # un lado se ve torcida si se centra por rectángulo.
    # Vertical: la BASE de todos los productos cae en la misma línea. Cada
    # burger tiene su altura real (la Oklahoma es chata, la Doble Doble es una
    # torre) y eso se conserva; lo que se comparte es el piso.
    izquierda = round(LIENZO / 2 - cx)
    arriba = round(LIENZO * LINEA_BASE - ch)
    izquierda = max(0, min(LIENZO - cw, izquierda))
    arriba = max(0, min(LIENZO - ch, arriba))

    lienzo = Image.new("RGBA", (LIENZO, LIENZO), (0, 0, 0, 0))
    lienzo.paste(recorte, (izquierda, arriba))

    destino.mkdir(parents=True, exist_ok=True)
    salida = destino / f"{salida_nombre or ruta.stem}.webp"
    lienzo.save(salida, "WEBP", quality=CALIDAD, method=6, lossless=False)

    margen_real = min(izquierda, arriba, LIENZO - cw - izquierda, LIENZO - ch - arriba) / LIENZO

    return Informe(
        nombre=f"{ruta.name} ({formato}) → {salida.name}",
        original=original,
        peso_png=peso_png,
        esquinas=esquinas,
        bbox=caja,
        recorte=(rw, rh),
        escala=escala,
        dentro=(cw, ch),
        margen_real=margen_real,
        peso_webp=salida.stat().st_size,
    )


def main(argv: list[str]) -> int:
    if not ORIGEN.exists():
        print(f"No existe {ORIGEN}", file=sys.stderr)
        return 1

    filtro = {a.lower() for a in argv}
    fuentes = sorted(ORIGEN.glob("*.png"))
    if filtro:
        fuentes = [f for f in fuentes if f.stem.lower() in filtro]
    if not fuentes:
        print("Nada para normalizar.", file=sys.stderr)
        return 1

    for fuente in fuentes:
        normalizar(fuente).imprimir()

    print(f"\nSalida en {DESTINO.relative_to(RAIZ)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
