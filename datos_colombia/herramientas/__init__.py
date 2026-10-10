from mcp.server.fastmcp import FastMCP

from datos_colombia.herramientas import busqueda, conjunto, consulta


def registrar_herramientas(mcp: FastMCP) -> None:
    """Registra las seis herramientas del conector."""
    busqueda.registrar(mcp)
    conjunto.registrar(mcp)
    consulta.registrar(mcp)
