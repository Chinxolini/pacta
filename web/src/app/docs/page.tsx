import type { Metadata } from "next";
import Link from "next/link";
import { MODELO_CONCERTO, TEMPLATEMARK } from "@pacta/sdk";

export const metadata: Metadata = {
  title: "@pacta/sdk · Documentación",
  description: "SDK de Pacta para firmar contratos cotidianos con passkey y sellarlos en Stellar con un Sello seudonimizado.",
};

const SECCIONES = [
  ["que-es", "Qué es"],
  ["instalar", "Instalar"],
  ["guia", "Guía rápida"],
  ["lenguaje", "Lenguaje"],
  ["identidad", "Identidad"],
  ["cadena", "Qué va a la cadena"],
  ["modulos", "Módulos"],
  ["plantilla", "Plantilla"],
  ["privacidad", "Privacidad y Ley 21.719"],
  ["por-que-stellar", "Por qué Stellar"],
  ["proximamente", "Próximamente"],
] as const;

const GUIA = `import {
  crearDocumento, nuevaClaveContrato, desafioDeFirma, autorizarConPasskey,
  firmarDocumento, generarSal, calcularCompromiso, construirSello,
  crearCuentaTestnet, anclarSello, armarRespaldo, verificar,
} from "@pacta/sdk";

// 1. El Integrador arma el Documento desde la Plantilla.
//    Las Partes llegan con el identificador que emite el KYC del Integrador,
//    nunca con el RUT.
let doc = crearDocumento({
  parametros: {
    acreedor: { nombre: "Ana Rojas", verificacion: "ver_sfz72bd29cst" },
    deudor: { nombre: "Larry Díaz", verificacion: "ver_7fvngzs1f9ug" },
    monto: 150000, moneda: "CLP",
    fechaEntrega: "2026-09-25", fechaPago: "2026-10-25", ciudad: "Santiago",
  },
});

// 2. Cada Parte autoriza con la passkey de su teléfono y firma
//    con una clave Ed25519 nueva, exclusiva de este contrato.
const claveAna = nuevaClaveContrato();
const passkey = await autorizarConPasskey({ etiqueta: "Ana", desafio: await desafioDeFirma(doc) });
doc = await firmarDocumento(doc, "acreedor", claveAna, passkey);
// … lo mismo para el deudor.

// 3. El Sello: huella con sal. Es lo único que va a la cadena.
const sal = generarSal();
const compromiso = await calcularCompromiso(doc, sal);
const sello = construirSello({ compromiso, plantilla: doc.plantilla });
const cuentaIntegrador = await crearCuentaTestnet();
const anclaje = await anclarSello(sello, cuentaIntegrador, {
  clavesDePartes: doc.firmas.map((f) => f.clavePublica),
});

// 4. Cada Parte descarga el respaldo del contrato (Documento, Sal y transacción).
//    Es su copia. El Integrador no lo conserva.
const respaldo = armarRespaldo(doc, sal, anclaje.tx);

// 5. En juicio: cualquiera recalcula y compara.
const r = await verificar({ documento: doc, sal, tx: anclaje.tx });
console.log(r.coincide, r.desde);`;

/** opcional: ayuda para el Integrador que la necesite. La demo no la usa. */
type Modulo = { nombre: string; que: string; api: string[]; opcional?: boolean };

