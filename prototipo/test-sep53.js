// Valida la implementacion de SEP-53 contra los vectores de prueba oficiales
// del estandar. `node test-sep53.js`
//
// Vectores tomados de:
// https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md

const { Keypair } = require("@stellar/stellar-sdk");
const { signMessage, verifyMessage, messageHash } = require("./sep53");

const SEED = "SAKICEVQLYWGSOJS4WW7HZJWAHZVEEBS527LHK5V4MLJALYKICQCJXMW";
const ADDRESS = "GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L";

// El mensaje japones va en base64 para que no dependa de la codificacion del
// archivo ni del shell: son los bytes UTF-8 de "こんにちは、世界！".
const JAPONES = Buffer.from("44GT44KT44Gr44Gh44Gv44CB5LiW55WM77yB", "base64");

// Las firmas esperadas se guardan en HEX, que es la forma inequivoca.
// El base64 se deriva de ahi: si el estandar es coherente, las dos coinciden.
//
// Nota: la copia del spec que consultamos mostraba, para el vector japones, un
// base64 que decodifica a `...36db...` mientras su propio hex dice `...36eb...`
// — un caracter de diferencia. Nuestra firma calza con el hex en los tres
// vectores, asi que tomamos el hex como autoritativo. Queda anotado en
// PENDIENTES.md para contrastarlo contra el texto del SEP directamente.
const VECTORES = [
  {
    nombre: "ASCII",
    message: "Hello, World!",
    hex: "7cee5d6d885752104c85eea421dfdcb95abf01f1271d11c4bec3fcbd7874dccd6e2e98b97b8eb23b643cac4073bb77de5d07b0710139180ae9f3cbba78f2ba04",
  },
  {
    nombre: "Japones (UTF-8)",
    message: JAPONES,
    hex: "083536eb95ecf32dce59b07fe7a1fd8cf814b2ce46f40d2a16e4ea1f6cecd980e04e6fbef9d21f98011c785a81edb85f3776a6e7d942b435eb0adc07da4d4604",
  },
  {
    nombre: "Binario",
    message: Buffer.from("2zZDP1sa1BVBfLP7TeeMk3sUbaxAkUhBhDiNdrksaFo=", "base64"),
    hex: "540d7eee179f370bf634a49c1fa9fe4a58e3d7990b0207be336c04edfcc539ff8bd0c31bb2c0359b07c9651cb2ae104e4504657b5d17d43c69c7e50e23811b0d",
  },
].map((v) => ({ ...v, sig: Buffer.from(v.hex, "hex").toString("base64") }));

let pass = 0;
let fail = 0;
const check = (n, c) => (c ? (console.log(`  ✅ ${n}`), pass++) : (console.log(`  ❌ ${n}`), fail++));

console.log("\nSEP-53 — vectores de prueba oficiales\n");

const kp = Keypair.fromSecret(SEED);
check("la direccion derivada de la semilla calza con la del estandar", kp.publicKey() === ADDRESS);

for (const v of VECTORES) {
  const firma = signMessage(v.message, kp);
  check(`${v.nombre}: firma base64 identica al estandar`, firma.toString("base64") === v.sig);
  check(`${v.nombre}: firma hex identica al estandar`, firma.toString("hex") === v.hex);
  check(`${v.nombre}: verifyMessage acepta la firma del estandar`, verifyMessage(v.message, v.sig, ADDRESS) === true);
}

console.log("\nRechazos\n");
{
  const otra = Keypair.random();
  check(
    "firma de otra clave, rechazada",
    verifyMessage("Hello, World!", signMessage("Hello, World!", otra), ADDRESS) === false
  );
  check(
    "mensaje alterado, rechazado",
    verifyMessage("Hello, World?", VECTORES[0].sig, ADDRESS) === false
  );
  check("firma malformada, rechazada sin lanzar", verifyMessage("Hello, World!", "no-es-base64-valido", ADDRESS) === false);
}

console.log("\nPrefijo\n");
check(
  'el payload lleva el prefijo "Stellar Signed Message:\\n"',
  messageHash("x").equals(
    require("crypto").createHash("sha256")
      .update(Buffer.concat([Buffer.from("Stellar Signed Message:\n", "utf8"), Buffer.from("x", "utf8")]))
      .digest()
  )
);

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail === 0 ? 0 : 1);
