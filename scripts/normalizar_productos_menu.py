#!/usr/bin/env python3
"""
Normaliza los assets de producto del menú: los recortes transparentes de las
hamburguesas y las fotos cuadradas de los acompañamientos.

ENTRADA  assets/hamburgueseria/productos-source/<slug>.png   (RGBA, alfa real)
SALIDA   web/public/hamburgueseria/productos-v2/<slug>.webp

ENTRADA  assets/hamburgueseria/*acompañamiento*.jpg          (foto opaca)
SALIDA   web/public/hamburgueseria/acompanamientos-v2/<slug>.webp

Qué hace con las hamburguesas, y por qué:

1. Verifica que el PNG tenga alfa REAL. Un PNG "con transparencia" que en
   realidad trae fondo pintado arruina la vitrina: la burger tiene que flotar
   sobre el negro de la página, no traer su propio rectángulo.
2. Recorta SOLO transparencia. No toca la fotografía: ni curvas, ni recorte de
   fondo extra, ni realce. Lo que llega es lo que sale.
3. IGUALA LA ESCALA PERCIBIDA. Cada burger se escala para que su caja visible
   tenga el mismo "tamaño aparente" —la media geométrica de ancho y alto— que
   la referencia. Sin esto, dos fotos del mismo tamaño de archivo se ven una
   grande y otra chica según cuánto aire traiga cada recorte, que es
   exactamente lo que hacía que el menú pareciera cinco composiciones
   distintas.
4. LE PONE UN TECHO AL ALTO. La altura visible no puede pasar de
   `ALTO_VISIBLE_MAX`. No es capricho: el nombre gigante vive detrás con su
   base fija, y una burger más alta que el techo se lo come. Las diferencias
   naturales de altura se conservan —la Doble Doble sigue siendo una torre—,
   pero dentro de un rango que la composición aguanta.
5. APOYA TODO EN LA MISMA LÍNEA. La base de la caja visible cae siempre en
   `LINEA_BASE`, así que al pasar de una burger a otra ninguna flota ni se
   hunde.
6. Centra por CENTRO DE MASA del alfa, no por caja: una burger con el pan
   corrido a un lado se ve torcida si se centra por rectángulo.
7. NUNCA agranda. Escalar hacia arriba una foto es perder nitidez para ganar
   nada.

Qué hace con los acompañamientos:

Son fotografías OPACAS —JPEG de verdad, sin canal alfa— y este pipeline no
inventa transparencia: no recorta fondos por umbral ni por magia. Lo único que
normaliza es el encuadre: recorte cuadrado centrado y WebP real, para que las
tres fotos tengan el mismo lienzo y el mismo peso visual dentro de la grilla
compacta.

El emparejamiento archivo → producto es POR NOMBRE, nunca por orden: se
normaliza el nombre del archivo (sin tildes, espacios, guiones ni la palabra
"acompañamiento") y se busca el producto con ese mismo nombre normalizado en
el JSON del prospecto. Lo que no empareja se reporta y no se asigna.

Uso:
    python3 scripts/normalizar_productos_menu.py            # todo
    python3 scripts/normalizar_productos_menu.py clasica    # una burger
"""

from __future__ import annotations

import json
import math
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "assets/hamburgueseria/productos-source"
DESTINO = RAIZ / "web/public/hamburgueseria/productos-v2"
#: Fotos sueltas de acompañamiento, tal como llegan de la agencia.
ORIGEN_ACOMP = RAIZ / "assets/hamburgueseria"
DESTINO_ACOMP = RAIZ / "web/public/hamburgueseria/acompanamientos-v2"
#: El JSON del prospecto es la única fuente de los nombres de producto.
PROSPECTO = RAIZ / "data/prospects/_ejemplo.json"
#: Geometría medida de cada salida. No la lee la web: la lee la verificación,
#: que necesita saber dónde quedó la burger DENTRO del lienzo para poder
#: comprobar que todas apoyan y se centran igual.
MANIFIESTO = RAIZ / "assets/hamburgueseria/geometria-productos.json"

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

