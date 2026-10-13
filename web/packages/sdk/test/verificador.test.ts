import { describe, expect, it } from "vitest";
import {
  armarRespaldo,
  calcularCompromiso,
  compararConSello,
  crearDocumento,
  firmarDocumento,
  generarSal,
  leerRespaldo,
  nuevaClaveContrato,
  type SelloEnCadena,
} from "../src";
import { PARAMS } from "./fixtures";

async function contratoFirmado() {
  let doc = crearDocumento({ parametros: PARAMS });
  doc = await firmarDocumento(doc, "acreedor", nuevaClaveContrato(), { tipo: "simulada", motivo: "test" });
  doc = await firmarDocumento(doc, "deudor", nuevaClaveContrato(), { tipo: "simulada", motivo: "test" });
  const sal = generarSal();
  const compromiso = await calcularCompromiso(doc, sal);
  const enCadena: SelloEnCadena = {
    sello: { version: 1, compromiso, plantilla: "pacta/prestamo@1.2.0" },
    tx: "t".repeat(64),
    ledger: 1,
    fecha: "2026-09-25T12:00:00Z",
    cuenta: "GINTEGRADOR",
    url: "",
  };
  return { doc, sal, enCadena };
}

describe("Verificador (sin red)", () => {
  it("coincide con el Documento y la Sal correctos", async () => {
    const { doc, sal, enCadena } = await contratoFirmado();
    const r = await compararConSello(doc, sal, enCadena);
    expect(r.coincide).toBe(true);
    expect(r.firmasValidas).toBe(true);
  });

  it("no coincide si cambia un dato o la Sal", async () => {
    const { doc, sal, enCadena } = await contratoFirmado();
    const alterado = { ...doc, parametros: { ...doc.parametros, monto: 1500000 } };
    expect((await compararConSello(alterado, sal, enCadena)).coincide).toBe(false);
    expect((await compararConSello(doc, generarSal(), enCadena)).coincide).toBe(false);
  });

  it("no coincide si el Sello calza pero las firmas no verifican o el texto no es el de la plantilla", async () => {
    const { doc, sal, enCadena } = await contratoFirmado();
    const firmaAjena = { ...doc, firmas: [doc.firmas[0], { ...doc.firmas[1], firma: doc.firmas[0].firma }] };
    const otroTexto = { ...doc, texto: doc.texto.replace("sin intereses", "con intereses") };
    for (const [falso, motivo] of [
      [firmaAjena, /firmas/],
      [otroTexto, /firmas|texto/],
    ] as const) {
      const sellado = { ...enCadena, sello: { ...enCadena.sello, compromiso: await calcularCompromiso(falso, sal) } };
      const r = await compararConSello(falso, sal, sellado);
      expect(r.coincide).toBe(false);
      expect(r.motivo).toMatch(motivo);
    }
  });

  it("rechaza entradas que no son un Documento o una Sal", async () => {
    const { doc, enCadena } = await contratoFirmado();
    expect((await compararConSello({ hola: 1 }, "00", enCadena)).motivo).toMatch(/Documento/);
    expect((await compararConSello(doc, "xyz", enCadena)).motivo).toMatch(/Sal/);
  });

  it("el respaldo del contrato ida y vuelta: armar, leer y verificar contra el Sello", async () => {
    const { doc, sal, enCadena } = await contratoFirmado();
    const archivo = JSON.stringify(armarRespaldo(doc, sal, enCadena.tx), null, 2);
    const p = leerRespaldo(archivo);
    expect(p.documento).toEqual(doc);
    expect(p.sal).toBe(sal);
    expect(p.tx).toBe(enCadena.tx);
    const r = await compararConSello(p.documento, p.sal, enCadena);
    expect(r.coincide).toBe(true);
    expect(r.firmasValidas).toBe(true);
  });

  it("rechaza un archivo que no es respaldo", async () => {
    const { doc } = await contratoFirmado();
    expect(() => leerRespaldo('{"a":1}')).toThrow(/respaldo/);
    expect(() => leerRespaldo("no es json")).toThrow(/respaldo/);
    expect(() => leerRespaldo(JSON.stringify(armarRespaldo(doc, "xyz", "t")))).toThrow(/respaldo/);
  });
});
