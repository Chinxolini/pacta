// Firma: clave Ed25519 nueva por contrato, nunca reutilizada. Una clave por
// persona repetida en cada contrato los vincularía entre sí (EDPB §64).
//
// La firma sigue SEP-53 (Sign and Verify Messages), verificable por un
// tercero con `stellar message verify`:
//   firma = ed25519(SHA-256("Stellar Signed Message:\n" || mensaje))
//
// La passkey (WebAuthn) autoriza en el dispositivo: huella o cara. En esta
// iteración no se verifica on-chain; queda registrada en el Documento.

import { Keypair } from "@stellar/stellar-sdk";
import { aBase64, aHex, aleatorio, concatenar, deBase64, sha256, utf8 } from "./bytes";
import { contenidoFirmable, type Autorizacion, type Documento, type FirmaParte, type RolParte } from "./documento";

const PREFIJO_SEP53 = utf8("Stellar Signed Message:\n");

export async function hashSep53(mensaje: string): Promise<Uint8Array> {
  return sha256(concatenar(PREFIJO_SEP53, utf8(mensaje)));
}

export async function firmarMensaje(mensaje: string, clave: Keypair): Promise<string> {
  return aBase64(clave.sign(await hashSep53(mensaje)));
}

export async function verificarMensaje(mensaje: string, firmaB64: string, clavePublica: string): Promise<boolean> {
  try {
    return Keypair.fromPublicKey(clavePublica).verify(await hashSep53(mensaje), deBase64(firmaB64));
  } catch {
    return false;
  }
}

/** Clave nueva para un solo contrato. */
export function nuevaClaveContrato(): Keypair {
  return Keypair.random();
}

/** Desafío que la passkey firma: la huella del contenido a firmar. */
export async function desafioDeFirma(doc: Documento): Promise<Uint8Array> {
  return sha256(utf8(contenidoFirmable(doc)));
}

export async function firmarDocumento(
  doc: Documento,
  rol: RolParte,
  clave: Keypair,
  autorizacion: Autorizacion,
  ahora: Date = new Date(),
): Promise<Documento> {
  if (doc.firmas.some((f) => f.rol === rol)) throw new Error(`${rol} ya firmó`);
  if (doc.firmas.some((f) => f.clavePublica === clave.publicKey()))
    throw new Error("cada Parte firma con su propia clave");
  const firma: FirmaParte = {
    rol,
    clavePublica: clave.publicKey(),
    firma: await firmarMensaje(contenidoFirmable(doc), clave),
    firmadoEn: ahora.toISOString(),
    autorizacion,
  };
  // Orden estable: acreedor antes que deudor.
  const firmas = [...doc.firmas, firma].sort((a, b) => a.rol.localeCompare(b.rol));
  return { ...doc, firmas };
}

export async function verificarFirma(doc: Documento, firma: FirmaParte): Promise<boolean> {
  return verificarMensaje(contenidoFirmable(doc), firma.firma, firma.clavePublica);
}

export async function verificarFirmas(doc: Documento): Promise<boolean> {
  if (doc.firmas.length !== 2) return false;
  const resultados = await Promise.all(doc.firmas.map((f) => verificarFirma(doc, f)));
  return resultados.every(Boolean);
}

// ——— Passkey (WebAuthn) ———

function b64url(bytes: Uint8Array): string {
  return aBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deB64url(s: string): Uint8Array {
  return deBase64(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
}

export function passkeyDisponible(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
}

/**
 * Pide la huella o la cara en el dispositivo. La primera vez crea una passkey
 * para la etiqueta dada; después la reutiliza con el desafío nuevo.
 * Devuelve la credencial usada y el desafío, para dejar constancia en el
 * Documento. Lanza si el usuario cancela.
 */
export async function autorizarConPasskey(opciones: {
  etiqueta: string;
  desafio: Uint8Array;
  credencialExistente?: string;
}): Promise<Autorizacion & { tipo: "passkey" }> {
  if (!passkeyDisponible()) throw new Error("Este navegador no soporta passkeys");
  const challenge = opciones.desafio as BufferSource;
  let credencial: string;
  if (opciones.credencialExistente) {
    const r = (await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: "public-key", id: deB64url(opciones.credencialExistente) as BufferSource }],
        userVerification: "required",
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!r) throw new Error("Autorización cancelada");
    credencial = b64url(new Uint8Array(r.rawId));
  } else {
    const r = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "Pacta (demo)" },
        user: {
          id: aleatorio(16) as BufferSource,
          name: `${opciones.etiqueta.toLowerCase()}@pacta-demo`,
          displayName: `Pacta · ${opciones.etiqueta}`,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: { userVerification: "required", residentKey: "preferred" },
        timeout: 60_000,
        attestation: "none",
      },
    })) as PublicKeyCredential | null;
    if (!r) throw new Error("Autorización cancelada");
    credencial = b64url(new Uint8Array(r.rawId));
  }
  return { tipo: "passkey", credencial, desafio: aHex(opciones.desafio) };
}
