// Pruebas sin internet de Preguntas.responder con un datos.gov.co de mentiras.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { PREGUNTAS, responder } = require("../../docs/assets/preguntas.js");
const guardadas = require("../datos/columnas_preguntas.json").conjuntos;

const porId = (id) => PREGUNTAS.find((p) => p.id === id);
function falso(respuestas) {
  const pedidas = [];
  const pedir = async (url) => {
    const u = decodeURIComponent(url.replace(/\+/g, " "));
    pedidas.push(u);
    for (const [patron, valor] of respuestas) if (patron.test(u)) return typeof valor === "function" ? valor() : valor;
    throw new Error("Sin respuesta para " + url);
  };
  return { pedir, pedidas };
}
const CUCUTA = { codigo: "54001", municipio: "San José de Cúcuta", departamento: "Norte de Santander" };

test("contratos: busca el nombre que usa el SECOP II y responde", async () => {
  const { pedir, pedidas } = falso([
    [/api\/views\/jbjy-vk9h/, guardadas["jbjy-vk9h"]],
    [/\$select=ciudad as v.*departamento='Norte de Santander'/, [{ v: "Cúcuta" }, { v: "Los Patios" }]],
    [/count\(\*\) as total/, [{ total: "120", valor: "2500000000", ultima: "2026-12-30T10:00:00.000" }]]
  ]);
  const r = await responder(porId("contratos"), CUCUTA, { pedir, hoy: { a: 2027, m: 1, d: 4 } });
  assert.equal(r.estado, "ok");
  assert.equal(r.cifra, "120");
  assert.equal(r.fuente.municipioFuente, "Cúcuta");
  assert.match(pedidas.at(-1), /ciudad='Cúcuta'/);
  assert.match(r.detalle, /2\.500 millones de pesos/);
});

test("si datos.gov.co cambia el nombre de una columna, la pregunta se pausa sin romper", async () => {
  const meta = JSON.parse(JSON.stringify(guardadas["4rxi-8m8d"]));
  meta.columns = meta.columns.map((c) => (c.fieldName === "cantidad" ? { ...c, fieldName: "numero_casos", name: "NÚMERO CASOS" } : c));
  const { pedir, pedidas } = falso([[/api\/views\/4rxi-8m8d/, meta]]);
  const r = await responder(porId("hurtos"), CUCUTA, { pedir });
  assert.equal(r.estado, "pausa");
  assert.deepEqual(r.faltan, ["cantidad"]);
  assert.equal(pedidas.length, 1, "no debe seguir preguntando");
});

test("si el municipio no aparece con ese nombre, lo dice", async () => {
  const { pedir } = falso([
    [/api\/views\/jbjy-vk9h/, guardadas["jbjy-vk9h"]],
    [/\$select=ciudad as v/, [{ v: "Los Patios" }]]
  ]);
  const r = await responder(porId("contratos"), CUCUTA, { pedir });
  assert.equal(r.estado, "sin-lugar");
  assert.equal(r.que, "San José de Cúcuta");
});

test("contratos: Bogotá usa el nombre de departamento del SECOP II", async () => {
  const { pedir, pedidas } = falso([
    [/api\/views\/jbjy-vk9h/, guardadas["jbjy-vk9h"]],
    [/\$select=ciudad as v.*departamento='Distrito Capital de Bogotá'/, [{ v: "Bogotá" }, { v: "Distrito Capital" }, { v: "No Definido" }]],
    [/count\(\*\) as total/, [{ total: "155310", valor: "628404312458910.13", mayor: "577152576000000", ultima: "2026-11-25T10:00:00.000" }]]
  ]);
  const r = await responder(porId("contratos"), { codigo: "11001", municipio: "Bogotá, D.C.", departamento: "Bogotá, D.C." }, { pedir, hoy: { a: 2026, m: 11, d: 26 } });
  assert.equal(r.estado, "ok");
  assert.match(pedidas.at(-1), /ciudad='Bogotá'/);
  assert.equal(r.sospechoso, true);
  assert.match(r.detalle, /un solo contrato reporta 577,2 billones de pesos/);
});

test("si el departamento no trae ciudades, lo dice sin adivinar", async () => {
  const { pedir } = falso([
    [/api\/views\/jbjy-vk9h/, guardadas["jbjy-vk9h"]],
    [/\$select=ciudad as v/, []]
  ]);
  const r = await responder(porId("contratos"), CUCUTA, { pedir });
  assert.equal(r.estado, "sin-lugar");
  assert.equal(r.que, "Norte de Santander");
});

test("hurtos: la ventana termina en el corte del conjunto, no hoy", async () => {
  const { pedir, pedidas } = falso([
    [/api\/views\/4rxi-8m8d/, guardadas["4rxi-8m8d"]],
    [/max\(fecha_hecho\) as corte/, [{ corte: "2026-10-31T00:00:00.000" }]],
    [/sum\(cantidad\)/, [{ total: "4587", registros: "3000" }]]
  ]);
  const r = await responder(porId("hurtos"), { codigo: "25754", municipio: "Soacha", departamento: "Cundinamarca" }, { pedir, hoy: { a: 2027, m: 1, d: 4 } });
  assert.equal(r.cifra, "4.587");
  assert.match(pedidas.at(-1), /fecha_hecho < '2026-11-01T00:00:00'/);
  assert.match(r.periodo, /31\/10\/2026/);
});

test("una respuesta que no es lista de filas se trata como error", async () => {
  const { pedir } = falso([
    [/api\/views\/nudc-7mev/, guardadas["nudc-7mev"]],
    [/resource\/nudc-7mev/, { error: true, message: "query.compiler.malformed" }]
  ]);
  await assert.rejects(responder(porId("educacion"), CUCUTA, { pedir }));
});
