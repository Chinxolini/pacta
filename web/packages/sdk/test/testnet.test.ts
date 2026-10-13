// Integración contra Stellar testnet. Opcional: corre con PACTA_TESTNET=1.
// No bloquea si la red falla.
import { describe, expect, it } from "vitest";
import {
  anclarSello,
  calcularCompromiso,
  construirSello,
  crearCuentaTestnet,
  crearDocumento,
  firmarDocumento,
  generarSal,
  leerSello,
  nuevaClaveContrato,
  verificarCompromiso,
} from "../src";
import { PARAMS } from "./fixtures";

describe.runIf(process.env.PACTA_TESTNET === "1")("Anclaje en testnet", () => {
  it("ancla y relee el Sello; recalcular con Documento y Sal coincide", async () => {
    let doc = crearDocumento({ parametros: PARAMS });
    const ka = nuevaClaveContrato();
    const kb = nuevaClaveContrato();
    doc = await firmarDocumento(doc, "acreedor", ka, { tipo: "simulada", motivo: "test" });
    doc = await firmarDocumento(doc, "deudor", kb, { tipo: "simulada", motivo: "test" });
    const sal = generarSal();
    const compromiso = await calcularCompromiso(doc, sal);
    const sello = construirSello({ compromiso, plantilla: doc.plantilla });
    const integrador = await crearCuentaTestnet();
    const a = await anclarSello(sello, integrador, { clavesDePartes: [ka.publicKey(), kb.publicKey()] });
    const leido = await leerSello(a.tx);
    expect(leido?.sello).toEqual({ version: 1, compromiso, plantilla: "pacta/prestamo@1.2.0" });
    expect(await verificarCompromiso(doc, sal, leido!.sello.compromiso)).toBe(true);
    console.log(a.url);
  }, 60_000);
});