#: TAMAÑO APARENTE DE REFERENCIA, en píxeles del lienzo.
#:
#: Es la media geométrica √(ancho·alto) de la caja visible de Oklahoma tal como
#: quedaba normalizada antes de esta pasada: 1230×862 → 1030. Oklahoma es la
#: composición que el cliente da por buena, así que se la midió y su tamaño
#: aparente pasó a ser el patrón; no se copiaron sus medidas literales, que
#: harían más chata a la Doble Doble.
#:
#: La media geométrica —y no el ancho ni el alto sueltos— es lo que se parece a
#: cómo el ojo compara dos objetos: una burger ancha y chata y una angosta y
#: alta se ven "del mismo tamaño" cuando su área aparente coincide.
LADO_PERCIBIDO = 1030
#: Techo de altura visible, en fracción del lienzo.
#:
#: El nombre gigante apoya su base a una altura fija del escenario y la burger
#: sube desde el piso: cuanto más alta, más nombre tapa. Con el techo en 58% del
#: lienzo ninguna se come más de un tercio de la palabra, y las diferencias
#: reales de altura entre productos siguen viéndose.
ALTO_VISIBLE_MAX = 0.58


@dataclass
class Informe:
    slug: str
    nombre: str
    original: tuple[int, int]
    peso_png: int
    esquinas: list[int]
    bbox: tuple[int, int, int, int]
    recorte: tuple[int, int]
    escala: float
    dentro: tuple[int, int]
    #: Caja visible DENTRO del lienzo, en fracciones (x, y, ancho, alto).
    caja_lienzo: tuple[float, float, float, float]
    margen_real: float
    peso_webp: int

    def imprimir(self) -> None:
        bw, bh = self.recorte
        x, y, w, h = self.caja_lienzo
        print(f"\n{self.nombre}")
        print(f"  original      {self.original[0]}×{self.original[1]} px · {self.peso_png / 1024:.0f} KB PNG")
        print(f"  alfa esquinas {self.esquinas}  (0 = transparente)")
        print(f"  bounding box  {self.bbox} → {bw}×{bh} px")
        print(f"  escala        ×{self.escala:.3f} (1.000 = sin tocar; nunca >1)")
        print(f"  en el lienzo  {self.dentro[0]}×{self.dentro[1]} px dentro de {LIENZO}×{LIENZO}")
        print(f"  caja visible  centro x {x + w / 2:.3f} · base y {y + h:.3f} · alto {h:.3f} · ancho {w:.3f}")
        print(f"  tamaño aparente √(w·h) = {math.sqrt(self.dentro[0] * self.dentro[1]):.0f} px (referencia {LADO_PERCIBIDO})")
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

    # --- ESCALA: tres reglas que se aplican a la vez, gana la más chica ------
    #
    # 1. tamaño aparente igual al de la referencia (media geométrica),
    # 2. techo de altura, para que la burger no se coma el nombre,
    # 3. techo de lado, para que entre en el lienzo con margen.
    #
    # Y por encima de las tres, el 1.0: nunca se agranda.
    util = min(LADO_VISIBLE_MAX, int(LIENZO * (1 - 2 * MARGEN)))
    por_percibido = LADO_PERCIBIDO / math.sqrt(rw * rh)
    por_alto = (ALTO_VISIBLE_MAX * LIENZO) / rh
    escala = min(por_percibido, por_alto, util / rw, util / rh, 1.0)
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
        slug=salida.stem,
        nombre=f"{ruta.name} ({formato}) → {salida.name}",
        original=original,
        peso_png=peso_png,
        esquinas=esquinas,
        bbox=caja,
        recorte=(rw, rh),
        escala=escala,
        dentro=(cw, ch),
        caja_lienzo=(
            izquierda / LIENZO,
            arriba / LIENZO,
            cw / LIENZO,
            ch / LIENZO,
        ),
        margen_real=margen_real,
        peso_webp=salida.stat().st_size,
    )


# ---------------------------------------------------------------------------
# Acompañamientos: fotos opacas, encuadre cuadrado
# ---------------------------------------------------------------------------

#: La palabra que marca un archivo de acompañamiento, ya normalizada.
MARCA_ACOMPANAMIENTO = "acompanamiento"
#: Lado del cuadrado de salida. Más chico que el de las burgers a propósito:
#: es una miniatura de grilla, no una vitrina.
LIENZO_ACOMP = 1100


