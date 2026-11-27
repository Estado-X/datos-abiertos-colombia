"""Arma el archivo para instalar el conector en Claude Desktop sin terminal.

Escribe docs/descargas/datos-abiertos-colombia.mcpb: un .zip con mcpb/manifest.json
(servidor de tipo «uv»), pyproject.toml, uv.lock, LICENSE y el código de datos_colombia/.
No incluye dependencias: Claude Desktop instala Python y las versiones fijas de uv.lock
por su cuenta. Solo usa la biblioteca estándar de Python.

Uso, desde la raíz del repo:

    python herramientas/armar_mcpb.py

El archivo sale igual byte a byte si el código no cambió (fechas fijas dentro del zip),
así que git solo lo marca como cambiado cuando de verdad cambió algo.
"""

import json
import sys
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "docs" / "descargas" / "datos-abiertos-colombia.mcpb"
FECHA_FIJA = (2026, 1, 1, 0, 0, 0)


def archivos() -> list[tuple[str, Path]]:
    """(ruta dentro del paquete, archivo en el repo), en orden estable."""
    lista = [
        ("manifest.json", RAIZ / "mcpb" / "manifest.json"),
        ("pyproject.toml", RAIZ / "pyproject.toml"),
        ("uv.lock", RAIZ / "uv.lock"),
        ("LICENSE", RAIZ / "LICENSE"),
        ("README.md", RAIZ / "mcpb" / "LEEME_PAQUETE.md"),
    ]
    for f in sorted((RAIZ / "datos_colombia").rglob("*.py")):
        lista.append((f.relative_to(RAIZ).as_posix(), f))
    return lista


def contenido(ruta: Path) -> bytes:
    # Siempre con saltos de línea LF, aunque el repo esté en Windows
    return ruta.read_bytes().replace(b"\r\n", b"\n")


def revisar_manifiesto() -> None:
    m = json.loads((RAIZ / "mcpb" / "manifest.json").read_text(encoding="utf-8"))
    version_py = next(
        line.split("=", 1)[1].strip().strip('"')
        for line in (RAIZ / "pyproject.toml").read_text(encoding="utf-8").splitlines()
        if line.startswith("version")
    )
    if m["version"] != version_py:
        sys.exit(
            f"La versión del manifiesto ({m['version']}) no es la de pyproject.toml ({version_py})."
        )
    if not (RAIZ / m["server"]["entry_point"]).is_file():
        sys.exit(f"No existe el punto de entrada {m['server']['entry_point']}.")


def main() -> int:
    revisar_manifiesto()
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(
        DESTINO, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
    ) as z:
        for nombre, ruta in archivos():
            info = zipfile.ZipInfo(nombre, date_time=FECHA_FIJA)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, contenido(ruta))
    print(
        f"Listo: {DESTINO.relative_to(RAIZ).as_posix()} ({DESTINO.stat().st_size / 1024:.0f} KB, {len(archivos())} archivos)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
