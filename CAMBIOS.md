# Cambios frente al original

Este repositorio es un fork de [datagouv/datagouv-mcp](https://github.com/datagouv/datagouv-mcp) (licencia MIT, © 2025 DINUM), adaptado por Estado X en 2026 al portal de datos abiertos de Colombia. Se adaptó desde el commit `5a37d6f0f1da` (8 sep 2026). No se sincroniza con el original.

## Qué se conservó (adaptado)

| Original | Ahora | Cambio |
|---|---|---|
| `main.py` | `datos_colombia/servidor.py` | Modo stdio por defecto para Claude Desktop y Claude Code; modo HTTP con `--http`. Se conservan la protección contra *DNS rebinding* y el endpoint `/health`. Por defecto solo acepta `localhost`, y se escucha en `127.0.0.1` en vez de `0.0.0.0`. |
| `helpers/logging.py` | `datos_colombia/registro.py` | Sin el envío de eventos a Matomo. Los registros van a stderr, como pide el modo stdio. |
| `helpers/health_probe.py` | `datos_colombia/servidor.py` (`chequeo_de_salud`) | Prueba una búsqueda real en datos.gov.co. |
| `helpers/mcp_tool_defaults.py` | `datos_colombia/herramientas/_comun.py` | Mismas marcas de solo lectura. |
| `Dockerfile`, `docker-compose.yml` | Mismo nombre | Arrancan el modo HTTP; el puerto se publica solo en `127.0.0.1`; sin variables de Matomo. |
| `pyproject.toml`, `uv.lock` | Mismo nombre | Paquete `datos-abiertos-colombia` con el comando `datos-abiertos-colombia`. Se quitan `sentry-sdk` y `pyyaml`. |
| `.gitignore`, `.pre-commit-config.yaml` | Sin cambios | |
| `LICENSE` | Se agrega «Copyright (c) 2026 Estado X» | El texto y el aviso de la DINUM no cambian. |

## Qué se reemplazó

| Original (data.gouv.fr) | Ahora (datos.gov.co, Socrata) |
|---|---|
| `helpers/datagouv_api_client.py`, `tabular_api_client.py`, `metrics_api_client.py`, `crawler_api_client.py` | `datos_colombia/cliente.py`: catálogo, facetas, metadatos y consultas SoQL de Socrata |
| `search_datasets`, `search_organizations` | `buscar_conjuntos`, `buscar_entidades`, `ver_categorias` |
| `get_dataset_info`, `list_dataset_resources`, `get_resource_info` | `ver_conjunto` (en datos.gov.co cada conjunto es una sola tabla) |
| `query_resource_data` | `consultar_datos` y `contar_por` (agrupaciones calculadas por el servidor de datos.gov.co) |
| Pruebas en `tests/` (contra las API francesas) | `pruebas/`: 21 sin internet, con respuestas reales guardadas, y una en vivo (`-m en_vivo`) |

## Qué se quitó

- **Telemetría:** Matomo (`helpers/matomo.py`) y Sentry (`helpers/sentry.py`).
- **Flujos y CI del original:** `.circleci/` (construía y publicaba una imagen Docker con secretos del registro) y `.github/` (recordatorio automático en issues y plantillas de issues y PR de data.gouv.fr).
- **`tag_version.sh`:** creaba etiquetas, hacía `git push` y publicaba versiones en GitHub.
- **Herramientas sin equivalente en datos.gov.co:** `search_dataservices`, `get_dataservice_info`, `get_dataservice_openapi_spec` (catálogo de API de terceros) y `get_metrics` (API de métricas de data.gouv.fr). Las vistas y descargas de cada conjunto ahora salen en `buscar_conjuntos` y `ver_conjunto`.
- **`helpers/ssrf.py`:** protegía la descarga de direcciones entregadas por terceros (especificaciones OpenAPI). Este conector no descarga ninguna dirección externa: solo habla con dos direcciones fijas de datos.gov.co. Los identificadores se validan (`abcd-1234`) y las columnas de `contar_por` solo aceptan nombres técnicos.
- **`scripts/call_tool.py` y `helpers/mcp_client.py`:** las pruebas llaman las herramientas dentro del proceso.

## Qué se agregó

- `docs/`: buscador web estático (GitHub Pages) con muestra de filas y el botón «Llévalo a tu IA».
- `README.md` en español y en inglés. El original quedó en `README.original.md` y su historial de versiones en `CHANGELOG.original.md`.
- Este archivo.
