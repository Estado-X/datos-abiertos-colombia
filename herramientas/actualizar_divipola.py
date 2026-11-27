"""Actualiza la lista de departamentos y municipios del selector «¿Qué hay de mi municipio?».

Fuente: DIVIPOLA - Códigos municipios, del DANE, publicada en datos.gov.co
(conjunto gdxc-w37w). Solo usa la biblioteca estándar de Python.

Uso, desde la raíz del repo:

    python herramientas/actualizar_divipola.py

Escribe docs/assets/divipola.json. Revisa el cambio con git diff antes de subirlo.
"""

import json
import sys
import unicodedata
import urllib.request
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

CONJUNTO = "gdxc-w37w"
SITIO = "https://www.datos.gov.co"
DESTINO = Path(__file__).resolve().parent.parent / "docs" / "assets" / "divipola.json"
BOGOTA = timezone(timedelta(hours=-5))
# Palabras que van en minúscula dentro de un nombre propio («San José de Cúcuta»)
MENORES = {"de", "del", "la", "las", "los", "el", "y", "e", "en"}


def pedir(url: str):
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "datos-abiertos-colombia (Estado X)",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def nombre_propio(texto: str) -> str:
    """«SAN JOSÉ DE CÚCUTA» -> «San José de Cúcuta»; «BOGOTÁ, D.C.» -> «Bogotá, D.C.»"""
    palabras = " ".join(texto.split()).lower().split(" ")
    salida = []
    for i, p in enumerate(palabras):
        if p in ("d.c.", "d.c"):
            salida.append("D.C.")
        elif i > 0 and p in MENORES:
            salida.append(p)
        else:
            # También después de guion o paréntesis: «Santafé de Antioquia», «Tolú Viejo (San José de Tolú)»
            partes = p.split("-")
            salida.append("-".join(x[:1].upper() + x[1:] if x else x for x in partes))
    nombre = " ".join(salida)
    # Mayúscula después de un paréntesis
    return "".join(
        c.upper() if i > 0 and nombre[i - 1] == "(" else c for i, c in enumerate(nombre)
    )


def orden(texto: str) -> str:
    """Clave para ordenar sin que las tildes manden «Córdoba» al final."""
    return "".join(
        c
        for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    ).lower()


def main() -> int:
    meta = pedir(f"{SITIO}/api/views/{CONJUNTO}.json")
    filas = pedir(f"{SITIO}/resource/{CONJUNTO}.json?$limit=5000&$order=cod_mpio")
    if len(filas) < 1000:
        print(f"Llegaron solo {len(filas)} filas: no se escribe nada.", file=sys.stderr)
        return 1
    deptos: dict[str, dict] = {}
    for f in filas:
        cd, cm = (
            str(f.get("cod_dpto", "")).zfill(2),
            str(f.get("cod_mpio", "")).zfill(5),
        )
        if not (cd.isdigit() and cm.isdigit() and cm.startswith(cd)):
            print(f"Fila rara, se omite: {f}", file=sys.stderr)
            continue
        d = deptos.setdefault(
            cd, {"codigo": cd, "nombre": nombre_propio(f["dpto"]), "municipios": []}
        )
        d["municipios"].append([cm, nombre_propio(f["nom_mpio"])])
    lista = sorted(deptos.values(), key=lambda d: orden(d["nombre"]))
    for d in lista:
        d["municipios"].sort(key=lambda m: orden(m[1]))
    datos_al = (
        datetime.fromtimestamp(meta.get("rowsUpdatedAt", 0), UTC)
        .astimezone(BOGOTA)
        .date()
        .isoformat()
    )
    salida = {
        "fuente": "DIVIPOLA - Códigos municipios (DANE), datos.gov.co",
        "conjunto": CONJUNTO,
        "enlace": f"{SITIO}/d/{CONJUNTO}",
        "datos_al": datos_al,
        "consultado": datetime.now(BOGOTA).date().isoformat(),
        "total_municipios": sum(len(d["municipios"]) for d in lista),
        "departamentos": lista,
    }
    DESTINO.write_text(
        json.dumps(salida, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(
        f"Listo: {len(lista)} departamentos y {salida['total_municipios']} municipios (datos al {datos_al})."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
