# Guía del Integrador

Para el desarrollador que incorpora `@pacta/sdk` en su app. Estado: borrador del 12-oct-2026, sobre el código de la rama `pacta/mesa-redonda`. Lo que no se pudo confirmar en el código o en la documentación oficial va marcado `[?]`.

## 1. Qué es Pacta y qué te toca a ti

Pacta es una capa de acuerdos: dos Partes firman un contrato desde su teléfono y tú, el Integrador, ancla en Stellar un Sello (huella con Sal del Documento completo, más la referencia de plantilla). El SDK define el formato y la comprobación. Todo lo demás es tuyo.

| Del SDK | Del Integrador |
|---|---|
| Formato del Documento, firma SEP-53, cálculo del Sello, formato del Respaldo, verificador | Identidad civil y KYC de las Partes (el SDK solo recibe un identificador opaco `ver_…`, nunca el RUT) |
| Una transacción por contrato con `memo_hash` + `manage_data` | Cuenta Stellar que paga y envía, y su clave secreta |
| Rechazo de registros con Sal, documento en claro o RUT (`validarRegistroIntegrador`) | Datos personales, vínculo persona-clave, base de datos, conservación |

"Pacta no opera infraestructura" es cierto a medias: Pacta no corre servidores, pero **tú sí**, y el más sensible es el que guarda la clave de la cuenta que sella (sección 3).

**Núcleo** (siempre): `crearDocumento`, `firmarDocumento`, `generarSal`, `calcularCompromiso`, `construirSello`, `anclarSello`, `armarRespaldo`, `leerRespaldo`, `leerSello`, `verificar`, `compararConSello`.
**Módulos opcionales**: custodia (`custodiar`, `recuperar`: cifrado AES-GCM con clave repartida 2 de 3), borrado/bloqueo (`crearSolicitudSupresion`, `resolverSolicitudSupresion`, `AlmacenIntegrador`) y pago (`pagar`, `detectarPago`). La demo no usa ninguno.

## 2. Integración mínima

Todo en `web/packages/sdk/src/` (se exporta desde `index.ts`).

1. **Documento.** `crearDocumento({ parametros })` valida los parámetros del préstamo (`validarParametros`) y genera el texto desde la plantilla `pacta/prestamo@1.2.0`.
2. **Firma de cada Parte.** Clave nueva por contrato con `nuevaClaveContrato()`; autorización en el dispositivo con `autorizarConPasskey({ etiqueta, desafio })` (el desafío sale de `desafioDeFirma(doc)`); luego `firmarDocumento(doc, rol, clave, autorizacion)`. Hay que firmar dos veces (acreedor y deudor); `estaCompleto(doc)` confirma.
3. **Sello.** `const sal = generarSal()`; `const compromiso = await calcularCompromiso(doc, sal)`; `const sello = construirSello({ compromiso, plantilla: doc.plantilla })`.
4. **Anclaje.** `anclarSello(sello, cuentaIntegrador, { red, clavesDePartes })` devuelve `{ tx, ledger, fecha, cuenta, url }`. Pasa `clavesDePartes` para que el SDK rechace sellar desde la cuenta de una Parte.
5. **Respaldo.** `armarRespaldo(doc, sal, tx, red)` y entrégalo a cada Parte. No conserves la Sal ni el Documento en claro.
6. **Comprobación.** `verificar({ documento, sal, tx, red })` recalcula el Sello, lo compara con la cadena y revisa firmas y texto de plantilla.

En la cadena solo viajan `memo_hash` (32 bytes) y `manage_data` `pacta` → `1;pacta/prestamo@1.2.0`. `vistaPublica(sello)` muestra exactamente eso.

## 3. La cuenta que sella

**Quién guarda la clave.** `anclarSello` recibe un `Keypair` con la clave secreta: la cuenta paga la comisión, consume el número de secuencia y firma. Esa clave vive en **tu servidor**, nunca en el navegador ni en el teléfono de las Partes. Si se filtra, un tercero puede sellar en tu nombre y vaciar la cuenta; si se pierde, pierdes el control de la cuenta que aparece en todos tus Sellos (los ya anclados siguen válidos).

**Cómo protegerla** (el SDK no impone ninguna; son decisiones tuyas):
- Variable de entorno de un secreto gestionado (gestor de secretos del proveedor), no en el repositorio.
- HSM/KMS que firme la transacción sin exponer la clave: ver "Firmante externo" más abajo.
- Saldo mínimo en la cuenta: lo justo para comisiones, con recarga controlada.
- Una cuenta de operación separada de cualquier cuenta de tesorería.

