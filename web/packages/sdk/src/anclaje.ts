// Anclaje Stellar: el Sello va a la cadena desde la cuenta del Integrador,
// nunca desde cuentas de las Partes.
//
// Una sola transacción por contrato, cuando las dos Partes ya firmaron:
//   memo_hash   = compromiso (32 bytes)
//   manage_data = "pacta" → "1;pacta/prestamo@1.2.0"
// La fecha es la del ledger. Nada más viaja. Los cambios de Estado no se
// anclan (propuesta P9, en evaluación).
//
// Testnet se resetea varias veces al año: los sellos de la demo no son
// permanentes. Un anclaje real va en mainnet.

import {
  Account,
  FeeBumpTransaction,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { aBase64, aHex, deBase64, deHex, deUtf8 } from "./bytes";
import { construirSello, leerMetadatosSello, metadatosSello, type Sello } from "./sello";

export interface Red {
  nombre: "testnet" | "mainnet";
  horizon: string;
  passphrase: string;
  explorador: string;
  friendbot: string | null;
}

export const TESTNET: Red = {
  nombre: "testnet",
  horizon: "https://horizon-testnet.stellar.org",
  passphrase: Networks.TESTNET,
  explorador: "https://stellar.expert/explorer/testnet",
  friendbot: "https://friendbot.stellar.org",
};

export const MAINNET: Red = {
  nombre: "mainnet",
  horizon: "https://horizon.stellar.org",
  passphrase: Networks.PUBLIC,
  explorador: "https://stellar.expert/explorer/public",
  friendbot: null,
};

export const CLAVE_DATOS = "pacta";

/** Ventana de validez por defecto de la transacción, en segundos. */
export const VENTANA_SEGUNDOS = 180;

export interface Anclaje {
  red: Red["nombre"];
  tx: string;
  ledger: number;
  fecha: string;
  cuenta: string;
  url: string;
}

export interface SelloEnCadena {
  sello: Sello;
  tx: string;
  ledger: number;
  fecha: string;
  cuenta: string;
  url: string;
}

/** Cuenta efímera de testnet financiada por friendbot. */
export async function crearCuentaTestnet(red: Red = TESTNET): Promise<Keypair> {
  if (!red.friendbot) throw new Error("Esta red no tiene friendbot");
  const kp = Keypair.random();
  const r = await fetch(`${red.friendbot}?addr=${encodeURIComponent(kp.publicKey())}`);
  if (!r.ok) throw new Error(`friendbot respondió ${r.status}`);
  return kp;
}

/**
 * Firmante externo (KMS, HSM, bóveda): firma sin entregar la clave secreta.
 * Cualquier rol de firma del anclaje acepta un `Keypair` o un `Firmante`.
 */
export interface Firmante {
  /** Clave pública G… de la cuenta. */
  clavePublica: string;
  /** Firma el hash de la transacción (32 bytes) y devuelve la firma Ed25519 (64 bytes). */
  firmar(hash: Uint8Array): Promise<Uint8Array> | Uint8Array;
}

/** Adapta un Keypair a Firmante. */
export function firmanteDeKeypair(kp: Keypair): Firmante {
  return { clavePublica: kp.publicKey(), firmar: (hash) => kp.sign(Buffer.from(hash)) };
}

function comoFirmante(f: Keypair | Firmante): Firmante {
  return "clavePublica" in f ? f : firmanteDeKeypair(f);
}

/** Firma con el firmante y agrega la firma solo si verifica contra su clave pública. */
async function firmarCon(tx: Transaction | FeeBumpTransaction, firmante: Firmante): Promise<void> {
  const hash = new Uint8Array(tx.hash());
  const firma = await firmante.firmar(hash);
  let valida = false;
  try {
    valida = firma.length === 64 && Keypair.fromPublicKey(firmante.clavePublica).verify(Buffer.from(hash), Buffer.from(firma));
  } catch {
    valida = false;
  }
  if (!valida)
    throw new Error(`La firma devuelta por el firmante de la cuenta ${firmante.clavePublica} no verifica contra su clave pública; revisa la configuración del servicio de claves`);
  tx.addSignature(firmante.clavePublica, aBase64(firma));
}

function esSelloValido(s: Sello): boolean {
  try {
    if (Object.keys(s).some((k) => !["version", "compromiso", "plantilla"].includes(k))) return false;
    construirSello({
      compromiso: s.compromiso,
      plantilla: { id: s.plantilla.split("@")[0], version: s.plantilla.split("@")[1] },
    });
    return true;
  } catch {
    return false;
  }
}

/** Lo mínimo que el SDK usa de Horizon; permite inyectar un servidor propio o simulado. */
export type ServidorAnclaje = Pick<Horizon.Server, "submitTransaction" | "transactions" | "operations" | "loadAccount">;

export interface OpcionesPreparar {
  red?: Red;
  clavesDePartes?: string[];
  /** Comisión máxima por operación, en stroops. Por defecto BASE_FEE. */
  comisionMaxima?: string;
  /**
   * Número de secuencia actual de la cuenta fuente de la transacción (el canal,
   * si hay; si no, la del Integrador). Si se omite, se consulta a Horizon.
   * La transacción usa secuencia + 1.
   */
  secuencia?: string;
  /**
   * Cuenta canal: fuente de la transacción (pone secuencia y comisión). El Sello
   * sigue atribuido a la cuenta del Integrador, que es el origen de la operación.
   * Firman ambas claves. Si el canal es la misma cuenta que el Integrador se descarta
   * en silencio (no hay nada que separar) y la transacción sale sin canal.
   */
  canal?: Keypair | Firmante;
  /** Envuelve la transacción en un fee-bump pagado por otra cuenta. */
  feeBump?: { pagador: Keypair | Firmante; comisionMaxima?: string };
  /** Límites de tiempo exactos (segundos Unix). Si se omiten, ahora + ventanaSegundos. */
  timebounds?: { minTime: number; maxTime: number };
  ventanaSegundos?: number;
  servidor?: ServidorAnclaje;
}

/** Transacción armada y firmada, lista para enviar. Guárdala antes de enviar. */
export interface SelloPreparado {
  /** XDR del sobre firmado (fee-bump si lo hay). Es lo que se envía y se reenvía. */
  xdr: string;
  /** Hash de la transacción enviada (la externa, si hay fee-bump). Con él se consulta la cadena. */
  hash: string;
  /** Hash de la transacción interna; igual a `hash` si no hay fee-bump. */
  hashInterno: string;
  red: Red["nombre"];
  /** Cuenta del Integrador, a la que queda atribuido el Sello. */
  cuenta: string;
  /** Segundo Unix tras el cual la transacción ya no puede entrar. Pasado ese plazo sin inclusión es seguro reconstruir. */
  expiraEn: number;
  conFeeBump: boolean;
}

export interface OpcionesEnviar {
  red?: Red;
  servidor?: ServidorAnclaje;
  /** Veces que se intenta enviar y confirmar. Por defecto 5. */
  intentos?: number;
  /** Espera entre intentos, en ms. Por defecto 2000. */
  intervaloMs?: number;
  /**
   * Tope de tiempo total para enviar y confirmar, en ms (por defecto 25000). Al agotarse,
   * lanza un error que indica si es seguro reconstruir; el XDR sigue siendo reenviable.
   */
  tiempoMaximoMs?: number;
}

/** Tope de tiempo por defecto de enviarSello/anclarSello: del orden del comportamiento previo a los reintentos. */
export const TIEMPO_MAXIMO_MS = 25_000;

function redPorNombre(nombre: Red["nombre"]): Red {
  return nombre === "mainnet" ? MAINNET : TESTNET;
}

/**
 * Arma y firma la transacción del Sello sin enviarla. El XDR y el hash son los
 * que hay que guardar antes de enviar: reenviar ese mismo XDR nunca produce un
 * segundo Sello. Solo acepta un Sello construido con construirSello.
 */
export async function prepararSello(
  sello: Sello,
  cuentaIntegrador: Keypair | Firmante,
  opciones: OpcionesPreparar = {},
): Promise<SelloPreparado> {
  const red = opciones.red ?? TESTNET;
  const firmanteIntegrador = comoFirmante(cuentaIntegrador);
  if (!esSelloValido(sello)) throw new Error("Solo se ancla un Sello válido");
  // En Stellar maxTime 0 significa "sin vencimiento": no habría plazo tras el cual reconstruir sea seguro.
  if (opciones.timebounds && !(opciones.timebounds.maxTime > 0))
    throw new Error("timebounds.maxTime debe ser mayor que 0: una transacción sin vencimiento no permite reintentar con seguridad");
  const integrador = firmanteIntegrador.clavePublica;
  const firmanteCanal = opciones.canal ? comoFirmante(opciones.canal) : undefined;
  const canal = firmanteCanal && firmanteCanal.clavePublica !== integrador ? firmanteCanal : undefined;
  const firmantePagador = opciones.feeBump ? comoFirmante(opciones.feeBump.pagador) : undefined;
  const prohibidas = opciones.clavesDePartes ?? [];
  for (const k of [integrador, canal?.clavePublica, firmantePagador?.clavePublica])
    if (k && prohibidas.includes(k))
      throw new Error("El Sello se ancla desde la cuenta del Integrador, nunca desde la de una Parte");

  const fuente = canal ? canal.clavePublica : integrador;
  let cuenta: Account;
  if (opciones.secuencia !== undefined) {
    cuenta = new Account(fuente, opciones.secuencia);
  } else {
    const server = opciones.servidor ?? new Horizon.Server(red.horizon);
    const c = await server.loadAccount(fuente);
    cuenta = new Account(fuente, c.sequenceNumber());
  }

  const comision = opciones.comisionMaxima ?? BASE_FEE;
  const b = new TransactionBuilder(cuenta, { fee: comision, networkPassphrase: red.passphrase })
    .addOperation(
      Operation.manageData({
        name: CLAVE_DATOS,
        value: metadatosSello(sello),
        ...(canal ? { source: integrador } : {}),
      }),
    )
    .addMemo(Memo.hash(sello.compromiso));
  if (opciones.timebounds) b.setTimebounds(opciones.timebounds.minTime, opciones.timebounds.maxTime);
  else b.setTimeout(opciones.ventanaSegundos ?? VENTANA_SEGUNDOS);
  const interna = b.build();
  await firmarCon(interna, firmanteIntegrador);
  if (canal) await firmarCon(interna, canal);
  const hashInterno = aHex(interna.hash());

  let final: Transaction | FeeBumpTransaction = interna;
  if (opciones.feeBump && firmantePagador) {
    const f = TransactionBuilder.buildFeeBumpTransaction(
      firmantePagador.clavePublica,
      opciones.feeBump.comisionMaxima ?? comision,
      interna,
      red.passphrase,
    );
    await firmarCon(f, firmantePagador);
    final = f;
  }
  return {
    xdr: final.toXDR(),
    hash: aHex(final.hash()),
    hashInterno,
    red: red.nombre,
    cuenta: integrador,
    expiraEn: Number(interna.timeBounds?.maxTime ?? 0),
    conFeeBump: final instanceof FeeBumpTransaction,
  };
}

type DetalleTx = { hash: string; ledger_attr: number; created_at: string; successful?: boolean };

function respuestaDe(e: unknown): { status?: number; data?: { extras?: { result_codes?: unknown } } } | undefined {
  const x = e as { response?: unknown; getResponse?: () => unknown } | null;
  return (x?.response ?? (typeof x?.getResponse === "function" ? x.getResponse() : undefined)) as
    | { status?: number; data?: { extras?: { result_codes?: unknown } } }
    | undefined;
}

/** Códigos de rechazo que se resuelven reintentando el mismo XDR (la comisión de red puede bajar). */
const RECHAZOS_TRANSITORIOS = ["tx_insufficient_fee"];

/**
 * Rechazo definitivo de la red (400 con result_codes), salvo los transitorios;
 * todo lo demás es ambiguo y se resuelve consultando el hash.
 */
function esRechazoDefinitivo(e: unknown): boolean {
  const r = respuestaDe(e);
  if (r?.status !== 400 || !r.data?.extras?.result_codes) return false;
  const codigo = (r.data.extras.result_codes as { transaction?: string }).transaction;
  return !(codigo && RECHAZOS_TRANSITORIOS.includes(codigo));
}

/** Resultado de consultar la cadena: se distingue "no está" (404) de "no sé" (429, 500, red caída). */
type Consulta = { estado: "incluida"; detalle: DetalleTx } | { estado: "no_esta" } | { estado: "desconocido" };

/** Margen sobre `expiraEn` antes de afirmar que una transacción ya no puede entrar (desfase de relojes y de ledger). */
const MARGEN_VENCIMIENTO_S = 30;

/**
 * Envía el XDR de un SelloPreparado. Es idempotente: antes de enviar y después
 * de cualquier error consulta la cadena por el hash, y reenvía siempre el mismo
 * XDR, así que un reintento no puede producir un segundo Sello. Si no logra
 * confirmar, lanza; mientras no pase `expiraEn` hay que volver a llamarla con el
 * mismo preparado, no reconstruir la transacción.
 */
export async function enviarSello(preparado: SelloPreparado, opciones: OpcionesEnviar = {}): Promise<Anclaje> {
  const red = opciones.red ?? redPorNombre(preparado.red);
  const server = opciones.servidor ?? new Horizon.Server(red.horizon);
  const tx = TransactionBuilder.fromXDR(preparado.xdr, red.passphrase);
  if (aHex(tx.hash()) !== preparado.hash) throw new Error("El XDR no corresponde a la red indicada o al hash del preparado");

  // Con fee-bump se consultan el hash externo y el interno: basta que uno esté en la cadena.
  const hashes = preparado.hashInterno && preparado.hashInterno !== preparado.hash
    ? [preparado.hash, preparado.hashInterno]
    : [preparado.hash];
  const consultar = async (): Promise<Consulta> => {
    let desconocido = false;
    for (const h of hashes) {
      try {
        const detalle = (await server.transactions().transaction(h).call()) as unknown as DetalleTx;
        return { estado: "incluida", detalle };
      } catch (e) {
        if (respuestaDe(e)?.status !== 404) desconocido = true; // 429, 5xx, red caída: no sabemos
      }
    }
    return { estado: desconocido ? "desconocido" : "no_esta" };
  };
  const aAnclaje = (d: DetalleTx): Anclaje => {
    if (d.successful === false) throw new Error(`La transacción ${preparado.hash} entró a la cadena pero falló`);
    return {
      red: red.nombre,
      tx: preparado.hash,
      ledger: d.ledger_attr,
      fecha: d.created_at,
      cuenta: preparado.cuenta,
      url: `${red.explorador}/tx/${preparado.hash}`,
    };
  };

  const previa = await consultar();
  if (previa.estado === "incluida") return aAnclaje(previa.detalle);

  const intentos = opciones.intentos ?? 5;
  const intervalo = opciones.intervaloMs ?? 2000;
  const tope = opciones.tiempoMaximoMs ?? TIEMPO_MAXIMO_MS;
  const inicio = Date.now();
  let ultima: Consulta = previa;
  for (let i = 0; i < intentos && (i === 0 || Date.now() - inicio < tope); i++) {
    let rechazo: unknown = null;
    try {
      await server.submitTransaction(tx);
    } catch (e) {
      if (esRechazoDefinitivo(e)) rechazo = e;
    }
    // Se consulta siempre tras el envío: un tx_bad_seq puede significar que ya entró.
    ultima = await consultar();
    if (ultima.estado === "incluida") return aAnclaje(ultima.detalle);
    if (rechazo) {
      const codigos = JSON.stringify(respuestaDe(rechazo)?.data?.extras?.result_codes);
      throw new Error(
        `Stellar rechazó la transacción ${preparado.hash}: ${codigos}` +
          (ultima.estado === "desconocido" ? " (no se pudo comprobar si ya estaba en la cadena)" : ""),
      );
    }
    const restante = tope - (Date.now() - inicio);
    if (i < intentos - 1 && intervalo > 0 && restante > 0)
      await new Promise((r) => setTimeout(r, Math.min(intervalo, restante)));
  }

  const base = `No se pudo confirmar la transacción ${preparado.hash}. `;
  if (ultima.estado === "desconocido")
    throw new Error(base + "No se pudo consultar la cadena: su estado es desconocido. No reconstruyas; vuelve a llamar enviarSello con el mismo preparado.");
  if (Date.now() / 1000 <= preparado.expiraEn + MARGEN_VENCIMIENTO_S)
    throw new Error(base + "Aún puede entrar: vuelve a llamar enviarSello con el mismo preparado; no reconstruyas.");
  // Vencida con margen: una última consulta decide si es seguro reconstruir.
  const final = await consultar();
  if (final.estado === "incluida") return aAnclaje(final.detalle);
  if (final.estado === "desconocido")
    throw new Error(base + "Su plazo venció, pero no se pudo consultar la cadena: su estado es desconocido. No reconstruyas todavía.");
  throw new Error(base + "Su plazo venció y la cadena confirma que no entró: ya es seguro reconstruirla con prepararSello.");
}

/**
 * Ancla un Sello en una llamada: prepararSello + enviarSello. Para reintentos
 * sin riesgo de doble Sello, usa los dos pasos y guarda el preparado.
 */
export async function anclarSello(
  sello: Sello,
  cuentaIntegrador: Keypair | Firmante,
  opciones: OpcionesPreparar & Pick<OpcionesEnviar, "intentos" | "intervaloMs" | "tiempoMaximoMs"> = {},
): Promise<Anclaje> {
  const preparado = await prepararSello(sello, cuentaIntegrador, opciones);
  return enviarSello(preparado, {
    red: opciones.red,
    servidor: opciones.servidor,
    intentos: opciones.intentos,
    intervaloMs: opciones.intervaloMs,
    tiempoMaximoMs: opciones.tiempoMaximoMs,
  });
}

/** Lee un Sello desde una transacción. Devuelve null si la transacción no porta un Sello de Pacta. */
export async function leerSello(
  tx: string,
  red: Red = TESTNET,
  servidor?: Pick<ServidorAnclaje, "transactions" | "operations">,
): Promise<SelloEnCadena | null> {
  const server = servidor ?? new Horizon.Server(red.horizon);
  const t = await server.transactions().transaction(tx).call();
  // Una transacción fallida conserva el memo pero no es un Sello.
  if (t.successful === false) return null;
  if (t.memo_type !== "hash" || !t.memo) return null;
  const compromiso = aHex(deBase64(t.memo));
  // Horizon pagina de a 10 por defecto; una transacción admite hasta 100 operaciones.
  const ops = await server.operations().forTransaction(tx).limit(200).call();
  // Un Sello porta exactamente un manage_data con la clave de Pacta.
  const candidatas = ops.records.filter(
    (o) => o.type === "manage_data" && (o as unknown as { name: string }).name === CLAVE_DATOS,
  ) as unknown as { value?: string; source_account?: string }[];
  if (candidatas.length !== 1) return null;
  const op = candidatas[0];
  if (!op.value) return null;
  const meta = leerMetadatosSello(deUtf8(deBase64(op.value)));
  if (!meta) return null;
  return {
    sello: { ...meta, compromiso },
    tx: t.hash,
    ledger: t.ledger_attr,
    fecha: t.created_at,
    // Con cuenta canal, la fuente de la transacción es el canal; el Sello es de la cuenta de la operación.
    cuenta: op.source_account ?? t.source_account,
    url: `${red.explorador}/tx/${t.hash}`,
  };
}

/**
 * Lo que la transacción deja visible a cualquiera, para mostrarlo tal cual.
 * Útil para comprobar que no viajan nombres, montos ni claves.
 */
export function vistaPublica(sello: Sello): { memo_hash: string; manage_data: Record<string, string> } {
  return { memo_hash: aBase64(deHex(sello.compromiso)), manage_data: { [CLAVE_DATOS]: metadatosSello(sello) } };
}
