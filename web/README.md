# Pacta · app web y `@pacta/sdk`

Demo pública: https://pacta-demo.vercel.app (Stellar testnet, sin valor real).

- `/` portada · `/demo` préstamo con dos teléfonos (Ana | Larry): firman, se sella en testnet y cada uno descarga el respaldo del contrato · `/verificar` comprobar sello · `/docs` documentación del SDK.
- `packages/sdk/` — `@pacta/sdk`: Plantilla (Accord Project: TemplateMark + Concerto), Documento (JCS), Sello (`SHA-256(sal ‖ documento)`), Firma (Ed25519 por contrato, SEP-53, passkey WebAuthn), Anclaje del contrato firmado, sin Estado (`memo_hash` + `manage_data`), Verificador y respaldo del contrato (`RespaldoContrato`), Identidad (enchufe del KYC del Integrador: al SDK llega solo un `ver_…`). Opcionales para el Integrador, sin uso en la demo: Pago, Custodia (AES-GCM + Shamir 2 de 3) y Solicitud de borrado (bloqueo y negativa fundada).

```bash
npm install
npm run dev            # http://localhost:3000
npm test               # tests sin red
PACTA_TESTNET=1 npm test   # + integración contra testnet (opcional)
npm run typecheck && npm run lint
```

Sin secretos en servidor: el anclaje sale del navegador, desde cuentas efímeras de testnet financiadas por friendbot. Si testnet no responde, la demo sella en modo sin red, rotulado como simulado. Testnet se resetea varias veces al año: los sellos de la demo no son permanentes.

La demo alojada usa la tipografía Equity (Matthew Butterick, licencia propia, no incluida aquí); este repositorio usa EB Garamond como sustituta libre.
