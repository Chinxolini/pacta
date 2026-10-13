// Anclaje sin red: preparación determinista, canal, fee-bump, redes y envío idempotente.
import { Keypair, Memo, Operation, TransactionBuilder, FeeBumpTransaction, Transaction } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
  anclarSello,
  construirSello,
  enviarSello,
  firmanteDeKeypair,
  leerSello,
  MAINNET,
  metadatosSello,
  prepararSello,
  TESTNET,
  type Firmante,
  type ServidorAnclaje,
} from "../src";

const sello = construirSello({
  compromiso: "ab".repeat(32),
  plantilla: { id: "pacta/prestamo", version: "1.2.0" },
});
const integrador = Keypair.random();
const canal = Keypair.random();
const pagador = Keypair.random();
const tb = { minTime: 0, maxTime: 2_000_000_000 };
const base = { secuencia: "100", timebounds: tb };

function interna(xdr: string, red = TESTNET): Transaction {
  const t = TransactionBuilder.fromXDR(xdr, red.passphrase);
  return t instanceof FeeBumpTransaction ? t.innerTransaction : t;
}

describe("prepararSello", () => {
  it("es determinista: mismo hash y mismo XDR para las mismas entradas", async () => {
    const a = await prepararSello(sello, integrador, base);
    const b = await prepararSello(sello, integrador, base);
    expect(a.xdr).toBe(b.xdr);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toBe(a.hashInterno);
    expect(a.conFeeBump).toBe(false);
    // el hash sale del XDR, no del reloj
    expect(Buffer.from(TransactionBuilder.fromXDR(a.xdr, TESTNET.passphrase).hash()).toString("hex")).toBe(a.hash);
  });

  it("el XDR trae el memo_hash y el manage_data del Sello, con secuencia + 1", async () => {
    const p = await prepararSello(sello, integrador, base);
    const t = interna(p.xdr);
    expect(t.memo.type).toBe(Memo.hash(sello.compromiso).type);
    expect(Buffer.from(t.memo.value as Buffer).toString("hex")).toBe(sello.compromiso);
    expect(t.operations).toHaveLength(1);
    const op = t.operations[0] as Operation.ManageData;
    expect(op.type).toBe("manageData");
    expect(op.name).toBe("pacta");
    expect(Buffer.from(op.value as Buffer).toString("utf8")).toBe(metadatosSello(sello));
    expect(t.source).toBe(integrador.publicKey());
    expect(t.sequence).toBe("101");
    expect(t.fee).toBe("100");
    expect(t.signatures).toHaveLength(1);
  });

  it("pone timebounds por defecto y respeta la comisión máxima", async () => {
    const p = await prepararSello(sello, integrador, { secuencia: "1", comisionMaxima: "500" });
    const t = interna(p.xdr);
    expect(Number(t.timeBounds?.maxTime)).toBeGreaterThan(Date.now() / 1000);
    expect(p.expiraEn).toBe(Number(t.timeBounds?.maxTime));
    expect(t.fee).toBe("500");
  });

  it("fee-bump envuelve la interna sin cambiar su hash", async () => {
    const sin = await prepararSello(sello, integrador, base);
    const con = await prepararSello(sello, integrador, { ...base, feeBump: { pagador, comisionMaxima: "400" } });
    expect(con.conFeeBump).toBe(true);
    expect(con.hashInterno).toBe(sin.hash);
    expect(con.hash).not.toBe(sin.hash);
    const f = TransactionBuilder.fromXDR(con.xdr, TESTNET.passphrase) as FeeBumpTransaction;
    expect(f.feeSource).toBe(pagador.publicKey());
    expect(Buffer.from(f.innerTransaction.hash()).toString("hex")).toBe(sin.hash);
    expect(con.cuenta).toBe(integrador.publicKey());
  });

  it("con cuenta canal, la operación sigue siendo del Integrador y firman ambos", async () => {
    const p = await prepararSello(sello, integrador, { ...base, canal });
    const t = interna(p.xdr);
    expect(t.source).toBe(canal.publicKey());
    expect(t.operations[0].source).toBe(integrador.publicKey());
    expect(t.signatures).toHaveLength(2);
    expect(p.cuenta).toBe(integrador.publicKey());
    // el contenido del Sello es el mismo
    const op = t.operations[0] as Operation.ManageData;
    expect(Buffer.from(op.value as Buffer).toString("utf8")).toBe(metadatosSello(sello));
  });

  it("la red cambia el hash; mainnet usa su passphrase", async () => {
    const t = await prepararSello(sello, integrador, base);
    const m = await prepararSello(sello, integrador, { ...base, red: MAINNET });
    expect(m.red).toBe("mainnet");
    expect(m.hash).not.toBe(t.hash);
    expect(MAINNET.passphrase).toBe("Public Global Stellar Network ; September 2015");
    expect(MAINNET.horizon).toBe("https://horizon.stellar.org");
    expect(MAINNET.friendbot).toBeNull();
  });

  it("rechaza sellar desde la cuenta de una Parte (también canal y pagador)", async () => {
    await expect(prepararSello(sello, integrador, { ...base, clavesDePartes: [integrador.publicKey()] })).rejects.toThrow(/Integrador/);
    await expect(prepararSello(sello, integrador, { ...base, canal, clavesDePartes: [canal.publicKey()] })).rejects.toThrow(/Integrador/);
    await expect(
      prepararSello(sello, integrador, { ...base, feeBump: { pagador }, clavesDePartes: [pagador.publicKey()] }),
    ).rejects.toThrow(/Integrador/);
  });
});


