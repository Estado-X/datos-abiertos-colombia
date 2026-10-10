"""Direcciones fijas y ajustes por variables de entorno.

El conector solo habla con dos direcciones públicas de la plataforma de datos
abiertos de Colombia (Socrata). No descarga direcciones que entreguen los
usuarios ni los conjuntos de datos.
"""

import os

from datos_colombia import __version__

DOMINIO = "www.datos.gov.co"
SITIO = f"https://{DOMINIO}"
CATALOGO = "https://api.us.socrata.com/api/catalog/v1"

USER_AGENT = f"datos-abiertos-colombia/{__version__} (+https://github.com/Estado-X/datos-abiertos-colombia)"


def token_de_aplicacion() -> str | None:
    """Token opcional de Socrata: sube el cupo de consultas. No es obligatorio."""
    valor = os.getenv("SOCRATA_APP_TOKEN", "").strip()
    return valor or None


def encabezados() -> dict[str, str]:
    h = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    token = token_de_aplicacion()
    if token:
        h["X-App-Token"] = token
    return h
