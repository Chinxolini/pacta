# Pacta · Hackathon Stellar *Find Your Way* 2026

**Pacta is an open protocol and SDK that lets any app add phone-signed agreements sealed on Stellar.** Two people sign with a passkey (fingerprint or face), no wallet and no XLM. The app seals a salted SHA-256 of the canonical document in a single Stellar transaction (`memo_hash` + `manage_data`). Anyone holding the document and the salt can recompute the Seal and check it against the ledger without trusting Pacta or the integrating app. Only a salted hash goes on-chain: no names, amounts or contract status.

- Live demo (testnet): https://pacta-beta.vercel.app/demo
- Seal verifier: https://pacta-beta.vercel.app/verificar
- SDK docs: https://pacta-beta.vercel.app/docs
- Seal specification (recompute it without our SDK): [`docs/especificacion-sello.md`](docs/especificacion-sello.md)
- Integrator guide: [`docs/guia-integrador.md`](docs/guia-integrador.md)
- Domain language: [`CONTEXT.md`](CONTEXT.md)
- License: Apache-2.0 ([`LICENSE`](LICENSE))

The rest of this document is in Spanish.

---

**Pacta es un SDK para que cualquier app agregue acuerdos firmados desde el teléfono y sellados en Stellar, de modo que, si las partes discrepan después, cualquiera pueda comprobar que el documento existía en esa fecha y que nadie lo cambió. Está pensado para desarrolladores y empresas (los Integradores); el préstamo entre personas es el primer caso de demostración, no el producto.**

## Qué es

**Demo pública: https://pacta-beta.vercel.app** · Stellar testnet, sin valor real.

Pacta es un protocolo y SDK (`@pacta/sdk`) que cualquier app, el Integrador,
incorpora para que dos Partes firmen un Contrato desde el teléfono con passkey,
sin wallet. En Stellar queda solo el Sello del contrato firmado: huella con sal
del Documento completo, plantilla y fecha, sin Estado. El Documento lo conserva cada Parte en su
respaldo; la custodia cifrada con la clave repartida 2 de 3 es un módulo opcional. La identidad de
las Partes la verifica el Integrador con su propio KYC y responde por ella. En juicio, quien litiga
presenta Documento y Sal y cualquiera recalcula el Sello, que prueba que el
documento existía en esa fecha y que nadie lo cambió. El Sello es un dato
seudonimizado. Nadie borra la prueba por su cuenta. Con el módulo de borrado, si una Parte pide borrar
sola, el Integrador bloquea el contrato y responde con el fundamento (Ley 19.628,
art. 7 inc. 2 numeral vi, texto de la Ley 21.719, vigente desde el 1-12-2026).
Plantillas según el estándar abierto del Accord Project.

La demo muestra el préstamo de Ana a Larry paso a paso, en dos teléfonos:
Ana propone y firma, Larry firma, la app sella en testnet y el sello se
comprueba ahí mismo, incluido qué pasa si alguien cambia el monto. No simula
el KYC ni usa los módulos opcionales (custodia, borrado, pago). Código en [`web/`](web/);
lenguaje del dominio en [`CONTEXT.md`](CONTEXT.md). El verificador está en `/verificar`
y la demo en `/demo`.

Para quien integra: [`docs/especificacion-sello.md`](docs/especificacion-sello.md)
(formato del Sello, para recalcularlo sin depender del SDK) y
[`docs/guia-integrador.md`](docs/guia-integrador.md) (cómo incorporarlo a una app).

### Qué entrega

- Que el documento existía en la fecha y hora de la red.
- Que no cambió desde entonces: cualquier cambio, aun de una coma, rompe la coincidencia.
- Que las dos firmas son válidas para las claves que firmaron; el Integrador acredita con su KYC quién está detrás de cada una.
- Un documento electrónico firmado, fechado y verificable por cualquiera: en juicio, la diferencia entre llegar con un trato de palabra y llegar con un documento.

### Estado

Implementado (código en `web/packages/sdk/src`):
- Núcleo: plantilla versionada (préstamo 1.2.0, en formato Accord Project), documento, firmas (clave por contrato, autorización con passkey), Sello, anclaje en Stellar, Respaldo del contrato y verificador.
- Módulos opcionales: custodia cifrada con clave repartida 2 de 3, bloqueo y negativa fundada ante una solicitud de borrado de una sola Parte, y pago de prueba en testnet.
- Aplicación de ejemplo: la demo guiada y el verificador, en testnet. No usa los módulos opcionales.

Pendiente:
- Mainnet (hoy todo corre en testnet, que se reinicia: los sellos de la demo no son permanentes).
- Paquete publicado en npm (`@pacta/sdk` vive hoy dentro del repositorio).
- Caso en USDC.
- Módulo ejecutable en Soroban.
- Más plantillas.
- Un Integrador real.

### Por qué Stellar

El Sello queda definitivo en unos 5 segundos, con la hora de consenso de la red, a un costo ínfimo.
La Parte nunca necesita XLM ni wallet, y no hay contrato inteligente que mantener: el Sello es una sola transacción
firmada por la cuenta del Integrador.

## Estructura

| Carpeta | Contenido |
|---|---|
| [`web/`](web/) | App Next.js de la demo y `@pacta/sdk` (`web/packages/sdk`) |
| [`docs/`](docs/) | Especificación del Sello y guía del Integrador |
| [`prototipo/`](prototipo/) | Exploración anterior en JavaScript |

## Prototipo

Es una exploración anterior, con un formato distinto al del SDK. El formato
vigente del Sello está en [`docs/especificacion-sello.md`](docs/especificacion-sello.md).

Árbol Merkle con sal por hoja, manifiesto canónico (JCS), firma SEP-53
verificable con `stellar message verify`, anclaje en `memo_hash` y verificador.
Funciona en testnet.

```bash
cd prototipo && npm install && npm test
node anchor.js sample-chat.txt   # ancla en testnet
node verify.js 10                # verifica la cadena completa
```

## Alcance legal

Pacta no da fe pública ni reemplaza la escritura pública. Es firma electrónica simple (Ley 19.799, art. 2 f) con los atributos técnicos de una avanzada, sin prestador acreditado: el documento vale en juicio como instrumento privado, y el cobro por vía ejecutiva pasa antes por un tribunal. Sirve para actos que la ley no obliga a hacer ante notario.

## Equipo

Ignacio, Danilo, Marco Vinicio.

## Licencia

Apache-2.0. La demo alojada usa la tipografía Equity (licencia propia), que no se incluye en este repositorio.