it("rechaza timebounds sin vencimiento (maxTime 0)", async () => {
  await expect(prepararSello(sello, integrador, { secuencia: "1", timebounds: { minTime: 0, maxTime: 0 } })).rejects.toThrow(/maxTime/);
});

// Simulador de Horizon que responde según el estado de la cadena, no según el número de llamadas.
interface Cadena {
  incluida: boolean;
  consulta: "ok" | "error500";
  /** Si se fija, solo ese hash está indexado (p. ej. el hash interno de un fee-bump). */
  soloHash?: string;
  envios: number;
}
const cadena = (c: Partial<Cadena> = {}): Cadena => ({ incluida: false, consulta: "ok", envios: 0, ...c });
function servidorSimulado(c: Cadena, alEnviar?: (c: Cadena, n: number) => unknown) {
  return {
    submitTransaction: async () => {
      c.envios++;
      const e = alEnviar?.(c, c.envios);
      if (e) throw e;
      return { hash: "x", ledger: 1 };
    },
    transactions: () => ({
      transaction: (h: string) => ({
        call: async () => {
          if (c.consulta === "error500") throw Object.assign(new Error("500"), { response: { status: 500 } });
          if (c.incluida && (!c.soloHash || c.soloHash === h))
            return { hash: h, ledger_attr: 77, created_at: "2026-10-12T00:00:00Z", successful: true };
          throw Object.assign(new Error("404"), { response: { status: 404 } });
        },
      }),
    }),
  } as unknown as ServidorAnclaje;
}

const rechazo = (codigo: string) =>
  Object.assign(new Error("400"), { response: { status: 400, data: { extras: { result_codes: { transaction: codigo } } } } });
const ambiguo = Object.assign(new Error("timeout"), { response: { status: 504 } });
const rapido = { intervaloMs: 0 };
const vencido = { minTime: 0, maxTime: 1000 }; // en el pasado, pero con vencimiento

