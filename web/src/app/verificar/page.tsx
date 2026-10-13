import type { Metadata } from "next";
import Verificador from "./Verificador";

export const metadata: Metadata = { title: "Comprobar sello · Pacta" };

export default function PaginaVerificar() {
  return (
    <>
      <section className="prose">
        <p className="kicker">Comprobación pública</p>
        <h1>Comprobar sello</h1>
        <p>
          Quien litiga presenta el Documento completo y la Sal, o el respaldo del contrato que recibió al firmar. Con la
          transacción de Stellar, cualquiera puede comprobar que el documento existía en esa fecha y que nadie lo
          cambió. Sin la Sal, el Sello no dice nada. Quién firmó lo acredita el Integrador con el vínculo
          persona-clave.
        </p>
      </section>
      <Verificador />
    </>
  );
}
