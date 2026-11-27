# Cómo colaborar

Este repositorio es abierto y gratis. Lo puedes usar, copiar y mejorar. Gracias por darte el tiempo.

Todo se hace en GitHub. Si nunca has abierto un *issue* (una conversación sobre un cambio o un problema), no pasa nada: es un formulario y lo puedes llenar en español, sin saber programar.

## Formas de colaborar

### 1. Propón una pregunta para tu municipio (sin programar)

La sección «¿Qué hay de mi municipio?» de la página tiene tres preguntas listas. Queremos más, sobre temas que le importen a la gente: salud, ambiente, servicios públicos, transporte.

[Abre la propuesta aquí](https://github.com/Estado-X/datos-abiertos-colombia/issues/new?template=pregunta-municipio.yml). Te pedimos:

- el conjunto de datos de datos.gov.co (su enlace o su ID, con la forma `abcd-1234`);
- la columna que dice el lugar (mejor si es el código DANE del municipio, de 5 dígitos);
- la pregunta, en palabras sencillas, y para qué le sirve a alguien.

Una buena pregunta usa un conjunto **nacional** (que traiga todos los municipios), que se actualice y que no tenga datos de personas.

### 2. Cuéntanos si algo no funciona

[Abre el reporte aquí](https://github.com/Estado-X/datos-abiertos-colombia/issues/new?template=algo-no-funciona.yml). Dinos qué hiciste, qué esperabas y qué pasó, y el municipio o el conjunto que probaste. Una captura de pantalla ayuda mucho.

Si una pregunta del municipio dice «en pausa», es porque datos.gov.co cambió el nombre de una columna. Avísanos y la ajustamos.

### 3. Prueba el conector en otra IA

El conector funciona con programas que hablan MCP. Si lo probaste en LM Studio, Jan, Open WebUI, Cursor u otro, [cuéntanos cómo te fue](https://github.com/Estado-X/datos-abiertos-colombia/issues/new?template=otra-ia.yml) y lo sumamos a la guía.

### 4. Cambia el código

1. Copia el repositorio a tu cuenta con **Fork** y crea una rama para tu cambio.
2. Haz el cambio y corre las pruebas (abajo).
3. Abre un *pull request* hacia **este** repositorio (`Estado-X/datos-abiertos-colombia`), no hacia el proyecto original de Francia. Cuenta qué cambiaste y por qué.

Para adaptarlo a otra ciudad u otro país con un portal Socrata, cambia `DOMINIO` en `datos_colombia/config.py` y en `docs/assets/logica.js`.

## Cómo está hecho

| Parte | Dónde | Pruebas |
|---|---|---|
| Página (buscador, municipio, Excel) | `docs/` (HTML, CSS y JavaScript sin dependencias) | `node --test pruebas/js/` |
| Preguntas del municipio | `docs/assets/preguntas.js` | las mismas, y en vivo con `EN_VIVO=1` |
| Lista de municipios | `docs/assets/divipola.json` (DIVIPOLA del DANE) | `python herramientas/actualizar_divipola.py` la regenera |
| Conector MCP | `datos_colombia/` (Python 3.13 o 3.14) | `uv run pytest` |
| Paquete para Claude Desktop | `mcpb/` y `docs/descargas/` | `python herramientas/armar_mcpb.py` y `uv run pytest` |

### Correr las pruebas

```bash
# Página, sin internet
node --test pruebas/js/

# Página, contra datos.gov.co (tarda un poco)
EN_VIVO=1 node --test pruebas/js/
# En PowerShell:  $env:EN_VIVO="1"; node --test pruebas/js/

# Conector
uv sync
uv run pytest             # sin internet
uv run pytest -m en_vivo  # contra datos.gov.co
uv run ruff check . && uv run ruff format --check .
```

Si cambias algo de `datos_colombia/`, `pyproject.toml` o `uv.lock`, vuelve a armar el paquete con `python herramientas/armar_mcpb.py` (una prueba avisa si quedó viejo).

### Para sumar una pregunta del municipio

Cada pregunta en `docs/assets/preguntas.js` dice:

- `conjunto`: el ID en datos.gov.co;
- `roles`: las columnas que necesita, **cada una con varios nombres posibles**, porque datos.gov.co a veces los cambia. Si ninguno aparece, la pregunta se pone en pausa con un aviso en vez de romper la página;
- `consulta()`: la consulta SoQL, siempre con los valores escapados con `L.soqlTexto()`;
- `resultado()`: la cifra y el texto, con formato colombiano.

Suma su caso en `pruebas/js/` y comprueba las columnas reales con `EN_VIVO=1`.

## Reglas de la casa

- **Nada de datos de personas** en el repositorio ni en las preguntas.
- **Ningún secreto** (llaves, tokens, contraseñas) en el código ni en los *issues*.
- Español claro y cálido, sin jerga innecesaria. Cifras con su fuente y su fecha.
- Las cifras que muestra la página salen de datos.gov.co en vivo: no se copian a mano.
- Respeta la licencia MIT y el crédito al proyecto original, [datagouv-mcp](https://github.com/datagouv/datagouv-mcp), de la DINUM de Francia.
- Trata bien a las demás personas. Preguntar no molesta.

¿Dudas? Abre un *issue* y pregunta.
