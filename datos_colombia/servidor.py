"""Servidor MCP de datos abiertos de Colombia.

Adaptado de main.py de datagouv-mcp (DINUM, MIT) por Estado X (2026):
- Modo stdio por defecto, para instalarlo en Claude Desktop o Claude Code sin servidor.
- Modo HTTP (--http) con la misma protección contra DNS rebinding y el mismo /health.
- Sin Matomo ni Sentry.
"""

import argparse
import json
import logging
import os
import sys
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import TextContent

from datos_colombia import __version__
from datos_colombia.herramientas import registrar_herramientas
from datos_colombia.registro import CONFIG_UVICORN, NOMBRE_PRINCIPAL

logger = logging.getLogger(NOMBRE_PRINCIPAL)
INICIO = datetime.now(UTC)

INSTRUCCIONES = (
    "Conector a datos.gov.co, el portal de datos abiertos del Estado colombiano. "
    "Flujo: buscar_conjuntos (o buscar_entidades / ver_categorias para filtrar) → ver_conjunto "
    "(nombres técnicos de las columnas) → consultar_datos para filas o contar_por para totales. "
    "Cita siempre la entidad, el ID del conjunto y la fecha de actualización. Los datos son de cada "
    "entidad publicadora; no están validados por este conector."
)


def _hosts_permitidos() -> tuple[list[str], list[str]]:
    hosts = ["localhost:*", "127.0.0.1:*"]
    origenes = ["http://localhost:*", "http://127.0.0.1:*"]
    extra = [
        h.strip() for h in os.getenv("MCP_HOSTS_PERMITIDOS", "").split(",") if h.strip()
    ]
    for h in extra:  # para quien lo aloje en su propio dominio
        hosts.append(h)
        origenes.append(f"https://{h}")
    return hosts, origenes


def crear_servidor() -> FastMCP:
    hosts, origenes = _hosts_permitidos()
    seguridad = TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=hosts,
        allowed_origins=origenes,
    )
    mcp = FastMCP(
        "Datos abiertos de Colombia",
        instructions=INSTRUCCIONES,
        transport_security=seguridad,
        stateless_http=True,
    )
    registrar_herramientas(mcp)
    return mcp


async def chequeo_de_salud(mcp: FastMCP) -> bool:
    """Llama una herramienta dentro del proceso para confirmar que datos.gov.co responde."""
    try:
        contenido, _ = await mcp.call_tool(
            "buscar_conjuntos", {"consulta": "salud", "por_pagina": 1}
        )
        return (
            bool(contenido)
            and isinstance(contenido[0], TextContent)
            and not contenido[0].text.startswith("Error")
        )
    except Exception as e:  # noqa: BLE001
        logger.error("Chequeo de salud fallido: %s", e)
        return False


def app_http(mcp: FastMCP):
    interna = mcp.streamable_http_app()

    async def app(scope, receive, send: Callable[[dict], Awaitable[None]]):
        if scope["type"] == "http" and scope.get("path") == "/health":
            ok = await chequeo_de_salud(mcp)
            cuerpo = json.dumps(
                {
                    "status": "ok",
                    "uptime_since": INICIO.isoformat(),
                    "version": __version__,
                }
                if ok
                else {"status": "mcp_unavailable"}
            ).encode("utf-8")
            await send(
                {
                    "type": "http.response.start",
                    "status": 200 if ok else 503,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(cuerpo)).encode()),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": cuerpo})
            return
        await interna(scope, receive, send)

    return app


def run() -> None:
    p = argparse.ArgumentParser(
        prog="datos-abiertos-colombia", description="Conector MCP a datos.gov.co"
    )
    p.add_argument(
        "--http", action="store_true", help="servir por HTTP en vez de stdio"
    )
    p.add_argument("--host", default=os.getenv("MCP_HOST", "127.0.0.1"))
    p.add_argument(
        "--puerto",
        type=int,
        default=None,
        help="puerto HTTP (por defecto MCP_PORT o 8000)",
    )
    args = p.parse_args()

    mcp = crear_servidor()
    if not args.http:
        mcp.run(transport="stdio")
        return

    import uvicorn

    try:
        puerto = args.puerto or int(os.getenv("MCP_PORT", "8000"))
    except ValueError:
        print(f"MCP_PORT no es un número: {os.getenv('MCP_PORT')}", file=sys.stderr)
        sys.exit(1)
    uvicorn.run(
        app_http(mcp),
        host=args.host,
        port=puerto,
        log_level="info",
        log_config=CONFIG_UVICORN,
    )


if __name__ == "__main__":
    run()
