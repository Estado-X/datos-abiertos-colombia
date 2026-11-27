/* «¿Qué hay de mi municipio?»: tres preguntas listas sobre conjuntos nacionales de
   datos.gov.co que traen una columna de lugar · Estado X (2026).

   Cada pregunta dice qué columnas necesita con varios nombres posibles («roles»).
   La página lee las columnas reales del conjunto antes de preguntar: si datos.gov.co
   cambia un nombre y ninguno de los posibles aparece, la pregunta se pone en pausa
   con un aviso y el resto de la página sigue funcionando.

   Conjuntos y columnas verificados en datos.gov.co el 26/11/2026.
   Para proponer una pregunta nueva: CONTRIBUTING.md. */
(function (raiz, fabrica) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = fabrica(require("./logica.js"));
  else raiz.Preguntas = fabrica(raiz.Logica);
})(typeof self !== "undefined" ? self : this, function (L) {
  "use strict";

  const PREGUNTAS = [
    {
      id: "contratos",
      tema: "Contratación",
      conjunto: "jbjy-vk9h",
      fuente: "SECOP II - Contratos Electrónicos",
      entidad: "Agencia Nacional de Contratación Pública - Colombia Compra Eficiente",
      roles: {
        departamento: ["departamento", "departamento entidad"],
        ciudad: ["ciudad", "ciudad entidad", "municipio"],
        fecha: ["fecha_de_firma", "fecha de firma"],
        valor: ["valor_del_contrato", "valor del contrato"]
      },
      tipos: { fecha: "fecha", valor: "numero" },
      // Columnas que se llevan a Excel desde esta pregunta: las del contrato, sin cédulas,
      // representantes, supervisores ni cuentas bancarias. Las que no existan se omiten.
      columnasExcel: ["nombre_entidad", "nit_entidad", "departamento", "ciudad", "orden", "sector",
        "proceso_de_compra", "id_contrato", "referencia_del_contrato", "estado_contrato", "tipo_de_contrato",
        "modalidad_de_contratacion", "objeto_del_contrato", "descripcion_del_proceso", "fecha_de_firma",
        "fecha_de_inicio_del_contrato", "fecha_de_fin_del_contrato", "proveedor_adjudicado", "es_pyme",
        "valor_del_contrato", "valor_pagado", "origen_de_los_recursos", "urlproceso"],
      // El SECOP II guarda el lugar como nombre («Cúcuta»), no como código DANE:
      // primero se buscan los nombres de ciudad que usa en ese departamento.
      necesitaNombres: true,
      // Nombres de departamento del SECOP II que no son iguales a los de la DIVIPOLA
      // (comprobado el 26/11/2026); los demás coinciden.
      departamentos: { "11": "Distrito Capital de Bogotá", "88": "San Andrés, Providencia y Santa Catalina" },
      // Ciudades que el SECOP II escribe de otra forma y no se reconocen solas.
      ciudades: { "13468": "Mompós" },
      titulo: (m) => `¿Cuántos contratos firmaron las entidades con sede en ${m} en los últimos 12 meses?`,
      nota: "Cuenta los contratos de entidades registradas en el municipio (alcaldía, hospital, colegios…). Los de entidades nacionales que ejecutan ahí no entran. El SECOP II guarda el municipio como nombre: si lo escribe distinto («Cali» por «Santiago de Cali»), lo reconocemos por parecido, y si el parecido se confunde con otro municipio del departamento, no contamos. Hay valores mal digitados en la fuente: revisa los más altos antes de concluir.",
      consulta(c, lugar, hoy) {
        const v = L.ventanaDoceMeses(hoy);
        return {
          ventana: v,
          params: {
            select: `count(*) as total, sum(${c.valor}) as valor, max(${c.valor}) as mayor, max(${c.fecha}) as ultima`,
            where: `${c.departamento}=${L.soqlTexto(lugar.departamentoFuente)} AND ${c.ciudad}=${L.soqlTexto(lugar.municipioFuente)} AND ${c.fecha} >= '${v.desde}' AND ${c.fecha} < '${v.hasta}'`
          },
          filas: {
            where: `${c.departamento}=${L.soqlTexto(lugar.departamentoFuente)} AND ${c.ciudad}=${L.soqlTexto(lugar.municipioFuente)} AND ${c.fecha} >= '${v.desde}' AND ${c.fecha} < '${v.hasta}'`,
            order: `${c.fecha} DESC`
          }
        };
      },
      resultado(fila, ctx) {
        const total = Number(fila && fila.total) || 0;
        const valor = Number(fila && fila.valor), mayor = Number(fila && fila.mayor);
        // Si un solo contrato pesa más de la mitad de la suma, casi siempre es un error de digitación
        const sospechoso = total > 1 && isFinite(valor) && isFinite(mayor) && valor > 0 && mayor > valor / 2;
        const plata = sospechoso
          ? `Suman ${L.pesos(valor)}, pero un solo contrato reporta ${L.pesos(mayor)}: puede ser un error de digitación. Revísalo en Excel antes de usar la suma.`
          : `Por ${L.pesos(valor)}.`;
        return {
          cifra: L.miles(total),
          unidad: total === 1 ? "contrato" : "contratos",
          detalle: total ? `${plata} El más reciente se firmó el ${L.diaTexto(L.leerDia(fila.ultima))}.` : "No aparece ninguno en esta ventana.",
          sospechoso,
          filasTotal: total,
          periodo: `Del ${L.diaTexto(ctx.ventana.desdeDia)} al ${L.diaTexto(ctx.ventana.hastaDia)}`
        };
      }
    },
    {
      id: "educacion",
      tema: "Educación",
      conjunto: "nudc-7mev",
      fuente: "Estadísticas en educación preescolar, básica y media por municipio",
      entidad: "Ministerio de Educación Nacional",
      roles: {
        codigo: ["c_digo_municipio", "codigo_municipio", "codigo municipio", "cod_mpio"],
        ano: ["a_o", "ano", "año", "vigencia"],
        cobertura: ["cobertura_neta", "cobertura neta"],
        desercion: ["deserci_n", "desercion", "deserción"]
      },
      tipos: { cobertura: "numero", desercion: "numero" },
      titulo: (m) => `¿Qué parte de los niños y jóvenes de ${m}, de 5 a 16 años, está matriculada en su nivel?`,
      nota: "Cobertura neta: estudiantes en el grado que corresponde a su edad frente a la población de 5 a 16 años. Puede pasar de 100 % cuando estudian ahí niños de otros municipios o la proyección de población se queda corta. La deserción es la del sector oficial.",
      consulta(c, lugar) {
        return {
          params: {
            select: `${c.ano} as ano, ${c.cobertura} as cobertura, ${c.desercion} as desercion`,
            where: `${c.codigo}=${L.soqlTexto(lugar.codigo)} AND ${c.cobertura} IS NOT NULL`,
            order: `${c.ano} DESC`,
            limit: 1
          },
          filas: { where: `${c.codigo}=${L.soqlTexto(lugar.codigo)}`, order: `${c.ano} DESC` }
        };
      },
      resultado(fila) {
        if (!fila || fila.cobertura == null) return { cifra: "Sin dato", unidad: "", detalle: "El Ministerio no publica este indicador para el municipio.", periodo: "" };
        return {
          cifra: L.decimal(fila.cobertura, 1) + " %",
          unidad: "de cobertura neta",
          detalle: fila.desercion != null ? `Deserción en colegios oficiales: ${L.decimal(fila.desercion, 2)} %.` : "",
          periodo: `Año ${String(fila.ano || "sin dato")} (el último publicado)`
        };
      }
    },
    {
      id: "hurtos",
      tema: "Seguridad",
      conjunto: "4rxi-8m8d",
      fuente: "Hurto a personas",
      entidad: "Ministerio de Defensa Nacional (Policía Nacional)",
      roles: {
        codigo: ["cod_muni", "codigo_municipio", "codigo municipio", "codigo_dane"],
        fecha: ["fecha_hecho", "fecha hecho", "fecha"],
        cantidad: ["cantidad", "total"]
      },
      tipos: { fecha: "fecha", cantidad: "numero" },
      // Este conjunto se publica con un corte (por ejemplo, fin de mes): la ventana de 12 meses
      // termina en la fecha más reciente que traiga el conjunto, no hoy.
      necesitaCorte: true,
      titulo: (m) => `¿Cuántas personas fueron víctimas de hurto en ${m} en los últimos 12 meses con datos?`,
      nota: "Son víctimas de hurto a personas registradas por la Policía Nacional (el conjunto se mide en víctimas). No incluye los casos que no se denuncian.",
      consulta(c, lugar, hoy, corte) {
        const v = L.ventanaDoceMeses(corte || hoy);
        const where = `${c.codigo}=${L.soqlTexto(lugar.codigo)} AND ${c.fecha} >= '${v.desde}' AND ${c.fecha} < '${v.hasta}'`;
        return {
          ventana: v,
          params: { select: `sum(${c.cantidad}) as total, count(*) as registros, max(${c.fecha}) as ultima`, where },
          filas: { where, order: `${c.fecha} DESC` }
        };
      },
      resultado(fila, ctx) {
        const periodo = `Del ${L.diaTexto(ctx.ventana.desdeDia)} al ${L.diaTexto(ctx.ventana.hastaDia)}, fecha de corte del conjunto`;
        const registros = Number(fila && fila.registros) || 0;
        // Sin filas no es «cero hurtos»: el conjunto no trae datos de ese municipio en la ventana
        if (!registros) return { cifra: "Sin registros", unidad: "", detalle: "El conjunto no trae registros de este municipio en esta ventana.", periodo };
        const total = Number(fila.total) || 0;
        const ultima = L.leerDia(fila.ultima), fin = ctx.ventana.hastaDia;
        const atrasado = ultima && L.isoDia(ultima) < L.isoDia(fin);
        return {
          cifra: L.miles(total),
          unidad: total === 1 ? "víctima de hurto" : "víctimas de hurto",
          filasTotal: registros,
          detalle: atrasado ? `El dato más reciente de este municipio es del ${L.diaTexto(ultima)}.` : "",
          periodo
        };
      }
    }
  ];

  /** Responde una pregunta para un lugar. `pedir(url)` trae JSON (en la página, con fetch).
      Devuelve { estado: "ok" | "pausa" | "sin-lugar", ... } y nunca deja la página rota:
      si algo no cuadra, dice qué y deja el enlace al conjunto. */
  async function responder(p, lugar, opciones) {
    const pedir = opciones.pedir;
    const hoy = opciones.hoy || L.hoyBogota();
    const enlace = `${L.SITIO}/d/${p.conjunto}`;
    const meta = await pedir(`${L.SITIO}/api/views/${p.conjunto}.json`);
    const roles = L.resolverRoles(meta, p.roles, p.tipos);
    if (!roles.ok) return { estado: "pausa", faltan: roles.faltan, enlace, meta };
    const c = roles.campos;
    const fuente = Object.assign({}, lugar);
    if (p.necesitaNombres) {
      fuente.departamentoFuente = (p.departamentos || {})[String(lugar.codigo).slice(0, 2)] || lugar.departamento;
      const ciudades = await pedir(L.urlRecurso(p.conjunto, { select: `${c.ciudad} as v`, where: `${c.departamento}=${L.soqlTexto(fuente.departamentoFuente)}`, group: c.ciudad, limit: 3000 }));
      if (!Array.isArray(ciudades) || !ciudades.length) return { estado: "sin-lugar", que: lugar.departamento, enlace, meta };
      const valores = ciudades.map((x) => x.v);
      const alias = (p.ciudades || {})[lugar.codigo];
      fuente.municipioFuente = alias && valores.includes(alias) ? alias : L.elegirNombre(lugar.municipio, valores, lugar.hermanos);
      if (!fuente.municipioFuente) {
        // ¿Había un parecido que se descartó porque también es de otro municipio del departamento?
        const parecido = lugar.hermanos ? L.elegirNombre(lugar.municipio, valores) : null;
        return { estado: "sin-lugar", que: lugar.municipio, parecido, enlace, meta };
      }
    }
    let corte = null;
    if (p.necesitaCorte) {
      const r = await pedir(L.urlRecurso(p.conjunto, { select: `max(${c.fecha}) as corte` }));
      corte = L.leerDia(r && r[0] && r[0].corte);
    }
    const k = p.consulta(c, fuente, hoy, corte);
    if (p.columnasExcel) {
      const existen = new Set(L.columnasVisibles(meta).map((x) => x.fieldName));
      const select = p.columnasExcel.filter((f) => existen.has(f));
      if (select.length) k.filas.select = select.join(", ");
    }
    const url = L.urlRecurso(p.conjunto, k.params);
    const filas = await pedir(url);
    if (!Array.isArray(filas)) throw new Error("Respuesta inesperada de datos.gov.co");
    return Object.assign({ estado: "ok", url, enlace, meta, fuente, campos: c, filas: k.filas }, p.resultado(filas[0], k));
  }

  return { PREGUNTAS, responder };
});
