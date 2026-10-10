"""Herramientas para encontrar conjuntos de datos, entidades y categorías.

Reemplazan a search_datasets y search_organizations de datagouv-mcp (Estado X, 2026).
"""

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError

from datos_colombia import cliente
from datos_colombia.cliente import ErrorDatos, fecha, numero, sin_tildes
from datos_colombia.herramientas._comun import SOLO_LECTURA, recortar
from datos_colombia.registro import registrar_herramienta

# Palabras que la gente agrega y que casi nunca están en los metadatos.
PALABRAS_VACIAS = {
    "datos",
    "dato",
    "base",
    "archivo",
    "archivos",
    "tabla",
    "csv",
    "excel",
    "xlsx",
    "json",
    "abiertos",
}


def limpiar_consulta(consulta: str) -> str:
    palabras = [
        p for p in (consulta or "").split() if sin_tildes(p) not in PALABRAS_VACIAS
    ]
    return " ".join(palabras)


def registrar(mcp: FastMCP) -> None:
    @mcp.tool(title="Buscar conjuntos de datos", annotations=SOLO_LECTURA)
    @registrar_herramienta
    async def buscar_conjuntos(
        consulta: str,
        pagina: int = 1,
        por_pagina: int = 10,
        categoria: str | None = None,
        entidad: str | None = None,
        orden: str = "relevancia",
    ) -> str:
        """
        Busca conjuntos de datos en datos.gov.co, el portal de datos abiertos de Colombia.

        Es el primer paso. Usa palabras cortas y concretas (ej.: "contratos secop",
        "dengue", "matrícula colegios"). Filtros opcionales:
        - categoria: nombre exacto de una categoría (ver_categorias).
        - entidad: nombre exacto de la entidad (buscar_entidades).
        - orden: "relevancia" (por defecto), "vistas" o "recientes".
        por_pagina va de 1 a 50.

        Flujo típico: buscar_conjuntos → ver_conjunto → consultar_datos o contar_por.
        """
        por_pagina = max(1, min(int(por_pagina), 50))
        pagina = max(1, int(pagina))
        try:
            limpia = limpiar_consulta(consulta) or consulta
            r = await cliente.buscar_catalogo(
                limpia, pagina, por_pagina, categoria, entidad, orden
            )
            resultados = r.get("results", [])
            if not resultados and limpia != consulta:
                r = await cliente.buscar_catalogo(
                    consulta, pagina, por_pagina, categoria, entidad, orden
                )
                resultados = r.get("results", [])
        except ErrorDatos as e:
            raise ToolError(str(e)) from e

        if not resultados:
            filtros = ", ".join(
                x
                for x in [
                    categoria and f"categoría «{categoria}»",
                    entidad and f"entidad «{entidad}»",
                ]
                if x
            )
            return (
                f"No hay conjuntos de datos para «{consulta}»"
                + (f" con {filtros}" if filtros else "")
                + ". Prueba con menos palabras o sin filtros."
            )

        total = r.get("resultSetSize", len(resultados))
        partes = [
            f"{numero(total)} conjuntos de datos para «{consulta}» · página {pagina}",
            "",
        ]
        for i, item in enumerate(
            resultados, 1 + (max(1, pagina) - 1) * max(1, min(por_pagina, 50))
        ):
            res = item.get("resource", {})
            cla = item.get("classification", {})
            vistas = (res.get("page_views") or {}).get("page_views_total")
            partes.append(f"{i}. {res.get('name', 'Sin título')}")
            partes.append(f"   ID: {res.get('id')}")
            if res.get("attribution"):
                partes.append(f"   Entidad: {res['attribution']}")
            if cla.get("domain_category"):
                partes.append(f"   Categoría: {cla['domain_category']}")
            partes.append(
                f"   Datos actualizados: {fecha(res.get('data_updated_at') or res.get('updatedAt'))}"
                + (f" · {numero(vistas)} vistas" if vistas is not None else "")
            )
            if res.get("description"):
                partes.append(f"   Descripción: {recortar(res['description'])}")
            partes.append(
                f"   Enlace: {item.get('permalink') or cliente.config.SITIO + '/d/' + str(res.get('id'))}"
            )
            partes.append("")
        if total > pagina * por_pagina:
            partes.append(f"Hay más resultados: usa pagina={pagina + 1}.")
        return "\n".join(partes)

    @mcp.tool(title="Buscar entidades", annotations=SOLO_LECTURA)
    @registrar_herramienta
    async def buscar_entidades(texto: str) -> str:
        """
        Encuentra el nombre exacto con el que una entidad publica en datos.gov.co
        (ministerio, alcaldía, gobernación, superintendencia…) y cuántos conjuntos tiene.

        Úsalo antes de filtrar buscar_conjuntos por entidad.
        Ejemplo: texto="Medellín" o "Superintendencia de Salud".
        """
        try:
            datos = await cliente.facetas(texto)
        except ErrorDatos as e:
            raise ToolError(str(e)) from e
        nombres = next(
            (
                f.get("values", [])
                for f in datos
                if f.get("facet", "").endswith("Nombre-de-la-Entidad")
            ),
            [],
        )
        clave = sin_tildes(texto)
        directas = [
            v for v in nombres if clave and clave in sin_tildes(v.get("value", ""))
        ]
        otras = [v for v in nombres if v not in directas]
        if not nombres:
            return f"No encontré entidades relacionadas con «{texto}»."
        partes = [
            f"Entidades relacionadas con «{texto}» (nombre exacto · conjuntos que coinciden):",
            "",
        ]
        for v in directas[:20]:
            partes.append(f"- {v['value']} · {numero(v['count'])}")
        if otras:
            if directas:
                partes.append("")
                partes.append("También publican datos que mencionan esa palabra:")
            for v in otras[: 10 if directas else 20]:
                partes.append(f"- {v['value']} · {numero(v['count'])}")
        partes.append("")
        partes.append(
            "Para filtrar, copia el nombre exacto en buscar_conjuntos(entidad=...)."
        )
        return "\n".join(partes)

    @mcp.tool(title="Ver categorías", annotations=SOLO_LECTURA)
    @registrar_herramienta
    async def ver_categorias() -> str:
        """
        Lista las categorías temáticas de datos.gov.co (Educación, Salud y Protección
        Social, Transporte…) con su número de recursos. Sirve para filtrar buscar_conjuntos.
        """
        try:
            datos = await cliente.facetas()
        except ErrorDatos as e:
            raise ToolError(str(e)) from e
        cats = next(
            (f.get("values", []) for f in datos if f.get("facet") == "categories"), []
        )
        if not cats:
            return "datos.gov.co no devolvió categorías en este momento."
        lineas = ["Categorías de datos.gov.co (recursos publicados):", ""]
        lineas += [f"- {c['value']} · {numero(c['count'])}" for c in cats]
        return "\n".join(lineas)
