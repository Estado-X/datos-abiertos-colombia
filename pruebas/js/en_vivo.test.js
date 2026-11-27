// Pruebas EN VIVO contra datos.gov.co: comprueban que las tres preguntas de
// «¿Qué hay de mi municipio?» siguen encontrando sus columnas y dan una cifra.
// No corren por defecto. Desde la raíz del repo:
//   PowerShell:  $env:EN_VIVO="1"; node --test pruebas/js/
//   bash:        EN_VIVO=1 node --test pruebas/js/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../../docs/assets/logica.js");
const { PREGUNTAS, responder } = require("../../docs/assets/preguntas.js");

const EN_VIVO = process.env.EN_VIVO === "1";
async function pedir(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
  return r.json();
}
// Tres municipios con nombres que cambian entre fuentes
const LUGARES = [
  { codigo: "25754", municipio: "Soacha", departamento: "Cundinamarca" },
  { codigo: "54001", municipio: "San José de Cúcuta", departamento: "Norte de Santander" },
  { codigo: "11001", municipio: "Bogotá, D.C.", departamento: "Bogotá, D.C." }
];

for (const p of PREGUNTAS) {
  for (const lugar of LUGARES) {
    test(`en vivo · ${p.id} · ${lugar.municipio}`, { skip: !EN_VIVO && "solo con EN_VIVO=1", timeout: 180000 }, async () => {
      const r = await responder(p, lugar, { pedir });
      assert.equal(r.estado, "ok", JSON.stringify({ estado: r.estado, faltan: r.faltan, que: r.que }));
      assert.ok(r.cifra && r.cifra !== "Sin dato", `sin cifra: ${JSON.stringify(r.cifra)}`);
      assert.ok(new URL(r.url).hostname === L.DOMINIO);
    });
  }
}
