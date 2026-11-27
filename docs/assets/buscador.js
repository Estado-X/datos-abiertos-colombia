/* Página de datos.gov.co · Estado X (2026), versión 2.
   Todo corre en el navegador contra los servicios públicos de Socrata (sin clave).
   La lógica sin pantalla está en logica.js y las preguntas del municipio en preguntas.js.
   Si la página trae window.__DATOS (vista previa sin red), se usa como respaldo del buscador. */
(function () {
  "use strict";
  const L = window.Logica, P = window.Preguntas;
  const { SITIO, DOMINIO, ID_VALIDO, TOPE_EXCEL } = L;
  const CATALOGO = "https://api.us.socrata.com/api/catalog/v1";
  const REPO = "https://github.com/Estado-X/datos-abiertos-colombia";
  const POR_PAGINA = 10;
  const COLUMNAS_VISIBLES = 12;
  const ESPERA = 45000;   // después de esto se avisa que datos.gov.co no respondió
  const TARDA = 6000;     // después de esto se avisa que está tardando
  const RESPALDO = window.__DATOS || null;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const recortar = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

  let pagina = 1;
  let ultimo = null;
  let divipola = null;
  const metas = new Map();

  // ---------- Red ----------
  async function pedir(url, espera) {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), espera || ESPERA);
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" }, signal: control.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { clearTimeout(reloj); }
  }
  // La ficha de un conjunto se pide una sola vez por visita
  function pedirCacheado(url) {
    const m = /\/api\/views\/([a-z0-9]{4}-[a-z0-9]{4})\.json$/.exec(url);
    if (!m) return pedir(url);
    if (!metas.has(m[1])) metas.set(m[1], pedir(url).catch((e) => { metas.delete(m[1]); throw e; }));
    return metas.get(m[1]);
  }
  const metadatos = (id) => pedirCacheado(`${SITIO}/api/views/${id}.json`).catch((e) => {
    if (RESPALDO && RESPALDO.fichas && RESPALDO.fichas[id]) return RESPALDO.fichas[id].meta;
    throw e;
  });

  // ---------- Carga clara ----------
  /** Pone un aviso de carga en `caja` y, si tarda, lo dice. Devuelve una función para quitarlo. */
  function cargando(caja, texto) {
    caja.innerHTML = `<p class="cargando" role="status"><span class="cargando__barra" aria-hidden="true"></span><span>${esc(texto)}</span></p>`;
    const t = setTimeout(() => {
      const s = caja.querySelector(".cargando span:last-child");
      if (s) s.textContent = texto + " datos.gov.co está tardando: los conjuntos grandes, como el SECOP II, pueden tomar hasta medio minuto.";
    }, TARDA);
    return () => clearTimeout(t);
  }
  function fallo(caja, mensaje, reintentar) {
    caja.innerHTML = `<p class="aviso">${esc(mensaje)} <button type="button" class="enlace">Reintentar</button></p>`;
    caja.querySelector("button").addEventListener("click", reintentar);
  }
  const mensajeError = (e) => e && e.name === "AbortError" ? "datos.gov.co no respondió a tiempo." : "datos.gov.co no respondió.";

  // ---------- Copiar y descargar ----------
  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; } catch (e) {
      const t = document.createElement("textarea"); t.value = texto; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand("copy"); } catch (e2) { ok = false; } t.remove(); return ok;
    }
  }
  function avisar(el, texto) {
    el.hidden = false; el.textContent = texto;
    clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 6000);
  }
  function descargar(contenido, nombre) {
    const blob = new Blob([contenido], { type: "text/csv;charset=utf-8" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = u; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 10000);
  }
  /** «Llévatelo a Excel»: trae hasta TOPE_EXCEL filas como JSON y arma el CSV limpio en el navegador. */
  async function llevarExcel({ id, nombre, params, meta, total, boton, aviso }) {
    boton.disabled = true;
    const texto = boton.textContent;
    boton.textContent = "Preparando el archivo…";
    try {
      const m = meta || await metadatos(id);
      const cols = L.columnasVisibles(m);
      const filas = await pedir(L.urlRecurso(id, Object.assign({ order: ":id" }, params || {}, { limit: TOPE_EXCEL })), 120000);
      if (!Array.isArray(filas)) throw new Error("Respuesta inesperada");
      descargar(L.aCSV(cols, filas), L.nombreArchivo(nombre));
      const recorte = filas.length >= TOPE_EXCEL ? ` Son las primeras ${L.miles(TOPE_EXCEL)}${total ? ` de ${L.miles(total)}` : ""}.` : "";
      avisar(aviso, `Listo: ${L.miles(filas.length)} filas.${recorte}`);
    } catch (e) {
      avisar(aviso, "No se pudo armar el archivo: " + mensajeError(e) + " Intenta de nuevo.");
    } finally { boton.disabled = false; boton.textContent = texto; }
  }

  // ---------- Columnas legibles ----------
  function htmlColumnas(cols) {
    const fila = (c) => `<li><span class="cols__nombre">${esc(c.name || c.fieldName)}</span><span class="cols__tipo">${esc(L.tipoLegible(c.dataTypeName))}</span>
      <code title="Nombre técnico: el que usan la API y la IA">${esc(c.fieldName)}</code>${c.description ? `<p>${esc(recortar(c.description, 180))}</p>` : ""}</li>`;
    const primeras = cols.slice(0, COLUMNAS_VISIBLES), resto = cols.slice(COLUMNAS_VISIBLES);
    return `<ul class="cols">${primeras.map(fila).join("")}</ul>` +
      (resto.length ? `<ul class="cols" data-resto hidden>${resto.map(fila).join("")}</ul><p><button type="button" class="boton boton--chico boton--claro" data-accion="todas" aria-expanded="false">Ver las ${cols.length} columnas</button></p>` : "");
  }
  function activarColumnas(caja) {
    const b = caja.querySelector('[data-accion="todas"]');
    if (!b) return;
    b.addEventListener("click", () => {
      const resto = caja.querySelector("[data-resto]");
      resto.hidden = !resto.hidden;
      b.setAttribute("aria-expanded", String(!resto.hidden));
      b.textContent = resto.hidden ? `Ver las ${caja.querySelectorAll(".cols li").length} columnas` : "Ver menos columnas";
    });
  }

  // Valor de una celda de la muestra con formato colombiano según el tipo de columna
  function celda(v, tipo) {
    if (v == null || v === "") return "";
    if (typeof v === "object") return v.url || v.human_address || JSON.stringify(v);
    if ((tipo === "floating_timestamp" || tipo === "calendar_date") && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      const [a, m, d] = String(v).slice(0, 10).split("-");
      return `${d}/${m}/${a}`;
    }
    if ((tipo === "number" || tipo === "money" || tipo === "percent") && !isNaN(Number(v))) {
      const n = Number(v);
      const [e, dec] = String(Math.abs(n)).split(".");
      return (n < 0 ? "−" : "") + e.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (dec ? "," + dec : "");
    }
    return String(v);
  }

  // ---------- Resultado del buscador ----------
  function tarjeta(item) {
    const r = item.resource, c = item.classification || {};
    const idu = encodeURIComponent(r.id);
    const vistas = r.page_views ? r.page_views.page_views_total : null;
    const el = document.createElement("article");
    el.className = "conjunto";
    el.innerHTML = `
      <h3>${esc(r.name)}</h3>
      <p class="meta"><span><b>${esc(r.attribution || "Entidad sin dato")}</b></span>
        ${c.domain_category ? `<span>${esc(c.domain_category)}</span>` : ""}
        <span>Datos al ${esc(fechaCorta(r.data_updated_at || r.updatedAt))}</span>
        ${vistas != null ? `<span>${L.miles(vistas)} vistas</span>` : ""}
        <span>ID ${esc(r.id)}</span></p>
      ${r.description ? `<p class="desc">${esc(recortar(r.description, 260))}</p>` : ""}
      <div class="acciones">
        <button type="button" class="boton boton--chico" data-accion="detalle" aria-expanded="false">Ver columnas y muestra</button>
        <button type="button" class="boton boton--chico boton--claro" data-accion="llevar">Llévalo a tu IA</button>
        <a class="boton boton--chico boton--claro" href="${SITIO}/d/${idu}" target="_blank" rel="noopener">Abrir en datos.gov.co</a>
        <span class="copiado" role="status" hidden></span>
      </div>
      <div class="detalle" hidden></div>`;
    el.querySelector('[data-accion="detalle"]').addEventListener("click", (ev) => alternarDetalle(el, r, ev.currentTarget));
    el.querySelector('[data-accion="llevar"]').addEventListener("click", () => llevarIA(el, r));
    return el;
  }
  // Fecha en hora de Colombia (UTC−5 todo el año)
  function fechaCorta(v) {
    if (!v) return "sin dato";
    const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
    if (isNaN(d)) return "sin dato";
    return L.diaTexto(L.hoyBogota(d));
  }

  async function alternarDetalle(el, r, boton) {
    const caja = el.querySelector(".detalle");
    const abrir = caja.hidden;
    caja.hidden = !abrir;
    boton.setAttribute("aria-expanded", abrir ? "true" : "false");
    boton.textContent = abrir ? "Ocultar columnas" : "Ver columnas y muestra";
    if (abrir && !caja.dataset.listo) cargarDetalle(el, r);
  }
  async function cargarDetalle(el, r) {
    const caja = el.querySelector(".detalle");
    const parar = cargando(caja, "Leyendo las columnas y una muestra en datos.gov.co…");
    try {
      const [m, f, total] = await Promise.all([
        metadatos(r.id),
        pedir(L.urlRecurso(r.id, { limit: 5 })).catch(() => (RESPALDO && RESPALDO.fichas && RESPALDO.fichas[r.id] ? RESPALDO.fichas[r.id].filas : null)),
        pedir(L.urlRecurso(r.id, { select: "count(*) as total" })).then((x) => Number(x[0].total)).catch(() => null)
      ]);
      parar();
      const cols = L.columnasVisibles(m);
      const info = ((m.metadata || {}).custom_fields || {})["Información de Datos"] || {};
      const vis = cols.slice(0, 8);
      caja.innerHTML = `
        <p class="nota">${total != null ? `<b>${L.miles(total)} filas</b> · ` : ""}${cols.length} columnas${info["Frecuencia de Actualización"] ? ` · se actualiza: ${esc(String(info["Frecuencia de Actualización"]).toLowerCase())}` : ""} · licencia: ${esc((m.license || {}).name || m.licenseId || "sin dato")}</p>
        <h4>Columnas</h4>
        ${htmlColumnas(cols)}
        <h4>Muestra</h4>
        ${f && f.length ? `<div class="tabla-scroll" tabindex="0" role="region" aria-label="Muestra de 5 filas"><table class="muestra"><thead><tr>${vis.map((c) => `<th scope="col" title="${esc(c.fieldName)}">${esc(c.name || c.fieldName)}</th>`).join("")}</tr></thead>
        <tbody>${f.map((row) => `<tr>${vis.map((c) => `<td>${esc(recortar(celda(row[c.fieldName], c.dataTypeName), 60))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
        <p class="nota">Muestra de 5 filas${cols.length > 8 ? " y las primeras 8 columnas" : ""}.</p>` : '<p class="nota">Este conjunto no devolvió filas para la muestra.</p>'}
        <div class="acciones">
          <button type="button" class="boton boton--chico" data-accion="excel">Llévatelo a Excel</button>
          <button type="button" class="boton boton--chico boton--claro" data-accion="enlace">Copiar enlace de la consulta</button>
          <span class="copiado" role="status" hidden></span>
        </div>
        <p class="nota">Excel: hasta ${L.miles(TOPE_EXCEL)} filas, limpias de fórmulas.${total != null && total > TOPE_EXCEL ? ` Este conjunto tiene ${L.miles(total)}: para todas, la <a href="${SITIO}/api/views/${encodeURIComponent(r.id)}/rows.csv?accessType=DOWNLOAD" rel="noopener">descarga completa</a> del portal (archivo original, sin limpiar).` : ""} API: <a href="${SITIO}/resource/${encodeURIComponent(r.id)}.json" target="_blank" rel="noopener">${DOMINIO}/resource/${esc(r.id)}.json</a></p>`;
      activarColumnas(caja);
      const aviso = caja.querySelector(".acciones .copiado");
      caja.querySelector('[data-accion="excel"]').addEventListener("click", (ev) => llevarExcel({ id: r.id, nombre: r.name, meta: m, total, boton: ev.currentTarget, aviso }));
      caja.querySelector('[data-accion="enlace"]').addEventListener("click", async () => {
        const ok = await copiar(L.urlRecurso(r.id, { limit: TOPE_EXCEL }));
        avisar(aviso, ok ? "Enlace copiado: ábrelo en el navegador o pégalo en tu IA." : "No se pudo copiar el enlace.");
      });
      caja.dataset.listo = "1";
      el._meta = m; el._total = total;
    } catch (e) {
      parar();
      fallo(caja, mensajeError(e), () => cargarDetalle(el, r));
    }
  }

  async function llevarIA(el, r) {
    const aviso = el.querySelector(".acciones .copiado");
    let m = el._meta, total = el._total;
    try {
      if (!m) {
        [m, total] = await Promise.all([metadatos(r.id), pedir(L.urlRecurso(r.id, { select: "count(*) as total" })).then((x) => Number(x[0].total)).catch(() => null)]);
        el._meta = m; el._total = total;
      }
    } catch (e) { /* se arma con lo que hay */ }
    const cols = m ? L.columnasVisibles(m).map((c) => `- ${c.fieldName} (${L.tipoLegible(c.dataTypeName)}): ${c.name}${c.description ? ` — ${recortar(c.description, 120)}` : ""}`).join("\n") : "- [ver columnas en la página del conjunto]";
    const texto =
`Quiero analizar el conjunto de datos «${r.name}» de datos.gov.co, el portal de datos abiertos de Colombia.
- ID: ${r.id}
- Publica: ${r.attribution || "sin dato"}
- Datos actualizados al: ${fechaCorta(r.data_updated_at || r.updatedAt)}${total != null ? `\n- Filas: ${L.miles(total)}` : ""}
- Página: ${SITIO}/d/${r.id}

Columnas (nombre técnico, tipo y nombre visible):
${cols}

Para consultarlo sin descargarlo puedes usar la API pública (SoQL): ${SITIO}/resource/${r.id}.json
Ejemplos: ?$limit=5 · ?$select=columna, count(*) as filas&$group=columna&$order=filas DESC
Si tienes el conector «datos-abiertos-colombia», usa ver_conjunto("${r.id}") y contar_por.

Mi pregunta: [escribe aquí tu pregunta]

Cita en tu respuesta la entidad, el ID del conjunto y la fecha de actualización, y avísame si ves valores atípicos.`;
    const ok = await copiar(texto);
    avisar(aviso, ok ? "Copiado. Pégalo en tu IA y escribe tu pregunta." : "No se pudo copiar automáticamente.");
  }

  // ---------- Búsqueda ----------
  function urlCatalogo({ q, categoria, orden, pagina }) {
    const p = new URLSearchParams({ domains: DOMINIO, search_context: DOMINIO, only: "dataset", limit: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA });
    if (q) p.set("q", q);
    if (categoria) p.set("categories", categoria);
    const o = { vistas: "page_views_total", recientes: "updatedAt" }[orden] || (q ? null : "page_views_total");
    if (o) p.set("order", o);
    return CATALOGO + "?" + p.toString();
  }
  async function buscar(params) {
    try { return await pedir(urlCatalogo(params)); }
    catch (e) {
      if (!RESPALDO) throw e;
      const q = (params.q || "").toLowerCase();
      const r = RESPALDO.catalogo.results.filter((x) => !q || (x.resource.name + " " + x.resource.description).toLowerCase().includes(q))
        .filter((x) => !params.categoria || x.classification.domain_category === params.categoria);
      return { results: r, resultSetSize: r.length, respaldo: true };
    }
  }
  async function ejecutar(nueva) {
    if (nueva) pagina = 1;
    const params = { q: $("q").value.trim(), categoria: $("categoria").value, orden: $("orden").value, pagina };
    ultimo = params;
    $("estado").textContent = "Buscando en datos.gov.co…";
    if (nueva) $("resultados").innerHTML = "";
    $("mas").disabled = true;
    try {
      const r = await buscar(params);
      if (ultimo !== params) return;
      const total = r.resultSetSize || 0;
      const titulo = params.q ? `${L.miles(total)} conjuntos de datos para «${params.q}»` : `${L.miles(total)} conjuntos de datos${params.categoria ? " en " + params.categoria : ""}, los más consultados primero`;
      $("estado").textContent = (r.respaldo ? "Vista previa sin conexión: " : "") + titulo + (total ? "." : ". Prueba con menos palabras o sin categoría.");
      (r.results || []).filter((x) => x && x.resource && ID_VALIDO.test(String(x.resource.id))).forEach((x) => $("resultados").appendChild(tarjeta(x)));
      $("mas").hidden = r.respaldo || pagina * POR_PAGINA >= total;
    } catch (e) {
      if (ultimo !== params) return;
      if (!nueva && pagina > 1) pagina -= 1;
      $("estado").textContent = mensajeError(e) + " Revisa tu conexión e intenta de nuevo.";
    } finally { $("mas").disabled = false; }
  }

  // ---------- ¿Qué hay de mi municipio? ----------
  function buscarMunicipio(codigo) {
    if (!divipola) return null;
    for (const d of divipola.departamentos) {
      const m = d.municipios.find((x) => x[0] === codigo);
      if (m) return { codigo: m[0], municipio: m[1], departamento: d.nombre, codigoDepartamento: d.codigo };
    }
    return null;
  }
  function llenarMunicipios(codDepto, elegido) {
    const sel = $("mpio");
    const d = divipola.departamentos.find((x) => x.codigo === codDepto);
    sel.innerHTML = d ? '<option value="">Escoge el municipio</option>' + d.municipios.map((m) => `<option value="${esc(m[0])}">${esc(m[1])}</option>`).join("") : '<option value="">Primero el departamento</option>';
    sel.disabled = !d;
    if (elegido) sel.value = elegido;
  }
  async function iniciarMunicipios() {
    try {
      divipola = await pedir("assets/divipola.json", 20000);
      $("depto").innerHTML = '<option value="">Escoge el departamento</option>' + divipola.departamentos.map((d) => `<option value="${esc(d.codigo)}">${esc(d.nombre)}</option>`).join("");
    } catch (e) {
      $("depto").innerHTML = '<option value="">No se pudo cargar la lista</option>';
      return;
    }
    $("depto").addEventListener("change", () => llenarMunicipios($("depto").value));
    const pedido = new URLSearchParams(location.search).get("municipio");
    if (pedido && /^\d{5}$/.test(pedido)) mostrarMunicipio(pedido, false);
  }
  function mostrarMunicipio(codigo, enfocar) {
    const lugar = buscarMunicipio(codigo);
    if (!lugar) return;
    $("depto").value = lugar.codigoDepartamento;
    llenarMunicipios(lugar.codigoDepartamento, lugar.codigo);
    try { const u = new URL(location.href); u.searchParams.set("municipio", codigo); history.replaceState(null, "", u); } catch (e) { /* sin efecto */ }
    const sec = $("mi-municipio");
    sec.hidden = false;
    $("t-mun").textContent = lugar.municipio === lugar.departamento ? lugar.municipio : `${lugar.municipio}, ${lugar.departamento}`;
    const caja = $("preguntas");
    caja.innerHTML = "";
    for (const p of P.PREGUNTAS) {
      const art = document.createElement("article");
      art.className = "pregunta";
      art.setAttribute("aria-live", "polite");
      caja.appendChild(art);
      responderPregunta(art, p, lugar);
    }
    if (enfocar) { sec.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); $("t-mun").focus({ preventScroll: true }); }
  }
  function cabeceraPregunta(p, lugar) {
    return `<p class="pregunta__tema">${esc(p.tema)}</p><p class="pregunta__q">${esc(p.titulo(lugar.municipio))}</p>`;
  }
  async function responderPregunta(art, p, lugar) {
    art.innerHTML = cabeceraPregunta(p, lugar) + '<div class="pregunta__cuerpo"></div>';
    const cuerpo = art.querySelector(".pregunta__cuerpo");
    const parar = cargando(cuerpo, "Consultando datos.gov.co…");
    let r;
    try { r = await P.responder(p, lugar, { pedir: pedirCacheado }); }
    catch (e) { parar(); fallo(cuerpo, mensajeError(e), () => responderPregunta(art, p, lugar)); return; }
    parar();
    const fuente = `<p class="pregunta__fuente">Fuente: <a href="${esc(r.enlace)}" target="_blank" rel="noopener">${esc(p.fuente)}</a>, ${esc(p.entidad)}. ID ${esc(p.conjunto)}.</p>`;
    if (r.estado === "pausa") {
      cuerpo.innerHTML = `<p class="aviso">Esta pregunta está en pausa: datos.gov.co cambió las columnas del conjunto (no encontramos: ${esc(r.faltan.join(", "))}). <a href="${REPO}/issues/new?template=algo-no-funciona.yml" target="_blank" rel="noopener">Avísanos</a> y la ajustamos.</p>${fuente}`;
      return;
    }
    if (r.estado === "sin-lugar") {
      cuerpo.innerHTML = `<p class="aviso">El conjunto no trae «${esc(r.que)}» con ese nombre: sus registros pueden estar sin lugar («No definido»). Para no adivinar, no contamos. Búscalo directamente en el conjunto.</p>${fuente}`;
      return;
    }
    cuerpo.innerHTML = `
      <p class="cifra">${esc(r.cifra)}</p>
      ${r.unidad ? `<p class="cifra__unidad">${esc(r.unidad)}</p>` : ""}
      ${r.detalle ? `<p class="pregunta__detalle">${esc(r.detalle)}</p>` : ""}
      ${r.periodo ? `<p class="pregunta__periodo">${esc(r.periodo)}.</p>` : ""}
      ${fuente}
      <details class="pregunta__nota"><summary>Cómo leer esta cifra</summary><p>${esc(p.nota)}</p></details>
      <div class="acciones">
        <button type="button" class="boton boton--chico" data-accion="excel">Llévatelo a Excel</button>
        <button type="button" class="boton boton--chico boton--claro" data-accion="ia">Llévalo a tu IA</button>
        <button type="button" class="boton boton--chico boton--claro" data-accion="consulta">Copiar la consulta</button>
        <span class="copiado" role="status" hidden></span>
      </div>`;
    const aviso = cuerpo.querySelector(".copiado");
    cuerpo.querySelector('[data-accion="excel"]').addEventListener("click", (ev) =>
      llevarExcel({ id: p.conjunto, nombre: `${p.id} ${lugar.municipio}`, params: r.filas, meta: r.meta, boton: ev.currentTarget, aviso }));
    cuerpo.querySelector('[data-accion="consulta"]').addEventListener("click", async () => {
      const ok = await copiar(r.url);
      avisar(aviso, ok ? "Consulta copiada: ábrela en el navegador para ver la cifra en la fuente." : "No se pudo copiar la consulta.");
    });
    cuerpo.querySelector('[data-accion="ia"]').addEventListener("click", async () => {
      const texto =
`Pregunta sobre ${lugar.municipio} (${lugar.departamento}, código DANE ${lugar.codigo}), con datos abiertos de Colombia:
«${p.titulo(lugar.municipio)}»

Respuesta de la consulta en datos.gov.co: ${r.cifra} ${r.unidad}. ${r.detalle} ${r.periodo}.
- Conjunto: ${p.fuente} (${p.entidad}), ID ${p.conjunto}: ${SITIO}/d/${p.conjunto}
- Consulta reproducible (API SoQL): ${r.url}
- Cómo leerla: ${p.nota}

Ayúdame a entender esta cifra: [escribe aquí tu pregunta, por ejemplo «compárala con el año anterior» o «¿qué entidades firmaron más?»]

Cita la entidad, el ID del conjunto y la fecha, y avísame si ves valores atípicos.`;
      const ok = await copiar(texto);
      avisar(aviso, ok ? "Copiado. Pégalo en tu IA y escribe tu pregunta." : "No se pudo copiar automáticamente.");
    });
  }

  // ---------- Arranque ----------
  async function iniciar() {
    iniciarMunicipios();
    try {
      let fac;
      try { fac = await pedir(`${CATALOGO}/domains/${DOMINIO}/facets`); } catch (e) { if (!RESPALDO) throw e; fac = RESPALDO.facetas; }
      const tipos = (fac.find((f) => f.facet === "datatypes") || { values: [] }).values;
      const n = (tipos.find((v) => v.value === "dataset") || {}).count;
      if (n) $("cifra-portal").innerHTML = `Hoy hay <strong>${L.miles(n)}</strong> conjuntos de datos en tabla publicados por entidades del Estado.`;
      const cats = (fac.find((f) => f.facet === "categories") || { values: [] }).values;
      cats.forEach((c) => { const o = document.createElement("option"); o.value = c.value; o.textContent = c.value; $("categoria").appendChild(o); });
    } catch (e) {
      $("cifra-portal").textContent = "No se pudo leer el total de datos.gov.co en este momento.";
    }
    const q = new URLSearchParams(location.search).get("q");
    if (q) $("q").value = q;
    ejecutar(true);
  }

  // Botones «Copiar» de los comandos de instalación
  document.querySelectorAll("pre.codigo").forEach((pre) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "boton boton--chico boton--claro"; b.textContent = "Copiar";
    b.addEventListener("click", async () => {
      b.textContent = (await copiar(pre.textContent)) ? "Copiado" : "Selecciona y copia";
      setTimeout(() => { b.textContent = "Copiar"; }, 3000);
    });
    pre.insertAdjacentElement("afterend", b);
  });

  $("form-municipio").addEventListener("submit", (ev) => {
    ev.preventDefault();
    if ($("mpio").value) mostrarMunicipio($("mpio").value, true);
    else ($("depto").value ? $("mpio") : $("depto")).focus();
  });
  $("ejemplos").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-municipio]");
    if (b && divipola) mostrarMunicipio(b.dataset.municipio, true);
  });
  $("form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    try { const u = new URL(location.href); const v = $("q").value.trim(); if (v) u.searchParams.set("q", v); else u.searchParams.delete("q"); history.replaceState(null, "", u); } catch (e) { /* sin efecto */ }
    ejecutar(true);
  });
  $("categoria").addEventListener("change", () => ejecutar(true));
  $("orden").addEventListener("change", () => ejecutar(true));
  $("mas").addEventListener("click", () => { pagina += 1; ejecutar(false); });
  iniciar();
})();
