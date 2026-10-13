// Árbol Merkle con sal por hoja, para anclar un corpus de mensajes.
//
// Cada hoja compromete: sal + POSICIÓN + TOTAL DE HOJAS + contenido.
// Comprometer índice y total es lo que impide truncar la cola del hilo:
// sin ellos, borrar los últimos mensajes produce un árbol distinto pero
// igualmente válido, y la verificación de los mensajes restantes seguiría
// pasando. Con ellos, cualquier cambio en el largo del corpus rompe todas
// las hojas a la vez.
//
// Separación de dominio (0x00 hoja / 0x01 nodo interno) para que un hash
// de nodo interno no pueda presentarse como si fuera una hoja.
//
// El orden de combinación es POSICIONAL (izquierda-derecha real), no por
// valor: ordenar por valor pierde la posición y con ella la prueba de que
// el mensaje estaba donde dice que estaba.

const crypto = require("crypto");

const LEAF_PREFIX = Buffer.from([0x00]);
const NODE_PREFIX = Buffer.from([0x01]);
const SALT_BYTES = 16;

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest();
}

function randomSalt() {
  return crypto.randomBytes(SALT_BYTES);
}

function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

// hoja = SHA256(0x00 || sal || u32be(indice) || u32be(total) || mensaje)
function hashLeaf(message, salt, index, total) {
  return sha256(
    Buffer.concat([
      LEAF_PREFIX,
      salt,
      u32be(index),
      u32be(total),
      Buffer.from(message, "utf8"),
    ])
  );
}

// nodo = SHA256(0x01 || izquierda || derecha) — orden posicional, sin ordenar
function hashNode(left, right) {
  return sha256(Buffer.concat([NODE_PREFIX, left, right]));
}

/**
 * Construye el árbol completo a partir de una lista de mensajes (strings).
 * Devuelve { root, total, leaves, layers }.
 */
function buildTree(messages) {
  if (messages.length === 0) throw new Error("corpus vacío");
  const total = messages.length;

  const leaves = messages.map((message, index) => {
    const salt = randomSalt();
    const hash = hashLeaf(message, salt, index, total);
    return { message, salt, index, hash };
  });

  let layer = leaves.map((l) => l.hash);
  const layers = [layer];

  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 < layer.length) {
        next.push(hashNode(layer[i], layer[i + 1]));
      } else {
        // hoja impar: sube tal cual (duplicarla habilitaría un ataque de
        // segunda preimagen sobre el último par)
        next.push(layer[i]);
      }
    }
    layers.push(next);
    layer = next;
  }

  return { root: layers[layers.length - 1][0], total, leaves, layers };
}

/**
 * Prueba de inclusión: hermanos CON su posición, para poder recombinar
 * en el mismo orden en que se construyó el árbol.
 * Devuelve [{ hash: Buffer, position: 'left'|'right' }]
 */
function getProof(tree, index) {
  const proof = [];
  let idx = index;
  for (let level = 0; level < tree.layers.length - 1; level++) {
    const layer = tree.layers[level];
    const isRightNode = idx % 2 === 1;
    const siblingIdx = isRightNode ? idx - 1 : idx + 1;
    if (siblingIdx < layer.length) {
      proof.push({
        hash: layer[siblingIdx],
        position: isRightNode ? "left" : "right",
      });
    }
    idx = Math.floor(idx / 2);
  }
  return proof;
}

/**
 * Verifica que (message, salt, index, total) + proof reconstruyen root.
 * `total` es parte de lo verificado: si el corpus presentado tiene otro
 * largo que el sellado, ninguna hoja calza.
 */
function verifyProof(message, salt, index, total, proof, root) {
  if (!Number.isInteger(index) || !Number.isInteger(total)) return false;
  if (index < 0 || total <= 0 || index >= total) return false;

  let hash = hashLeaf(message, salt, index, total);
  for (const sibling of proof) {
    hash =
      sibling.position === "left"
        ? hashNode(sibling.hash, hash)
        : hashNode(hash, sibling.hash);
  }
  return hash.equals(root);
}

module.exports = {
  sha256,
  randomSalt,
  hashLeaf,
  hashNode,
  buildTree,
  getProof,
  verifyProof,
  SALT_BYTES,
};
