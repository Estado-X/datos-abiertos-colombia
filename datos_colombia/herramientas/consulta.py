"""Herramientas para leer y resumir filas de un conjunto de datos con SoQL.

Reemplazan a query_resource_data (Tabular API de data.gouv.fr) de datagouv-mcp
(Estado X, 2026). Solo leen: las consultas SoQL de Socrata no pueden cambiar datos.
"""

import re

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError

from datos_colombia import cliente
from datos_colombia.cliente import ErrorDatos, numero
from datos_colombia.herramientas._comun import SOLO_LECTURA, tabla
from datos_colombia.registro import registrar_herramienta

PATRON_COLUMNA = re.compile(r"^[a-z_][a-z0-9_]*$")


def _validar_columna(nombre: str) -> str:
    n = (nombre or "").strip()
    if not PATRON_COLUMNA.match(n):
        raise ErrorDatos(
            f"«{nombre}» no es un nombre técnico de columna. Usa ver_conjunto para ver los nombres "
            "(en minúsculas, sin espacios, como valor_del_contrato)."
        )
    return n


def registrar(mcp: FastMCP) -> None:
    @mcp.tool(title="Consultar datos", annotations=SOLO_LECTURA)
    @registrar_herramienta
    async def consultar_datos(
        conjunto_id: str,
        columnas: str | None = None,
        filtro: str | None = None,
        texto: str | None = None,
        orden: str | None = None,
        limite: int = 20,
        desde: int = 0,
    ) -> str:
        """
        Lee filas de un conjunto de datos de datos.gov.co sin descargarlo, con el lenguaje
        de consultas SoQL de Socrata. Revisa antes los nombres técnicos con ver_conjunto.

        - columnas: lista separada por comas ($select). Ej.: "departamento, valor_del_contrato".
        - filtro: condición ($where). Ej.: "departamento = 'Antioquia' AND valor_del_contrato > 100000000".
          Los textos van entre comillas simples; las fechas como '2026-01-01'.
        - texto: búsqueda de texto libre en todas las columnas ($q).
        - orden: ($order). Ej.: "valor_del_contrato DESC".
        - limite: de 1 a 200 filas. desde: cuántas filas saltar (para paginar).

        Para totales y conteos por grupo usa contar_por, que no trae filas sueltas.
        """
        limite = max(1, min(int(limite), 200))
        soql = {
            "$select": columnas,
            "$where": filtro,
            "$q": texto,
            "$order": orden,
            "$limit": limite,
            "$offset": max(0, int(desde)),
        }
        try:
            filas = await cliente.consultar(conjunto_id, soql)
            url = cliente.url_consulta(conjunto_id, soql)
        except ErrorDatos as e:
            raise ToolError(str(e)) from e
        total = await cliente.contar_filas(conjunto_id, filtro) if not texto else None

        partes = []
        if total is not None:
            partes.append(f"Filas que cumplen la condición: {numero(total)}")
        partes.append(
            f"Filas traídas: {len(filas)} (desde la {numero(int(desde) + 1)})"
            if filas
            else "No hay filas con esa condición."
        )
        if filas:
            partes += ["", tabla(filas)]
            if len(filas) == limite:
                partes += ["", f"Puede haber más: usa desde={int(desde) + limite}."]
        partes += ["", f"Consulta reproducible: {url}"]
        return "\n".join(partes)

    @mcp.tool(title="Contar por columna", annotations=SOLO_LECTURA)
    @registrar_herramienta
    async def contar_por(
        conjunto_id: str,
        columna: str,
        filtro: str | None = None,
        sumar: str | None = None,
        limite: int = 20,
    ) -> str:
        """
        Resume un conjunto de datos de datos.gov.co por los valores de una columna: cuántas
        filas hay de cada valor y, si se pide, la suma de una columna numérica. Lo calcula
        el servidor de datos.gov.co, así que sirve aunque la tabla tenga millones de filas.

        Ejemplos: columna="departamento"; columna="modalidad_de_contratacion",
        sumar="valor_del_contrato", filtro="fecha_de_firma >= '2026-01-01'".
        Ordena de mayor a menor. limite: de 1 a 100 grupos.
        """
        try:
            col = _validar_columna(columna)
            sel = f"{col}, count(*) as filas"
            orden = "filas DESC"
            if sumar:
                s = _validar_columna(sumar)
                sel += f", sum({s}) as suma"
                orden = "suma DESC"
            soql = {
                "$select": sel,
                "$where": filtro,
                "$group": col,
                "$order": orden,
                "$limit": max(1, min(int(limite), 100)),
            }
            grupos = await cliente.consultar(conjunto_id, soql)
            url = cliente.url_consulta(conjunto_id, soql)
        except ErrorDatos as e:
            raise ToolError(str(e)) from e
        if not grupos:
            return "No hay filas con esa condición."
        for g in grupos:
            g["filas"] = numero(g.get("filas", 0))
            if "suma" in g:
                g["suma"] = numero(g.get("suma", 0))
            if g.get(col) in (None, ""):
                g[col] = "(vacío)"
        columnas = [col, "filas"] + (["suma"] if sumar else [])
        titulo = (
            f"Filas por {col}"
            + (f" y suma de {sumar}" if sumar else "")
            + (f", con {filtro}" if filtro else "")
        )
        return "\n".join(
            [titulo, "", tabla(grupos, columnas), "", f"Consulta reproducible: {url}"]
        )
