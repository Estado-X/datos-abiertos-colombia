/* Lógica sin pantalla del buscador de datos.gov.co · Estado X (2026).
   Funciones puras: se usan en la página (window.Logica) y en las pruebas de Node
   (pruebas/js/). No hablan con la red ni tocan el documento. */
(function (raiz, fabrica) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = fabrica();
  else raiz.Logica = fabrica();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DOMINIO = "www.datos.gov.co";
  const SITIO = "https://" + DOMINIO;
  const ID_VALIDO = /^[a-z0-9]{4}-[a-z0-9]{4}$/;
  const TOPE_EXCEL = 5000;
  const TIPOS = {
    text: "texto", number: "número", calendar_date: "fecha", floating_timestamp: "fecha",
    fixed_timestamp: "fecha", date: "fecha", checkbox: "sí/no", url: "enlace", point: "punto (mapa)",
    location: "ubicación", multipolygon: "polígonos (mapa)", polygon: "polígono (mapa)",
    line: "línea (mapa)", multiline: "líneas (mapa)", multipoint: "puntos (mapa)",
    money: "dinero", percent: "porcentaje", photo: "foto", document: "documento"
  };
  const NUMERICOS = new Set(["number", "money", "percent"]);
  const FECHAS = new Set(["calendar_date", "floating_timestamp", "fixed_timestamp", "date"]);

  // ---------- Texto ----------
  function sinTildes(t) {
    return String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  // «Bogotá, D.C.» -> «bogota»; «San José de Cúcuta» -> «san jose de cucuta»
  function normalizar(t) {
    return sinTildes(t).toLowerCase()
      .replace(/\bd\s*\.\s*c\s*\.?(?=\s|$)/g, " ")
      .replace(/[^a-z0-9ñ]+/g, " ")
      .replace(/\s+/g, " ").trim();
  }
  const tipoLegible = (t) => TIPOS[t] || String(t || "sin tipo");

  // ---------- Columnas que pueden cambiar de nombre ----------
  // Las columnas «de sistema» de Socrata empiezan con «:» y no se muestran.
  function columnasVisibles(meta) {
    return ((meta && meta.columns) || []).filter((c) => c && c.fieldName && !String(c.fieldName).startsWith(":"));
  }
  /** Busca una columna por varios nombres posibles: primero el nombre técnico exacto,
      después el técnico o el visible comparados sin tildes ni mayúsculas. */
  function resolverColumna(columnas, candidatos) {
    const lista = columnas || [];
    for (const k of candidatos) {
      const c = lista.find((x) => x.fieldName === k);
      if (c) return c;
    }
    for (const k of candidatos) {
      const nk = normalizar(String(k).replace(/_/g, " "));
      const c = lista.find((x) => normalizar(String(x.fieldName).replace(/_/g, " ")) === nk || normalizar(x.name) === nk);
      if (c) return c;
    }
    return null;
  }
  /** roles = { lugar: ["cod_muni", "codigo municipio"], ... } -> { ok, campos, tipos, faltan } */
  function resolverRoles(meta, roles) {
    const cols = columnasVisibles(meta);
    const campos = {}, tipos = {}, faltan = [];
    for (const [rol, candidatos] of Object.entries(roles || {})) {
      const c = resolverColumna(cols, candidatos);
      if (c) { campos[rol] = c.fieldName; tipos[rol] = c.dataTypeName; } else faltan.push(rol);
    }
    return { ok: faltan.length === 0, campos, tipos, faltan };
  }

  /** Escoge, entre los valores que usa un conjunto, el que corresponde a un nombre oficial.
      En orden: igual sin tildes ni mayúsculas; igual sin espacios ni palabras cortas
      («Donmatías» ↔ «Don Matías», «San Andrés de Sotavento» ↔ «San Andrés Sotavento»);
      uno que lo contenga como palabras completas al principio o al final
      («San José de Cúcuta» ↔ «Cúcuta»); y lo mismo sin espacios. Si hay dos posibles, no adivina: null. */
  const CORTAS = new Set(["de", "del", "la", "las", "los", "el", "y"]);
  const compacto = (n) => n.split(" ").filter((w) => !CORTAS.has(w)).join("");
  function elegirNombre(buscado, opciones) {
    const nb = normalizar(buscado);
    if (!nb) return null;
    const ignorar = new Set(["no definido", "sin definir", "distrito capital"]);
    const limpias = (opciones || []).filter((o) => o != null && String(o).trim() !== "" && !ignorar.has(normalizar(o)));
    const unico = (lista) => (lista.length === 1 ? lista[0] : null);
    const exactas = limpias.filter((o) => normalizar(o) === nb);
    if (exactas.length) return exactas[0];
    const cb = compacto(nb);
    const compactas = limpias.filter((o) => compacto(normalizar(o)) === cb);
    if (compactas.length) return unico(compactas);
    const porPalabras = limpias.filter((o) => {
      const no = normalizar(o);
      const [corto, largo] = no.length < nb.length ? [no, nb] : [nb, no];
      return largo.startsWith(corto + " ") || largo.endsWith(" " + corto);
    });
    if (porPalabras.length) return unico(porPalabras);
    // Último intento, sin espacios: «San José de Toluviejo» ↔ «Tolú Viejo» (mínimo 6 letras)
    return unico(limpias.filter((o) => {
      const co = compacto(normalizar(o));
      const [corto, largo] = co.length < cb.length ? [co, cb] : [cb, co];
      return corto.length >= 6 && (largo.startsWith(corto) || largo.endsWith(corto));
    }));
  }

  // ---------- Consultas SoQL ----------
  const soqlTexto = (v) => "'" + String(v ?? "").replace(/'/g, "''") + "'";
  function urlRecurso(id, params, formato) {
    if (!ID_VALIDO.test(String(id))) throw new Error("Identificador inválido: " + id);
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) if (v != null && v !== "") p.set("$" + k, String(v));
    const q = p.toString();
    return `${SITIO}/resource/${id}.${formato || "json"}${q ? "?" + q : ""}`;
  }

  // ---------- Fechas (Colombia: UTC−5 todo el año) ----------
  const dos = (n) => String(n).padStart(2, "0");
  function hoyBogota(ahora) {
    const d = new Date((ahora instanceof Date ? ahora.getTime() : Date.now()) - 5 * 3600 * 1000);
    return { a: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }
  const isoDia = (f) => `${f.a}-${dos(f.m)}-${dos(f.d)}`;
  /** Mismo día, doce meses antes (el 29 de febrero cae en el 28). */
  function haceUnAno(f) {
    const ultimo = new Date(Date.UTC(f.a - 1, f.m, 0)).getUTCDate();
    return { a: f.a - 1, m: f.m, d: Math.min(f.d, ultimo) };
  }
  function diaSiguiente(f) {
    const d = new Date(Date.UTC(f.a, f.m - 1, f.d + 1));
    return { a: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }
  /** «2026-10-31T00:00:00.000» -> { a: 2026, m: 10, d: 31 } (o null) */
  function leerDia(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ""));
    return m ? { a: +m[1], m: +m[2], d: +m[3] } : null;
  }
  /** Ventana de 12 meses que termina en `fin` (incluido): [desde, hasta) para SoQL. */
  function ventanaDoceMeses(fin) {
    const desde = diaSiguiente(haceUnAno(fin));
    return { desde: isoDia(desde) + "T00:00:00", hasta: isoDia(diaSiguiente(fin)) + "T00:00:00", desdeDia: desde, hastaDia: fin };
  }
  const diaTexto = (f) => (f ? `${dos(f.d)}/${dos(f.m)}/${f.a}` : "sin dato");

  // ---------- Números con formato colombiano ----------
  function miles(n) {
    const x = Math.round(Number(n) || 0);
    return (x < 0 ? "−" : "") + String(Math.abs(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  function decimal(n, cifras) {
    const x = Number(n);
    if (!isFinite(x)) return "sin dato";
    const [e, d] = Math.abs(x).toFixed(cifras ?? 1).split(".");
    return (x < 0 ? "−" : "") + e.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (d && /[1-9]/.test(d) ? "," + d.replace(/0+$/, "") : "");
  }
  /** Pesos en palabras cortas: 566.840.142.042 -> «566.840 millones de pesos». */
  function pesos(n) {
    const x = Number(n);
    if (!isFinite(x)) return "un valor sin dato";
    if (Math.abs(x) >= 1e12) return decimal(x / 1e12, 1) + " billones de pesos";
    if (Math.abs(x) >= 1e6) return miles(x / 1e6) + " millones de pesos";
    return miles(x) + " pesos";
  }

  // ---------- «Llévatelo a Excel» ----------
  // Una celda que empieza con = + - @ (o tabulador, retorno) Excel la lee como fórmula.
  // Esas celdas de texto se escriben con un apóstrofo delante para que queden como texto.
  // (también sus versiones de ancho completo, que algunas hojas de cálculo convierten).
  const PELIGROSO = /^[=+\-@\t\r\uff1d\uff0b\uff0d\uff20]/;
  function textoSeguro(t) {
    const s = String(t);
    return PELIGROSO.test(s) ? "'" + s : s;
  }
  function valorCSV(v, tipo) {
    if (v == null || v === "") return "";
    if (typeof v === "object") return textoSeguro(v.url || v.human_address || JSON.stringify(v));
    const s = String(v);
    if (NUMERICOS.has(tipo) && /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s.trim()) && isFinite(Number(s))) {
      return s.trim().replace(".", ","); // Excel en español de Colombia usa coma decimal
    }
    if (FECHAS.has(tipo)) {
      const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(s);
      if (m) return m[2] === "00:00:00" ? m[1] : `${m[1]} ${m[2]}`;
    }
    if (tipo === "checkbox") return s === "true" ? "sí" : s === "false" ? "no" : textoSeguro(s);
    return textoSeguro(s);
  }
  const comillas = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  /** Arma un CSV para Excel en español: separador «;», coma decimal y BOM para las tildes. */
  function aCSV(columnas, filas) {
    const cols = columnas || [];
    const lineas = [cols.map((c) => comillas(textoSeguro(c.name || c.fieldName))).join(";")];
    for (const f of filas || []) lineas.push(cols.map((c) => comillas(valorCSV(f ? f[c.fieldName] : null, c.dataTypeName))).join(";"));
    return "\uFEFF" + lineas.join("\r\n") + "\r\n";
  }
  function nombreArchivo(base, f) {
    const limpio = normalizar(base).replace(/ /g, "-").slice(0, 60).replace(/-+$/, "") || "datos";
    return `${limpio}-${isoDia(f || hoyBogota())}.csv`;
  }

  return {
    DOMINIO, SITIO, ID_VALIDO, TOPE_EXCEL, TIPOS,
    sinTildes, normalizar, tipoLegible, columnasVisibles, resolverColumna, resolverRoles, elegirNombre,
    soqlTexto, urlRecurso, hoyBogota, isoDia, haceUnAno, diaSiguiente, leerDia, ventanaDoceMeses, diaTexto,
    miles, decimal, pesos, textoSeguro, valorCSV, aCSV, nombreArchivo
  };
});
