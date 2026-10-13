import Link from "next/link";
import Sello from "./Sello";

export default function Portada() {
  return (
    <>
      <section className="hero">
        <div>
          <p className="kicker">Protocolo y SDK sobre Stellar</p>
          <h1>Un papel para lo que se acuerda por WhatsApp</h1>
          <p className="lede">
            Dos personas se prestan plata y firman el contrato desde el teléfono, con la huella o la cara,
            dentro de la app que ya usan. En Stellar queda solo el Sello, una huella que prueba que el
            documento existía en esa fecha y que nadie lo cambió. Sin la Sal, el Sello no dice de quién es.
          </p>
          <div className="actions">
            <Link className="btn primary" href="/demo">
              Ver la demo del préstamo
            </Link>
            <Link className="btn" href="/verificar">
              Comprobar sello
            </Link>
            <Link className="btn" href="/docs">
              Documentación del SDK
            </Link>
          </div>
        </div>
        <div aria-hidden="true">
          <Sello />
        </div>
      </section>

      <section className="columns">
        <div>
          <span className="num">I.</span>
          <h3>Se firma donde te lo piden</h3>
          <p>
            Pacta es un SDK que se incorpora a la app donde la gente ya está, el Integrador. Cada Parte
            firma con la passkey de su teléfono, sin instalar una wallet.
          </p>
        </div>
        <div>
          <span className="num">II.</span>
          <h3>En la cadena queda una huella</h3>
          <p>
            En la cadena va la huella con sal del contrato firmado, junto a la Plantilla y la fecha. Los
            nombres, los montos, el Estado, las claves de las Partes y el texto cifrado se quedan fuera.
          </p>
        </div>
        <div>
          <span className="num">III.</span>
          <h3>La prueba no se pierde</h3>
          <p>
            Al firmar, cada Parte recibe el respaldo del contrato: el Documento, la Sal y la transacción.
            Con ese archivo cualquiera comprueba el sello, sin depender de Pacta ni del Integrador.
          </p>
        </div>
      </section>

      <section className="ledger">
        <div>
          <h3>Qué queda en la cadena</h3>
          <ul>
            <li>Sello: SHA-256 de la Sal y el Documento canónico</li>
            <li>Plantilla y versión</li>
            <li>Fecha de la transacción</li>
          </ul>
        </div>
        <div>
          <h3>Qué pone el Integrador</h3>
          <ul>
            <li>Su app, donde firman las Partes</li>
            <li>Su KYC, enchufado al SDK (al contrato llega solo un ver_…)</li>
            <li>Vínculo persona-clave, para exhibir en juicio</li>
          </ul>
        </div>
      </section>

      <section className="prose">
        <h2>En juicio</h2>
        <p>
          Quien litiga presenta el Documento y la Sal. Cualquiera recalcula el Sello y lo compara con la
          transacción en Stellar. Si coincide, el documento existía en esa fecha y nadie lo alteró, y para
          comprobarlo no hace falta confiar en Pacta ni en el Integrador.
        </p>
        <p className="note">
          Pacta está diseñado para la Ley 21.719, vigente desde el 1 de diciembre de 2026. El Sello es un
          dato seudonimizado. Quien tenga el Documento y la Sal puede vincularlo con las Partes. En la
          cadena no queda el Estado del contrato, así que nada ahí dice si alguien pagó o debe. Las
          plantillas siguen el estándar abierto del Accord Project.
        </p>
      </section>

      <section className="prose" id="limites">
        <h2>Alcance legal</h2>
        <p>
          Pacta le da a un acuerdo cotidiano lo que le faltaba: un documento electrónico firmado por las dos
          Partes, con una fecha que cualquiera puede comprobar y un texto bien redactado. Llegar a juicio con ese
          documento, y no con un trato de palabra, es la diferencia entre tener un caso y no tenerlo. La identidad
          de las Partes la verifica el Integrador con su KYC y responde por ella. Sirve para contratos que la ley
          no obliga a hacer ante notario, como un préstamo, un reconocimiento de deuda o la compraventa de un
          mueble.
        </p>
        <ul>
          <li>Firma electrónica simple (Ley 19.799): en juicio vale como instrumento privado.</li>
          <li>
            El Sello prueba existencia e integridad. El Integrador acredita quién está detrás de cada clave con el
            vínculo persona-clave.
          </li>
          <li>No es un título ejecutivo: para cobrar, el camino pasa por un tribunal, donde este documento es la base.</li>
          <li>Los actos que exigen escritura pública o notario quedan fuera.</li>
        </ul>
      </section>
    </>
  );
}
