// Pruebas sin internet de la lógica de la página (docs/assets/logica.js y preguntas.js).
// Correr desde la raíz del repo:  node --test pruebas/js/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../../docs/assets/logica.js");
const { PREGUNTAS } = require("../../docs/assets/preguntas.js");
const guardadas = require("../datos/columnas_preguntas.json").conjuntos;

test("normalizar quita tildes, mayúsculas, puntuación y el D.C.", () => {
  assert.equal(L.normalizar("Bogotá, D.C."), "bogota");
  assert.equal(L.normalizar("  San José de   Cúcuta "), "san jose de cucuta");
  assert.equal(L.normalizar("Mirití - Paraná"), "miriti parana");
  assert.equal(L.normalizar("Nariño"), "narino");
});

test("resolverColumna: primero el nombre técnico exacto, después por parecido", () => {
  const cols = [
    { fieldName: "c_digo_municipio", name: "CÓDIGO_MUNICIPIO" },
    { fieldName: "fecha_de_firma", name: "Fecha de Firma" }
  ];
  assert.equal(L.resolverColumna(cols, ["c_digo_municipio"]).fieldName, "c_digo_municipio");
  assert.equal(L.resolverColumna(cols, ["codigo_municipio"]).fieldName, "c_digo_municipio");
  assert.equal(L.resolverColumna(cols, ["Fecha de firma"]).fieldName, "fecha_de_firma");
  assert.equal(L.resolverColumna(cols, ["no_existe"]), null);
});

