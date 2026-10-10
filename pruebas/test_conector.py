"""Pruebas del conector. Por defecto no usan internet: responden con datos reales
guardados en pruebas/datos/. Las pruebas en vivo se corren con: pytest -m en_vivo
"""

import json
from pathlib import Path

import pytest
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError

from datos_colombia import cliente
from datos_colombia.cliente import ErrorDatos, fecha, numero, validar_id
from datos_colombia.herramientas import registrar_herramientas
from datos_colombia.herramientas._comun import tabla
from datos_colombia.herramientas.busqueda import limpiar_consulta
from datos_colombia.herramientas.consulta import _validar_columna
from datos_colombia.servidor import crear_servidor

DATOS = Path(__file__).parent / "datos"
HERRAMIENTAS = {
    "buscar_conjuntos",
    "buscar_entidades",
    "ver_categorias",
    "ver_conjunto",
    "consultar_datos",
    "contar_por",
}


def cargar(nombre):
    return json.loads((DATOS / nombre).read_text(encoding="utf-8"))


@pytest.fixture
def mcp():
    app = FastMCP()
    registrar_herramientas(app)
    return app


async def llamar(mcp, nombre, args):
    contenido, _ = await mcp.call_tool(nombre, args)
    return contenido[0].text


# ---------- Piezas sueltas ----------


def test_formato_colombiano():
    assert numero(5625151) == "5.625.151"
    assert numero(1234.5) == "1.234,5"
    assert fecha("2026-10-10T17:19:55.000Z") == "10/10/2026"
    assert fecha(1599226050) == "04/09/2020"
    assert fecha(None) == "sin dato"


@pytest.mark.parametrize(
    "entrada, esperado",
    [
        ("jbjy-vk9h", "jbjy-vk9h"),
        ("  JBJY-VK9H ", "jbjy-vk9h"),
        (
            "https://www.datos.gov.co/Gastos-Gubernamentales/SECOP-II-Contratos-Electr-nicos/jbjy-vk9h/about_data",
            "jbjy-vk9h",
        ),
        ("https://www.datos.gov.co/resource/jbjy-vk9h.json", "jbjy-vk9h"),
    ],
)
def test_validar_id(entrada, esperado):
    assert validar_id(entrada) == esperado


@pytest.mark.parametrize("malo", ["", "abc", "../../etc", "jbjy_vk9h", "abcd-12345"])
def test_validar_id_rechaza(malo):
    with pytest.raises(ErrorDatos):
        validar_id(malo)


def test_validar_id_toma_el_ultimo_segmento():
    assert (
        validar_id("https://www.datos.gov.co/Salud/Agua-Para/abcd-1234") == "abcd-1234"
    )


def test_numero_sin_coma_colgando():
    assert numero(1234.999) == "1.235"
    assert numero(0.004) == "0"
    assert numero("nan") == "nan"


def test_fecha_en_hora_de_colombia():
    # 03:00 UTC del 11 de octubre son las 10:00 p. m. del 10 de octubre en Bogotá
    assert fecha("2026-10-11T03:00:00.000Z") == "10/10/2026"


def test_validar_id_devuelve_solo_el_id_limpio():
    # De un texto con basura alrededor solo queda el identificador: nunca pasa «/» ni «..» a la dirección.
    assert validar_id("jbjy-vk9h/../x") == "jbjy-vk9h"


def test_columnas_solo_nombres_tecnicos():
    assert _validar_columna("valor_del_contrato") == "valor_del_contrato"
    for malo in ["Valor del contrato", "x; drop", "a,b", "count(*)", ""]:
        with pytest.raises(ErrorDatos):
            _validar_columna(malo)


def test_limpiar_consulta():
    assert limpiar_consulta("datos abiertos de contratos csv") == "de contratos"
    assert limpiar_consulta("dengue") == "dengue"


def test_tabla_markdown_recorta_y_escapa():
    t = tabla([{"a": "x|y", "b": "z" * 100}], ancho=10)
    assert "x/y" in t and "…" in t and t.startswith("| a | b |")


# ---------- Servidor ----------


async def test_seis_herramientas_de_solo_lectura(mcp):
    herramientas = await mcp.list_tools()
    assert {h.name for h in herramientas} == HERRAMIENTAS
    for h in herramientas:
        assert h.annotations.readOnlyHint is True
        assert h.annotations.destructiveHint is False


def test_servidor_solo_acepta_localhost_por_defecto(monkeypatch):
    monkeypatch.delenv("MCP_HOSTS_PERMITIDOS", raising=False)
    s = crear_servidor()
    seg = s.settings.transport_security
    assert seg.enable_dns_rebinding_protection
    assert set(seg.allowed_hosts) == {"localhost:*", "127.0.0.1:*"}


