"""Registro (logs) del servidor y de cada herramienta.

Adaptado de helpers/logging.py de datagouv-mcp: se quitó el envío de eventos a
Matomo. Los registros van a stderr, que es lo que exige el modo stdio de MCP.
"""

import functools
import inspect
import logging
import os
import sys
from typing import Any, cast

NOMBRE_PRINCIPAL = "mcp.main"
NOMBRE_HERRAMIENTAS = "mcp.tools"

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    stream=sys.stderr,
    force=True,
)

CONFIG_UVICORN = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {"format": "%(asctime)s | %(levelname)s | %(name)s | %(message)s"}
    },
    "handlers": {
        "default": {
            "class": "logging.StreamHandler",
            "formatter": "default",
            "stream": "ext://sys.stderr",
        }
    },
    "root": {"level": "INFO", "handlers": ["default"]},
}

logger = logging.getLogger(NOMBRE_HERRAMIENTAS)


def registrar_herramienta(func):
    """Deja en el registro qué herramienta se llamó y con qué argumentos."""

    @functools.wraps(func)
    async def envoltura(*args, **kwargs):
        logger.info("Herramienta: %s | argumentos=%s", func.__name__, kwargs)
        return await func(*args, **kwargs)

    cast(Any, envoltura).__signature__ = inspect.signature(func)
    return envoltura