const MODULOS: Modulo[] = [
  {
    nombre: "Plantilla",
    que: "Texto legal público y versionado (TemplateMark) con parámetros tipados (Concerto). Valida y genera el texto. Rechaza cualquier RUT.",
    api: [
      "validarParametros(entrada): ParametrosPrestamo",
      "generarTexto(parametros): string",
      "PLANTILLA_PRESTAMO, TEMPLATEMARK, MODELO_CONCERTO",
    ],
  },
  {
    nombre: "Documento",
    que: "El contrato en claro con partes, montos, plazos y firmas, en forma canónica JCS (RFC 8785). ID de contrato aleatorio.",
    api: [
      "crearDocumento({ parametros, ahora?, contratoId? }): Documento",
      "canonicalizar(valor): string",
      "contenidoFirmable(doc) · documentoCanonico(doc)",
      "estaCompleto(doc) · firmaDe(doc, rol)",
    ],
  },
  {
    nombre: "Firma",
    que: "Clave Ed25519 nueva por contrato. Firma SEP-53, verificable con stellar message verify. La passkey (WebAuthn) autoriza en el dispositivo.",
    api: [
      "nuevaClaveContrato(): Keypair",
      "autorizarConPasskey({ etiqueta, desafio, credencialExistente? })",
      "firmarDocumento(doc, rol, clave, autorizacion): Promise<Documento>",
      "verificarFirmas(doc) · firmarMensaje · verificarMensaje",
    ],
  },
  {
    nombre: "Sello",
    que: "compromiso = SHA-256(sal ‖ documento canónico), sal de 256 bits por contrato. construirSello es la única vía a algo anclable.",
    api: [
      "generarSal(): string",
      "calcularCompromiso(doc, sal) · verificarCompromiso(doc, sal, compromiso)",
      "construirSello({ compromiso, plantilla }): Sello",
      'metadatosSello(sello) → "1;pacta/prestamo@1.2.0"',
    ],
  },
  {
    nombre: "Anclaje",
    que: "Una sola transacción por contrato, cuando firman las dos Partes, desde la cuenta del Integrador: memo_hash = compromiso, manage_data pacta = metadatos. Nunca desde cuentas de las Partes. Los cambios de Estado no se anclan.",
    api: [
      "crearCuentaTestnet(): Promise<Keypair>",
      "anclarSello(sello, cuentaIntegrador, { red?, clavesDePartes? }): Promise<Anclaje>",
      "leerSello(tx, red?): Promise<SelloEnCadena | null>",
      "vistaPublica(sello)",
    ],
  },
  {
    nombre: "Pago",
    que: "El Deudor puede devolver on-chain desde una cuenta nueva, sin memo y nunca desde la cuenta que sella. Es un gesto: el contrato no se sella como «pagado».",
    api: ["pagar({ origen, destino, monto, cuentasProhibidas? })", "detectarPago({ origen, destino, montoMinimo })"],
    opcional: true,
  },
  {
    nombre: "Custodia",
    que: "Documento y Sal cifrados con AES-256-GCM, atados al contrato. La clave se reparte con Shamir 2 de 3 y una porción sola no abre. El Integrador guarda solo el texto cifrado, su porción y el vínculo persona-clave, nunca la Sal ni el Documento legible.",
    api: [
      "custodiar(doc, sal): Promise<Custodia>",
      "recuperar(contratoId, cifrado, porciones)",
      "crearAlmacenMemoria() · validarRegistroIntegrador(registro)",
    ],
    opcional: true,
  },
  {
    nombre: "Solicitud de borrado",
    que: "Si una Parte pide borrar sola, el Integrador bloquea el contrato y responde una negativa fundada con aviso de reclamo ante la Agencia (art. 11). Deja un registro con id, fecha, forma de autenticación y decisión, sin contenido. El SDK no borra: ni de oficio ni a pedido de las dos Partes, por ahora.",
    api: [
      "crearSolicitudSupresion({ contratoId, rol, autenticacion })",
      "resolverSolicitudSupresion(almacen, solicitud): RespuestaSupresion",
      "almacen.estaBloqueado(id) · almacen.supresiones()",
    ],
    opcional: true,
  },
  {
    nombre: "Verificador",
    que: "Dado Documento + Sal + transacción, dice si coinciden y desde cuándo existe el documento.",
    api: [
      "verificar({ documento, sal, tx, red? }): Promise<ResultadoVerificacion>",
      "compararConSello(documento, sal, enCadena), sin red",
      "armarRespaldo(doc, sal, tx) · leerRespaldo(texto)",
    ],
  },
  {
    nombre: "Identidad",
    que: "El enchufe del KYC. La verificación la hace el Integrador y al SDK solo llega un identificador opaco. Estas funciones lo ayudan de su lado.",
    api: ["nuevoIdentificadorVerificacion()", "rutValido(rut) · enmascararRut(rut) · contieneRut(texto)"],
  },
];

