# Pacta

Protocolo y SDK (Pacta) para que dos personas firmen un acuerdo cotidiano desde el
teléfono, dentro de la app de un tercero, y que quede sellado en Stellar. En la
cadena queda solo un Sello seudonimizado del contrato firmado.

## Lenguaje

### Actores

**Parte**:
Persona natural que firma un contrato (en el préstamo: acreedor o deudor).
_Evitar_: usuario, cliente, firmante

**Integrador**:
Empresa cuya app usa el SDK y ante la cual firman las partes; es el responsable de los datos.
_Evitar_: plataforma, proveedor, cliente, partner

**Árbitro**:
Rol del integrador cuando una parte pide algo sola. En la propuesta, resuelve las solicitudes de borrado; ya no aprueba cambios de Estado.
_Evitar_: mediador, validador

### El contrato y sus capas

**Contrato**:
Acuerdo concreto entre dos partes, creado desde una plantilla y con sus parámetros.
_Evitar_: acuerdo (en código), smart contract, pacto

**Plantilla**:
Texto legal público y versionado con variables tipadas y nombradas.
_Evitar_: template, modelo, formato

**Documento completo**:
El contrato en claro con partes, montos, plazos y firmas; es lo que se presenta en juicio.
_Evitar_: PDF, manifiesto (si se habla del contenido legible)

**Sello**:
Lo que queda en Stellar: huella del contrato firmado con sal, plantilla y fecha. Es un dato seudonimizado: quien tenga el Documento completo y la Sal lo vincula con las Partes.
Sin Estado: hay un solo Sello por contrato. 
_Evitar_: ancla, hash, registro on-chain, compromiso (en conversación con no técnicos)

**Sal**:
Valor aleatorio sin el cual el sello no se puede recalcular ni reconocer.
_Evitar_: nonce (en conversación con no técnicos)

**Estado**:
Situación del contrato: vigente, pagado, resciliado o bloqueado. No se ancla en la cadena (un «pagado» o «bloqueado» público funciona como registro de morosidad). 

**Vínculo persona-clave**:
Registro del integrador que dice qué persona está detrás de cada clave de firma.

**Respaldo del contrato**:
Copia de cada Parte, en claro, con el Documento completo, la Sal y la transacción del Sello. La recibe al firmar y el Integrador no la conserva. 
_Evitar_: comprobante, recibo, paquete de prueba (nombre anterior), medio probatorio (es la categoría procesal que admite el tribunal)

### Firma y borrado

**Firmar**:
Aprobar el documento completo con la passkey del teléfono (huella o cara).
_Evitar_: conectar wallet, autenticar

**Borrado**:
Eliminación real, fuera de la cadena, del texto cifrado, la porción del Integrador y el vínculo persona-clave. También cuenta como Borrado destruir todas las claves y sus copias, de modo que nadie pueda ya acceder al dato; destruir una sola porción no basta, porque las otras dos todavía abren. El SDK no la ejecuta: el borrado a pedido de las dos Partes salió del SDK y quedó en backlog. 
_Evitar_: quemar la clave, crypto-shredding, olvido (como sinónimo técnico)

**Quema**:
_En desuso desde el 25-sep._ Era resciliación seguida del borrado; hoy la resciliación no borra.
_Evitar_: burn, destrucción

**Bloqueo**:
Respuesta del Integrador cuando una Parte sola pide borrar (art. 8 ter): congela el contrato, que no se abre por el flujo normal mientras dure, y va con una negativa fundada y aviso de reclamo ante la Agencia (art. 11). Deja un registro con id, fecha, forma de autenticación y decisión, sin contenido. 

## Relaciones

- Un **Contrato** nace de una **Plantilla** y tiene exactamente dos **Partes** y un **Integrador**
- Un **Contrato** tiene un **Documento completo** y un solo **Sello**, el del contrato firmado; los cambios de **Estado** no se anclan. 
- El **Integrador** guarda solo el texto cifrado, su porción de la clave (2 de 3) y el **Vínculo persona-clave**; nunca la **Sal** ni el **Documento completo** en claro. Cada **Parte** guarda su **Respaldo del contrato**. 
- El **Borrado** nunca es de oficio, y el SDK tampoco lo ejecuta a pedido de las dos **Partes** (backlog). 
- Una solicitud de borrado de una sola **Parte** termina en **Bloqueo** y negativa fundada: el contrato es prueba para ambas (Ley 19.628, art. 7 inc. 2 numeral vi, texto de la Ley 21.719, vigente desde el 1-12-2026; hasta esa fecha, art. 12 inc. 4). 

## Diálogo de ejemplo

> **Dev:** "Si el deudor pide borrar su **Contrato**, ¿el **Integrador** lo borra?"
> **Experto legal:** "No. El **Integrador**, como **Árbitro**, lo bloquea y responde una negativa fundada: el contrato es la prueba de las dos **Partes** ante un reclamo (art. 7 inc. 2 numeral vi, texto de la Ley 21.719). Le avisa que puede reclamar ante la Agencia. Tampoco borra de oficio, ni al prescribir."
> **Dev:** "¿Y el **Sello**?"
> **Experto legal:** "Queda. Es un dato seudonimizado: sin la **Sal**, nadie puede saber de qué **Contrato** era."

## Ambigüedades resueltas

- "Borrar el contrato" se usaba para destruir la clave y también para eliminar datos. Resuelto el 10-oct: **Borrado** es eliminar datos, y destruir todas las claves y sus copias también cuenta, porque la ley define la eliminación como «destrucción de datos, cualquiera fuere el procedimiento empleado» (art. 2 h, lectura de la Academia Judicial). Reemplaza el criterio anterior, que seguía al EDPB §51 (destruida la clave, el texto cifrado sigue siendo dato personal); esa lectura no es norma chilena.
- "Wallet" se usaba para firmar y para cifrar. Resuelto: en la demo se **firma** con passkey; la wallet con clave derivada por contrato es opcional.
- "Plataforma" se usaba para nosotros y para el integrador. Resuelto: nosotros somos el protocolo o SDK; la app es el **Integrador**.
