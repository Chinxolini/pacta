import { describe, expect, it } from "vitest";
import * as sdk from "../src";
import { crearCuentaTestnet, detectarPago, montoXlmDemo, pagar } from "../src";

describe("Pago (sin red)", () => {
  it("equivalencia simbólica de la demo", () => {
    expect(montoXlmDemo(150000)).toBe("15.0000000");
  });

  it("el pago es un gesto: el SDK no expone cómo sellar «pagado»", () => {
    expect("validarPagado" in sdk).toBe(false);
  });
});

describe.runIf(process.env.PACTA_TESTNET === "1")("Pago en testnet", () => {
  it("paga sin memo y se detecta en la cadena", async () => {
    const [deudor, acreedor] = await Promise.all([crearCuentaTestnet(), crearCuentaTestnet()]);
    const p = await pagar({ origen: deudor, destino: acreedor.publicKey(), monto: "15" });
    const d = await detectarPago({ origen: deudor.publicKey(), destino: acreedor.publicKey(), montoMinimo: "15" });
    expect(d?.tx).toBe(p.tx);
  }, 60_000);
});
