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
  TESTNET,
  type SelloEnCadena,
} from "../src";
import { PARAMS } from "./fixtures";

const CUENTA = "G" + "A".repeat(55);
const ANCLA = { ledger: 1234567, fecha: "2026-09-25T12:00:00Z", cuenta: CUENTA };

async function contrato() {
  let doc = crearDocumento({ parametros: PARAMS });
  doc = await firmarDocumento(doc, "acreedor", nuevaClaveContrato(), { tipo: "simulada", motivo: "test" });
  doc = await firmarDocumento(doc, "deudor", nuevaClaveContrato(), { tipo: "simulada", motivo: "test" });
  const sal = generarSal();
  const enCadena: SelloEnCadena = {
    sello: { version: 1, compromiso: await calcularCompromiso(doc, sal), plantilla: "pacta/prestamo@1.2.0" },
    tx: "t".repeat(64),
    ...ANCLA,
    url: "",
  };
  return { doc, sal, enCadena };
}

describe("Respaldo con datos de anclaje", () => {
  it("la llamada de tres argumentos sigue igual: sin campos nuevos", async () => {
    const { doc, sal, enCadena } = await contrato();
    const r = armarRespaldo(doc, sal, enCadena.tx);
    expect(Object.keys(r).sort()).toEqual(["documento", "perfil", "red", "sal", "tx"]);
  });

  it("guarda ledger, fecha, cuenta y red, y los lee de vuelta", async () => {
    const { doc, sal, enCadena } = await contrato();
    const r = leerRespaldo(JSON.stringify(armarRespaldo(doc, sal, enCadena.tx, TESTNET, ANCLA)));
    expect(r).toMatchObject({ ...ANCLA, red: "testnet" });
  });

  it("un respaldo antiguo sin esos campos se lee y verifica sin advertencias", async () => {
    const { doc, sal, enCadena } = await contrato();
    const antiguo = JSON.stringify({ perfil: "pacta/paquete/1", documento: doc, sal, tx: enCadena.tx });
    const r = leerRespaldo(antiguo);
    const v = await compararConSello(r.documento, r.sal, enCadena, r);
    expect(v.coincide).toBe(true);
    expect(v.advertencias).toEqual([]);
  });

  it("rechaza basura en los campos nuevos", async () => {
    const { doc, sal, enCadena } = await contrato();
    const base = armarRespaldo(doc, sal, enCadena.tx, TESTNET, ANCLA);
    for (const mala of [
      { ledger: "123" },
      { ledger: -1 },
      { ledger: 1.5 },
      { fecha: "ayer" },
      { fecha: 20260925 },
      { cuenta: "GINTEGRADOR" },
      { cuenta: 7 },
      { red: "devnet" },
    ])
      expect(() => leerRespaldo(JSON.stringify({ ...base, ...mala }))).toThrow(/anclaje|respaldo/);
  });

  it("con datos que coinciden con la cadena no hay advertencias", async () => {
    const { doc, sal, enCadena } = await contrato();
    const v = await compararConSello(doc, sal, enCadena, ANCLA);
    expect(v.coincide).toBe(true);
    expect(v.advertencias).toEqual([]);
  });

  it("ledger, fecha o cuenta adulterados no hacen fallar la verificación pero se señalan", async () => {
    const { doc, sal, enCadena } = await contrato();
    const v = await compararConSello(doc, sal, enCadena, { ledger: 1, fecha: "2020-01-01T00:00:00Z", cuenta: "G" + "B".repeat(55) });
    expect(v.coincide).toBe(true);
    expect(v.advertencias).toHaveLength(3);
    expect(v.advertencias.join(" ")).toMatch(/ledger/);
    expect(v.advertencias.join(" ")).toMatch(/fecha/);
    expect(v.advertencias.join(" ")).toMatch(/cuenta/);
  });
});
