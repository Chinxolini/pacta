# Prototipo — sello de mensajería en Stellar (caso WhatsApp)

Certificación de prueba de mensajería anclada en Stellar. Ciclo completo:
**anclar → verificar → detectar cada trampa**.

```bash
npm install
npm test                                    # 44 pruebas, sin red
node anchor.js sample-chat.txt              # ancla en testnet
node verify.js 10                           # verifica la cadena completa
node verify.js 10 --tamper "texto alterado"
node verify.js 10 --claim-total 8           # simula un hilo truncado
```

`sample-chat.txt` es un chat **sintético** (Ana/Bruno coordinando custodia), no
una conversación real.

## Qué se ancla

No la raíz Merkle suelta — 32 bytes sin etiqueta que ningún perito puede
interpretar. Se ancla el hash de un **manifiesto canónico**:

```json
{
  "perfil": "registro/manifiesto/1",
  "algoritmo": { "hash": "SHA-256", "hoja": "...", "nodo": "...", "orden": "posicional" },
  "corpus": { "raiz": "<hex>", "total": 16 },
  "nonce": "<hex>", "causa": "C-1234-2026", "custodio": "G...", "jurisdiccion": "CL"
}
```

El patrón viene de **SEP-15 "Attachment Convention"** (Draft, 2018): SHA-256 de
un JSON que viaja fuera de la cadena, con `nonce` para distinguir dos
declaraciones idénticas. SEP-15 define su propio esquema para pagos; acá se toma
el patrón, no ese esquema — por eso el campo `perfil`.

La canonicalización es **JCS (RFC 8785)**: claves ordenadas, sin espacios entre
tokens. El `JSON.stringify` que muestra SEP-15 depende del orden de inserción,
así que dos implementaciones del mismo manifiesto darían hashes distintos.

El manifiesto **nunca lleva contenido de mensajes ni sales** — solo la raíz y
metadatos del método. Es lo que exige la Ley 21.719: on-chain, únicamente el
hash de esto. Hay pruebas que lo verifican contra un corpus real.

## Quién lo declaró — SEP-53

El anclaje prueba que el manifiesto existía en una fecha, pero no quién lo
declaró. La firma **SEP-53 "Sign and Verify Messages"** (Final, v1.0.0,
2026-06-18) ata el manifiesto a una clave:

```
payload     = utf8("Stellar Signed Message:\n") || manifiesto_canónico
messageHash = SHA256(payload)
firma       = ed25519(messageHash)          # 64 bytes
```

`test-sep53.js` valida la implementación contra **los tres vectores de prueba
oficiales del SEP** — coinciden byte a byte. Un tercero puede verificar sin este
código, con la herramienta oficial:

```bash
stellar message verify --address G... --message <manifiesto> --signature <base64>
```

## La cadena de verificación

`verify.js` comprueba cuatro eslabones y dice cuál se corta:

1. El manifiesto del certificado es el anclado on-chain (SHA-256 = `memo_hash`)
2. El declarante firmó ese manifiesto (SEP-53)
3. La raíz y el total salen del manifiesto, no del certificado
4. El mensaje pertenece al corpus sellado (camino Merkle)

## Qué impide cada trampa

| Trampa | Qué la bloquea |
|---|---|
| Cambiar el texto de un mensaje | El hash de la hoja cambia y no reconstruye la raíz |
| Mover un mensaje de lugar | La hoja sella `u32be(índice)` |
| Borrar la cola del hilo | La hoja sella `u32be(total)`: cambiar el largo rompe **todas** las hojas |
| Pasar un nodo interno por hoja | Separación de dominio (`0x00` hoja / `0x01` nodo) |
| Editar el manifiesto | Rompe el eslabón 1 y la firma a la vez |
| Firmar con otra clave | SEP-53 lo rechaza |
| Reanclar el mismo corpus y hacerlo pasar por otro | El `nonce` los distingue |

## Qué prueba y qué NO prueba

**Prueba**: que ese mensaje, en esa posición, dentro de un hilo de N mensajes,
existía sin alteración a la fecha del ledger, y que una clave determinada lo
declaró.

**NO prueba**: quién escribió el mensaje, que el hilo esté completo, ni que no
se haya fabricado *antes* de anclar. Ese hueco pre-anclaje es estructural y no
lo cierra ninguna blockchain.
El diseño real usa esto como **contrasello**, con FEA + fechado de prestador
acreditado (Ley 19.799) como mecanismo probatorio primario.

## Sobre la red

Por defecto ancla en **testnet**, que Stellar **resetea a génesis** varias veces
al año — su propia documentación la descarta para "long-term storage of data on
the network". Sirve para demostrar el mecanismo; no para sellar una prueba que
deba llegar viva a una audiencia.

Para un anclaje real:

```bash
STELLAR_NETWORK=mainnet STELLAR_SECRET=S... REGISTRO_CAUSA=C-1234-2026 node anchor.js chat.txt
```

Mainnet gasta XLM real, así que la cuenta hay que financiarla a mano. La
transacción clásica no tiene TTL ni renta: queda en los archivos de checkpoint
que publican por separado varios validadores, recuperable sin depender de que
ninguna empresa siga existiendo.

## Archivos

| Archivo | Rol |
|---|---|
| `merkle.js` | Árbol con sal, índice, total y separación de dominio |
| `manifiesto.js` | Manifiesto canónico (JCS) + su hash |
| `sep53.js` | Firma y verificación de mensajes, SEP-53 |
| `anchor.js` | Construye, firma y ancla |
| `verify.js` | Verifica los cuatro eslabones contra la red |
| `test-*.js` | 44 pruebas, sin red |
