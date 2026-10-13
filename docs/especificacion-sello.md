# Especificación del Sello de Pacta

**Versión de la especificación:** 1.0 (borrador, 12-oct-2026). Corresponde a Sello `version` 1, Documento `pacta/documento/1`, Respaldo del contrato `pacta/respaldo/1` y Plantilla `pacta/prestamo@1.2.0` (el SDK también reconoce la `1.1.0`). Fuente de verdad: `web/packages/sdk/src/` (`documento.ts`, `sello.ts`, `firma.ts`, `anclaje.ts`, `verificador.ts`, `plantilla.ts`). Lo que no pude confirmar contra el código va marcado `[?]`.

Objetivo: que un perito recalcule el Sello con herramientas estándar, sin el SDK.

## 1. Qué prueba el Sello y qué no

- **Prueba:** que un Documento completo con esos bytes exactos existía en la fecha del ledger de Stellar, y que no cambió desde entonces.
- **No prueba, por sí solo, quién firmó.** Vincular cada clave de firma con una persona lo acredita el Integrador (Vínculo persona-clave, verificación de identidad). Son firmas electrónicas simples. La `autorizacion` (passkey) queda escrita en el Documento pero no se verifica en la cadena. Hay un tipo `simulada` que solo sirve para demos.
- El Sello en sí no une la cuenta Stellar que ancló con un Integrador conocido: ese vínculo se comprueba aparte con SEP-1 (sección 8).

## 2. Estructuras

**Documento** (JSON, todos los textos en UTF-8):

| Campo | Tipo |
|---|---|
| `perfil` | `"pacta/documento/1"` |
| `contratoId` | texto, `ctr_` + 32 hex aleatorios |
| `plantilla` | `{ "id": "pacta/prestamo", "version": "1.2.0" }` |
| `parametros` | `acreedor{nombre, verificacion}`, `deudor{nombre, verificacion}` (`verificacion` = `ver_` + 8 a 40 caracteres `[a-z0-9]`), `monto` (entero 1 a 1.000.000.000), `moneda` `"CLP"`, `fechaEntrega` y `fechaPago` (`AAAA-MM-DD`), `ciudad` |
| `texto` | texto legal ya generado con la Plantilla |
| `creadoEn` | ISO 8601 UTC con milisegundos (`2026-09-25T12:00:00.000Z`) |
| `firmas` | arreglo de 2 `FirmaParte`, en orden `acreedor`, `deudor` |

**FirmaParte:** `rol` (`acreedor`/`deudor`), `clavePublica` (Stellar `G…`, Ed25519, nueva por contrato), `firma` (base64 de 64 bytes), `firmadoEn` (ISO 8601), `autorizacion` (`{tipo:"passkey", credencial, desafio}` o `{tipo:"simulada", motivo}`).

**Respaldo del contrato** (lo guarda cada Parte): `{ "perfil":"pacta/respaldo/1", "documento":{…}, "sal":"<64 hex>", "tx":"<hash de la transacción>", "red":"testnet"|"mainnet" }`, más tres campos **opcionales e informativos** del anclaje: `"ledger"` (entero positivo: ledger que incluyó la transacción), `"fecha"` (ISO 8601: cierre de ese ledger) y `"cuenta"` (`G…`: la cuenta que selló). Sirven para ubicar la transacción en los archivos de historia de Stellar años después. Los respaldos anteriores no los traen y siguen siendo válidos. La verificación **no depende de ellos**: lee la cadena. Si vienen y no coinciden con la cadena, la verificación no falla pero el resultado trae una advertencia (`advertencias`), para que un respaldo adulterado en esos campos no pase inadvertido. El lector rechaza un respaldo cuyos campos de anclaje tengan un tipo o formato inválido. El lector también acepta `pacta/paquete/1` (nombre anterior).

## 3. Canonicalización

El Documento se serializa según **JCS (RFC 8785)** (`canonicalizar`, `documento.ts`), para cualquier JSON válido:

