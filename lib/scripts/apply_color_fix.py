#!/usr/bin/env python3
"""
Descarga mq_js_bundle.js de miniquad y le aplica un parche para forzar
colorSpace: "srgb" al crear el contexto WebGL/WebGL2.

Esto evita que macOS (pantallas Retina / P3) expanda los valores sRGB del
framebuffer a un gamut más amplio y los colores se vean apagados o desaturados
en la versión web respecto a la nativa.

Uso:
    python3 lib/scripts/apply_color_fix.py

El script es idempotente: si el bundle ya tiene el parche, no lo vuelve a aplicar.
"""

from pathlib import Path
import sys
import urllib.request

BUNDLE_URL = "https://not-fl3.github.io/miniquad-samples/mq_js_bundle.js"
WEB_DIR = Path(__file__).resolve().parent.parent / "web"
BUNDLE_PATH = WEB_DIR / "mq_js_bundle.js"

# Atributos que se inyectan en ambos contextos.
ATTRS = '{alpha:false,premultipliedAlpha:false,colorSpace:"srgb"}'

OLD_WEBGL1 = 'gl=canvas.getContext("webgl");'
NEW_WEBGL1 = f'gl=canvas.getContext("webgl",{ATTRS});'

OLD_WEBGL2 = 'gl=canvas.getContext("webgl2");'
NEW_WEBGL2 = f'gl=canvas.getContext("webgl2",{ATTRS});'


def download() -> str:
    with urllib.request.urlopen(BUNDLE_URL, timeout=30) as resp:
        return resp.read().decode("utf-8")


def is_patched(text: str) -> bool:
    return f'colorSpace:"srgb"' in text or 'colorSpace: "srgb"' in text


def patch(text: str) -> str:
    if is_patched(text):
        return text

    original = text
    text = text.replace(OLD_WEBGL1, NEW_WEBGL1)
    text = text.replace(OLD_WEBGL2, NEW_WEBGL2)

    if text == original:
        raise RuntimeError("No se encontró el patrón de getContext para parchear.")
    return text


def main() -> None:
    WEB_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Descargando {BUNDLE_URL} ...")
    text = download()

    if is_patched(text):
        print("El bundle ya contiene el parche colorSpace:srgb. Nada que hacer.")
        return

    patched = patch(text)
    BUNDLE_PATH.write_text(patched, encoding="utf-8")
    print(f"Parche aplicado y guardado en {BUNDLE_PATH}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
