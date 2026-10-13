// Pruebas del manifiesto canónico y su hash. `node test-manifiesto.js`
//
// Lo que se protege acá: que dos implementaciones del mismo manifiesto lleguen
// al mismo hash (canonicalización), que cualquier cambio en el contenido lo
// mueva, y que nunca viaje contenido de mensajes dentro del manifiesto.

const { construirManifiesto, hashManifiesto, canonicalize, PERFIL } = require("./manifiesto");
const { buildTree } = require("./merkle");

let pass = 0;
let fail = 0;
const check = (n, c) => (c ? (console.log(`  ✅ ${n}`), pass++) : (console.log(`  ❌ ${n}`), fail++));

const BASE = { root: "aa".repeat(32), total: 16, nonce: "ff".repeat(16) };

console.log("\nCanonicalización (JCS, RFC 8785)\n");
{
  check("orden de claves ordenado y sin espacios entre tokens",
    canonicalize({ b: 1, a: 2 }) === '{"a":2,"b":1}');
  check("anidamiento y arreglos también se ordenan",
    canonicalize({ z: { y: 1, x: 2 }, a: [3, { d: 4, c: 5 }] }) === '{"a":[3,{"c":5,"d":4}],"z":{"x":2,"y":1}}');

  const m = construirManifiesto(BASE);
  // Reinsertar las mismas claves en orden inverso: mismo contenido, otro orden.
  const reordenado = {};
  Object.keys(m).reverse().forEach((k) => (reordenado[k] = m[k]));
  check("el orden de inserción no cambia el hash", hashManifiesto(m).equals(hashManifiesto(reordenado)));
  check("el hash es de 32 bytes (calza exacto en memo_hash)", hashManifiesto(m).length === 32);
}

console.log("\nSensibilidad al contenido\n");
{
  const m = construirManifiesto(BASE);
  const distinto = (cambio, nombre) =>
    check(nombre, !hashManifiesto(m).equals(hashManifiesto(construirManifiesto({ ...BASE, ...cambio }))));

  distinto({ total: 17 }, "cambiar el total mueve el hash");
  distinto({ root: "bb".repeat(32) }, "cambiar la raíz mueve el hash");
  distinto({ nonce: "ee".repeat(16) }, "el nonce distingue dos anclajes del mismo corpus (SEP-15)");
  distinto({ causa: "C-9999-2026" }, "agregar la causa mueve el hash");

  check("dos manifiestos idénticos dan el mismo hash",
    hashManifiesto(construirManifiesto(BASE)).equals(hashManifiesto(construirManifiesto(BASE))));
}

console.log("\nPrivacidad — Ley 21.719\n");
{
  // Se construye desde un corpus real y se comprueba que ni una palabra
  // del contenido se filtre al manifiesto (que es lo único que se hashea
  // hacia la cadena).
  const CORPUS = [
    "[01/03/2026, 09:00:00] Ana: paso a buscar a los niños el viernes",
    "[01/03/2026, 09:05:00] Bruno: ok, van a estar listos",
  ];
  const tree = buildTree(CORPUS);
  const m = construirManifiesto({
    root: tree.root.toString("hex"),
    total: tree.total,
    nonce: "ff".repeat(16),
    causa: "C-1234-2026",
    jurisdiccion: "CL",
  });
  const serializado = canonicalize(m);

  for (const palabra of ["Ana", "Bruno", "niños", "viernes", "buscar", "listos"]) {
    check(`"${palabra}" no aparece en el manifiesto`, !serializado.includes(palabra));
  }
  check("tampoco aparece ninguna línea completa del corpus",
    CORPUS.every((linea) => !serializado.includes(linea)));
  check("las sales no viajan en el manifiesto",
    tree.leaves.every((l) => !serializado.includes(l.salt.toString("hex"))));
}

console.log("\nForma\n");
{
  const m = construirManifiesto(BASE);
  check("declara su perfil", m.perfil === PERFIL);
  check("declara el algoritmo de hoja y de nodo", !!m.algoritmo.hoja && !!m.algoritmo.nodo);
  check("declara orden posicional", m.algoritmo.orden === "posicional");
  check("los campos opcionales se omiten cuando no vienen", m.causa === undefined && m.custodio === undefined);
  let lanzo = false;
  try { construirManifiesto({ total: 5, nonce: "aa" }); } catch { lanzo = true; }
  check("exige raíz y total", lanzo);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail === 0 ? 0 : 1);