**Firmante externo.** En el Integrador, el canal y el pagador del fee-bump, el SDK acepta un `Keypair` o un `Firmante` (`{ clavePublica, firmar(hash) }`). `firmar` recibe el hash de la transacción (32 bytes) y devuelve la firma Ed25519 (64 bytes), sin que la clave salga de tu servicio de claves. El SDK verifica la firma contra `clavePublica` antes de aceptarla y lanza un error si no verifica, así que un KMS mal configurado no produce una transacción que se envíe. `firmanteDeKeypair(kp)` adapta un `Keypair`.

```ts
const firmante: Firmante = { clavePublica: "G…", firmar: (hash) => miKms.firmar(hash) };
await anclarSello(sello, firmante, { red: MAINNET });
```

**Qué revela en cadena.** Todos los Sellos del Integrador salen de la misma cuenta: cualquiera ve cuántos contratos cierras y cuándo, y la referencia de plantilla de cada uno. No ve Partes, montos ni contenido.

| Opción para reducirlo | Efecto | Costo |
|---|---|---|
| Rotar de cuenta (p. ej. una por mes o por tanda) | Corta el conteo por cuenta, no por Integrador si la cuenta es identificable | Reserva por cuenta (ver 6) y más claves que custodiar |
| Cuentas canal (sección 4) con una cuenta base | Distribuye la fuente de la transacción en varias cuentas | Cada canal necesita su reserva y su clave |
| Patrón de envío por lotes/horarios | Oculta el momento exacto del cierre | La fecha del ledger ya no coincide con el instante de la firma; hay que declararlo |

Ninguna opción oculta que "este Integrador usa Pacta" si el vínculo cuenta-Integrador es público. Declara esto a tus usuarios.

## 4. Concurrencia: cuentas canal y fee-bump

`anclarSello` (y `prepararSello`) cargan la cuenta de Horizon y construyen una transacción por llamada. Si dos contratos se sellan a la vez desde la misma cuenta, ambos leen la misma secuencia y uno falla con `tx_bad_seq`.

**Qué trae el SDK** (opciones de `prepararSello` y de `anclarSello`):
- `canal: Keypair`: cuenta canal como fuente de la transacción; la operación `manageData` lleva como fuente la cuenta del Integrador, y firman ambas claves. El Sello sigue atribuido al Integrador: `leerSello` devuelve como `cuenta` el origen de la operación, no el del canal. La cuenta canal debe existir y tener saldo.
- `feeBump: { pagador: Keypair, comisionMaxima? }`: envuelve la transacción firmada en un fee-bump pagado por otra cuenta. El hash de la transacción interna no cambia (`hashInterno`); el `hash` que se consulta es el del sobre externo.
- `secuencia: string`: número de secuencia actual de la cuenta fuente (el canal, si hay). Evita la consulta a Horizon; es la forma de llevar tú el control de secuencias por canal.
- `comisionMaxima: string`: comisión por operación en stroops (por defecto `BASE_FEE`).
- `timebounds` o `ventanaSegundos`: por defecto la transacción vale 180 s (`VENTANA_SEGUNDOS`).
- `clavesDePartes` rechaza también un canal o un pagador que sea clave de una Parte.

- **Cuentas canal.** Según la documentación oficial, las transacciones de una cuenta deben llegar en incrementos de una unidad de secuencia; a ritmo alto pueden llegar desordenadas y rebotar. La receta: crear cuentas canal que sean la cuenta fuente de la transacción (ponen secuencia y comisión), y firmar con la clave del canal y la de la cuenta base. Para Pacta, el canal sería la fuente de la transacción y la operación `manageData` puede llevar la cuenta base como fuente. https://developers.stellar.org/docs/build/guides/transactions/channel-accounts
- **Fee-bump.** Una cuenta distinta paga la comisión de una transacción ya firmada, sin volver a firmarla ni tocar secuencias; sirve también para subir la comisión si hay tarifa dinámica por congestión. https://developers.stellar.org/docs/build/guides/transactions/fee-bump-transactions
- **Reservas patrocinadas.** Para no inmovilizar saldo en cada canal, otra cuenta puede patrocinar su reserva. https://developers.stellar.org/docs/build/guides/transactions/sponsored-reserves

**Cuándo hacen falta.** Si sellas pocos contratos por minuto y los envías en serie (una cola de un solo trabajador), una cuenta basta. Canales cuando varios workers o picos de cierres simultáneos superen eso. Fee-bump cuando quieras separar quién paga de quién arma la transacción, o reintentar con más comisión. El SDK **no** administra un pool de canales: tú eliges el canal de cada contrato y llevas su secuencia (o la dejas a Horizon). Con varios workers, usa un canal distinto por worker.

