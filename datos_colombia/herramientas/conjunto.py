"""Herramienta para ver la ficha de un conjunto de datos: entidad, fechas, licencia y columnas.

Reemplaza a get_dataset_info, list_dataset_resources y get_resource_info de
datagouv-mcp: en datos.gov.co cada conjunto es una sola tabla (Estado X, 2026).
"""

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError

from datos_colombia import cliente, config
from datos_colombia.cliente import ErrorDatos, fecha, numero
from datos_colombia.herramientas._comun import SOLO_LECTURA, recortar
from datos_colombia.registro import registrar_herramienta

TIPOS = {
    "text": "texto",
    "number": "número",
    "calendar_date": "fecha",
    "floating_timestamp": "fecha",
    "checkbox": "sí/no",
    "url": "enlace",
    "point": "punto (mapa)",
    "location": "ubicación",
    "multipolygon": "polígonos (mapa)",
    "polygon": "polígono (mapa)",
    "line": "línea (mapa)",
    "multiline": "líneas (mapa)",
    "multipoint": "puntos (mapa)",
    "money": "dinero",
    "percent": "porcentaje",
}


def registrar(mcp: FastMCP) -> None:
    @mcp.tool(title="Ver un conjunto de datos", annotations=SOLO_LECTURA)
    @registrar_herramienta
    async def ver_conjunto(conjunto_id: str) -> str:
        """
        Muestra la ficha de un conjunto de datos de datos.gov.co: qué contiene, quién lo
        publica, cada cuánto se actualiza, la licencia, cuántas filas tiene y sus columnas
        con el nombre técnico que hay que usar en consultar_datos y contar_por.

        conjunto_id tiene la forma abcd-1234 (también sirve el enlace completo).
        """
        try:
            m = await cliente.metadatos(conjunto_id)
        except ErrorDatos as e:
            raise ToolError(str(e)) from e
        cid = m.get("id") or cliente.validar_id(conjunto_id)
        custom = (m.get("metadata") or {}).get("custom_fields") or {}
        info_datos = custom.get("Información de Datos") or {}
        info_ent = custom.get("Información de la Entidad") or {}
        licencia = (
            (m.get("license") or {}).get("name") or m.get("licenseId") or "sin dato"
        )

        partes = [f"# {m.get('name', 'Sin título')}", f"ID: {cid}"]
        if m.get("assetType") and m.get("assetType") != "dataset":
            partes.append(
                f"Ojo: es un recurso de tipo «{m.get('assetType')}», no una tabla; puede que no se pueda consultar por filas."
            )
        partes.append(
            f"Entidad: {m.get('attribution') or info_ent.get('Nombre de la Entidad') or 'sin dato'}"
        )
        if info_ent.get("Orden") or info_ent.get("Sector"):
            partes.append(
                f"Orden y sector: {info_ent.get('Orden', '—')} · {info_ent.get('Sector', '—')}"
            )
        partes.append(f"Categoría: {m.get('category') or 'sin dato'}")
        partes.append(f"Datos actualizados: {fecha(m.get('rowsUpdatedAt'))}")
        if info_datos.get("Frecuencia de Actualización"):
            partes.append(
                f"Frecuencia declarada: {info_datos['Frecuencia de Actualización']}"
            )
        if info_datos.get("Cobertura Geográfica"):
            partes.append(f"Cobertura: {info_datos['Cobertura Geográfica']}")
        partes.append(f"Licencia: {licencia}")
        partes.append(
            f"Vistas: {numero(m.get('viewCount', 0))} · descargas: {numero(m.get('downloadCount', 0))}"
        )
        filas = await cliente.contar_filas(cid)
        if filas is not None:
            partes.append(f"Filas: {numero(filas)}")
        if m.get("description"):
            partes += ["", "Descripción: " + recortar(m["description"], 900)]

        columnas = [
            c
            for c in m.get("columns", [])
            if not str(c.get("fieldName", "")).startswith(":")
        ]
        if columnas:
            partes += [
                "",
                f"Columnas ({len(columnas)}) · nombre técnico → tipo · nombre visible:",
            ]
            for c in columnas:
                tipo = TIPOS.get(c.get("dataTypeName", ""), c.get("dataTypeName", ""))
                linea = f"- {c.get('fieldName')} → {tipo} · {c.get('name')}"
                if c.get("description"):
                    linea += f" ({recortar(c['description'], 120)})"
                partes.append(linea)

        partes += [
            "",
            f"Página: {config.SITIO}/d/{cid}",
            f"API (SoQL): {config.SITIO}/resource/{cid}.json",
            f"Descarga CSV: {config.SITIO}/api/views/{cid}/rows.csv?accessType=DOWNLOAD",
            "",
            "Siguiente paso: consultar_datos para ver filas, o contar_por para resumir por una columna.",
        ]
        return "\n".join(partes)
