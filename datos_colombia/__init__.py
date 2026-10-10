"""Conector MCP para los datos abiertos de Colombia (datos.gov.co).

Adaptado por Estado X (2026) a partir de datagouv-mcp (DINUM, licencia MIT).
"""

try:
    from importlib.metadata import version

    __version__ = version("datos-abiertos-colombia")
except Exception:  # noqa: BLE001  (paquete sin instalar)
    __version__ = "0.1.0"