describe("enviarSello (cadena simulada)", () => {
  it("si la transacción ya entró, no la reenvía", async () => {
    const p = await prepararSello(sello, integrador, base);
    const c = cadena({ incluida: true });
    const a = await enviarSello(p, { ...rapido, servidor: servidorSimulado(c) });
    expect(a.tx).toBe(p.hash);
    expect(a.ledger).toBe(77);
    expect(c.envios).toBe(0);
  });

  it("un timeout en una transacción que sí entró se resuelve consultando: un solo envío", async () => {
    const p = await prepararSello(sello, integrador, base);
    const c = cadena();
    const a = await enviarSello(p, {
      ...rapido,
      servidor: servidorSimulado(c, (x) => {
        x.incluida = true;
        return ambiguo;
      }),
    });
    expect(a.tx).toBe(p.hash);
    expect(c.envios).toBe(1);
  });

  it("reintenta el mismo XDR hasta que entra", async () => {
    const p = await prepararSello(sello, integrador, base);
    const c = cadena();
    await enviarSello(p, {
      ...rapido,
      servidor: servidorSimulado(c, (x, n) => {
        if (n < 3) return ambiguo;
        x.incluida = true;
      }),
    });
    expect(c.envios).toBe(3);
  });

  it("tx_insufficient_fee es transitorio: reintenta", async () => {
    const p = await prepararSello(sello, integrador, base);
    const c = cadena();
    await enviarSello(p, {
      ...rapido,
      servidor: servidorSimulado(c, (x, n) => {
        if (n < 3) return rechazo("tx_insufficient_fee");
        x.incluida = true;
      }),
    });
    expect(c.envios).toBe(3);
  });

  it("tx_too_late y tx_bad_seq con la transacción fuera de la cadena son definitivos", async () => {
    const p = await prepararSello(sello, integrador, base);
    for (const codigo of ["tx_too_late", "tx_bad_seq"]) {
      const c = cadena();
      await expect(enviarSello(p, { ...rapido, servidor: servidorSimulado(c, () => rechazo(codigo)) })).rejects.toThrow(codigo);
      expect(c.envios).toBe(1);
    }
  });

  it("tx_bad_seq con la transacción ya incluida es éxito", async () => {
    const p = await prepararSello(sello, integrador, base);
    const c = cadena();
    const a = await enviarSello(p, {
      ...rapido,
      servidor: servidorSimulado(c, (x) => {
        x.incluida = true;
        return rechazo("tx_bad_seq");
      }),
    });
    expect(a.tx).toBe(p.hash);
  });

  it("con fee-bump también consulta el hash interno", async () => {
    const p = await prepararSello(sello, integrador, { ...base, feeBump: { pagador } });
    const c = cadena({ incluida: true, soloHash: p.hashInterno });
    const a = await enviarSello(p, { ...rapido, servidor: servidorSimulado(c) });
    expect(a.tx).toBe(p.hash);
    expect(c.envios).toBe(0);
  });

  it("sin confirmar y con plazo vigente: no reconstruyas", async () => {
    const p = await prepararSello(sello, integrador, base);
    const c = cadena();
    await expect(enviarSello(p, { ...rapido, intentos: 2, servidor: servidorSimulado(c, () => ambiguo) })).rejects.toThrow(/no reconstruyas/);
    expect(c.envios).toBe(2);
  });

  it("vencida y la cadena responde 404: afirma que es seguro reconstruir", async () => {
    const p = await prepararSello(sello, integrador, { secuencia: "1", timebounds: vencido });
    const c = cadena();
    await expect(enviarSello(p, { ...rapido, intentos: 2, servidor: servidorSimulado(c, () => ambiguo) })).rejects.toThrow(
      /ya es seguro reconstruirla/,
    );
  });

  it("vencida pero la consulta da error 500: estado desconocido, nunca seguro", async () => {
    const p = await prepararSello(sello, integrador, { secuencia: "1", timebounds: vencido });
    const c = cadena({ consulta: "error500" });
    const r = enviarSello(p, { ...rapido, intentos: 2, servidor: servidorSimulado(c, () => ambiguo) });
    await expect(r).rejects.toThrow(/desconocido/);
    await expect(r).rejects.not.toThrow(/ya es seguro reconstruirla/);
  });

  it("respeta el tope de tiempo total (tiempoMaximoMs)", async () => {
    const p = await prepararSello(sello, integrador, base);
    const c = cadena();
    await expect(
      enviarSello(p, { intentos: 1000, intervaloMs: 5, tiempoMaximoMs: 40, servidor: servidorSimulado(c, () => ambiguo) }),
    ).rejects.toThrow(/no reconstruyas/);
    expect(c.envios).toBeLessThan(1000);
    expect(c.envios).toBeGreaterThan(0);
  });

  it("rechaza un preparado enviado a la red equivocada", async () => {
    const p = await prepararSello(sello, integrador, base);
    await expect(enviarSello(p, { servidor: servidorSimulado(cadena({ incluida: true })), red: MAINNET })).rejects.toThrow(/red/);
  });

  it("anclarSello sigue funcionando con la misma firma", async () => {
    const c = cadena();
    const a = await anclarSello(sello, integrador, {
      ...base,
      intervaloMs: 0,
      servidor: servidorSimulado(c, (x) => {
        x.incluida = true;
      }),
    });
    expect(a.red).toBe("testnet");
    expect(a.cuenta).toBe(integrador.publicKey());
    expect(a.url).toBe(`${TESTNET.explorador}/tx/${a.tx}`);
  });
});

// leerSello contra un Horizon simulado que pagina de a 10 por defecto, como el real.
function horizonConOperaciones(opts: { successful?: boolean; ops: Record<string, unknown>[] }) {
  const memo = Buffer.from(sello.compromiso, "hex").toString("base64");
  return {
    transactions: () => ({
      transaction: () => ({
        call: async () => ({
          hash: "h",
          ledger_attr: 5,
          created_at: "2026-10-12T00:00:00Z",
          source_account: canal.publicKey(),
          memo_type: "hash",
          memo,
          successful: opts.successful,
        }),
      }),
    }),
    operations: () => {
      let limite = 10;
      const q = {
        forTransaction: () => q,
        limit: (n: number) => {
          limite = n;
          return q;
        },
        call: async () => ({ records: opts.ops.slice(0, limite) }),
      };
      return q;
    },
  } as unknown as ServidorAnclaje;
}
const opSello = () => ({
  type: "manage_data",
  name: "pacta",
  value: Buffer.from(metadatosSello(sello)).toString("base64"),
  source_account: integrador.publicKey(),
});
const opPago = { type: "payment" };

