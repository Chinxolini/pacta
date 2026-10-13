// Registro del Integrador: lo único que persiste del contrato.
//
// Guarda solo el ciphertext (Documento + salt cifrados), su key share y el
// vínculo persona-clave. Nunca la salt ni el documento en plaintext: con la
// salt, el hash de la cadena sería identificable para él, y si le roban la
// base el atacante tendría todo (propuesta P6, en evaluación). Con su key
// share y la de una Parte se recupera el contrato; con una sola, no.

import type { TextoCifrado } from "./custodia";
import type { RegistroSupresion } from "./borrado";
import { contieneRut } from "./identidad";

export interface VinculoPersonaClave {
  rol: "acreedor" | "deudor";
  /** Identificador opaco de verificación (ver_…). Nunca el RUT. */
  verificacion: string;
  clavePublica: string;
}

export interface RegistroIntegrador {
  contratoId: string;
  compromiso: string;
  /** Documento + salt, cifrados. */
  cifrado: TextoCifrado;
  /** La key share del Integrador (Shamir 2 de 3). */
  porcionIntegrador: string;
  vinculos: VinculoPersonaClave[];
  /** Transacción del Sello del contrato firmado. */
  sellos: string[];
}

const CAMPOS: readonly (keyof RegistroIntegrador)[] = [
  "contratoId",
  "compromiso",
  "cifrado",
  "porcionIntegrador",
  "vinculos",
  "sellos",
];

/**
 * Lanza si el registro trae algo más que ciphertext, key share, vínculos y
 * referencias: una salt, un documento en plaintext o un RUT.
 */
export function validarRegistroIntegrador(r: RegistroIntegrador): void {
  const extra = Object.keys(r).filter((k) => !CAMPOS.includes(k as keyof RegistroIntegrador));
  if (extra.length) throw new Error(`El Integrador guarda solo el ciphertext y su key share; sobra: ${extra.join(", ")}`);
  // El ciphertext y la key share son bytes al azar en base64: no se revisan.
  const claro = { ...r, cifrado: undefined, porcionIntegrador: undefined };
  if (contieneRut(JSON.stringify(claro))) throw new Error("El registro del Integrador no puede contener un RUT");
  for (const v of r.vinculos)
    if (Object.keys(v).some((k) => !["rol", "verificacion", "clavePublica"].includes(k)))
      throw new Error("El vínculo persona-clave lleva solo rol, verificación y clave pública");
}

export class ErrorBloqueo extends Error {
  constructor(contratoId: string) {
    super(`El contrato ${contratoId} está bloqueado: no se abre por el flujo normal`);
    this.name = "ErrorBloqueo";
  }
}

/**
 * Lo que el Integrador persiste. La demo usa memoria; en producción, su base
 * de datos. No hay operación de borrado: el SDK no borra (propuestas P10 y
 * P11, en evaluación).
 */
export interface AlmacenIntegrador {
  guardar(r: RegistroIntegrador): void;
  /** Flujo normal. Lanza ErrorBloqueo si el contrato está bloqueado. */
  obtener(contratoId: string): RegistroIntegrador | undefined;
  existe(contratoId: string): boolean;
  bloquear(contratoId: string): void;
  estaBloqueado(contratoId: string): boolean;
  anotarSupresion(r: RegistroSupresion): void;
  supresiones(): RegistroSupresion[];
}

export function crearAlmacenMemoria(): AlmacenIntegrador {
  const datos = new Map<string, RegistroIntegrador>();
  const bloqueados = new Set<string>();
  const registros: RegistroSupresion[] = [];
  return {
    guardar: (r) => {
      validarRegistroIntegrador(r);
      if (bloqueados.has(r.contratoId)) throw new ErrorBloqueo(r.contratoId);
      datos.set(r.contratoId, structuredClone(r));
    },
    obtener: (id) => {
      if (bloqueados.has(id)) throw new ErrorBloqueo(id);
      const r = datos.get(id);
      return r ? structuredClone(r) : undefined;
    },
    existe: (id) => datos.has(id),
    bloquear: (id) => {
      if (!datos.has(id)) throw new Error("El Integrador no tiene ese contrato");
      bloqueados.add(id);
    },
    estaBloqueado: (id) => bloqueados.has(id),
    anotarSupresion: (r) => void registros.push(structuredClone(r)),
    supresiones: () => registros.map((r) => structuredClone(r)),
  };
}
