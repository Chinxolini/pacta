// Verifica que un mensaje pertenece al corpus anclado, pidiendo la raíz
// DIRECTAMENTE a la red (no confía en tree.json para la raíz: de ahí solo
// saca el mensaje, la sal, la posición y el camino a verificar).
//
// Uso:
//   node verify.js <index>                        -> debe dar VÁLIDO
//   node verify.js <index> --tamper "texto"        -> texto alterado, debe fallar
//   node verify.js <index> --claim-total <n>       -> miente sobre el largo del hilo

const fs = require("fs");
const path = require("path");
const { Horizon } = require("@stellar/stellar-sdk");
const { verifyProof } = require("./merkle");
const { hashManifiesto, canonicalize } = require("./manifiesto");
const { verifyMessage } = require("./sep53");

const HORIZON = {
  testnet: "https://horizon-testnet.stellar.org",
  mainnet: "https://horizon.stellar.org",
};

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

async function main() {
  const index = parseInt(process.argv[2], 10);
  const tampered = arg("--tamper");
  const claimTotal = arg("--claim-total");

  if (Number.isNaN(index)) {
    console.error('Uso: node verify.js <index> [--tamper "texto"] [--claim-total <n>]');
    process.exit(1);
  }

  const cert = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "tree.json"), "utf8")
  );
  const leaf = cert.leaves[index];
  if (!leaf) {
    console.error(`No existe la hoja ${index}. El certificado tiene ${cert.leaves.length}.`);
    process.exit(1);
  }

  const total = claimTotal !== null ? parseInt(claimTotal, 10) : cert.total;

  console.log(`\n🔎 Verificando el mensaje ${index} de ${total}`);
  console.log(`   Texto: "${tampered !== null ? tampered : leaf.message}"`);
  if (tampered !== null) console.log(`   ⚠️  texto alterado respecto del sellado`);
  if (claimTotal !== null && total !== cert.total)
    console.log(`   ⚠️  declarando total=${total} cuando se sellaron ${cert.total}`);

  const horizonUrl = HORIZON[cert.network] || HORIZON.testnet;
  console.log(`\n📡 Pidiendo el sello a ${cert.network}: ${cert.txHash}`);
  const server = new Horizon.Server(horizonUrl);
  const tx = await server.transactions().transaction(cert.txHash).call();

  // El memo tipo hash llega en base64; lo pasamos a bytes.
  const memoOnChain = Buffer.from(tx.memo, "base64");
  console.log(`   memo_hash on-chain: ${memoOnChain.toString("hex")}`);
  console.log(`   Fecha del ledger:   ${tx.created_at}  ← la fecha cierta`);

  // La verificación es una cadena de cuatro eslabones. Si cualquiera se corta,
  // la prueba no vale — y el informe dice cuál se cortó.
  const pasos = [];

  // 1. El manifiesto del certificado es el que está anclado.
  const hashLocal = hashManifiesto(cert.manifiesto);
  const okManifiesto = hashLocal.equals(memoOnChain);
  pasos.push(["El manifiesto es el anclado on-chain", okManifiesto]);

  // 2. El declarante firmó ese manifiesto (SEP-53).
  const okFirma = verifyMessage(
    canonicalize(cert.manifiesto),
    cert.firmaSep53,
    cert.manifiesto.custodio || cert.publicKey
  );
  pasos.push([`Firma SEP-53 de ${(cert.manifiesto.custodio || cert.publicKey).slice(0, 8)}…`, okFirma]);

  // 3. La raíz que dice el certificado es la que declara el manifiesto.
  const okRaiz = cert.manifiesto.corpus.raiz === cert.root
    && cert.manifiesto.corpus.total === cert.total;
  pasos.push(["La raíz y el total salen del manifiesto", okRaiz]);

  // 4. El mensaje pertenece a ese corpus.
  const okMensaje = verifyProof(
    tampered !== null ? tampered : leaf.message,
    Buffer.from(leaf.salt, "hex"),
    index,
    total,
    leaf.proof.map((s) => ({ hash: Buffer.from(s.hash, "hex"), position: s.position })),
    Buffer.from(cert.manifiesto.corpus.raiz, "hex")
  );
  pasos.push(["El mensaje pertenece al corpus sellado", okMensaje]);

  console.log(`\nCadena de verificación:`);
  for (const [nombre, bien] of pasos) console.log(`   ${bien ? "✅" : "❌"} ${nombre}`);

  const ok = pasos.every(([, bien]) => bien);
  console.log(`\n${ok ? "✅ VÁLIDO" : "❌ INVÁLIDO"}: la prueba ${ok ? "se sostiene entera" : "está rota"}.`);
  if (!ok) {
    const roto = pasos.find(([, bien]) => !bien)[0];
    console.log(`   → Primer eslabón que falla: ${roto.toLowerCase()}.`);
  } else {
    console.log(`   Acredita: que ese mensaje, en esa posición, dentro de un hilo de`);
    console.log(`   ${cert.total} mensajes, existía sin alteración al ${tx.created_at},`);
    console.log(`   y que ${(cert.manifiesto.custodio || cert.publicKey).slice(0, 12)}… lo declaró.`);
    console.log(`   NO acredita quién escribió el mensaje ni que el hilo esté completo.`);
  }
  console.log();
  process.exit(ok ? 0 : 2);
}

main().catch((err) => {
  console.error("❌ Error:", err.message || err);
  process.exit(1);
});
