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

Hay DOS tipos de archivo posibles para el mismo producto, y el pipeline elige
por lo que encuentra en los BYTES, no por el nombre:

  · un PNG con alfa REAL → pasa por el MISMO recorte que las hamburguesas
    (`normalizar()`, reutilizada tal cual): se recorta la transparencia, se
    escala para igualar el tamaño aparente de las otras dos, se apoya en la
    misma línea de piso y sale como WebP con canal alfa. Es lo que permite que
    la vitrina lo muestre flotando, igual que una burger.
  · una foto OPACA (JPEG real, o un PNG sin alfa) → se recorta a un cuadrado
    centrado, sin inventarle transparencia por umbral ni por magia, y sale
    como WebP opaco. Es el camino de siempre, para cuando no hay recorte.

Si para un mismo producto llegan los dos —una foto vieja y un recorte nuevo—
GANA EL TRANSPARENTE: es lo que hace que subir un recorte reemplace la foto
opaca en vez de convivir con ella por casualidad del orden alfabético.

El emparejamiento archivo → producto es POR NOMBRE, nunca por orden. Se
normaliza el nombre del archivo (sin tildes, espacios, guiones ni la palabra
"acompañamiento") y se compara contra el nombre del producto en el JSON del
prospecto, DE DOS FORMAS:

  1. Igualdad directa del nombre completo normalizado
     ("papasdelacasaacompañamiento.jpg" → "papasdelacasa" == "Papas de la
     casa" sin tildes ni espacios).
  2. Si eso no alcanza, se comparan las dos formas SIN CONECTORES ("de", "del",
     "la", "las", "el", "en") y se acepta una igualdad o que una sea PREFIJO de
     la otra ("papasacompañamientotransparente.png" → "papas" es prefijo de
     "papascasa"; "aroscebollaacompañamientotransparente.png" → "aroscebolla"
     ya es exactamente igual a "arosdecebolla" sin el "de").

El prefijo se acepta porque quien nombra el archivo puede abreviar ("papas" en
vez de "papas de la casa"), pero SOLO si el resultado es único: si dos
productos calzaran con el mismo prefijo, no se asigna a ninguno y se reporta —
la ambigüedad no se resuelve por orden ni por adivinanza.

Lo que no empareja de ninguna de las dos formas se reporta y no se asigna.

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


def normalizar(
    ruta: Path,
    destino: Path = DESTINO,
    salida_nombre: str | None = None,
    *,
    lado_percibido: int = LADO_PERCIBIDO,
    alto_visible_max: float = ALTO_VISIBLE_MAX,
) -> Informe:
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
    por_percibido = lado_percibido / math.sqrt(rw * rh)
    por_alto = (alto_visible_max * LIENZO) / rh
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
#: Lado del cuadrado de salida OPACA. Más chico que el de las burgers a
#: propósito: es una miniatura de grilla, no una vitrina.
LIENZO_ACOMP = 1100

#: Conectores que se ignoran al comparar nombres, SOLO como segunda pasada
#: (ver el docstring del módulo). No se tocan en la primera comparación —la
#: igualdad directa— para no cambiar el comportamiento ya probado con los
#: archivos opacos originales.
CONECTORES_ES = {"de", "del", "la", "las", "el", "en"}

#: TAMAÑO APARENTE DE REFERENCIA para los acompañamientos TRANSPARENTES, en
#: píxeles del lienzo de 1600 que usa `normalizar()`.
#:
#: Es la media geométrica √(ancho·alto) del recorte de "Aros de cebolla" tal
#: como llegó de la agencia (1227×1075 → 1148). Se la eligió a ELLA por ser la
#: intermedia de las tres fotos —ni la más chata (Papas, 1047) ni la más
#: grande (Nuggets, 1184)—, el mismo criterio con el que se eligió Oklahoma
#: como referencia de las hamburguesas: la composición del medio, no la más
#: grande ni la más chica, para no forzar ni un achique ni un agrandamiento
#: artificial en los otros dos.
LADO_PERCIBIDO_ACOMP = 1148

#: Techo de altura visible para los acompañamientos transparentes, en fracción
#: del lienzo de 1600. Más alto que el de las hamburguesas (58%) porque acá no
#: hay un nombre gigante detrás que tapar: el escenario compacto solo necesita
#: que las tres fotos se vean del mismo porte.
ALTO_VISIBLE_MAX_ACOMP = 0.70


def normalizar_texto(texto: str, *, quitar_conectores: bool = False) -> str:
    """
    Nombre comparable: sin tildes, sin ñ, sin signos, sin espacios, minúsculas.

    Es lo que permite que `papas de la casaacompañamiento.jpg`,
    `Papas-de-la-Casa-acompanamiento.webp` y el producto "Papas de la casa"
    del JSON sean, para el emparejamiento, exactamente la misma cosa.

    Con `quitar_conectores=True` además se sacan "de", "la", "del"… ANTES de
    pegar las palabras, para el segundo intento de emparejamiento (ver el
    docstring del módulo). Los conectores se identifican por PALABRA —contra
    el texto con espacios todavía— y no por substring, así que un producto
    como "Delicia" no pierde su "deli" por tener un "de" adentro.
    """
    sin_tildes = unicodedata.normalize("NFD", texto)
    sin_tildes = "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn").lower()
    if quitar_conectores:
        palabras = [w for w in re.findall(r"[a-z0-9]+", sin_tildes) if w not in CONECTORES_ES]
        return "".join(palabras)
    return re.sub(r"[^a-z0-9]+", "", sin_tildes)


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