- Objetos: claves ordenadas por unidades de código UTF-16, sin espacios, `{"clave":valor,…}`.
- Arreglos: el orden se conserva, `[a,b]`.
- Textos: como `JSON.stringify` (comillas dobles; `\b \t \n \f \r \" \\`, el resto de los controles como `\u00xx` en minúscula; **no** se escapan `/` ni los caracteres no ASCII).
- Números: forma ECMAScript de `JSON.stringify` (RFC 8785, sección 3.2.2.3), con `-0` como `0`. El único número del Documento es `monto`, entero.
- Codificación final: **UTF-8, sin BOM, sin salto de línea final**.
- Lo que no es JSON lanza error y nunca produce una salida no canónica: `NaN`, `Infinity`, `undefined` (en arreglos o como raíz), funciones, símbolos, `BigInt`, objetos no planos (`Date`, `Map`…), referencias circulares y cadenas con sustitutos UTF-16 sueltos. Las cadenas con sustitutos UTF-16 sueltos (no son Unicode válido) no se pueden canonicalizar y se rechazan, tanto en valores como en nombres de clave. Única tolerancia heredada: las claves de objeto con valor `undefined` se omiten (no existen en un Documento ya firmado).

Los tests (`canonicalizacion.test.ts`) cubren los vectores del RFC: 3.2.2 (números y escapes de cadenas), 3.2.3 (orden de claves con caracteres Unicode, incluido un par sustituto) y números del Apéndice B. Un test de regresión fija el hash de un Documento de ejemplo, calculado con la implementación anterior, para asegurar que los Sellos ya emitidos siguen recalculándose igual. `[?]` Los números de más de 2^53 en el JSON de entrada se redondean al leerlos con `JSON.parse`; no aplica a un Documento de Pacta (montos hasta 1.000.000.000).

## 4. Cálculo del Sello

1. `D` = JCS del Documento **completo, con el arreglo `firmas`**, en UTF-8.
2. `S` = Sal: 32 bytes aleatorios, guardados como 64 caracteres hex (`sal` del Respaldo). Se decodifica a 32 bytes crudos. Nunca viaja en la cadena.
3. `compromiso` = `SHA-256( S ‖ D )`: primero los 32 bytes de la Sal, luego `D`, sin separador. Se escribe en 64 hex minúscula.

En Stellar, una sola transacción clásica enviada desde la cuenta del Integrador:

- **`memo_hash`** = los 32 bytes del `compromiso` (Horizon los muestra en base64 en el campo `memo`, con `memo_type: "hash"`).
- **Operación `manage_data`**, `name` = `pacta`, `value` = texto UTF-8 `1;pacta/prestamo@1.2.0` (formato `versionDelSello;idPlantilla@versión`; máximo 64 bytes; Horizon lo muestra en base64). Sellos antiguos de la demo traen un tercer campo (`;vigente`, `;pagado`, `;resciliado` o `;bloqueado`): se ignora.

## 5. Firmas de las Partes

Cada Parte firma el **contenido firmable**: el mismo JCS del Documento pero **sin la clave `firmas`** (queda `creadoEn`, `contratoId`, `parametros`, `perfil`, `plantilla`, `texto`). Formato SEP-53:

`firma = Ed25519( SHA-256( "Stellar Signed Message:\n" ‖ mensaje_utf8 ) )`, guardada en base64.

Verificación: reconstruir el mensaje, calcular el SHA-256 de prefijo más mensaje y verificar con la `clavePublica` (decodificar el `G…` strkey a la clave Ed25519 de 32 bytes). Alternativa: `stellar message verify` del CLI de Stellar `[?]` (sintaxis exacta no comprobada aquí). Hay que verificar **ambas** firmas, cada una con su `clavePublica`; el verificador del SDK exige exactamente dos.

## 6. Ubicar la transacción y la fecha

Con el `tx` del Respaldo: `GET {horizon}/transactions/{tx}` (Horizon testnet del SDK: `https://horizon-testnet.stellar.org`; mainnet: `https://horizon.stellar.org`) o el explorador `https://stellar.expert/explorer/{red}/tx/{tx}`. La fecha es `created_at` (cierre del ledger) y el número de ledger es `ledger`. Los `manage_data` salen en `GET /transactions/{tx}/operations`.

**Advertencias:** los servidores públicos conservan historial limitado `[?]` (plazo no verificado); anote el **número de ledger y el hash** al firmar y guarde una copia de la respuesta. Testnet se reinicia varias veces al año: un Sello de testnet no es permanente.

## 7. Comprobación manual (ver también la sección 8)