describe("leerSello (Horizon simulado)", () => {
  it("lee el Sello y atribuye la cuenta al origen de la operación, no al canal", async () => {
    const l = await leerSello("h", TESTNET, horizonConOperaciones({ ops: [opSello()] }));
    expect(l?.sello.compromiso).toBe(sello.compromiso);
    expect(l?.cuenta).toBe(integrador.publicKey());
  });

  it("una transacción fallida no es un Sello", async () => {
    expect(await leerSello("h", TESTNET, horizonConOperaciones({ successful: false, ops: [opSello()] }))).toBeNull();
  });

  it("encuentra el Sello aunque haya más de 10 operaciones", async () => {
    const ops = [...Array.from({ length: 12 }, () => opPago), opSello()];
    const l = await leerSello("h", TESTNET, horizonConOperaciones({ ops }));
    expect(l?.sello.plantilla).toBe(sello.plantilla);
  });

  it("dos manage_data pacta no son un Sello", async () => {
    expect(await leerSello("h", TESTNET, horizonConOperaciones({ ops: [opSello(), opSello()] }))).toBeNull();
  });
});

// Firmante simulado: usa un Keypair por dentro pero solo expone clavePublica y firmar.
function firmanteSimulado(kp: Keypair, asincrono = false): Firmante {
  return {
    clavePublica: kp.publicKey(),
    firmar: asincrono
      ? async (h) => {
          await new Promise((r) => setTimeout(r, 1));
          return new Uint8Array(kp.sign(Buffer.from(h)));
        }
      : (h) => new Uint8Array(kp.sign(Buffer.from(h))),
  };
}

describe("firmante externo", () => {
  it("firmanteDeKeypair expone la clave pública y firma", () => {
    expect(firmanteDeKeypair(integrador).clavePublica).toBe(integrador.publicKey());
  });

  it("caso simple: mismo XDR y hash que con Keypair", async () => {
    const a = await prepararSello(sello, integrador, base);
    const b = await prepararSello(sello, firmanteSimulado(integrador), base);
    expect(b.xdr).toBe(a.xdr);
    expect(b.hash).toBe(a.hash);
  });

  it("con canal: mismo XDR y hash que con Keypair", async () => {
    const a = await prepararSello(sello, integrador, { ...base, canal });
    const b = await prepararSello(sello, firmanteSimulado(integrador), { ...base, canal: firmanteSimulado(canal) });
    expect(b.xdr).toBe(a.xdr);
    expect(b.hash).toBe(a.hash);
  });

  it("con fee-bump: mismo XDR y hash que con Keypair", async () => {
    const a = await prepararSello(sello, integrador, { ...base, feeBump: { pagador } });
    const b = await prepararSello(sello, firmanteSimulado(integrador), { ...base, feeBump: { pagador: firmanteSimulado(pagador) } });
    expect(b.xdr).toBe(a.xdr);
    expect(b.hash).toBe(a.hash);
    expect(b.conFeeBump).toBe(true);
  });

  it("un firmante asíncrono funciona", async () => {
    const a = await prepararSello(sello, integrador, base);
    const b = await prepararSello(sello, firmanteSimulado(integrador, true), base);
    expect(b.xdr).toBe(a.xdr);
  });

  it("una firma inválida (bytes al azar) hace que prepararSello lance", async () => {
    const malo: Firmante = { clavePublica: integrador.publicKey(), firmar: () => new Uint8Array(64).fill(7) };
    await expect(prepararSello(sello, malo, base)).rejects.toThrow(/no verifica/);
  });

  it("una firma de otra clave hace que prepararSello lance, también en canal y fee-bump", async () => {
    const otra = Keypair.random();
    const ajeno = (kp: Keypair): Firmante => ({
      clavePublica: kp.publicKey(),
      firmar: (h) => new Uint8Array(otra.sign(Buffer.from(h))),
    });
    await expect(prepararSello(sello, ajeno(integrador), base)).rejects.toThrow(/no verifica/);
    await expect(prepararSello(sello, integrador, { ...base, canal: ajeno(canal) })).rejects.toThrow(/no verifica/);
    await expect(prepararSello(sello, integrador, { ...base, feeBump: { pagador: ajeno(pagador) } })).rejects.toThrow(/no verifica/);
  });

  it("una firma de largo incorrecto lanza", async () => {
    const corto: Firmante = { clavePublica: integrador.publicKey(), firmar: () => new Uint8Array(10) };
    await expect(prepararSello(sello, corto, base)).rejects.toThrow(/no verifica/);
  });

  it("canal/pagador de una Parte siguen prohibidos con firmante externo", async () => {
    await expect(
      prepararSello(sello, integrador, { ...base, canal: firmanteSimulado(canal), clavesDePartes: [canal.publicKey()] }),
    ).rejects.toThrow(/Integrador/);
  });
});
