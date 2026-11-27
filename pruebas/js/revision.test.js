// Pruebas sin internet de los ajustes de la revisión independiente (26/11/2026).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../../docs/assets/logica.js");
const { PREGUNTAS, responder } = require("../../docs/assets/preguntas.js");
const guardadas = require("../datos/columnas_preguntas.json").conjuntos;

const porId = (id) => PREGUNTAS.find((p) => p.id === id);
const copia = (x) => JSON.parse(JSON.stringify(x));
function falso(respuestas) {
  const pedidas = [];
  const pedir = async (url) => {
    const u = decodeURIComponent(url.replace(/\+/g, " "));
    pedidas.push(u);
    for (const [patron, valor] of respuestas) if (patron.test(u)) return valor;
    throw new Error("Sin respuesta para " + url);
  };
  return { pedir, pedidas };
}

test("elegirNombre no adivina si el parecido también es de otro municipio del departamento", () => {
  const ciudades = ["San Jacinto", "Cartagena"];
  const hermanos = ["San Jacinto", "San Jacinto del Cauca", "Cartagena de Indias"];
  assert.equal(L.elegirNombre("San Jacinto", ciudades, hermanos), "San Jacinto");
  assert.equal(L.elegirNombre("San Jacinto del Cauca", ciudades, hermanos), null);
  assert.equal(L.elegirNombre("Cartagena de Indias", ciudades, hermanos), "Cartagena");
  // Sin la lista de hermanos se comporta como antes
  assert.equal(L.elegirNombre("San Jacinto del Cauca", ciudades), "San Jacinto");
});

test("resolverRoles pausa una columna que cambió de tipo", () => {
  const meta = { columns: [{ fieldName: "valor_del_contrato", name: "Valor", dataTypeName: "text" }, { fieldName: "fecha_de_firma", name: "Fecha", dataTypeName: "calendar_date" }] };
  const r = L.resolverRoles(meta, { valor: ["valor_del_contrato"], fecha: ["fecha_de_firma"] }, { valor: "numero", fecha: "fecha" });
  assert.equal(r.ok, false);
  assert.match(r.faltan[0], /^valor \(cambió de tipo: texto\)$/);
  assert.equal(r.campos.fecha, "fecha_de_firma");
});

test("las tres preguntas declaran tipos que cuadran con las columnas reales guardadas", () => {
  for (const p of PREGUNTAS) {
    const r = L.resolverRoles(guardadas[p.conjunto], p.roles, p.tipos);
    assert.equal(r.ok, true, p.id + ": " + r.faltan.join(", "));
  }
});

test("contratos: si el valor pasa a texto, la pregunta se pausa sin consultar", async () => {
  const meta = copia(guardadas["jbjy-vk9h"]);
  meta.columns.find((c) => c.fieldName === "valor_del_contrato").dataTypeName = "text";
  const { pedir, pedidas } = falso([[/api\/views\/jbjy-vk9h/, meta]]);
  const r = await responder(porId("contratos"), { codigo: "25754", municipio: "Soacha", departamento: "Cundinamarca" }, { pedir });
  assert.equal(r.estado, "pausa");
  assert.equal(pedidas.length, 1);
});

test("contratos: Excel lleva las columnas del contrato, sin cédulas ni representantes", async () => {
  const { pedir } = falso([
    [/api\/views\/jbjy-vk9h/, guardadas["jbjy-vk9h"]],
    [/\$select=ciudad as v/, [{ v: "Soacha" }]],
    [/count\(\*\) as total/, [{ total: "10", valor: "1000000", mayor: "200000", ultima: "2026-11-20T00:00:00.000" }]]
  ]);
  const r = await responder(porId("contratos"), { codigo: "25754", municipio: "Soacha", departamento: "Cundinamarca", hermanos: ["Soacha", "Sibaté"] }, { pedir });
  const cols = r.filas.select.split(", ");
  assert.ok(cols.includes("valor_del_contrato") && cols.includes("urlproceso") && cols.includes("proveedor_adjudicado"));
  for (const sensible of ["documento_proveedor", "nombre_representante_legal", "identificaci_n_representante_legal", "nombre_supervisor", "n_mero_de_cuenta", "nombre_ordenador_del_gasto"]) {
    assert.ok(!cols.includes(sensible), sensible);
  }
});

test("contratos: San Jacinto del Cauca no se cuenta como San Jacinto", async () => {
  const { pedir } = falso([
    [/api\/views\/jbjy-vk9h/, guardadas["jbjy-vk9h"]],
    [/\$select=ciudad as v/, [{ v: "San Jacinto" }, { v: "Cartagena" }]]
  ]);
  const r = await responder(porId("contratos"), { codigo: "13655", municipio: "San Jacinto del Cauca", departamento: "Bolívar", hermanos: ["San Jacinto", "San Jacinto del Cauca"] }, { pedir });
  assert.equal(r.estado, "sin-lugar");
  assert.equal(r.parecido, "San Jacinto");
});

test("hurtos: sin registros no es «0»; y avisa si el municipio trae datos más viejos que el corte", () => {
  const h = porId("hurtos");
  const k = h.consulta({ codigo: "cod_muni", fecha: "fecha_hecho", cantidad: "cantidad" }, { codigo: "91001" }, { a: 2027, m: 1, d: 4 }, { a: 2026, m: 10, d: 31 });
  assert.match(k.params.select, /max\(fecha_hecho\) as ultima/);
  assert.equal(h.resultado({ registros: "0" }, k).cifra, "Sin registros");
  assert.equal(h.resultado(undefined, k).cifra, "Sin registros");
  const r = h.resultado({ total: "120", registros: "80", ultima: "2026-10-11T00:00:00.000" }, k);
  assert.equal(r.cifra, "120");
  assert.equal(r.unidad, "víctimas de hurto");
  assert.match(r.detalle, /11\/10\/2026/);
  assert.equal(h.resultado({ total: "1", registros: "1", ultima: "2026-10-31T00:00:00.000" }, k).detalle, "");
});

test("educación: pide el último año con cobertura publicada", () => {
  const e = porId("educacion");
  const k = e.consulta({ codigo: "c_digo_municipio", ano: "a_o", cobertura: "cobertura_neta", desercion: "deserci_n" }, { codigo: "25754" });
  assert.match(k.params.where, /cobertura_neta IS NOT NULL/);
});