def normalizar_texto(texto: str) -> str:
    """
    Nombre comparable: sin tildes, sin ñ, sin signos, sin espacios, minúsculas.

    Es lo que permite que `papas de la casaacompañamiento.jpg`,
    `Papas-de-la-Casa-acompanamiento.webp` y el producto "Papas de la casa"
    del JSON sean, para el emparejamiento, exactamente la misma cosa.
    """
    sin_tildes = unicodedata.normalize("NFD", texto)
    sin_tildes = "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "", sin_tildes.lower())


def producto_de_archivo(nombre_archivo: str) -> str | None:
    """
    Qué producto nombra un archivo de acompañamiento.

    Devuelve el nombre normalizado que quedó ANTES de la palabra
    "acompañamiento", o `None` si el archivo no lleva esa marca. No adivina por
    posición ni por orden: si el archivo no dice a qué producto pertenece, no
    pertenece a ninguno.
    """
    base = normalizar_texto(Path(nombre_archivo).stem)
    if MARCA_ACOMPANAMIENTO not in base:
        return None
    izquierda = base.split(MARCA_ACOMPANAMIENTO)[0]
    return izquierda or None


def nombres_de_acompanamientos() -> dict[str, str]:
    """
    Nombre normalizado → nombre real, leídos del JSON del prospecto.

    Los nombres NO se escriben acá: los pone el negocio. Este script empareja
    contra lo que el JSON diga hoy.
    """
    datos = json.loads(PROSPECTO.read_text(encoding="utf-8"))
    mapa: dict[str, str] = {}
    for seccion in datos.get("menu", []):
        if normalizar_texto(seccion.get("title", "")) != "acompanamientos":
            continue
        for item in seccion.get("items", []):
            mapa[normalizar_texto(item["name"])] = item["name"]
    return mapa


@dataclass
class InformeAcomp:
    archivo: str
    producto: str
    slug: str
    formato: str
    original: tuple[int, int]
    modo: str
    alfa: bool
    recorte: tuple[int, int, int, int]
    peso_origen: int
    peso_webp: int

    def imprimir(self) -> None:
        print(f"\n{self.archivo} → {self.producto}")
        print(f"  formato real  {self.formato} · modo {self.modo} · alfa: {'sí' if self.alfa else 'NO (foto opaca)'}")
        print(f"  original      {self.original[0]}×{self.original[1]} px · {self.peso_origen / 1024:.0f} KB")
        print(f"  recorte       {self.recorte} → cuadrado {LIENZO_ACOMP}×{LIENZO_ACOMP}")
        print(f"  salida        acompanamientos-v2/{self.slug}.webp · {self.peso_webp / 1024:.0f} KB WebP")


def normalizar_acompanamiento(ruta: Path, producto: str, slug: str) -> InformeAcomp:
    """
    Encuadra una foto de acompañamiento en un cuadrado y la guarda como WebP.

    NO se le inventa transparencia. Si el archivo es un JPEG opaco —y los tres
    que llegaron lo son—, sale opaco: recortar el fondo por umbral dejaría
    halos y bordes comidos, y este pipeline no hace edición generativa.
    """
    formato = firma_real(ruta)
    if formato == "desconocido":
        raise ValueError(f"{ruta.name}: formato no reconocido por su firma.")

    imagen = Image.open(ruta)
    original = imagen.size
    modo = imagen.mode
    tiene_alfa = modo in ("RGBA", "LA") and alfa_real(imagen.convert("RGBA"))

    ancho, alto = original
    lado = min(ancho, alto)
    # Recorte cuadrado centrado. El plato está al medio en las tres fotos; un
    # recorte con sesgo sería una decisión distinta por archivo, que es
    # justamente lo que rompe la consistencia.
    izquierda = (ancho - lado) // 2
    arriba = (alto - lado) // 2
    caja = (izquierda, arriba, izquierda + lado, arriba + lado)

    cuadrado = imagen.convert("RGBA" if tiene_alfa else "RGB").crop(caja)
    if lado != LIENZO_ACOMP:
        cuadrado = cuadrado.resize((LIENZO_ACOMP, LIENZO_ACOMP), Image.LANCZOS)

    DESTINO_ACOMP.mkdir(parents=True, exist_ok=True)
    salida = DESTINO_ACOMP / f"{slug}.webp"
    cuadrado.save(salida, "WEBP", quality=CALIDAD, method=6, lossless=False)

    return InformeAcomp(
        archivo=ruta.name,
        producto=producto,
        slug=slug,
        formato=formato,
        original=original,
        modo=modo,
        alfa=tiene_alfa,
        recorte=caja,
        peso_origen=ruta.stat().st_size,
        peso_webp=salida.stat().st_size,
    )