test("resolverRoles avisa qué rol falta cuando datos.gov.co cambia un nombre", () => {
  const meta = { columns: [{ fieldName: ":id", name: "id" }, { fieldName: "cod_muni", name: "COD_MUNI", dataTypeName: "text" }, { fieldName: "cantidad_casos", name: "Casos", dataTypeName: "number" }] };
  const r = L.resolverRoles(meta, { codigo: ["cod_muni"], cantidad: ["cantidad", "total"] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.faltan, ["cantidad"]);
  assert.equal(r.campos.codigo, "cod_muni");
});

test("las tres preguntas encuentran sus columnas en las fichas guardadas", () => {
  assert.equal(PREGUNTAS.length, 3);
  for (const p of PREGUNTAS) {
    const r = L.resolverRoles(guardadas[p.conjunto], p.roles);
    assert.equal(r.ok, true, p.id + ", faltan: " + r.faltan.join(", "));
    assert.match(p.conjunto, L.ID_VALIDO);
    assert.ok(p.titulo("Soacha").includes("Soacha"));
  }
});

test("elegirNombre: exacto, luego por palabras completas, nunca adivina entre dos", () => {
  const ciudades = ["Cúcuta", "Los Patios", "Villa Del Rosario", "No Definido"];
  assert.equal(L.elegirNombre("San José de Cúcuta", ciudades), "Cúcuta");
  assert.equal(L.elegirNombre("Villa del Rosario", ciudades), "Villa Del Rosario");
  assert.equal(L.elegirNombre("Bogotá, D.C.", ["Bogotá", "Distrito Capital", "No Definido"]), "Bogotá");
  assert.equal(L.elegirNombre("Bogotá, D.C.", ["Distrito Capital de Bogotá", "Antioquia"]), "Distrito Capital de Bogotá");
  assert.equal(L.elegirNombre("Archipiélago de San Andrés, Providencia y Santa Catalina", ["San Andrés, Providencia y Santa Catalina"]), "San Andrés, Providencia y Santa Catalina");
  assert.equal(L.elegirNombre("Cartagena de Indias", ["Cartagena", "Turbaco"]), "Cartagena");
  assert.equal(L.elegirNombre("San Juan", ["San Juan de Arama", "San Juan de Rioseco"]), null);
  assert.equal(L.elegirNombre("Patios", ["Los Patios"]), "Los Patios");
  assert.equal(L.elegirNombre("Tunja", ["Duitama"]), null);
  // Variantes de escritura reales del SECOP II (26/11/2026)
  assert.equal(L.elegirNombre("Donmatías", ["Don Matías", "No Definido"]), "Don Matías");
  assert.equal(L.elegirNombre("Santa Fé de Antioquia", ["Santafé De Antioquia"]), "Santafé De Antioquia");
  assert.equal(L.elegirNombre("San Andrés de Sotavento", ["San Andrés Sotavento", "San Antero"]), "San Andrés Sotavento");
  assert.equal(L.elegirNombre("San José de Toluviejo", ["Tolú Viejo", "Sincelejo"]), "Tolú Viejo");
  assert.equal(L.elegirNombre("Concordia", ["No Definido", "Medellín"]), null);
});

test("soqlTexto escapa las comillas simples", () => {
  assert.equal(L.soqlTexto("O'Higgins"), "'O''Higgins'");
  assert.equal(L.soqlTexto("x' OR '1'='1"), "'x'' OR ''1''=''1'");
});

test("urlRecurso arma la consulta y rechaza identificadores raros", () => {
  const u = new URL(L.urlRecurso("jbjy-vk9h", { where: "ciudad='Soacha'", limit: 5 }));
  assert.equal(u.origin, "https://www.datos.gov.co");
  assert.equal(u.pathname, "/resource/jbjy-vk9h.json");
  assert.equal(u.searchParams.get("$where"), "ciudad='Soacha'");
  assert.equal(u.searchParams.get("$limit"), "5");
  assert.ok(L.urlRecurso("jbjy-vk9h", {}, "csv").endsWith(".csv"));
  assert.throws(() => L.urlRecurso("../../evil", {}));
});

test("ventana de 12 meses en hora de Colombia, también con años bisiestos", () => {
  // 4 ene 2027 a las 2:00 a. m. de Bogotá = 7:00 UTC
  const hoy = L.hoyBogota(new Date(Date.UTC(2027, 0, 4, 7, 0)));
  assert.deepEqual(hoy, { a: 2027, m: 1, d: 4 });
  // 3 ene 2027 a las 11:30 p. m. de Bogotá ya es 4 ene en UTC: debe seguir siendo 3
  assert.deepEqual(L.hoyBogota(new Date(Date.UTC(2027, 0, 4, 4, 30))), { a: 2027, m: 1, d: 3 });
  const v = L.ventanaDoceMeses(hoy);
  assert.equal(v.desde, "2026-01-05T00:00:00");
  assert.equal(v.hasta, "2027-01-05T00:00:00");
  const b = L.ventanaDoceMeses({ a: 2028, m: 2, d: 29 });
  assert.equal(b.desde, "2027-03-01T00:00:00");
  assert.equal(b.hasta, "2028-03-01T00:00:00");
  assert.deepEqual(L.leerDia("2026-10-31T00:00:00.000"), { a: 2026, m: 10, d: 31 });
  assert.equal(L.diaTexto({ a: 2026, m: 1, d: 5 }), "05/01/2026");
});

test("números con formato colombiano", () => {
  assert.equal(L.miles(5735732), "5.735.732");
  assert.equal(L.decimal(83.28, 1), "83,3");
  assert.equal(L.decimal(4.04, 2), "4,04");
  assert.equal(L.decimal(100, 1), "100");
  assert.equal(L.pesos(566840142042.79), "566.840 millones de pesos");
  assert.equal(L.pesos(1.25e12), "1,3 billones de pesos");
  assert.equal(L.pesos(850000), "850.000 pesos");
});

test("Excel: las celdas que empiezan como fórmula quedan como texto", () => {
  for (const malo of ["=HYPERLINK(\"http://x\")", "+57 300", "-2+3", "@SUM(A1)", "\tx", "\rx", "\uff1d1+1"]) {
    assert.equal(L.valorCSV(malo, "text").startsWith("'"), true, malo);
  }
  assert.equal(L.valorCSV("Contrato de obra", "text"), "Contrato de obra");
  // Los números de verdad no se tocan (pasan a coma decimal); los negativos siguen siendo números
  assert.equal(L.valorCSV("-1500.5", "number"), "-1500,5");
  assert.equal(L.valorCSV("12000000", "money"), "12000000");
  // Algo que no es número en una columna numérica se trata como texto
  assert.equal(L.valorCSV("=1+1", "number"), "'=1+1");
  assert.equal(L.valorCSV("2026-11-24T18:36:15.711", "calendar_date"), "2026-11-24 18:36:15");
  assert.equal(L.valorCSV("2026-10-31T00:00:00.000", "calendar_date"), "2026-10-31");
  assert.equal(L.valorCSV({ url: "=cmd|' /C calc'!A0" }, "url"), "'=cmd|' /C calc'!A0");
  assert.equal(L.valorCSV(true, "checkbox"), "sí");
});

test("aCSV: BOM, punto y coma, comillas dobles y encabezados legibles", () => {
  const cols = [{ fieldName: "a", name: "Nombre \"oficial\"", dataTypeName: "text" }, { fieldName: "b", name: "=Valor", dataTypeName: "number" }];
  const csv = L.aCSV(cols, [{ a: "x;y", b: "2.5" }, { a: "=1+1" }]);
  assert.ok(csv.startsWith("\uFEFF"));
  const lineas = csv.slice(1).split("\r\n");
  assert.equal(lineas[0], "\"Nombre \"\"oficial\"\"\";\"'=Valor\"");
  assert.equal(lineas[1], "\"x;y\";\"2,5\"");
  assert.equal(lineas[2], "\"'=1+1\";\"\"");
  assert.equal(L.nombreArchivo("SECOP II - Contratos Electrónicos", { a: 2027, m: 1, d: 4 }), "secop-ii-contratos-electronicos-2027-01-04.csv");
});

test("las consultas de las preguntas escapan el nombre del lugar", () => {
  const p = PREGUNTAS.find((x) => x.id === "contratos");
  const c = { departamento: "departamento", ciudad: "ciudad", fecha: "fecha_de_firma", valor: "valor_del_contrato" };
  const k = p.consulta(c, { departamentoFuente: "Nariño", municipioFuente: "O'Higgins", codigo: "52001" }, { a: 2027, m: 1, d: 4 });
  assert.match(k.params.where, /ciudad='O''Higgins'/);
  assert.match(k.params.where, /fecha_de_firma >= '2026-01-05T00:00:00'/);
  const r = p.resultado({ total: "7884", valor: "566840142042.79", mayor: "49115659583", ultima: "2026-11-24T18:36:15.711" }, k);
  assert.equal(r.cifra, "7.884");
  assert.equal(r.sospechoso, false);
  assert.match(r.detalle, /^Por 566\.840 millones de pesos\./);
  const h = PREGUNTAS.find((x) => x.id === "hurtos");
  const kh = h.consulta({ codigo: "cod_muni", fecha: "fecha_hecho", cantidad: "cantidad" }, { codigo: "25754" }, { a: 2027, m: 1, d: 4 }, { a: 2026, m: 10, d: 31 });
  assert.match(kh.params.where, /fecha_hecho >= '2025-11-01T00:00:00' AND fecha_hecho < '2026-11-01T00:00:00'/);
  const e = PREGUNTAS.find((x) => x.id === "educacion");
  assert.equal(e.resultado({ ano: "2024", cobertura: "83.28", desercion: "4.04" }).cifra, "83,3 %");
  assert.equal(e.resultado(null).cifra, "Sin dato");
});
