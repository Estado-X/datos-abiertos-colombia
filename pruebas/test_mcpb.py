"""Pruebas del paquete para Claude Desktop (docs/descargas/datos-abiertos-colombia.mcpb).

Comprueban que el archivo publicado está al día con el código: si cambias el conector,
vuelve a armarlo con `python herramientas/armar_mcpb.py`.
"""

import importlib.util
import json
import tomllib
import zipfile
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from datos_colombia.herramientas import registrar_herramientas

RAIZ = Path(__file__).resolve().parent.parent
PAQUETE = RAIZ / "docs" / "descargas" / "datos-abiertos-colombia.mcpb"
_spec = importlib.util.spec_from_file_location(
    "armar_mcpb", RAIZ / "herramientas" / "armar_mcpb.py"
)
armar = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(armar)


def test_el_paquete_publicado_coincide_con_el_codigo():
    with zipfile.ZipFile(PAQUETE) as z:
        dentro = {i.filename: z.read(i) for i in z.infolist()}
    esperado = {nombre: armar.contenido(ruta) for nombre, ruta in armar.archivos()}
    assert sorted(dentro) == sorted(esperado), (
        "Faltan o sobran archivos: vuelve a correr herramientas/armar_mcpb.py"
    )
    distintos = [n for n in esperado if dentro[n] != esperado[n]]
    assert not distintos, (
        f"Paquete viejo en {distintos}: vuelve a correr herramientas/armar_mcpb.py"
    )


def test_el_paquete_no_trae_dependencias_ni_secretos():
    with zipfile.ZipFile(PAQUETE) as z:
        nombres = z.namelist()
    assert not [
        n
        for n in nombres
        if n.startswith(("server/lib", "server/venv", ".venv", "lib/"))
    ]
    assert not [n for n in nombres if n.endswith((".env", ".pem", ".key")) or "/." in n]


def test_manifiesto_uv_y_versiones():
    m = json.loads((RAIZ / "mcpb" / "manifest.json").read_text(encoding="utf-8"))
    proyecto = tomllib.loads((RAIZ / "pyproject.toml").read_text(encoding="utf-8"))[
        "project"
    ]
    assert m["manifest_version"] == "0.4"
    assert m["server"]["type"] == "uv"
    assert m["version"] == proyecto["version"]
    assert m["name"] == proyecto["name"]
    assert (RAIZ / m["server"]["entry_point"]).is_file()
    args = m["server"]["mcp_config"]["args"]
    assert args[-1] in proyecto["scripts"]
    assert "--no-dev" in args and "${__dirname}" in args
    for campo in ("description", "author", "license"):
        assert m[campo]


async def test_las_herramientas_del_manifiesto_son_las_del_servidor():
    m = json.loads((RAIZ / "mcpb" / "manifest.json").read_text(encoding="utf-8"))
    app = FastMCP()
    registrar_herramientas(app)
    reales = {t.name for t in await app.list_tools()}
    assert {t["name"] for t in m["tools"]} == reales
