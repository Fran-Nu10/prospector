#!/usr/bin/env python3
"""
Scraper de prospectos — Google Places API.

Busca restaurantes por zona/rubro en Montevideo, filtra los que NO tienen web
(o tienen una web sospechosamente vieja/rota) y escribe un JSON por prospecto
en data/prospects/ siguiendo el contrato ClientData.

Uso:
    export GOOGLE_PLACES_API_KEY="tu_clave"
    python scrape.py --query "hamburguesería Pocitos Montevideo" --vertical hamburgueseria

La clave se saca en console.cloud.google.com → Places API (New).
Con el crédito gratis mensual alcanza para miles de negocios.
"""

import argparse
import json
import os
import re
import time
import unicodedata
from pathlib import Path

import requests

PLACES_SEARCH = "https://places.googleapis.com/v1/places:searchText"
OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "prospects"

# Campos que pedimos. Menos campos = más barato. websiteUri es el que decide todo.
FIELD_MASK = ",".join([
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.nationalPhoneNumber",
    "places.internationalPhoneNumber",
    "places.websiteUri",
    "places.rating",
    "places.userRatingCount",
    "places.googleMapsUri",
])


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:60] or "sin-nombre"


def is_weak_site(url: str | None) -> bool:
    """
    Un prospecto es caliente si NO tiene web, o si su 'web' es en realidad
    una red social o un linktree — eso también es una oportunidad.
    """
    if not url:
        return True
    weak_hosts = ("instagram.com", "facebook.com", "linktr.ee",
                  "linktree", "wa.me", "menu.com.uy", "pedidosya")
    return any(h in url.lower() for h in weak_hosts)


def search_places(query: str, api_key: str) -> list[dict]:
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": FIELD_MASK,
    }
    body = {"textQuery": query, "languageCode": "es", "regionCode": "UY"}
    results, page_token = [], None
    while True:
        if page_token:
            body["pageToken"] = page_token
        resp = requests.post(PLACES_SEARCH, headers=headers, json=body, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        results.extend(data.get("places", []))
        page_token = data.get("nextPageToken")
        if not page_token:
            break
        time.sleep(2)  # el token tarda un momento en activarse
    return results


def to_client_data(place: dict, vertical: str) -> dict:
    name = place.get("displayName", {}).get("text", "Sin nombre")
    website = place.get("websiteUri")
    phone = place.get("internationalPhoneNumber") or place.get("nationalPhoneNumber")
    wa = re.sub(r"[^0-9]", "", phone) if phone else None
    return {
        "slug": slugify(name),
        "name": name,
        "vertical": vertical,
        "phone": phone,
        "whatsapp": wa,
        "address": place.get("formattedAddress"),
        "mapsUrl": place.get("googleMapsUri"),
        "_meta": {
            "hasWebsite": not is_weak_site(website),
            "currentSiteUrl": website,
            "rating": place.get("rating"),
            "reviewCount": place.get("userRatingCount"),
            "scrapedAt": time.strftime("%Y-%m-%d"),
            "status": "nuevo",
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--query", required=True, help="ej. 'parrilla Cordón Montevideo'")
    ap.add_argument("--vertical", required=True,
                    choices=["hamburgueseria", "parrilla", "cafe", "generico"])
    ap.add_argument("--only-hot", action="store_true",
                    help="guardar solo los que NO tienen web real")
    args = ap.parse_args()

    api_key = os.environ.get("GOOGLE_PLACES_API_KEY")
    if not api_key:
        raise SystemExit("Falta GOOGLE_PLACES_API_KEY en el entorno.")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    places = search_places(args.query, api_key)
    print(f"Encontrados {len(places)} negocios para: {args.query}")

    hot = saved = 0
    for place in places:
        client = to_client_data(place, args.vertical)
        is_hot = not client["_meta"]["hasWebsite"]
        if is_hot:
            hot += 1
        if args.only_hot and not is_hot:
            continue
        path = OUT_DIR / f"{client['slug']}.json"
        path.write_text(json.dumps(client, ensure_ascii=False, indent=2))
        saved += 1

    print(f"Prospectos calientes (sin web real): {hot}")
    print(f"Archivos guardados en data/prospects/: {saved}")


if __name__ == "__main__":
    main()
