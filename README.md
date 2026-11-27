# Datos abiertos de Colombia

**[Español](#español) · [English](#english)**

![Buscador de datos abiertos de Colombia](docs/captura.png)

## Español

Un **buscador web** y un **conector para Claude** que ponen a la mano los datos abiertos del Estado colombiano publicados en [datos.gov.co](https://www.datos.gov.co): contratos del SECOP, salud, educación, transporte, ambiente y miles más.

**Versión 2:** escoge tu municipio y mira qué dicen los datos públicos, con la cifra, la fuente y la fecha; llévate cualquier consulta a Excel; e instala el conector en Claude Desktop sin abrir la terminal. Lo que cambió está en [CAMBIOS.md](CAMBIOS.md#versión-2).

**Ábrelo aquí:** https://estado-x.github.io/datos-abiertos-colombia/

### Qué hace

**La página web** (para cualquier persona):

- **¿Qué hay de mi municipio?** Escoges departamento y municipio (lista DIVIPOLA del DANE) y la página responde tres preguntas con datos de datos.gov.co: cuántos contratos firmaron en los últimos 12 meses las entidades con sede ahí (SECOP II), qué parte de los niños y jóvenes está matriculada en su nivel (Ministerio de Educación) y cuántas personas fueron víctimas de hurto según la Policía en los últimos 12 meses con datos. Cada cifra trae su fuente, su fecha y la consulta para verificarla. Se puede enlazar directo: `?municipio=25754` (Soacha).
- Busca entre los conjuntos de datos en tabla de datos.gov.co, por palabras, categoría y orden (relevancia, más consultados o actualizados hace poco).
- Muestra quién publica cada conjunto, la fecha de los datos, cuántas filas tiene, sus columnas con nombre legible, tipo y descripción (y el nombre técnico que usa la IA) y una muestra de cinco filas.
- **«Llévatelo a Excel»** descarga hasta 5.000 filas en un archivo que abre directo en Excel (tildes, coma decimal y punto y coma). Las celdas que empiezan con `=`, `+`, `-` o `@` se guardan como texto, para que ninguna se ejecute como fórmula. Junto a él, «Copiar enlace de la consulta».
- **«Llévalo a tu IA»** copia un texto listo para pegar en Claude, ChatGPT, Gemini u otra IA, con el nombre, la entidad, la fecha, las columnas y la dirección para consultarlo.

**El conector** (para Claude Desktop, Claude Code u otro cliente MCP) le da a la IA seis herramientas de solo lectura:

| Herramienta | Para qué sirve |
|---|---|
| `buscar_conjuntos` | Buscar conjuntos de datos por palabras, con filtros de categoría y entidad |
| `buscar_entidades` | Encontrar el nombre exacto con el que publica una entidad (alcaldía, ministerio…) |
| `ver_categorias` | Ver las categorías temáticas del portal |
| `ver_conjunto` | Ficha de un conjunto: entidad, fechas, licencia, filas y columnas con su nombre técnico |
| `consultar_datos` | Leer filas con filtros y orden, sin descargar el archivo |
| `contar_por` | Totales por grupo (filas y sumas), calculados por datos.gov.co aunque la tabla tenga millones de filas |

Ejemplo de pregunta: *«¿Cuántos contratos del SECOP II firmó cada departamento en 2026 y por cuánto?»*.

### Instalar el conector

El conector corre en tu computador; no hay servidor de por medio.

**Claude Desktop, sin terminal** (Windows o Mac):

1. Descarga [datos-abiertos-colombia.mcpb](https://estado-x.github.io/datos-abiertos-colombia/descargas/datos-abiertos-colombia.mcpb) (unos 57 KB).
2. Haz doble clic en el archivo, o arrástralo a la ventana de Claude Desktop, y pulsa **Instalar**. Si el doble clic no lo abre: Configuración → Extensiones → Configuración avanzada → Instalar extensión…
3. La primera vez necesita internet: Claude Desktop descarga Python y las versiones fijas de `uv.lock` por su cuenta. Después pregúntale, por ejemplo, «¿cuántos contratos del SECOP II firmó la alcaldía de mi municipio este año?».

El archivo es un paquete [MCPB](https://github.com/modelcontextprotocol/mcpb) de tipo `uv`: trae el código, `pyproject.toml` y `uv.lock`, sin dependencias adentro. Se arma con `python herramientas/armar_mcpb.py`.

**Con un comando** (necesitas [uv](https://docs.astral.sh/uv/)).

**Claude Code:**

```bash
claude mcp add datos-colombia -- uvx --from git+https://github.com/Estado-X/datos-abiertos-colombia datos-abiertos-colombia
```

**Claude Desktop** (en `claude_desktop_config.json`; en Windows está en `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "datos-colombia": {
      "command": "uvx",
      "args": ["--from", "git+https://github.com/Estado-X/datos-abiertos-colombia", "datos-abiertos-colombia"]
    }
  }
}
```

Reinicia Claude Desktop y verás las herramientas en el ícono de conectores.

**Otras IA:** LM Studio (pestaña *Program* → *Install* → *Edit mcp.json*) y otros programas que leen un `mcp.json` con `mcpServers` aceptan el mismo bloque. Si lo pruebas en otra, [cuéntanos cómo te fue](https://github.com/Estado-X/datos-abiertos-colombia/issues/new?template=otra-ia.yml).

**Como servidor HTTP** (para alojarlo tú o usarlo con otros clientes):

```bash
uvx --from git+https://github.com/Estado-X/datos-abiertos-colombia datos-abiertos-colombia --http --puerto 8000
# o con Docker
docker compose up -d
```

Queda en `http://localhost:8000/mcp`, con chequeo en `/health`. Por seguridad solo acepta llamadas a `localhost`; para un dominio propio, define `MCP_HOSTS_PERMITIDOS`. Las variables están en `.env.example`. El token de Socrata (`SOCRATA_APP_TOKEN`) es opcional y solo sube el cupo de consultas.

### Cómo funciona

- datos.gov.co funciona sobre la plataforma Socrata. El conector y el buscador usan sus servicios públicos, sin clave:
  - el catálogo (`api.us.socrata.com/api/catalog/v1`),
  - los metadatos (`www.datos.gov.co/api/views/<id>.json`),
  - las filas, con el lenguaje de consultas SoQL (`www.datos.gov.co/resource/<id>.json`).
- Solo habla con esas direcciones fijas. No descarga direcciones que le pasen y no escribe datos.
- La página es estática, en `docs/`, publicada con GitHub Pages. Consulta datos.gov.co directamente desde el navegador de quien la usa, sin servidor propio.
- Las preguntas del municipio (`docs/assets/preguntas.js`) buscan cada columna por varios nombres posibles, porque datos.gov.co a veces los cambia. Si ninguno aparece, la pregunta se pone en pausa con un aviso y el resto de la página sigue funcionando.
- Cada respuesta del conector trae la consulta reproducible, para que cualquiera pueda verificarla.

### Úsalo o adáptalo

1. Haz un fork de este repositorio.
2. Para el buscador, activa GitHub Pages (Settings → Pages → rama `main`, carpeta `/docs`).
3. Para el código del conector: `uv sync` y luego `uv run pytest` (pruebas sin internet) o `uv run pytest -m en_vivo` (contra datos.gov.co). Requiere Python 3.13 o 3.14.
4. Para la página: `node --test pruebas/js/` (sin internet) o con `EN_VIVO=1` (contra datos.gov.co).

¿Otro portal Socrata, de otro país o de una ciudad? Cambia `DOMINIO` en `datos_colombia/config.py` y en `docs/assets/logica.js`.

### Cómo colaborar

Esto es abierto y gratis: úsalo, cópialo y mejóralo. No necesitas programar para ayudar.

- **Propón una pregunta para tu municipio:** un conjunto de datos.gov.co con columna de lugar y para qué le sirve a la gente ([formulario](https://github.com/Estado-X/datos-abiertos-colombia/issues/new?template=pregunta-municipio.yml)).
- **Cuéntanos si algo no funciona** ([formulario](https://github.com/Estado-X/datos-abiertos-colombia/issues/new?template=algo-no-funciona.yml)).
- **¿Probaste el conector en otra IA?** Cuéntanos cómo te fue ([formulario](https://github.com/Estado-X/datos-abiertos-colombia/issues/new?template=otra-ia.yml)).
- **Cambia el código:** copia el repo con *Fork* y abre un *pull request* hacia este repositorio.

La guía completa está en [CONTRIBUTING.md](CONTRIBUTING.md).

### Límites

- Los datos son de cada entidad que los publica y **no están validados aquí**. Hay valores atípicos. Por ejemplo, algunas sumas de valores de contratos del SECOP dan cifras imposibles por errores de digitación en la fuente. Revisa antes de concluir.
- Solo incluye conjuntos de tipo tabla. Los mapas, gráficos y enlaces externos del portal no se consultan por filas.
- «¿Qué hay de mi municipio?» cuenta los contratos de entidades registradas en el municipio según el SECOP II, que guarda el lugar como nombre y no como código DANE. En 159 de los 1.122 municipios la página no cuenta y lo dice (comprobado el 26/11/2026): 158 no aparecen con su propio nombre, probablemente porque sus entidades se registraron sin ciudad («No definido»), y uno tiene un nombre que se confunde con el de otro municipio del mismo departamento.
- «Llévatelo a Excel» desde la pregunta de contratos trae las columnas del contrato, sin cédulas, representantes, supervisores ni cuentas bancarias.
- «Llévatelo a Excel» trae hasta 5.000 filas. La descarga completa del portal es el archivo original, sin la limpieza de fórmulas.
- El buscador muestra lo que datos.gov.co responde en el momento: si el portal está lento o caído, el buscador también.
- No hay un servicio público alojado del conector: cada quien lo corre en su computador o en su propio servidor.

### Crédito

Adaptado de **[datagouv-mcp](https://github.com/datagouv/datagouv-mcp)**, el conector de la Dirección Interministerial de lo Digital de Francia (DINUM) para data.gouv.fr (licencia MIT). Se conservan su estructura de servidor, sus protecciones contra *DNS rebinding*, el chequeo de salud y el empaque con Docker. Los clientes de datos, las herramientas y el buscador web son nuevos. El detalle está en [CAMBIOS.md](CAMBIOS.md). El README original está en [README.original.md](README.original.md).

Datos: [datos.gov.co](https://www.datos.gov.co), portal de datos abiertos del Estado colombiano (MinTIC), con la licencia que indica cada entidad. Lista de municipios: DIVIPOLA del DANE (conjunto `gdxc-w37w`). Plataforma: Socrata (Tyler Technologies). Bibliotecas: [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk), [niquests](https://github.com/jawah/niquests) y [Uvicorn](https://www.uvicorn.org).

Hecho por **[Estado X](https://estadox.com)** · Licencia MIT (la del proyecto original; ver [LICENSE](LICENSE)).

---

## English

A **web search page** and a **Claude connector** for Colombia's government open data on [datos.gov.co](https://www.datos.gov.co): public procurement (SECOP), health, education, transport, environment and thousands more.

**Open it here:** https://estado-x.github.io/datos-abiertos-colombia/

### What it does

**Version 2:** pick your municipality and see what public data says about it, export any query to Excel, and install the connector in Claude Desktop without a terminal.

**The web page** (for anyone):

- **"¿Qué hay de mi municipio?"** ("What about my town?"): pick a department and municipality and get three answers from datos.gov.co (public contracts signed in the last 12 months, school enrollment and reported thefts), each with its source, date and reproducible query.
- Searches the tabular datasets on datos.gov.co by keyword, category and order (relevance, most viewed or recently updated).
- Shows each dataset's publisher, data date, row count, readable columns (name, type, description and technical name) and a five-row sample.
- **"Llévatelo a Excel"** downloads up to 5,000 rows as an Excel-ready CSV; cells starting with `=`, `+`, `-` or `@` are written as text to prevent formula injection.
- **"Llévalo a tu IA"** ("Take it to your AI") copies a ready-to-paste prompt for Claude, ChatGPT, Gemini or any other AI. The prompt includes the dataset's name, publisher, date, columns and query URL.

**The connector** (for Claude Desktop, Claude Code or any MCP client) gives the AI six read-only tools:

| Tool | What it does |
|---|---|
| `buscar_conjuntos` | Search datasets by keyword, with category and publisher filters |
| `buscar_entidades` | Find a publisher's exact name |
| `ver_categorias` | List the portal's themes |
| `ver_conjunto` | Dataset card: publisher, dates, license, rows and columns (technical names) |
| `consultar_datos` | Read rows with filters and sorting, no download needed |
| `contar_por` | Group totals (counts and sums), computed server-side by datos.gov.co |

### Install the connector

It runs on your computer; there is no hosted server.

- **Claude Desktop, no terminal:** download [datos-abiertos-colombia.mcpb](https://estado-x.github.io/datos-abiertos-colombia/descargas/datos-abiertos-colombia.mcpb), double-click it and press Install. It is a `uv`-type MCPB bundle: Claude Desktop installs Python and the pinned dependencies from `uv.lock`.
- **Claude Code** (needs [uv](https://docs.astral.sh/uv/)): `claude mcp add datos-colombia -- uvx --from git+https://github.com/Estado-X/datos-abiertos-colombia datos-abiertos-colombia`
- **Claude Desktop:** add the JSON block from the Spanish section to `claude_desktop_config.json` and restart.
- **HTTP server:** `datos-abiertos-colombia --http --puerto 8000` or `docker compose up -d`. It serves `http://localhost:8000/mcp`, with a health check at `/health`. It only accepts `localhost` by default; set `MCP_HOSTS_PERMITIDOS` for your own domain. The Socrata app token (`SOCRATA_APP_TOKEN`) is optional.

### How it works

- datos.gov.co runs on Socrata. Both the connector and the page use its public, keyless APIs: the catalog, the dataset metadata (`/api/views/<id>.json`) and SoQL queries (`/resource/<id>.json`).
- The connector only talks to those fixed addresses, never fetches user-supplied URLs and never writes data.
- The search page is static HTML in `docs/`, served by GitHub Pages. It calls datos.gov.co straight from the visitor's browser.
- Every connector answer includes a reproducible query URL.

### Use it or adapt it

Fork it. For the page, enable GitHub Pages (`main` branch, `/docs` folder). For the connector, run `uv sync`, then `uv run pytest` (offline) or `uv run pytest -m en_vivo` (live). It needs Python 3.13. To use another Socrata portal, change `DOMINIO` in `datos_colombia/config.py` and `docs/assets/logica.js`.

### Limits

- Data belongs to each publisher and **is not validated here**. Outliers exist; some SECOP contract sums are impossible because of data-entry errors at the source.
- Only tabular datasets are included.
- The page reflects datos.gov.co in real time. If the portal is down, so is the page.
- There is no hosted public instance of the connector.

### Contributing

Open and free: use it, copy it, improve it. Suggest a question for your municipality, report a problem or tell us how the connector worked in another AI through the issue forms. See [CONTRIBUTING.md](CONTRIBUTING.md) (in Spanish).

### Credit

Adapted from **[datagouv-mcp](https://github.com/datagouv/datagouv-mcp)**, the data.gouv.fr connector by France's Interministerial Digital Directorate (DINUM), MIT license. We kept its server structure, DNS-rebinding protection, health check and Docker setup. The data clients, the tools and the web page are new. See [CAMBIOS.md](CAMBIOS.md) for details. The original README is in [README.original.md](README.original.md).

Data: [datos.gov.co](https://www.datos.gov.co), Colombia's government open data portal (MinTIC), under each publisher's license.

Made by **[Estado X](https://estadox.com)** · MIT license (the original project's; see [LICENSE](LICENSE)).