## 5. Errores de envío y reintentos sin doble Sello

La documentación oficial separa dos casos (https://developers.stellar.org/docs/data/apis/horizon/api-reference/errors/error-handling):
- **Error de solicitud** (400, códigos en `extras.result_codes`): corregir y reenviar. `tx_insufficient_fee` se arregla con fee-bump.
- **Timeout (504) o `PENDING`**: no es un fallo; la transacción puede entrar después. Hay que **consultar por el hash**, no reenviar a ciegas. Un 404 sobre el hash significa "aún no incluida o no lo logró".
- `tx_bad_seq`: único error que permite reintentar reconstruyendo la transacción con la secuencia actual (documentación de Horizon sobre `transaction_failed`: https://developers.stellar.org/docs/data/apis/horizon/api-reference/errors/http-status-codes/horizon-specific/transaction-failed).

**El riesgo de doble Sello.** Reenviar el **mismo XDR firmado** es seguro (misma secuencia y mismo hash: el segundo envío queda como duplicado o rebota). Reconstruir la transacción tras un timeout, en cambio, usa otra secuencia y genera otro hash: dos Sellos del mismo contrato. El SDK separa los dos pasos para evitarlo:

- `prepararSello(sello, cuentaIntegrador, opciones?): Promise<SelloPreparado>` arma y firma sin enviar. Devuelve `{ xdr, hash, hashInterno, red, cuenta, expiraEn, conFeeBump }`. El hash sale del XDR, así que es el mismo siempre.
- `enviarSello(preparado, { red?, servidor?, intentos?, intervaloMs? }): Promise<Anclaje>` envía ese XDR. Antes de enviar consulta el hash; si ya entró, lo devuelve sin reenviar. Ante timeout o error ambiguo vuelve a consultar el hash (con fee-bump, también el interno) y reenvía el mismo XDR (hasta 5 intentos, 2 s entre ellos, y como máximo `tiempoMaximoMs`, 25 s por defecto). `tx_insufficient_fee` se reintenta; `tx_bad_seq`, `tx_too_late` y otros rechazos con `result_codes` cortan el reintento, pero antes se consulta el hash y, si la transacción ya está en la cadena, es éxito. Si no logra confirmar, lanza un error: solo afirma "es seguro reconstruir" si el plazo venció (con 30 s de margen) y la última consulta respondió 404; si la consulta falló (429, 500, red), dice que el estado es desconocido y no hay que reconstruir. `prepararSello` rechaza `timebounds.maxTime` 0 (sin vencimiento).
- `anclarSello` sigue igual y hace ambos pasos; úsalo solo si no necesitas guardar el XDR.

Reglas para tu código:
1. Antes de sellar, guarda en tu base `contratoId` → estado `sellando`.
2. Llama `prepararSello` y **guarda el `SelloPreparado` completo** (XDR y hash) antes de enviarlo.
3. Llama `enviarSello(preparado)`. Si falla sin confirmar y `expiraEn` no ha pasado, vuelve a llamarlo con el mismo preparado; no reconstruyas.
4. Solo al vencer `expiraEn` sin que el hash exista en la cadena, vuelve a `prepararSello` (secuencia nueva).
5. Guarda `tx`, `ledger` y `fecha` solo al confirmar.

Para tests y para llevar tú la secuencia, `prepararSello` acepta `secuencia` (sin llamar a Horizon) y `enviarSello` acepta `servidor` (un objeto con `submitTransaction`, `transactions` y `loadAccount`).

## 6. Paso a mainnet

El SDK trae `TESTNET` y `MAINNET` (`Red` en `anclaje.ts`). `MAINNET` usa la passphrase `Public Global Stellar Network ; September 2015`, Horizon `https://horizon.stellar.org`, explorador `https://stellar.expert/explorer/public` y `friendbot: null`. `prepararSello`, `enviarSello`, `anclarSello` y `leerSello` aceptan `red` (testnet por defecto): pasa `red: MAINNET`. `MAINNET` no se ha probado contra la red real `[?]`.

- [ ] Pasar `red: MAINNET` en todas las llamadas (también en `armarRespaldo` y `verificar`); una passphrase equivocada produce otro hash y `enviarSello` lo rechaza.
- [ ] Horizon/RPC: el Horizon público de SDF sirve para empezar, pero SDF indica que su Horizon guarda un año y va camino al fin de vida en favor de RPC (https://developers.stellar.org/docs/data). Para producción, proveedor o nodo propio. `leerSello` y `detectarPago` usan Horizon; migrar a RPC es trabajo pendiente `[?]`.
- [ ] Fondos: la cuenta debe existir con reserva mínima más saldo para comisiones (unos 100 stroops por operación en tarifa base, más recargo por congestión). Cifras actuales de reserva: verificar en la documentación `[?]`.
- [ ] Reservas de canales y cuentas de rotación (sección 3).
- [ ] Clave de la cuenta en gestor de secretos; plan de rotación y de pérdida.
- [ ] Alertas: saldo bajo, tasa de `tx_bad_seq`/timeouts, Sellos en estado `sellando` sin confirmar, caída del Horizon/RPC.
- [ ] Prueba de punta a punta con un contrato real de monto simbólico antes de abrir.
- [ ] Mensaje al usuario que no diga "permanente" para testnet: **testnet se resetea varias veces al año**, los Sellos de la demo no duran (`anclaje.ts`).

## 7. Conservación

Para comprobar un Sello años después hay que poder leer su transacción. El Horizon público de SDF guarda un año de historia (https://developers.stellar.org/docs/data); un RPC suele guardar días (por defecto unos 7, https://developers.stellar.org/docs/data/apis/rpc/admin-guide/configuring). Pasado ese plazo el servicio público puede no devolver la transacción, aunque siga en la red.

Por eso conviene que el Respaldo guarde, además de `tx`, el **número de ledger** y la fecha. **Hoy `RespaldoContrato` (`verificador.ts`) solo tiene `perfil`, `documento`, `sal`, `tx` y `red`**, aunque `anclarSello` ya devuelve `ledger` y `fecha`. Mientras no exista el campo, guarda tú `ledger` y `fecha` junto al Respaldo (en tu base y en el archivo que entregas). Con el ledger se puede ir a un archivo de historia o a otro proveedor y encontrar la transacción `[?]` (procedimiento exacto de recuperación desde archivos de historia no confirmado aquí).

Si todas las copias del Respaldo se pierden, el Sello queda en cadena pero sin Documento ni Sal: no se puede recalcular. Es la copia de las Partes más la tuya (si usas custodia) lo que lo evita.

## 8. Límites que debes declarar a tus usuarios

- **Firma electrónica simple.** Vale como instrumento privado y no hace plena prueba; no da mérito ejecutivo ni sustituye escritura pública (Ley 19.799, arts. 3 y 5, según README).
- **El Sello prueba existencia e integridad en una fecha, no identidad.** No prueba quién firmó ni que el dinero se entregó.
- **La atribución depende de ti.** Tú verificas a las personas (KYC) y guardas el vínculo persona-clave. Controlas además la página donde se crea la clave de cada contrato: podrías falsificar una firma o atribuirla a otra persona. El SDK no lo impide; es un límite de confianza que debes declarar y respaldar con auditoría y registros propios.
- **Pérdida de copias = pérdida de la prueba.** Sin Documento y Sal nadie recalcula el Sello.
- **La `cuenta` que devuelve `leerSello` es informativa.** No autentica al Integrador por sí sola: cualquiera puede anclar el mismo hash desde su cuenta. El vínculo entre un Sello y tu cuenta se comprueba aparte (ver `comprobarCuentaIntegrador` en `cuenta.ts`). `leerSello` solo acepta transacciones exitosas con exactamente un `manage_data` `pacta`.
- **Testnet no es permanente** y la cuenta que sella es visible (sección 3).
- **Borrado:** nunca de oficio; una Parte sola que pide borrar recibe bloqueo y negativa fundada (módulo `borrado.ts`). Las referencias legales son de la rama en evaluación y deben validarlas tus abogados.

## 9. Estado

**Implementado y probado en testnet:** documento y plantilla de préstamo, firma por contrato con SEP-53, Sello, anclaje con `memo_hash`, lectura y verificación, Respaldo, custodia 2 de 3, bloqueo y pago (módulos con pruebas propias en el SDK; el recorrido de la demo no los usa).

**Implementado y probado sin red (simulador de Horizon):** red configurable con `MAINNET`, cuenta canal, fee-bump, comisión máxima, y envío idempotente en dos pasos (`prepararSello` / `enviarSello`), y firmante externo (`Firmante`; no probado contra un KMS real).

**Pendiente o no confirmado:**
- Prueba real en mainnet (`MAINNET` existe y es configurable, sin probar contra la red).
- `ledger` y `fecha` en `RespaldoContrato`.
- Lectura vía RPC en vez de Horizon.
- Verificación de la passkey en cadena (`firma.ts`: solo queda registrada en el Documento).
- Guías oficiales de wallet y smart accounts de las Stellar skills no se aplicaron: la integración no usa wallet del usuario `[?]`.