def nombres_de_acompanamientos() -> tuple[dict[str, str], dict[str, str]]:
    """
    Nombres de acompañamientos leídos del JSON del prospecto, en las DOS formas
    que se comparan contra un archivo (ver el docstring del módulo):

      · `plano`       — nombre normalizado completo, tal como se venía usando;
      · `sin_conectores` — el mismo nombre, pero sin "de"/"la"/"del"…, para
        cuando el archivo abrevia ("papas" en vez de "papas de la casa").

    Los nombres NO se escriben acá: los pone el negocio. Este script empareja
    contra lo que el JSON diga hoy.
    """
    datos = json.loads(PROSPECTO.read_text(encoding="utf-8"))
    plano: dict[str, str] = {}
    sin_conectores: dict[str, str] = {}
    for seccion in datos.get("menu", []):
        if normalizar_texto(seccion.get("title", "")) != "acompanamientos":
            continue
        for item in seccion.get("items", []):
            plano[normalizar_texto(item["name"])] = item["name"]
            sin_conectores[normalizar_texto(item["name"], quitar_conectores=True)] = item["name"]
    return plano, sin_conectores


def emparejar_producto(
    clave_archivo: str, plano: dict[str, str], sin_conectores: dict[str, str]
) -> str | None:
    """
    Qué producto nombra `clave_archivo` (ya extraída con `producto_de_archivo`).

    Tres intentos, en orden, el primero que resuelve gana:

      1. Igualdad directa contra el nombre completo normalizado.
      2. Igualdad contra el nombre SIN CONECTORES.
      3. `clave_archivo` como PREFIJO del nombre sin conectores —para un
         archivo que abrevia—, solo si hay EXACTAMENTE un producto que calce.
         Con dos o más, no se decide por adivinanza: no matchea ninguno.

    `None` si ningún camino resuelve: el archivo se reporta como huérfano, no
    se le asigna el que más se le parezca.
    """
    if clave_archivo in plano:
        return plano[clave_archivo]
    if clave_archivo in sin_conectores:
        return sin_conectores[clave_archivo]

    candidatos = {
        nombre
        for clave, nombre in sin_conectores.items()
        if clave.startswith(clave_archivo) or clave_archivo.startswith(clave)
    }
    if len(candidatos) == 1:
        return next(iter(candidatos))
    return None


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


def normalizar_acomp_transparente(ruta: Path, producto: str, slug: str) -> Informe:
    """
    Un acompañamiento con recorte de verdad pasa por el MISMO pipeline que las
    hamburguesas —reutilizado, no reimplementado—, solo que apunta a la
    carpeta pública de acompañamientos y usa la referencia de escala medida
    entre las tres fotos (`LADO_PERCIBIDO_ACOMP`), no la de las burgers.
    """
    return normalizar(
        ruta,
        destino=DESTINO_ACOMP,
        salida_nombre=slug,
        lado_percibido=LADO_PERCIBIDO_ACOMP,
        alto_visible_max=ALTO_VISIBLE_MAX_ACOMP,
    )


@dataclass
class ResultadoAcompanamientos:
    transparentes: list[Informe]
    opacos: list[InformeAcomp]
    #: Nombre del producto → nombre del archivo transparente que reemplazó a
    #: uno opaco existente. Es lo que hace visible en el reporte que subir un
    #: recorte nuevo desplazó a la foto vieja, en vez de convivir con ella.
    reemplazados: dict[str, str]
    huerfanos: list[str]
    ambiguos: list[str]
    sin_foto: list[str]