def procesar_acompanamientos() -> tuple[list[InformeAcomp], list[str], list[str]]:
    """Devuelve (procesados, archivos sin producto, productos sin archivo)."""
    catalogo = nombres_de_acompanamientos()
    procesados: list[InformeAcomp] = []
    huerfanos: list[str] = []
    emparejados: set[str] = set()

    for ruta in sorted(ORIGEN_ACOMP.iterdir()):
        if not ruta.is_file():
            continue
        clave = producto_de_archivo(ruta.name)
        if clave is None:
            continue
        if clave not in catalogo:
            huerfanos.append(ruta.name)
            continue
        emparejados.add(clave)
        procesados.append(
            normalizar_acompanamiento(ruta, catalogo[clave], aslug(catalogo[clave]))
        )

    sin_foto = [catalogo[k] for k in catalogo if k not in emparejados]
    return procesados, huerfanos, sin_foto


def aslug(nombre: str) -> str:
    """Mismo criterio que `aSlug` del dominio: es la clave pública del archivo."""
    sin_tildes = unicodedata.normalize("NFD", nombre)
    sin_tildes = "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn")
    return re.sub(r"-+$|^-+", "", re.sub(r"[^a-z0-9]+", "-", sin_tildes.lower()))


# ---------------------------------------------------------------------------


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

    print("HAMBURGUESAS — recortes con alfa real")
    informes = [normalizar(fuente) for fuente in fuentes]
    for informe in informes:
        informe.imprimir()

    # Resumen comparativo: es lo que hace evidente si una burger se salió del
    # rango, sin tener que abrir las cinco imágenes.
    print("\n  resumen (fracción del lienzo)")
    print(f"  {'producto':<14}{'centro x':>10}{'base y':>9}{'alto':>8}{'ancho':>8}")
    for i in informes:
        x, y, w, h = i.caja_lienzo
        print(f"  {i.slug:<14}{x + w / 2:>10.3f}{y + h:>9.3f}{h:>8.3f}{w:>8.3f}")

    if not filtro:
        MANIFIESTO.write_text(
            json.dumps(
                {
                    "lienzo": LIENZO,
                    "lineaBase": LINEA_BASE,
                    "ladoPercibido": LADO_PERCIBIDO,
                    "altoVisibleMax": ALTO_VISIBLE_MAX,
                    "productos": {
                        i.slug: {
                            "x": round(i.caja_lienzo[0], 4),
                            "y": round(i.caja_lienzo[1], 4),
                            "ancho": round(i.caja_lienzo[2], 4),
                            "alto": round(i.caja_lienzo[3], 4),
                            "escala": round(i.escala, 4),
                        }
                        for i in informes
                    },
                },
                indent=2,
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"\n  geometría medida → {MANIFIESTO.relative_to(RAIZ)}")

    print("\n\nACOMPAÑAMIENTOS — fotos opacas, encuadre cuadrado")
    procesados, huerfanos, sin_foto = procesar_acompanamientos()
    for informe in procesados:
        informe.imprimir()
    if huerfanos:
        print("\n  archivos SIN producto que les corresponda (no se asignan):")
        for nombre in huerfanos:
            print(f"    · {nombre}")
    if sin_foto:
        print("\n  productos SIN foto (se quedan con su fallback):")
        for nombre in sin_foto:
            print(f"    · {nombre}")

    print(f"\nSalida en {DESTINO.relative_to(RAIZ)} y {DESTINO_ACOMP.relative_to(RAIZ)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
