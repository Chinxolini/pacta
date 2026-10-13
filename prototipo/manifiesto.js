// Manifiesto canonico — lo que realmente se ancla en el memo_hash.
//
// Antes se anclaba la raiz Merkle desnuda: 32 bytes sin etiqueta. Un perito que
// mira esa transaccion no puede saber que algoritmo la produjo, sobre cuantos
// mensajes, ni quien la declaro. Ahora el memo_hash sella un MANIFIESTO, y la
// raiz es un campo dentro de el.
//
// El patron viene de SEP-15 "Attachment Convention" (Draft, 2018-08-03):
// hash SHA-256 de un JSON que viaja fuera de la cadena, con un `nonce` para
// distinguir dos declaraciones por lo demas identicas. SEP-15 define su propio
// esquema para pagos (sender_info, route, note); aca se toma el PATRON, no ese
// esquema. Se declara explicitamente en el campo `perfil`.
//
// La canonicalizacion es JCS (RFC 8785): claves ordenadas, sin espacios. El
// `JSON.stringify` que muestra SEP-15 depende del orden de insercion, asi que
// dos implementaciones del mismo manifiesto darian hashes distintos.

const crypto = require("crypto");

const PERFIL = "registro/manifiesto/1";

/** Serializacion canonica JCS: claves ordenadas recursivamente, sin espacios. */
function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}

/**
 * Construye el manifiesto. Todo lo que un tribunal necesita para reproducir la
 * verificacion sin preguntarle nada a quien lo presenta.
 *
 * NO lleva contenido de los mensajes ni datos personales: solo la raiz y
 * metadatos del metodo. Ley 21.719 — on-chain va unicamente el hash de esto.
 */
function construirManifiesto({ root, total, nonce, causa, custodio, jurisdiccion, network }) {
  if (!root || !total) throw new Error("manifiesto: root y total son obligatorios");
  return {
    perfil: PERFIL,
    algoritmo: {
      hash: "SHA-256",
      hoja: "SHA256(0x00 || sal(16) || u32be(indice) || u32be(total) || mensaje)",
      nodo: "SHA256(0x01 || izquierda || derecha)",
      orden: "posicional",
      sal_bytes: 16,
    },
    corpus: { raiz: root, total },
    // El nonce distingue dos anclajes del mismo corpus (SEP-15 §nonce).
    nonce,
    // Opcionales: solo se incluyen si vienen. Nunca datos personales — "causa"
    // es un rol de causa (RIT), no el nombre de nadie.
    ...(causa ? { causa } : {}),
    ...(custodio ? { custodio } : {}),
    ...(jurisdiccion ? { jurisdiccion } : {}),
    ...(network ? { network } : {}),
  };
}

/** El hash que va en el memo_hash: SHA-256 de la forma canonica. */
function hashManifiesto(manifiesto) {
  return crypto.createHash("sha256").update(canonicalize(manifiesto), "utf8").digest();
}

module.exports = { PERFIL, canonicalize, construirManifiesto, hashManifiesto };
