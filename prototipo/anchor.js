// Sella la raíz Merkle de un export de WhatsApp en una transacción de Stellar.
//
// Uso:
//   node anchor.js sample-chat.txt                  -> testnet (cuenta nueva vía friendbot)
//   STELLAR_NETWORK=mainnet STELLAR_SECRET=S... node anchor.js chat.txt
//
// Sobre la red: testnet se RESETEA A GÉNESIS varias veces al año (la doc de
// Stellar lo lista entre los usos para los que no sirve: "long-term storage of
// data on the network"). Sirve para demostrar el mecanismo, no para sellar una
// prueba que deba durar hasta una audiencia. Un anclaje real va en mainnet.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  Keypair,
  Networks,
  TransactionBuilder,
  Operation,
  Memo,
  Asset,
  Horizon,
  BASE_FEE,
} = require("@stellar/stellar-sdk");
const { buildTree, getProof } = require("./merkle");
const { construirManifiesto, hashManifiesto, canonicalize } = require("./manifiesto");
const { signMessage } = require("./sep53");

const NETWORKS = {
  testnet: {
    horizon: "https://horizon-testnet.stellar.org",
    passphrase: Networks.TESTNET,
    explorer: "https://stellar.expert/explorer/testnet",
    friendbot: "https://friendbot.stellar.org",
  },
  mainnet: {
    horizon: "https://horizon.stellar.org",
    passphrase: Networks.PUBLIC,
    explorer: "https://stellar.expert/explorer/public",
    friendbot: null,
  },
};

const netName = (process.env.STELLAR_NETWORK || "testnet").toLowerCase();
const net = NETWORKS[netName];
if (!net) {
  console.error(`Red desconocida: ${netName}. Usa "testnet" o "mainnet".`);
  process.exit(1);
}

// Parser del export de WhatsApp: "[fecha, hora] Autor: mensaje"
function parseWhatsAppExport(raw) {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const messageRe = /^\[(.+?)\]\s(.+?):\s(.*)$/;
  const messages = [];
  for (const line of lines) {
    const m = line.match(messageRe);
    if (m) {
      const [, timestamp, author, text] = m;
      // Se sella la línea completa (timestamp + autor + texto), no solo el
      // texto: así el sello también cubre quién dijo qué y cuándo.
      messages.push(`[${timestamp}] ${author}: ${text}`);
    } else {
      messages.push(line); // continuación de un mensaje multilínea
    }
  }
  return messages;
}

async function resolveKeypair() {
  if (process.env.STELLAR_SECRET) {
    const kp = Keypair.fromSecret(process.env.STELLAR_SECRET.trim());
    console.log(`🔑 Usando cuenta provista: ${kp.publicKey()}`);
    return kp;
  }
  if (!net.friendbot) {
    console.error(
      "\n❌ En mainnet hay que aportar una cuenta ya financiada.\n" +
        "   Define STELLAR_SECRET con la clave secreta de una cuenta con saldo.\n" +
        "   (Anclar en mainnet gasta XLM real: la cuenta necesita el mínimo de\n" +
        "    reserva más la comisión. Fináncíala tú antes de correr esto.)\n"
    );
    process.exit(1);
  }
  const kp = Keypair.random();
  console.log(`🔑 Cuenta testnet nueva: ${kp.publicKey()}`);
  console.log(`💧 Financiando vía friendbot…`);
  const res = await fetch(`${net.friendbot}?addr=${encodeURIComponent(kp.publicKey())}`);
  if (!res.ok) throw new Error(`friendbot falló: ${res.status}`);
  return kp;
}

async function main() {
  const file = process.argv[2] || "sample-chat.txt";
  const filePath = path.resolve(__dirname, file);
  const raw = fs.readFileSync(filePath, "utf8");
  const messages = parseWhatsAppExport(raw);

  console.log(`\n📄 Corpus: ${messages.length} mensajes leídos de ${file}`);
  console.log(`🌐 Red: ${netName}${netName === "testnet" ? "  (se resetea; solo demostración)" : "  ⚠️  gasta XLM real"}`);

  const tree = buildTree(messages);
  console.log(`🌳 Raíz Merkle: ${tree.root.toString("hex")}`);
  console.log(`   (cada hoja compromete sal + posición + total=${tree.total})`);

  const keypair = await resolveKeypair();

  // El manifiesto: lo que un perito necesita para reproducir la verificación
  // sin preguntarle nada a quien presenta la prueba.
  const manifiesto = construirManifiesto({
    root: tree.root.toString("hex"),
    total: tree.total,
    nonce: crypto.randomBytes(16).toString("hex"),
    causa: process.env.REGISTRO_CAUSA || undefined,
    custodio: keypair.publicKey(),
    jurisdiccion: process.env.REGISTRO_JURISDICCION || "CL",
    network: netName,
  });
  const manifiestoHash = hashManifiesto(manifiesto);
  console.log(`📋 Manifiesto: ${manifiestoHash.toString("hex")}`);
  console.log(`   perfil ${manifiesto.perfil} · lo que se ancla es esto, no la raíz suelta`);

  // Firma SEP-53 sobre la forma canónica del manifiesto: ata la declaración a
  // una clave. Verificable por un tercero con `stellar message verify`.
  const firma = signMessage(canonicalize(manifiesto), keypair);
  console.log(`✍️  Firma SEP-53 de ${keypair.publicKey().slice(0, 8)}…`);

  const server = new Horizon.Server(net.horizon);
  const account = await server.loadAccount(keypair.publicKey());

  console.log(`⚓ Anclando el hash del manifiesto en el memo_hash…`);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: net.passphrase,
  })
    .addOperation(
      Operation.payment({
        destination: keypair.publicKey(), // a sí misma: la tx solo porta el memo
        asset: Asset.native(),
        amount: "0.0000001",
      })
    )
    .addMemo(Memo.hash(manifiestoHash.toString("hex")))
    .setTimeout(60)
    .build();

  tx.sign(keypair);
  const result = await server.submitTransaction(tx);

  console.log(`\n✅ Anclado. Tx: ${result.hash}`);
  console.log(`   ${net.explorer}/tx/${result.hash}`);

  // El certificado. Sin las sales no se reconstruye ningún camino Merkle:
  // este archivo es tan crítico como la raíz on-chain.
  const out = {
    version: 3,
    network: netName,
    file,
    anchoredAt: new Date().toISOString(),
    txHash: result.hash,
    publicKey: keypair.publicKey(),
    // El manifiesto completo: su SHA-256 canónico es lo que está on-chain.
    manifiesto,
    manifiestoHash: manifiestoHash.toString("hex"),
    // Firma SEP-53 del declarante sobre la forma canónica del manifiesto.
    firmaSep53: firma.toString("base64"),
    root: tree.root.toString("hex"),
    total: tree.total,
    leaves: tree.leaves.map((l, i) => ({
      index: i,
      message: l.message,
      salt: l.salt.toString("hex"),
      hash: l.hash.toString("hex"),
      proof: getProof(tree, i).map((s) => ({
        hash: s.hash.toString("hex"),
        position: s.position,
      })),
    })),
  };

  const outPath = path.resolve(__dirname, "tree.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(`💾 Certificado en ${path.basename(outPath)} — sin él la raíz on-chain es inútil.\n`);
}

main().catch((err) => {
  console.error("❌ Error:", err.message || err);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