# ---------- Herramientas con respuestas guardadas ----------


async def test_buscar_conjuntos(mcp, monkeypatch):
    llamadas = []

    async def falso(url, params=None):
        llamadas.append(params)
        return cargar("catalogo_secop.json")

    monkeypatch.setattr(cliente, "_obtener", falso)
    texto = await llamar(
        mcp,
        "buscar_conjuntos",
        {"consulta": "datos secop", "por_pagina": 2, "orden": "vistas"},
    )
    assert llamadas[0]["q"] == "secop" and llamadas[0]["order"] == "page_views_total"
    assert (
        llamadas[0]["domains"] == "www.datos.gov.co"
        and llamadas[0]["only"] == "dataset"
    )
    assert "152 conjuntos de datos" in texto
    assert "SECOP II - Contratos Electrónicos" in texto and "ID: jbjy-vk9h" in texto
    assert "Agencia Nacional de Contratación Pública" in texto
    assert "Hay más resultados" in texto


async def test_ver_conjunto(mcp, monkeypatch):
    async def falso(url, params=None):
        if "/api/views/" in url:
            return cargar("conjunto_jbjy-vk9h.json")
        return [{"total": "5625151"}]

    monkeypatch.setattr(cliente, "_obtener", falso)
    texto = await llamar(mcp, "ver_conjunto", {"conjunto_id": "jbjy-vk9h"})
    assert "# SECOP II - Contratos Electrónicos" in texto
    assert "Filas: 5.625.151" in texto
    assert "Frecuencia declarada: Diaria" in texto
    assert "- nombre_entidad → texto" in texto
    assert "rows.csv?accessType=DOWNLOAD" in texto


async def test_buscar_entidades_primero_las_que_coinciden(mcp, monkeypatch):
    async def falso(url, params=None):
        return cargar("facetas_medellin.json")

    monkeypatch.setattr(cliente, "_obtener", falso)
    texto = await llamar(mcp, "buscar_entidades", {"texto": "Medellín"})
    lineas = [x for x in texto.splitlines() if x.startswith("- ")]
    assert "Medellín" in lineas[0]


async def test_contar_por_arma_soql(mcp, monkeypatch):
    vistos = []

    async def falso(url, params=None):
        vistos.append((url, params))
        return [{"departamento": "Antioquia", "filas": "527805", "suma": "1000.5"}]

    monkeypatch.setattr(cliente, "_obtener", falso)
    texto = await llamar(
        mcp,
        "contar_por",
        {
            "conjunto_id": "jbjy-vk9h",
            "columna": "departamento",
            "sumar": "valor_del_contrato",
        },
    )
    url, params = vistos[0]
    assert url.endswith("/resource/jbjy-vk9h.json")
    assert params["$group"] == "departamento"
    assert (
        params["$select"]
        == "departamento, count(*) as filas, sum(valor_del_contrato) as suma"
    )
    assert "527.805" in texto and "1.000,5" in texto


async def test_error_de_consulta_se_explica(mcp, monkeypatch):
    async def falso(url, params=None):
        raise ErrorDatos("datos.gov.co rechazó la consulta. Detalle: type-mismatch")

    monkeypatch.setattr(cliente, "_obtener", falso)
    with pytest.raises(ToolError, match="datos.gov.co rechazó la consulta"):
        await llamar(
            mcp, "consultar_datos", {"conjunto_id": "jbjy-vk9h", "filtro": "x > 'a'"}
        )


# ---------- En vivo (pytest -m en_vivo) ----------


@pytest.mark.en_vivo
async def test_en_vivo_flujo_completo(mcp):
    t = await llamar(
        mcp, "buscar_conjuntos", {"consulta": "secop contratos", "por_pagina": 3}
    )
    assert "ID: " in t
    t = await llamar(mcp, "ver_conjunto", {"conjunto_id": "jbjy-vk9h"})
    assert "Filas: " in t and "departamento" in t
    t = await llamar(
        mcp,
        "consultar_datos",
        {
            "conjunto_id": "jbjy-vk9h",
            "columnas": "nombre_entidad, departamento",
            "filtro": "departamento = 'Antioquia'",
            "limite": 3,
        },
    )
    assert "Filas traídas: 3" in t
    t = await llamar(
        mcp,
        "contar_por",
        {"conjunto_id": "jbjy-vk9h", "columna": "departamento", "limite": 5},
    )
    assert "Distrito Capital" in t or "Bogotá" in t
    t = await llamar(mcp, "ver_categorias", {})
    assert "Educación" in t
    t = await llamar(mcp, "buscar_entidades", {"texto": "Medellín"})
    assert "Medellín" in t