1. Tome el Respaldo del contrato. Compruebe `perfil` y `red`.
2. Obtenga la transacción (sección 6). Anote `created_at`, `ledger`, `memo` y el `value` de `manage_data` `pacta`.
3. Decodifique el `memo` de base64 a hex: es el `compromiso` publicado. El `value` debe ser `1;<plantilla>`, y esa plantilla debe ser igual a `plantilla.id@plantilla.version` del Documento.
4. Canonicalice `documento` (sección 3), tal cual, con las firmas.
5. Calcule `SHA-256(Sal ‖ D)` y compárelo con el paso 3. Si no coincide, el Documento o la Sal no son los sellados.
6. Verifique las dos firmas (sección 5).
7. Compruebe que `texto` es el que produce la Plantilla de esa versión con esos `parametros` (el SDK exige esto; el texto de la plantilla está en `plantilla.ts`, `TEMPLATEMARK`; conviene archivar una copia).
8. Conclusión: el Documento existía desde `created_at`. La atribución de cada clave a una persona se pide al Integrador.

Ejemplo (Python 3, solo biblioteca estándar; paso 5). Probé que da el mismo resultado que el código JavaScript del SDK con un documento de ejemplo:

```python
import json, hashlib
resp = json.load(open("respaldo.json", encoding="utf-8"))
d = json.dumps(resp["documento"], sort_keys=True, separators=(",", ":"), ensure_ascii=False)
sal = bytes.fromhex(resp["sal"])            # 32 bytes
print(hashlib.sha256(sal + d.encode("utf-8")).hexdigest())   # comparar con el memo en hex
# memo en hex:  echo "<memo base64>" | base64 -d | xxd -p -c 64
```

Con herramientas de consola: guarde `D` en `d.json` y la sal en `sal.bin` (`xxd -r -p`), y `cat sal.bin d.json | sha256sum`. Para el mensaje SEP-53, `(printf 'Stellar Signed Message:\n'; cat mensaje.json) | openssl dgst -sha256 -binary` da el resumen que firma Ed25519. `jq -S -c` **no** es JCS en general: jq ordena las claves por punto de código Unicode y JCS por unidades de código UTF-16, y difieren con caracteres fuera del plano básico (p. ej. emojis); tampoco garantiza la misma forma de los números. Para la Plantilla actual, cuyas claves son todas ASCII y cuyo único número es un entero, el orden coincide; aun así conviene contrastar el resultado con el cálculo de la sección 4. No lo probé con un Documento real `[?]`.

## 8. Cómo se vincula la cuenta que sella con el Integrador

El Sello solo nombra la cuenta que firmó la transacción (`source_account`, o `cuenta` en el Respaldo). Para saber que esa cuenta es de un Integrador concreto se usa **SEP-1** de Stellar, en ambos sentidos:

1. La cuenta declara un `home_domain` (campo de la cuenta en Horizon: `GET {horizon}/accounts/{cuenta}`).
2. Ese dominio publica `https://<home_domain>/.well-known/stellar.toml` con la cuenta en `ACCOUNTS` y, opcionalmente, el nombre de la organización en `[DOCUMENTATION]` → `ORG_NAME`.

Solo si ambas cosas se cumplen, quien controla el dominio reconoce la cuenta y quien controla la cuenta apunta al dominio. El SDK lo comprueba con `comprobarCuentaIntegrador(cuenta, { red?, fetch?, timeoutMs? })` (`cuenta.ts`), que devuelve `estado` (`vinculada`, `no_vinculada` o `no_comprobable`), `dominio`, `listadaEnDominio`, `organizacion` y `motivo`. No lanza por errores de red. Como el `home_domain` lo fija quien controla la cuenta, el SDK no sigue redirecciones al pedir el toml (debe servirse desde el propio dominio), rechaza dominios de un solo rótulo o con TLD interno o reservado (`internal`, `local`, `localhost`, `corp`, `lan`, `home`, `test`, `invalid`, `example`), acepta TLD punycode y un punto final, y limita el plazo (8 s por solicitud, cuerpo incluido) y el tamaño del toml (100 KiB, medido en bytes). El tope de 100 KB es el que fija SEP-1 (v2.7.0: «`stellar.toml` can have a maximum file size of 100KB»), que además exige servir el archivo con CORS abierto. Ante un toml dudoso (ACCOUNTS que no es arreglo, repetido o mal formado) el resultado es "no lista la cuenta". Limitaciones: acredita el control de un dominio, no la identidad legal de quien lo opera; y refleja el estado **actual** de la cuenta y del dominio, no el del día del Sello (el `home_domain` puede cambiarse después). Por eso conviene archivar una copia del `stellar.toml` y de la respuesta de Horizon al emitir el Sello. `[?]` El lector de TOML del SDK es mínimo (solo `ACCOUNTS` de la raíz y `ORG_NAME`).
