// Pruebas del árbol Merkle, sin red. `node test-merkle.js`
//
// La prueba que importa es la 3: el ataque de truncado. Antes de comprometer
// índice y total en la hoja, borrar la cola del hilo producía un árbol nuevo
// cuyos mensajes restantes seguían verificando contra su propia raíz — un
// hilo mutilado se presentaba como íntegro.

const { buildTree, getProof, verifyProof } = require("./merkle");

let pass = 0;
let fail = 0;

function check(nombre, condicion) {
  if (condicion) {
    console.log(`  ✅ ${nombre}`);
    pass++;
  } else {
    console.log(`  ❌ ${nombre}`);
    fail++;
  }
}

const CORPUS = [
  "[01/03/2026, 09:00:00] Ana: Confirmo el viernes",
  "[01/03/2026, 09:05:00] Bruno: Ok",
  "[02/03/2026, 10:00:00] Ana: ¿Trajiste el certificado?",
  "[02/03/2026, 18:00:00] Bruno: Se me olvidó",
  "[03/03/2026, 08:00:00] Ana: Lo necesito antes del 20",
  "[03/03/2026, 22:00:00] Bruno: Mañana sin falta",
  "[05/03/2026, 11:00:00] Ana: Sigo esperando",
];

console.log("\n1. Inclusión — todo mensaje del corpus verifica");
{
  const tree = buildTree(CORPUS);
  let todos = true;
  for (let i = 0; i < CORPUS.length; i++) {
    const leaf = tree.leaves[i];
    const ok = verifyProof(
      leaf.message, leaf.salt, i, tree.total, getProof(tree, i), tree.root
    );
    if (!ok) todos = false;
  }
  check(`los ${CORPUS.length} mensajes verifican contra la raíz`, todos);
}

console.log("\n2. Alteración de contenido — una letra rompe la prueba");
{
  const tree = buildTree(CORPUS);
  const i = 4;
  const leaf = tree.leaves[i];
  const alterado = leaf.message + "0";
  const ok = verifyProof(
    alterado, leaf.salt, i, tree.total, getProof(tree, i), tree.root
  );
  check("un mensaje alterado NO verifica", ok === false);
}

console.log("\n3. Truncado de la cola — EL BUG QUE ESTAMOS CERRANDO");
{
  // Escenario: Bruno recibe el corpus completo pero al juicio lleva solo
  // los primeros 4 mensajes, borrando los tres donde queda mal parado.
  const completo = buildTree(CORPUS);
  const truncado = buildTree(CORPUS.slice(0, 4));

  check(
    "el corpus truncado produce una raíz distinta",
    !truncado.root.equals(completo.root)
  );

  // Intenta presentar una hoja del corpus truncado contra la raíz sellada
  // del corpus completo. Con índice y total comprometidos, no calza.
  const leaf = truncado.leaves[0];
  const colado = verifyProof(
    leaf.message, leaf.salt, 0, truncado.total,
    getProof(truncado, 0), completo.root
  );
  check("una hoja del corpus truncado NO verifica contra la raíz original", colado === false);

  // Y al revés: declarar el total original sobre un corpus recortado
  // tampoco funciona, porque la hoja fue sellada con total=4.
  const mintiendoElTotal = verifyProof(
    leaf.message, leaf.salt, 0, completo.total,
    getProof(truncado, 0), completo.root
  );
  check("mentir sobre el total tampoco cuela", mintiendoElTotal === false);
}

console.log("\n4. Reordenar mensajes — la posición está sellada");
{
  const tree = buildTree(CORPUS);
  const leaf = tree.leaves[2];
  // El mismo mensaje y la misma sal, pero declarado en otra posición.
  const ok = verifyProof(
    leaf.message, leaf.salt, 5, tree.total, getProof(tree, 2), tree.root
  );
  check("un mensaje declarado en otra posición NO verifica", ok === false);
}

console.log("\n5. Índices fuera de rango se rechazan");
{
  const tree = buildTree(CORPUS);
  const leaf = tree.leaves[0];
  const p = getProof(tree, 0);
  check("índice negativo", verifyProof(leaf.message, leaf.salt, -1, tree.total, p, tree.root) === false);
  check("índice >= total", verifyProof(leaf.message, leaf.salt, 99, tree.total, p, tree.root) === false);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail === 0 ? 0 : 1);
