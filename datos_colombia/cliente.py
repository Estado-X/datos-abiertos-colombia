"""Cliente de la plataforma de datos abiertos de Colombia (Socrata).

Escrito por Estado X (2026) en reemplazo de los clientes de data.gouv.fr de
datagouv-mcp. Usa cuatro servicios públicos, sin clave:

- Catálogo:  https://api.us.socrata.com/api/catalog/v1?domains=www.datos.gov.co
- Facetas:   https://api.us.socrata.com/api/catalog/v1/domains/www.datos.gov.co/facets
- Metadatos: https://www.datos.gov.co/api/views/<id>.json
- Filas:     https://www.datos.gov.co/resource/<id>.json  (consultas SoQL)
"""

import logging
import re
import unicodedata
from datetime import UTC, datetime
from typing import Any

import niquests

from datos_colombia import config
from datos_colombia.registro import NOMBRE_PRINCIPAL

logger = logging.getLogger(NOMBRE_PRINCIPAL)

PATRON_ID = re.compile(r"^[a-z0-9]{4}-[a-z0-9]{4}$")
ORDENES = {"relevancia": None, "vistas": "page_views_total", "recientes": "updatedAt"}
TIEMPO = 25.0


class ErrorDatos(Exception):
    """Error con un mensaje claro para mostrar a quien usa el conector."""


def validar_id(conjunto_id: str) -> str:
    cid = (conjunto_id or "").strip().lower()
    # Acepta también un enlace completo de datos.gov.co
    m = re.search(r"(?<![a-z0-9-])([a-z0-9]{4}-[a-z0-9]{4})(?:[/?.#]|$)", cid)
    if m:
        cid = m.group(1)
    if not PATRON_ID.match(cid):
        raise ErrorDatos(
            f"«{conjunto_id}» no es un identificador de datos.gov.co. "
            "Tiene la forma abcd-1234 (búscalo con buscar_conjuntos)."
        )
    return cid


def sin_tildes(texto: str) -> str:
    return "".join(
        c
        for c in unicodedata.normalize("NFD", texto or "")
        if unicodedata.category(c) != "Mn"
    ).lower()


# ---------- Formato colombiano ----------


def numero(n: Any) -> str:
    """1234567.5 -> '1.234.567,5'"""
    try:
        x = float(n)
    except (TypeError, ValueError):
        return str(n)
    if x.is_integer():
        return f"{int(x):,}".replace(",", ".")
    entero, dec = f"{x:,.2f}".split(".")
    return entero.replace(",", ".") + "," + dec.rstrip("0")


def fecha(valor: Any) -> str:
    """ISO 8601 o segundos desde 1970 -> dd/mm/aaaa"""
    if valor in (None, ""):
        return "sin dato"
    try:
        if isinstance(valor, (int, float)):
            d = datetime.fromtimestamp(valor, tz=UTC)
        else:
            d = datetime.fromisoformat(str(valor))
        return d.strftime("%d/%m/%Y")
    except (ValueError, OverflowError, OSError):
        return str(valor)


# ---------- Peticiones ----------


async def _obtener(url: str, params: dict[str, Any] | None = None) -> Any:
    async with niquests.AsyncSession(headers=config.encabezados()) as sesion:
        logger.debug("GET %s %s", url, params)
        try:
            resp = await sesion.get(url, params=params, timeout=TIEMPO)
        except niquests.RequestException as exc:
            raise ErrorDatos(
                f"No se pudo conectar con datos.gov.co ({exc.__class__.__name__}). Intenta de nuevo."
            ) from exc
        if resp.status_code == 404:
            raise ErrorDatos("datos.gov.co no encontró ese conjunto de datos.")
        if resp.status_code == 400:
            mensaje = ""
            try:
                cuerpo = resp.json()
                mensaje = str(cuerpo.get("message") or cuerpo.get("error") or "")
            except Exception:  # noqa: BLE001
                mensaje = (resp.text or "")[:300]
            raise ErrorDatos(
                "datos.gov.co rechazó la consulta. Revisa los nombres de columna "
                "(usa ver_conjunto) y la sintaxis SoQL. Detalle: " + mensaje[:400]
            )
        if resp.status_code == 429:
            raise ErrorDatos(
                "datos.gov.co pidió esperar (demasiadas consultas). Intenta en un minuto o define SOCRATA_APP_TOKEN."
            )
        if resp.status_code >= 500:
            raise ErrorDatos(
                f"datos.gov.co respondió con un error temporal ({resp.status_code}). Intenta de nuevo."
            )
        resp.raise_for_status()
        return resp.json()


async def buscar_catalogo(
    consulta: str | None,
    pagina: int = 1,
    por_pagina: int = 10,
    categoria: str | None = None,
    entidad: str | None = None,
    orden: str = "relevancia",
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "domains": config.DOMINIO,
        "search_context": config.DOMINIO,
        "only": "dataset",
        "limit": max(1, min(int(por_pagina), 50)),
        "offset": (max(1, int(pagina)) - 1) * max(1, min(int(por_pagina), 50)),
    }
    if consulta:
        params["q"] = consulta
    if categoria:
        params["categories"] = categoria
    if entidad:
        params["attribution"] = entidad
    o = ORDENES.get((orden or "relevancia").lower())
    if o:
        params["order"] = o
    return await _obtener(config.CATALOGO, params)


async def facetas(consulta: str | None = None) -> list[dict[str, Any]]:
    params = {"q": consulta} if consulta else None
    return await _obtener(f"{config.CATALOGO}/domains/{config.DOMINIO}/facets", params)


async def metadatos(conjunto_id: str) -> dict[str, Any]:
    cid = validar_id(conjunto_id)
    return await _obtener(f"{config.SITIO}/api/views/{cid}.json")


async def consultar(conjunto_id: str, soql: dict[str, Any]) -> list[dict[str, Any]]:
    cid = validar_id(conjunto_id)
    params = {k: v for k, v in soql.items() if v not in (None, "")}
    return await _obtener(f"{config.SITIO}/resource/{cid}.json", params)


async def contar_filas(conjunto_id: str, filtro: str | None = None) -> int | None:
    try:
        filas = await consultar(
            conjunto_id, {"$select": "count(*) as total", "$where": filtro}
        )
        return int(filas[0]["total"]) if filas else 0
    except (ErrorDatos, KeyError, ValueError, IndexError):
        return None


def url_consulta(conjunto_id: str, soql: dict[str, Any]) -> str:
    """Dirección para repetir la consulta en el navegador o en otro programa."""
    from urllib.parse import urlencode

    params = {k: v for k, v in soql.items() if v not in (None, "")}
    base = f"{config.SITIO}/resource/{validar_id(conjunto_id)}.json"
    return base + ("?" + urlencode(params) if params else "")
