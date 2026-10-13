// Pago: el Deudor puede devolver el préstamo on-chain, como gesto de la demo.
// El pago no cambia nada en la cadena: el contrato no se sella como "pagado"
// (propuesta P9, en evaluación: un "pagado" público asociado a una persona
// funciona como registro de morosidad).
//
// Reglas de privacidad:
// - Cuenta nueva por contrato, de un lado y del otro.
// - El memo del pago no referencia el Sello (no lleva memo).
// - La cuenta que paga no es la que sella.
// El monto sí queda visible, sin nada que lo asocie a un contrato ni a una
// persona.

import { Asset, BASE_FEE, Horizon, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { TESTNET, type Red } from "./anclaje";

export interface PagoDetectado {
  tx: string;
  fecha: string;
  origen: string;
  destino: string;
  /** En XLM, como string de 7 decimales. */
  monto: string;
}

/** Equivalencia simbólica de la demo: 1 XLM de prueba = $10.000. Sin valor real. */
export const PESOS_POR_XLM_DEMO = 10_000;

export function montoXlmDemo(pesos: number): string {
  return (pesos / PESOS_POR_XLM_DEMO).toFixed(7);
}

export async function pagar(opciones: {
  origen: Keypair;
  destino: string;
  monto: string;
  red?: Red;
  /** Cuentas que nunca pueden pagar: la del Integrador que sella. */
  cuentasProhibidas?: string[];
}): Promise<PagoDetectado> {
  const red = opciones.red ?? TESTNET;
  if (opciones.cuentasProhibidas?.includes(opciones.origen.publicKey()))
    throw new Error("La cuenta que paga no puede ser la que sella");
  const server = new Horizon.Server(red.horizon);
  const cuenta = await server.loadAccount(opciones.origen.publicKey());
  // Sin memo: el pago no referencia el Sello.
  const tx = new TransactionBuilder(cuenta, { fee: BASE_FEE, networkPassphrase: red.passphrase })
    .addOperation(Operation.payment({ destination: opciones.destino, asset: Asset.native(), amount: opciones.monto }))
    .setTimeout(60)
    .build();
  tx.sign(opciones.origen);
  const r = await server.submitTransaction(tx);
  const t = await server.transactions().transaction(r.hash).call();
  return { tx: r.hash, fecha: t.created_at, origen: opciones.origen.publicKey(), destino: opciones.destino, monto: opciones.monto };
}

/**
 * El Integrador busca en la cadena un pago desde la cuenta de pago registrada
 * del Deudor hacia la de cobro del Acreedor, por al menos el monto esperado.
 */
export async function detectarPago(opciones: {
  origen: string;
  destino: string;
  montoMinimo: string;
  red?: Red;
  intentos?: number;
  esperaMs?: number;
}): Promise<PagoDetectado | null> {
  const red = opciones.red ?? TESTNET;
  const server = new Horizon.Server(red.horizon);
  const intentos = opciones.intentos ?? 10;
  for (let i = 0; i < intentos; i++) {
    const pagina = await server.payments().forAccount(opciones.destino).order("desc").limit(20).call();
    for (const p of pagina.records) {
      const pago = p as unknown as {
        type: string;
        from?: string;
        to?: string;
        amount?: string;
        asset_type?: string;
        transaction_hash: string;
        created_at: string;
      };
      if (
        pago.type === "payment" &&
        pago.asset_type === "native" &&
        pago.from === opciones.origen &&
        pago.to === opciones.destino &&
        Number(pago.amount) >= Number(opciones.montoMinimo)
      )
        return {
          tx: pago.transaction_hash,
          fecha: pago.created_at,
          origen: pago.from,
          destino: pago.to,
          monto: pago.amount!,
        };
    }
    if (i < intentos - 1) await new Promise((r) => setTimeout(r, opciones.esperaMs ?? 2000));
  }
  return null;
}
