// Sello: lo que queda en Stellar. Huella con salt del Documento completo
// firmado, plantilla y fecha (la del ledger). Sin Estado: en la cadena queda
// solo el contrato firmado (propuesta P9, en evaluación).
//
//   compromiso = SHA-256(sal || documento canónico)       (EDPB 02/2025 §52)
//
// Sin la Sal, nadie puede recalcular ni reconocer el Sello.

import { aHex, concatenar, deHex, aleatorio, igualesTiempoConstante, sha256, utf8 } from "./bytes";
import { documentoCanonico, type Documento } from "./documento";
import type { ReferenciaPlantilla } from "./plantilla";

/** Estados que anclaban los sellos antiguos. El lector los acepta y los ignora; el SDK ya no los ancla. */
const ESTADOS_LEGADOS = ["vigente", "pagado", "resciliado", "bloqueado"];

export const VERSION_SELLO = 1;

export interface Sello {
  version: typeof VERSION_SELLO;
  /** 32 bytes en hex. Va en el memo_hash de la transacción. */
  compromiso: string;
  /** id@versión de la Plantilla pública. */
  plantilla: string;
}

const RE_COMPROMISO = /^[0-9a-f]{64}$/;

/** Sal aleatoria de 256 bits, una por contrato. */
export function generarSal(): string {
  return aHex(aleatorio(32));
}

export async function calcularCompromiso(doc: Documento, salHex: string): Promise<string> {
  const sal = deHex(salHex);
  if (sal.length !== 32) throw new Error("la Sal debe tener 32 bytes");
  return aHex(await sha256(concatenar(sal, utf8(documentoCanonico(doc)))));
}

export async function verificarCompromiso(doc: Documento, salHex: string, compromiso: string): Promise<boolean> {
  try {
    const calculado = await calcularCompromiso(doc, salHex);
    return igualesTiempoConstante(deHex(calculado), deHex(compromiso.toLowerCase()));
  } catch {
    return false;
  }
}

export function referenciaPlantilla(p: ReferenciaPlantilla): string {
  return `${p.id}@${p.version}`;
}

/**
 * Construye un Sello. Es la única forma de obtener algo anclable: valida que
 * el compromiso sea una huella de 32 bytes y que nada más viaje con él.
 */
export function construirSello(opciones: { compromiso: string; plantilla: ReferenciaPlantilla }): Sello {
  if (!RE_COMPROMISO.test(opciones.compromiso)) throw new Error("compromiso: 32 bytes en hex minúscula");
  if ("estado" in opciones) throw new Error("el Sello no lleva Estado: solo se sella el contrato firmado");
  const plantilla = referenciaPlantilla(opciones.plantilla);
  if (!/^[a-z0-9/-]{1,32}@\d+\.\d+\.\d+$/.test(plantilla)) throw new Error("plantilla: id@semver");
  return Object.freeze({ version: VERSION_SELLO, compromiso: opciones.compromiso, plantilla });
}

/**
 * Metadatos del Sello que viajan junto al memo_hash (manage_data, ≤ 64 bytes):
 * "1;pacta/prestamo@1.2.0". Ni partes, ni montos, ni claves, ni Estado.
 */
export function metadatosSello(sello: Sello): string {
  const s = `${sello.version};${sello.plantilla}`;
  if (utf8(s).length > 64) throw new Error("metadatos del Sello exceden 64 bytes");
  return s;
}

/**
 * Lee los metadatos. Acepta también los sellos antiguos de la demo, que traían
 * el Estado como tercer campo ("1;pacta/prestamo@1.0.0;vigente"); ese campo se ignora.
 */
export function leerMetadatosSello(texto: string): Omit<Sello, "compromiso"> | null {
  const campos = texto.split(";");
  const [v, plantilla, estado] = campos;
  if (v !== String(VERSION_SELLO) || !plantilla || campos.length > 3) return null;
  if (campos.length === 3 && !ESTADOS_LEGADOS.includes(estado)) return null;
  return { version: VERSION_SELLO, plantilla };
}