def procesar_acompanamientos() -> ResultadoAcompanamientos:
    """
    Recorre `assets/hamburgueseria/`, empareja cada archivo de acompañamiento
    con su producto POR NOMBRE (nunca por orden) y decide el pipeline por lo
    que hay en los bytes: transparente si tiene alfa real, opaco si no.

    Si para un mismo producto hay candidatos de los dos tipos, gana el
    transparente — es la única forma de que "subí un recorte nuevo" reemplace
    la foto vieja de manera predecible, sin depender del orden en que
    `iterdir()` devuelva los archivos.
    """
    plano, sin_conectores = nombres_de_acompanamientos()

    #: producto real → lista de (ruta, formato, tiene_alfa)
    candidatos: dict[str, list[tuple[Path, str, bool]]] = {}
    huerfanos: list[str] = []
    ambiguos: list[str] = []

    for ruta in sorted(ORIGEN_ACOMP.iterdir()):
        if not ruta.is_file():
            continue
        clave = producto_de_archivo(ruta.name)
        if clave is None:
            continue
        producto = emparejar_producto(clave, plano, sin_conectores)
        if producto is None:
            posibles = _prefijos_ambiguos(clave, sin_conectores)
            (ambiguos if len(posibles) > 1 else huerfanos).append(ruta.name)
            continue
        formato = firma_real(ruta)
        tiene_alfa = formato == "PNG" and alfa_real(Image.open(ruta).convert("RGBA"))
        candidatos.setdefault(producto, []).append((ruta, formato, tiene_alfa))

    transparentes: list[Informe] = []
    opacos: list[InformeAcomp] = []
    reemplazados: dict[str, str] = {}

    for producto, opciones in candidatos.items():
        slug = aslug(producto)
        transp = [o for o in opciones if o[2]]
        if transp:
            ruta_elegida = transp[0][0]
            transparentes.append(normalizar_acomp_transparente(ruta_elegida, producto, slug))
            opacas_desplazadas = [o[0].name for o in opciones if not o[2]]
            if opacas_desplazadas:
                reemplazados[producto] = f"{ruta_elegida.name} (antes: {', '.join(opacas_desplazadas)})"
            continue
        ruta_elegida = opciones[0][0]
        opacos.append(normalizar_acompanamiento(ruta_elegida, producto, slug))

    sin_foto = [nombre for nombre in plano.values() if nombre not in candidatos]
    return ResultadoAcompanamientos(
        transparentes=transparentes,
        opacos=opacos,
        reemplazados=reemplazados,
        huerfanos=huerfanos,
        ambiguos=ambiguos,
        sin_foto=sin_foto,
    )


def _prefijos_ambiguos(clave_archivo: str, sin_conectores: dict[str, str]) -> set[str]:
    """Nombres de producto que calzarían por prefijo con `clave_archivo` — para
    poder distinguir en el reporte un archivo REALMENTE huérfano de uno cuyo
    prefijo es ambiguo entre dos o más productos."""
    return {
        nombre
        for clave, nombre in sin_conectores.items()
        if clave.startswith(clave_archivo) or clave_archivo.startswith(clave)
    }


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

    print("\n\nACOMPAÑAMIENTOS")
    resultado = procesar_acompanamientos()
    if resultado.transparentes:
        print("\n  con recorte transparente (mismo pipeline que las hamburguesas):")
        for informe in resultado.transparentes:
            informe.imprimir()
    if resultado.opacos:
        print("\n  con foto opaca, encuadre cuadrado:")
        for informe in resultado.opacos:
            informe.imprimir()
    if resultado.reemplazados:
        print("\n  reemplazos (el recorte transparente desplazó a la foto opaca):")
        for producto, detalle in resultado.reemplazados.items():
            print(f"    · {producto}: {detalle}")
    if resultado.ambiguos:
        print("\n  archivos AMBIGUOS — el nombre calza con más de un producto (no se asignan):")
        for nombre in resultado.ambiguos:
            print(f"    · {nombre}")
    if resultado.huerfanos:
        print("\n  archivos SIN producto que les corresponda (no se asignan):")
        for nombre in resultado.huerfanos:
            print(f"    · {nombre}")
    if resultado.sin_foto:
        print("\n  productos SIN foto (se quedan con su fallback):")
        for nombre in resultado.sin_foto:
            print(f"    · {nombre}")

    if not filtro:
        productos_manifiesto = {
            i.slug: {
                "x": round(i.caja_lienzo[0], 4),
                "y": round(i.caja_lienzo[1], 4),
                "ancho": round(i.caja_lienzo[2], 4),
                "alto": round(i.caja_lienzo[3], 4),
                "escala": round(i.escala, 4),
            }
            for i in [*informes, *resultado.transparentes]
        }
        MANIFIESTO.write_text(
            json.dumps(
                {
                    "lienzo": LIENZO,
                    "lineaBase": LINEA_BASE,
                    "ladoPercibido": LADO_PERCIBIDO,
                    "altoVisibleMax": ALTO_VISIBLE_MAX,
                    "ladoPercibidoAcomp": LADO_PERCIBIDO_ACOMP,
                    "altoVisibleMaxAcomp": ALTO_VISIBLE_MAX_ACOMP,
                    "productos": productos_manifiesto,
                },
                indent=2,
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"\n  geometría medida → {MANIFIESTO.relative_to(RAIZ)}")

    print(f"\nSalida en {DESTINO.relative_to(RAIZ)} y {DESTINO_ACOMP.relative_to(RAIZ)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
