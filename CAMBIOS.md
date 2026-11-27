# Cambios frente al original

Este repositorio es un fork de [datagouv/datagouv-mcp](https://github.com/datagouv/datagouv-mcp) (licencia MIT, © 2025 DINUM), adaptado por Estado X en 2026 al portal de datos abiertos de Colombia. Se adaptó desde el commit `5a37d6f0f1da` (8 sep 2026). No se sincroniza con el original.

## Versión 2

Construida por Estado X en noviembre de 2026 (versión 0.2.0 del paquete). Nada de esto viene del original.

- **¿Qué hay de mi municipio?** Selector de departamento y municipio con la DIVIPOLA del DANE (`docs/assets/divipola.json`, conjunto `gdxc-w37w`, regenerable con `herramientas/actualizar_divipola.py`) y tres preguntas listas (`docs/assets/preguntas.js`):
  - contratos firmados en los últimos 12 meses por entidades con sede en el municipio (SECOP II, `jbjy-vk9h`), con aviso cuando un solo contrato pesa más de la mitad de la suma;
  - cobertura neta y deserción escolar del último año publicado (Ministerio de Educación, `nudc-7mev`);
  - hurtos a personas en los 12 meses que terminan en la fecha de corte del conjunto (MinDefensa, `4rxi-8m8d`).
  Cada columna se busca por varios nombres posibles: si datos.gov.co cambia uno y ninguno aparece, la pregunta se pausa con un aviso y la página sigue funcionando.
- **Columnas legibles:** nombre, tipo y descripción de cada columna, con el nombre técnico en pequeño; 12 a la vista y el resto con «Ver las N columnas». La muestra usa los nombres legibles.
- **Carga clara:** barra de carga, aviso cuando datos.gov.co tarda, límite de espera y «Reintentar».
- **«Llévatelo a Excel»:** hasta 5.000 filas armadas en el navegador, en un CSV para Excel en español (BOM, punto y coma, coma decimal). Las celdas que empiezan con `=`, `+`, `-`, `@`, tabulador o retorno se escriben con un apóstrofo delante, para que ninguna se ejecute como fórmula.
- **Instalar sin terminal:** paquete `docs/descargas/datos-abiertos-colombia.mcpb` para Claude Desktop (MCPB de tipo `uv`, `mcpb/manifest.json`), armado por `herramientas/armar_mcpb.py`.
- **Colaborar:** `CONTRIBUTING.md`, plantillas de *issue* en `.github/ISSUE_TEMPLATE/` y sección «Cómo colaborar» en el README y en la página.
- **Diseño:** títulos livianos con la pila de letras del sistema (la página no incrusta letras con licencia), palabra destacada en cobre claro y sin cursiva, pocas tarjetas.
- **Pruebas:** `pruebas/js/` (Node, sin dependencias) para la lógica de la página, y `pruebas/test_mcpb.py` para el paquete.
- **Seguridad:** `.gitignore` con el bloque base de Estado X y `.gitattributes` para los binarios.

## Qué se conservó (adaptado)

| Original | Ahora | Cambio |
|---|---|---|
| `main.py` | `datos_colombia/servidor.py` | Modo stdio por defecto para Claude Desktop y Claude Code; modo HTTP con `--http`. Se conservan la protección contra *DNS rebinding* y el endpoint `/health`. Por defecto solo acepta `localhost`, y se escucha en `127.0.0.1` en vez de `0.0.0.0`. |
| `helpers/logging.py` | `datos_colombia/registro.py` | Sin el envío de eventos a Matomo. Los registros van a stderr, como pide el modo stdio. |
| `helpers/health_probe.py` | `datos_colombia/servidor.py` (`chequeo_de_salud`) | Prueba una búsqueda real en datos.gov.co. |
| `helpers/mcp_tool_defaults.py` | `datos_colombia/herramientas/_comun.py` | Mismas marcas de solo lectura. |
| `helpers/env_config.py`, `helpers/user_agent.py` | `datos_colombia/config.py` | Direcciones fijas de datos.gov.co (ya no hay entornos demo/prod), identificación del conector y token opcional de Socrata. |
| `.env.example` | Mismo nombre | Salen `MCP_ENV`, `DATAGOUV_API_ENV`, `URLS_ALLOW_LOCAL`, `URLS_ALLOW_PRIVATE` y las variables de Matomo y Sentry. Entran `MCP_HOSTS_PERMITIDOS` y `SOCRATA_APP_TOKEN`. `MCP_HOST` pasa a `127.0.0.1` por defecto. |
| `Dockerfile`, `docker-compose.yml` | Mismo nombre | Arrancan el modo HTTP con `datos-abiertos-colombia --http --host 0.0.0.0` dentro del contenedor; en `docker-compose.yml` el puerto se publica solo en `127.0.0.1` del equipo; sin variables de Matomo. |
| `pyproject.toml`, `uv.lock` | Mismo nombre | Paquete `datos-abiertos-colombia`, versión fija `0.1.0` (sin `setuptools-scm`), `license = "MIT"` y el comando `datos-abiertos-colombia` (`[project.scripts]`). Se agrega `uvicorn` como dependencia explícita. Se quitan `sentry-sdk` y `pyyaml`, y de las de desarrollo `niquests-mock` y `ty`. |
| `.gitignore`, `.pre-commit-config.yaml` | Sin cambios | |
| `LICENSE` | Se agrega «Copyright (c) 2026 Estado X» | El texto y el aviso de la DINUM no cambian. |

## Qué se reemplazó

| Original (data.gouv.fr) | Ahora (datos.gov.co, Socrata) |
|---|---|
| `helpers/datagouv_api_client.py`, `tabular_api_client.py`, `metrics_api_client.py`, `crawler_api_client.py` | `datos_colombia/cliente.py`: catálogo, facetas, metadatos y consultas SoQL de Socrata |
| `search_datasets`, `search_organizations` | `buscar_conjuntos`, `buscar_entidades`, `ver_categorias` |
| `get_dataset_info`, `list_dataset_resources`, `get_resource_info` | `ver_conjunto` (en datos.gov.co cada conjunto es una sola tabla) |
| `query_resource_data` | `consultar_datos` y `contar_por` (agrupaciones calculadas por el servidor de datos.gov.co) |
| Pruebas en `tests/` (contra las API francesas) | `pruebas/`: 24 sin internet, con respuestas reales guardadas, y una en vivo (`-m en_vivo`) |

## Qué se quitó

- **Telemetría:** Matomo (`helpers/matomo.py`) y Sentry (`helpers/sentry.py`).
- **Flujos y CI del original:** `.circleci/` (construía y publicaba una imagen Docker con secretos del registro) y `.github/` (recordatorio automático en issues y plantillas de issues y PR de data.gouv.fr).
- **`tag_version.sh`:** creaba etiquetas, hacía `git push` y publicaba versiones en GitHub.
- **Herramientas sin equivalente en datos.gov.co:** `search_dataservices`, `get_dataservice_info`, `get_dataservice_openapi_spec` (catálogo de API de terceros) y `get_metrics` (API de métricas de data.gouv.fr). Las vistas y descargas de cada conjunto ahora salen en `buscar_conjuntos` y `ver_conjunto`.
- **`helpers/ssrf.py`:** protegía la descarga de direcciones entregadas por terceros (especificaciones OpenAPI). Este conector no descarga ninguna dirección externa: solo habla con dos direcciones fijas de datos.gov.co. Los identificadores se validan (`abcd-1234`) y las columnas de `contar_por` solo aceptan nombres técnicos.
- **`scripts/call_tool.py` y `helpers/mcp_client.py`:** las pruebas llaman las herramientas dentro del proceso.

## Qué se agregó

- Errores claros en español: si datos.gov.co rechaza una consulta, no responde o devuelve algo que no son datos, la herramienta falla con un mensaje que dice qué revisar.
- Fechas en hora de Colombia (UTC−5) y números con punto de miles y coma decimal.
- `docs/`: buscador web estático (GitHub Pages) con muestra de filas y el botón «Llévalo a tu IA».
- `README.md` en español y en inglés. El original quedó en `README.original.md` y su historial de versiones en `CHANGELOG.original.md`.
- Este archivo.
