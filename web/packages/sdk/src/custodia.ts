// Custodia: el Documento completo y la Sal se guardan cifrados (AES-GCM) y la
// clave se reparte 2 de 3 (Shamir) entre Acreedor, Deudor e Integrador.
// Dos porciones cualesquiera reconstruyen; una sola no revela nada.
//
// Protege contra la destrucción unilateral: ninguna parte sola puede abrir ni
// perder el contrato. No reemplaza el Borrado: destruir una porción no cuenta
// como borrar (EDPB §51).

import { combine, split } from "shamir-secret-sharing";
import { aBase64, aleatorio, deBase64, deUtf8, utf8 } from "./bytes";
import { canonicalizar, type Documento } from "./documento";

/** Quién tiene una key share: las dos Partes y el Integrador. */
export type Rol = "acreedor" | "deudor" | "integrador";

export interface TextoCifrado {
  algoritmo: "AES-256-GCM";
  iv: string;
  datos: string;
}

export interface Custodia {
  contratoId: string;
  cifrado: TextoCifrado;
  porciones: Record<Rol, string>;
}

export interface Contenido {
  documento: Documento;
  sal: string;
}

const ROLES: Rol[] = ["acreedor", "deudor", "integrador"];

async function importarClave(bruta: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bruta as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function custodiar(documento: Documento, sal: string): Promise<Custodia> {
  const clave = aleatorio(32);
  const iv = aleatorio(12);
  const datos = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource, additionalData: utf8(documento.contratoId) as BufferSource },
      await importarClave(clave),
      utf8(canonicalizar({ documento, sal })) as BufferSource,
    ),
  );
  const partes = await split(clave, 3, 2);
  clave.fill(0);
  return {
    contratoId: documento.contratoId,
    cifrado: { algoritmo: "AES-256-GCM", iv: aBase64(iv), datos: aBase64(datos) },
    porciones: Object.fromEntries(ROLES.map((r, i) => [r, aBase64(partes[i])])) as Record<Rol, string>,
  };
}

/** Reconstruye con dos porciones cualesquiera. Con una sola, falla. */
export async function recuperar(contratoId: string, cifrado: TextoCifrado, porciones: string[]): Promise<Contenido> {
  const distintas = [...new Set(porciones)];
  if (distintas.length < 2) throw new Error("Se necesitan dos porciones distintas de la clave");
  const clave = await combine(distintas.map(deBase64));
  try {
    const claro = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: deBase64(cifrado.iv) as BufferSource, additionalData: utf8(contratoId) as BufferSource },
      await importarClave(clave),
      deBase64(cifrado.datos) as BufferSource,
    );
    return JSON.parse(deUtf8(new Uint8Array(claro))) as Contenido;
  } catch {
    throw new Error("Las porciones no abren este contrato");
  } finally {
    clave.fill(0);
  }
}
