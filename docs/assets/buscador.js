/* Buscador de datos.gov.co · Estado X (2026).
   Todo corre en el navegador contra los servicios públicos de Socrata (sin clave).
   Si la página trae window.__DATOS (vista previa sin red), se usa como respaldo. */
(function () {
  "use strict";
  const DOMINIO = "www.datos.gov.co";
  const SITIO = "https://" + DOMINIO;
  const CATALOGO = "https://api.us.socrata.com/api/catalog/v1";
  const POR_PAGINA = 10;
  const RESPALDO = window.__DATOS || null;
  const $ = (id) => document.getElementById(id);

  let pagina = 1;
  let ultimo = null;

  // ---------- Formato ----------
  const miles = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  function fecha(v) {
    if (!v) return "sin dato";
    const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
    if (isNaN(d)) return String(v);
    const dd = String(d.getUTCDate()).padStart(2, "0"), mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getUTCFullYear()}`;
  }
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const recortar = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
  const TIPOS = { text: "texto", number: "número", calendar_date: "fecha", floating_timestamp: "fecha", checkbox: "sí/no", url: "enlace", point: "punto", location: "ubicación", multipolygon: "polígonos", money: "dinero", percent: "porcentaje" };

  // ---------- Datos ----------
  async function pedir(url) {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
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
  async function metadatos(id) {
    try { return await pedir(`${SITIO}/api/views/${id}.json`); }
    catch (e) { if (RESPALDO && RESPALDO.fichas[id]) return RESPALDO.fichas[id].meta; throw e; }
  }
  async function muestra(id) {
    try { return await pedir(`${SITIO}/resource/${id}.json?$limit=5`); }
    catch (e) { if (RESPALDO && RESPALDO.fichas[id]) return RESPALDO.fichas[id].filas; throw e; }
  }
  async function filas(id) {
    try { const r = await pedir(`${SITIO}/resource/${id}.json?$select=count(*)%20as%20total`); return Number(r[0].total); }
    catch (e) { return RESPALDO && RESPALDO.fichas[id] ? RESPALDO.fichas[id].total : null; }
  }

  // ---------- Vista ----------
  function tarjeta(item) {
    const r = item.resource, c = item.classification || {};
    const vistas = r.page_views ? r.page_views.page_views_total : null;
    const el = document.createElement("article");
    el.className = "conjunto";
    el.innerHTML = `
      <h3>${esc(r.name)}</h3>
      <p class="meta"><span><b>${esc(r.attribution || "Entidad sin dato")}</b></span>
        ${c.domain_category ? `<span>${esc(c.domain_category)}</span>` : ""}
        <span>Datos al ${fecha(r.data_updated_at || r.updatedAt)}</span>
        ${vistas != null ? `<span>${miles(vistas)} vistas</span>` : ""}
        <span>ID ${esc(r.id)}</span></p>
      ${r.description ? `<p class="desc">${esc(recortar(r.description, 260))}</p>` : ""}
      <div class="acciones">
        <button type="button" class="boton boton--chico" data-accion="detalle" aria-expanded="false">Ver columnas y muestra</button>
        <button type="button" class="boton boton--chico boton--claro" data-accion="llevar">Llévalo a tu IA</button>
        <a class="boton boton--chico boton--claro" href="${SITIO}/d/${encodeURIComponent(r.id)}" target="_blank" rel="noopener">Abrir en datos.gov.co</a>
        <span class="copiado" role="status" hidden></span>
      </div>
      <div class="detalle" hidden></div>`;
    el.querySelector('[data-accion="detalle"]').addEventListener("click", (ev) => alternarDetalle(el, r, ev.currentTarget));
    el.querySelector('[data-accion="llevar"]').addEventListener("click", () => llevar(el, r));
    return el;
  }

  // Valor de una celda de la muestra con formato colombiano según el tipo de columna
  function celda(v, tipo) {
    if (v == null || v === "") return "";
    if (typeof v === "object") return v.url || v.human_address || JSON.stringify(v);
    if ((tipo === "floating_timestamp" || tipo === "calendar_date") && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      const [a, m, d] = String(v).slice(0, 10).split("-");
      return `${d}/${m}/${a}`;
    }
    if ((tipo === "number" || tipo === "money" || tipo === "percent") && v !== "" && !isNaN(Number(v))) {
      const n = Number(v);
      const [e, dec] = String(Math.abs(n)).split(".");
      return (n < 0 ? "−" : "") + e.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (dec ? "," + dec : "");
    }
    return String(v);
  }

  const columnasDe = (m) => (m.columns || []).filter((c) => !String(c.fieldName).startsWith(":"));

  async function alternarDetalle(el, r, boton) {
    const caja = el.querySelector(".detalle");
    const abrir = caja.hidden;
    caja.hidden = !abrir;
    boton.setAttribute("aria-expanded", abrir ? "true" : "false");
    boton.textContent = abrir ? "Ocultar columnas" : "Ver columnas y muestra";
    if (!abrir || caja.dataset.listo) return;
    caja.innerHTML = '<p class="nota">Leyendo datos.gov.co…</p>';
    try {
      const [m, f, total] = await Promise.all([metadatos(r.id), muestra(r.id), filas(r.id)]);
      const cols = columnasDe(m);
      const info = ((m.metadata || {}).custom_fields || {})["Información de Datos"] || {};
      const vis = cols.slice(0, 8).map((c) => c.fieldName);
      const tipoDe = Object.fromEntries(cols.map((c) => [c.fieldName, c.dataTypeName]));
      caja.innerHTML = `
        <p class="nota">${total != null ? `<b>${miles(total)} filas</b> · ` : ""}${cols.length} columnas${info["Frecuencia de Actualización"] ? ` · se actualiza: ${esc(info["Frecuencia de Actualización"].toLowerCase())}` : ""} · licencia: ${esc((m.license || {}).name || m.licenseId || "sin dato")}</p>
        <div class="chips">${cols.map((c) => `<code title="${esc(c.name)}">${esc(c.fieldName)} · ${esc(TIPOS[c.dataTypeName] || c.dataTypeName)}</code>`).join("")}</div>
        ${f && f.length ? `<div class="tabla-scroll"><table class="muestra"><thead><tr>${vis.map((k) => `<th>${esc(k)}</th>`).join("")}</tr></thead>
        <tbody>${f.map((row) => `<tr>${vis.map((k) => `<td>${esc(recortar(celda(row[k], tipoDe[k]), 60))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
        <p class="nota">Muestra de 5 filas${cols.length > 8 ? " y las primeras 8 columnas" : ""}. Descarga completa: <a href="${SITIO}/api/views/${r.id}/rows.csv?accessType=DOWNLOAD" rel="noopener">CSV</a> · API: <a href="${SITIO}/resource/${r.id}.json" target="_blank" rel="noopener">${DOMINIO}/resource/${esc(r.id)}.json</a></p>` : '<p class="nota">Este conjunto no devolvió filas para la muestra.</p>'}`;
      caja.dataset.listo = "1";
      el._meta = m; el._total = total;
    } catch (e) {
      caja.innerHTML = '<p class="aviso">datos.gov.co no respondió. Intenta de nuevo en un momento.</p>';
    }
  }

  async function llevar(el, r) {
    const aviso = el.querySelector(".copiado");
    let m = el._meta, total = el._total;
    try { if (!m) { [m, total] = await Promise.all([metadatos(r.id), filas(r.id)]); el._meta = m; el._total = total; } } catch (e) { /* se arma con lo que hay */ }
    const cols = m ? columnasDe(m).map((c) => `- ${c.fieldName} (${TIPOS[c.dataTypeName] || c.dataTypeName}): ${c.name}`).join("\n") : "- [ver columnas en la página del conjunto]";
    const texto =
`Quiero analizar el conjunto de datos «${r.name}» de datos.gov.co, el portal de datos abiertos de Colombia.
- ID: ${r.id}
- Publica: ${r.attribution || "sin dato"}
- Datos actualizados al: ${fecha(r.data_updated_at || r.updatedAt)}${total != null ? `\n- Filas: ${miles(total)}` : ""}
- Página: ${SITIO}/d/${r.id}

Columnas (nombre técnico, tipo y nombre visible):
${cols}

Para consultarlo sin descargarlo puedes usar la API pública (SoQL): ${SITIO}/resource/${r.id}.json
Ejemplos: ?$limit=5 · ?$select=columna, count(*) as filas&$group=columna&$order=filas DESC
Si tienes el conector «datos-abiertos-colombia», usa ver_conjunto("${r.id}") y contar_por.

Mi pregunta: [escribe aquí tu pregunta]

Cita en tu respuesta la entidad, el ID del conjunto y la fecha de actualización, y avísame si ves valores atípicos.`;
    let ok = false;
    try { await navigator.clipboard.writeText(texto); ok = true; } catch (e) {
      const t = document.createElement("textarea"); t.value = texto; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select(); try { ok = document.execCommand("copy"); } catch (e2) { ok = false; } t.remove();
    }
    aviso.hidden = false;
    aviso.textContent = ok ? "Copiado. Pégalo en tu IA y escribe tu pregunta." : "No se pudo copiar automáticamente.";
    setTimeout(() => { aviso.hidden = true; }, 5000);
  }

  // ---------- Búsqueda ----------
  async function ejecutar(nueva) {
    if (nueva) pagina = 1;
    const params = { q: $("q").value.trim(), categoria: $("categoria").value, orden: $("orden").value, pagina };
    ultimo = params;
    $("estado").textContent = "Buscando en datos.gov.co…";
    if (nueva) $("resultados").innerHTML = "";
    try {
      const r = await buscar(params);
      if (ultimo !== params) return;
      const total = r.resultSetSize || 0;
      const titulo = params.q ? `${miles(total)} conjuntos de datos para «${params.q}»` : `${miles(total)} conjuntos de datos${params.categoria ? " en " + params.categoria : ""}, los más consultados primero`;
      $("estado").textContent = (r.respaldo ? "Vista previa sin conexión: " : "") + titulo + (total ? "." : ". Prueba con menos palabras o sin categoría.");
      r.results.forEach((x) => $("resultados").appendChild(tarjeta(x)));
      $("mas").hidden = r.respaldo || pagina * POR_PAGINA >= total;
    } catch (e) {
      $("estado").textContent = "datos.gov.co no respondió. Revisa tu conexión e intenta de nuevo.";
    }
  }

  async function iniciar() {
    // Categorías y total del portal
    try {
      let fac;
      try { fac = await pedir(`${CATALOGO}/domains/${DOMINIO}/facets`); } catch (e) { if (!RESPALDO) throw e; fac = RESPALDO.facetas; }
      const tipos = (fac.find((f) => f.facet === "datatypes") || { values: [] }).values;
      const n = (tipos.find((v) => v.value === "dataset") || {}).count;
      if (n) $("cifra-portal").innerHTML = `Hoy hay <strong>${miles(n)}</strong> conjuntos de datos en tabla publicados por entidades del Estado.`;
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
      try { await navigator.clipboard.writeText(pre.textContent); b.textContent = "Copiado"; } catch (e) { b.textContent = "Selecciona y copia"; }
      setTimeout(() => { b.textContent = "Copiar"; }, 3000);
    });
    pre.insertAdjacentElement("afterend", b);
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