export default function Docs() {
  return (
    <div className="docs">
      <nav className="docs-toc" aria-label="Contenido">
        <p className="kicker">@pacta/sdk</p>
        <ol>
          {SECCIONES.map(([id, t]) => (
            <li key={id}>
              <a href={`#${id}`}>{t}</a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="docs-cuerpo">
        <p className="kicker">Documentación · v0.1.0</p>
        <h1>@pacta/sdk</h1>
        <p className="lede">
          Un SDK del ecosistema Stellar para que cualquier app haga firmar a dos personas un acuerdo cotidiano desde el
          teléfono y lo selle en la cadena. El Sello prueba que el documento existía en esa fecha y que nadie lo
          cambió.
        </p>

        <section id="que-es">
          <h2>Qué es</h2>
          <p>
            Pacta es un protocolo y un SDK. La app la pone el <strong>Integrador</strong>, que puede ser la billetera,
            el marketplace de arriendos o la fintech donde las personas ya están. Dos <strong>Partes</strong> firman un{" "}
            <strong>Contrato</strong> con la passkey del teléfono, sin wallet. En Stellar queda solo el{" "}
            <strong>Sello</strong>. El <strong>Documento completo</strong> lo conserva cada Parte en el respaldo del
            contrato.
          </p>
          <p>
            En juicio, quien litiga presenta el Documento y la <strong>Sal</strong>, y cualquiera recalcula el Sello y
            lo compara con la cadena. Pruébalo en la <Link href="/demo">demo</Link> y en{" "}
            <Link href="/verificar">comprobar sello</Link>.
          </p>
          <p>
            Lo que Pacta no da. La firma es simple, así que en juicio el documento vale como instrumento privado y no
            hace plena prueba (Ley 19.799, arts. 3 y 5). No tiene mérito ejecutivo. El Sello prueba existencia e
            integridad, y por sí solo no prueba quién firmó. Sirve para contratos que la ley no obliga a hacer ante
            notario.
          </p>
        </section>

        <section id="instalar">
          <h2>Instalar</h2>
          <p>
            Hoy el SDK vive dentro del repositorio (<code>web/packages/sdk</code>) y la demo lo usa tal cual. Publicarlo
            en npm requiere crear la organización <code>@pacta</code>, y eso viene después.{" "}
            <span className="stamp muted">próximamente</span>
          </p>
          <pre className="codigo">{`npm install @pacta/sdk @stellar/stellar-sdk   # próximamente en npm`}</pre>
          <p className="small">
            Corre igual en el navegador y en Node 20+, con WebCrypto, <code>@stellar/stellar-sdk</code> y{" "}
            <code>shamir-secret-sharing</code> como únicas dependencias. En testnet el anclaje y el pago salen del
            navegador, así que el servidor no guarda secretos.
          </p>
        </section>

        <section id="guia">
          <h2>Guía rápida</h2>
          <p>Del préstamo redactado al Sello comprobado, en cinco pasos.</p>
          <pre className="codigo">{GUIA}</pre>
          <p className="small">
            Los cambios de Estado (pagado, resciliado, bloqueado) no se anclan. En la cadena queda solo el contrato
            firmado. Es una propuesta en evaluación.
          </p>
        </section>

        <section id="lenguaje">
          <h2>Lenguaje</h2>
          <dl className="glosario">
            <dt>Parte</dt>
            <dd>Persona natural que firma. En el préstamo, acreedor o deudor.</dd>
            <dt>Integrador</dt>
            <dd>Empresa cuya app usa el SDK y ante la cual firman las Partes. Es el responsable de los datos.</dd>
            <dt>Árbitro</dt>
            <dd>Rol del Integrador cuando una Parte pide algo sola. Hoy resuelve las solicitudes de borrado.</dd>
            <dt>Plantilla</dt>
            <dd>Texto legal público y versionado con variables tipadas y nombradas.</dd>
            <dt>Documento completo</dt>
            <dd>El contrato en claro con partes, montos, plazos y firmas. Es lo que se presenta en juicio.</dd>
            <dt>Sello</dt>
            <dd>Lo que queda en Stellar: huella del contrato firmado con sal, plantilla y fecha. Sin Estado.</dd>
            <dt>Sal</dt>
            <dd>Valor aleatorio sin el cual el Sello no se puede recalcular ni reconocer.</dd>
            <dt>Estado</dt>
            <dd>Vigente, pagado, resciliado o bloqueado. No se ancla en la cadena.</dd>
            <dt>Vínculo persona-clave</dt>
            <dd>Registro del Integrador que dice qué persona está detrás de cada clave de firma.</dd>
            <dt>Borrado</dt>
            <dd>
              Eliminación, fuera de la cadena, del texto cifrado, la porción del Integrador y el vínculo persona-clave. El
              SDK no lo hace por ahora. El borrado a pedido de las dos Partes quedó para más adelante.
            </dd>
            <dt>Bloqueo</dt>
            <dd>
              Respuesta del Integrador cuando una Parte pide borrar sola (art. 8 ter). Mientras dure, nadie abre el
              contrato por el flujo normal.
            </dd>
          </dl>
        </section>

        <section id="identidad">
          <h2>Identidad: el enchufe del Integrador</h2>
          <p>
            El SDK no verifica identidades. Lo hace el KYC que el Integrador ya usa (cédula y selfie, Soyio, Veriff u
            otro). Ese sistema emite un identificador opaco por persona, del tipo <code>ver_…</code>, y es lo único que
            el SDK recibe. El RUT y los datos de la verificación se quedan con el Integrador.
          </p>
          <pre className="codigo">{`// Del lado del Integrador, después de su KYC:
const verificacion = await miKyc.verificar(usuario); // "ver_sfz72bd29cst"
crearDocumento({ parametros: { acreedor: { nombre, verificacion }, … } });`}</pre>
          <p>
            Lo que prueba Pacta es que las claves X e Y firmaron este documento y que existía a la hora del ledger. Que
            esas claves son de Ana y de Larry lo sabe el Integrador, por el vínculo persona-clave que guarda. En juicio,
            el Integrador acredita ese vínculo. La demo no simula el KYC: asigna un <code>ver_…</code> ficticio.
          </p>
          <p className="small">
            En evaluación: que el Integrador firme una constancia de ese vínculo y que vaya en el respaldo del contrato, para
            que cualquiera pueda comprobarlo sin pedírselo.
          </p>
        </section>

        <section id="cadena">
          <h2>Qué va a la cadena</h2>
          <div className="ledger">
            <div>
              <h3>En Stellar</h3>
              <ul>
                <li>
                  <code>memo_hash</code>: el compromiso, 32 bytes
                </li>
                <li>
                  <code>manage_data pacta</code>: <code>1;pacta/prestamo@1.2.0</code>
                </li>
                <li>La fecha del ledger</li>
                <li>La cuenta efímera del Integrador que ancla</li>
              </ul>
            </div>
            <div>
              <h3>Nunca</h3>
              <ul>
                <li>Nombres, RUT ni identificadores de verificación</li>
                <li>Montos, plazos ni ciudad del contrato</li>
                <li>Claves públicas o firmas de las Partes</li>
                <li>El contrato, ni siquiera cifrado (EDPB 02/2025 §51)</li>
                <li>El Estado del contrato: pagado, resciliado o bloqueado</li>
              </ul>
            </div>
          </div>
          <p className="small">
            Si el Integrador usa el módulo opcional de pago, la devolución sí deja su monto visible. Sale sin memo y desde una cuenta nueva, así que nada lo
            asocia a un contrato ni a una persona. Ese vínculo lo conoce solo el Integrador.
          </p>
        </section>

        <section id="modulos">
          <h2>Módulos</h2>
          <p>
            Cada módulo se define por su interfaz. Si aparece un problema normativo, se cambia ese módulo y el resto
            sigue igual. El registro on-chain lleva versión para poder migrar. Los módulos marcados como opcionales son
            ayudas para el Integrador que las necesite (guardar el contrato, responder una solicitud de borrado, cobrar
            on-chain). El flujo mínimo no los usa.
          </p>
          <div className="modulos">
            {MODULOS.map((m) => (
              <section key={m.nombre} className="modulo">
                <h3>
                  {m.nombre} {m.opcional && <span className="stamp muted">opcional</span>}
                </h3>
                <p>{m.que}</p>
                <ul>
                  {m.api.map((a) => (
                    <li key={a}>
                      <code>{a}</code>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>

        <section id="plantilla">
          <h2>La Plantilla del préstamo</h2>
          <p>
            Sigue el estándar abierto del Accord Project, gobernado por la Linux Foundation. El texto va en TemplateMark
            y los parámetros en un modelo Concerto. El motor oficial es pesado para el navegador, así que el SDK valida
            contra el mismo modelo y rinde las mismas variables. Si más adelante se genera con el motor oficial en build
            o en servidor, la interfaz se mantiene.
          </p>
          <h3>Modelo Concerto</h3>
          <pre className="codigo">{MODELO_CONCERTO}</pre>
          <h3>TemplateMark</h3>
          <pre className="codigo">{TEMPLATEMARK}</pre>
        </section>

        <section id="privacidad">
          <h2>Privacidad y Ley 21.719</h2>
          <p>
            La Ley 21.719, vigente desde el 1 de diciembre de 2026, no permite dejar un registro inmutable y público de
            que alguien le debe plata a otro. Poner el contrato en una cadena, aunque sea cifrado, choca con eso. Por eso
            en la cadena va solo un compromiso con sal (EDPB 02/2025 §52), y todo lo demás queda fuera de ella.
          </p>
          <p>
            El Sello es un dato seudonimizado (EDPB 02/2025 §52). Quien tenga el Documento y la Sal puede vincularlo con
            las Partes. Por eso, si el Integrador guarda el contrato, guarda solo el texto cifrado y su porción de la
            clave, nunca la Sal. Para el
            tribunal es identificable, porque quien litiga presenta el Documento y la Sal.
          </p>
          <p>
            Nadie borra la prueba por su cuenta. Si una Parte pide borrar sus datos, el Integrador bloquea el contrato y
            responde con el fundamento, porque el contrato es prueba para las dos ante un reclamo (art. 7 inc. 2 numeral vi,
            texto de la Ley 21.719, vigente desde el 1-12-2026; hasta esa fecha, art. 12 inc. 4 del texto original).
            Le avisa que puede reclamar ante la Agencia (art. 11). Tampoco borra de oficio.
          </p>
          <p>
            El SDK hace que cumplir sea lo normal. Solo permite anclar un compromiso y rechaza un RUT en los parámetros.
            Cada contrato usa una clave nueva, porque la misma clave repetida en todos los contratos de una persona los
            vincularía entre sí (EDPB §64).
          </p>
          <p className="small">
            Testnet se resetea varias veces al año, así que los sellos de la demo no son permanentes. Un anclaje real va
            en mainnet.
          </p>
        </section>

        <section id="por-que-stellar">
          <h2>Por qué Stellar</h2>
          <p>Una huella se puede dejar en cualquier cadena. Lo propio de Stellar es esto:</p>
          <ul>
            <li>Multifirma nativa con umbrales, que es la llave de tres puntas.</li>
            <li>Passkeys para firmar con huella o cara sin instalar una wallet (verificación secp256r1 en Soroban).</li>
            <li>Pago y contrato en la misma cadena. El préstamo se puede devolver on-chain.</li>
            <li>ZK nativo desde Protocol 25/26 (BN254, Poseidon).</li>
          </ul>
        </section>

        <section id="proximamente">
          <h2>
            Arquitectura objetivo <span className="stamp muted">próximamente</span>
          </h2>
          <ul>
            <li>
              Una cuenta inteligente Soroban por contrato, con las passkeys verificadas on-chain. Hoy la passkey
              autoriza en el dispositivo.
            </li>
            <li>
              Una prueba ZK de firma (Protocol 25/26), para probar on-chain que firmaron las claves comprometidas sin
              publicarlas.
            </li>
            <li>Una wallet con clave derivada por contrato (SEP-5), para quien ya usa web3.</li>
            <li>Más plantillas, empezando por el arriendo entre particulares.</li>
          </ul>
        </section>
      </article>
    </div>
  );
}
