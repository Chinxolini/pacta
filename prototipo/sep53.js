// SEP-53 — Sign and Verify Messages (Final, v1.0.0, actualizado 2026-06-18)
// https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md
//
// Procedimiento exacto del estandar:
//   payload      = utf8("Stellar Signed Message:\n") || messageBytes
//   messageHash  = SHA256(payload)
//   signature    = ed25519_sign(messageHash)   -> 64 bytes
//
// Por que importa aca: el anclaje prueba que un manifiesto existia en una fecha,
// pero no quien lo declaro. La firma SEP-53 ata el manifiesto a una clave, y es
// verificable por un tercero con herramienta oficial:
//   stellar message verify --address G... --message <msg> --signature <b64>

const crypto = require("crypto");
const { Keypair } = require("@stellar/stellar-sdk");

const PREFIX = Buffer.from("Stellar Signed Message:\n", "utf8");

/** Construye el payload canonico del estandar. */
function encodeMessage(message) {
  const messageBytes = Buffer.isBuffer(message)
    ? message
    : Buffer.from(message, "utf8");
  return Buffer.concat([PREFIX, messageBytes]);
}

/** messageHash = SHA256(prefijo || mensaje) */
function messageHash(message) {
  return crypto.createHash("sha256").update(encodeMessage(message)).digest();
}

/** Firma un mensaje. Devuelve la firma de 64 bytes como Buffer.
 *  (keypair.sign devuelve Uint8Array; sin envolverlo, .toString("base64")
 *  entrega decimales separados por coma en vez de base64.) */
function signMessage(message, keypair) {
  return Buffer.from(keypair.sign(messageHash(message)));
}

/** Verifica una firma contra una direccion publica G... */
function verifyMessage(message, signature, publicKey) {
  const kp = Keypair.fromPublicKey(publicKey);
  const sig = Buffer.isBuffer(signature)
    ? signature
    : Buffer.from(signature, "base64");
  try {
    return kp.verify(messageHash(message), sig);
  } catch {
    return false;
  }
}

module.exports = { PREFIX, encodeMessage, messageHash, signMessage, verifyMessage };
