"""Piezas compartidas por las herramientas."""

from mcp.types import ToolAnnotations

# Todas las herramientas solo leen datos públicos de datos.gov.co: no cambian nada.
SOLO_LECTURA = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=True,
)


def recortar(texto: str | None, n: int = 220) -> str:
    t = " ".join(str(texto or "").split())
    return t if len(t) <= n else t[: n - 1].rstrip() + "…"


def tabla(filas: list[dict], columnas: list[str] | None = None, ancho: int = 60) -> str:
    """Filas en formato de tabla Markdown, con celdas recortadas."""
    if not filas:
        return "(sin filas)"
    cols = columnas or list(dict.fromkeys(k for f in filas for k in f))
    cab = "| " + " | ".join(cols) + " |"
    sep = "|" + "|".join("---" for _ in cols) + "|"
    cuerpo = []
    for f in filas:
        celdas = []
        for c in cols:
            v = f.get(c, "")
            if isinstance(v, dict):
                v = v.get("url") or v.get("human_address") or v
            s = recortar(str(v), ancho).replace("|", "/")
            celdas.append(s)
        cuerpo.append("| " + " | ".join(celdas) + " |")
    return "\n".join([cab, sep, *cuerpo])
