// Documento completo: el contrato en claro con partes, montos, plazos y firmas.
// Es lo que se presenta en juicio. Nunca va a la cadena.
//
// Forma canónica JCS (RFC 8785): claves ordenadas, sin espacios. Dos
// implementaciones del mismo documento dan los mismos bytes y el mismo Sello.

import { aHex, aleatorio } from "./bytes";
import {
  generarTexto,
  PLANTILLA_PRESTAMO,
  validarParametros,
  type ParametrosPrestamo,
  type ReferenciaPlantilla,
} from "./plantilla";

export const PERFIL_DOCUMENTO = "pacta/documento/1";

export type RolParte = "acreedor" | "deudor";

export type Autorizacion =
  | { tipo: "passkey"; credencial: string; desafio: string }
  | { tipo: "simulada"; motivo: string };

export interface FirmaParte {
  rol: RolParte;
  /** Clave Ed25519 nueva, exclusiva de este contrato (G…). */
  clavePublica: string;
  /** Firma SEP-53 sobre el contenido firmable, base64. */
  firma: string;
  firmadoEn: string;
  /** Cómo autorizó la Parte en su dispositivo. No se verifica on-chain. */
  autorizacion: Autorizacion;
}

export interface Documento {
  perfil: typeof PERFIL_DOCUMENTO;
  /** Aleatorio: no deriva de nada de las Partes. */
  contratoId: string;
  plantilla: ReferenciaPlantilla;
  parametros: ParametrosPrestamo;
  texto: string;
  creadoEn: string;
  firmas: FirmaParte[];
}

function tieneSurrogadoSuelto(s: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
}

function cadenaJcs(s: string): string {
  if (tieneSurrogadoSuelto(s)) throw new Error("JCS: cadena con sustituto UTF-16 suelto (no es Unicode válido)");
  return JSON.stringify(s);
}

function canonico(valor: unknown, ruta: unknown[]): string {
  if (valor === null) return "null";
  switch (typeof valor) {
    case "boolean":
      return valor ? "true" : "false";
    case "string":
      return cadenaJcs(valor);
    case "number":
      // JSON.stringify da la forma ECMAScript que exige RFC 8785 (incluye -0 → "0").
      if (!Number.isFinite(valor)) throw new Error("JCS: número no finito (NaN o Infinity no son JSON)");
      return JSON.stringify(valor);
    case "object":
      break;
    default:
      throw new Error(`JCS: valor no JSON (${typeof valor})`);
  }
  if (ruta.includes(valor)) throw new Error("JCS: referencia circular");
  const sub = [...ruta, valor];
  if (Array.isArray(valor)) return "[" + valor.map((v) => canonico(v, sub)).join(",") + "]";
  const proto = Object.getPrototypeOf(valor);
  if (proto !== Object.prototype && proto !== null) throw new Error("JCS: objeto no JSON (solo objetos planos y arreglos)");
  const obj = valor as Record<string, unknown>;
  // Orden por unidades de código UTF-16: es el orden por defecto de sort() sobre cadenas.
  const claves = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return "{" + claves.map((k) => cadenaJcs(k) + ":" + canonico(obj[k], sub)).join(",") + "}";
}

/**
 * Serialización canónica JCS (RFC 8785) de un valor JSON. Omite las claves de
 * objeto con valor undefined (comportamiento heredado, necesario para
 * contenidoFirmable). Lanza error con NaN, Infinity, undefined en arreglos,
 * funciones, símbolos, BigInt, objetos no planos (Date, Map…), referencias
 * circulares y cadenas con sustitutos UTF-16 sueltos.
 */
export function canonicalizar(valor: unknown): string {
  return canonico(valor, []);
}

export function nuevoContratoId(): string {
  return "ctr_" + aHex(aleatorio(16));
}

export function crearDocumento(opciones: {
  parametros: ParametrosPrestamo;
  ahora?: Date;
  contratoId?: string;
}): Documento {
  const parametros = validarParametros(opciones.parametros);
  return {
    perfil: PERFIL_DOCUMENTO,
    contratoId: opciones.contratoId ?? nuevoContratoId(),
    plantilla: { ...PLANTILLA_PRESTAMO },
    parametros,
    texto: generarTexto(parametros),
    creadoEn: (opciones.ahora ?? new Date()).toISOString(),
    firmas: [],
  };
}

/** Lo que firma cada Parte: el documento sin el arreglo de firmas. */
export function contenidoFirmable(doc: Documento): string {
  return canonicalizar({ ...doc, firmas: undefined });
}

/** Documento completo en forma canónica: lo que entra al Sello. */
export function documentoCanonico(doc: Documento): string {
  return canonicalizar(doc);
}

export function firmaDe(doc: Documento, rol: RolParte): FirmaParte | undefined {
  return doc.firmas.find((f) => f.rol === rol);
}

export function estaCompleto(doc: Documento): boolean {
  return Boolean(firmaDe(doc, "acreedor") && firmaDe(doc, "deudor"));
}
