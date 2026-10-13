"use client";

import { useEffect, useState } from "react";
import { leerRespaldo, MAINNET, TESTNET, verificar, type ResultadoVerificacion, type RespaldoContrato } from "@pacta/sdk";

export const CLAVE_TRASPASO = "pacta:respaldo-demo";

export default function Verificador() {
  const [documento, setDocumento] = useState("");
  const [sal, setSal] = useState("");
  const [tx, setTx] = useState("");
  // Respaldo leído: sus datos de anclaje y su red solo valen mientras la transacción no cambie.
  const [respaldo, setRespaldo] = useState<RespaldoContrato | null>(null);
  const [r, setR] = useState<ResultadoVerificacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function cargar(texto: string) {
    try {
      const p = leerRespaldo(texto);
      setDocumento(JSON.stringify(p.documento, null, 2));
      setSal(p.sal);
      setTx(p.tx);
      setRespaldo(p);
      setR(null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Traspaso desde la demo, en el mismo navegador (nunca por la URL).
  useEffect(() => {
    try {
      const t = localStorage.getItem(CLAVE_TRASPASO);
      if (t) {
        localStorage.removeItem(CLAVE_TRASPASO);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- carga única desde la demo
        cargar(t);
      }
    } catch {
      // Sin almacenamiento: se carga el respaldo a mano.
    }
  }, []);

  async function onVerificar() {
    setOcupado(true);
    setError(null);
    setR(null);
    try {
      let doc: unknown;
      try {
        doc = JSON.parse(documento);
      } catch {
        throw new Error("El Documento no es JSON válido");
      }
      const delRespaldo = respaldo && respaldo.tx.trim() === tx.trim() ? respaldo : undefined;
      setR(
        await verificar({
          documento: doc,
          sal,
          tx,
          red: delRespaldo?.red === "mainnet" ? MAINNET : TESTNET,
          respaldo: delRespaldo,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="verificador">
      <div className="form">
        <label>
          Respaldo del contrato (.json)
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) cargar(await f.text());
            }}
          />
        </label>
        <label>
          Documento completo (JSON)
          <textarea rows={10} value={documento} onChange={(e) => setDocumento(e.target.value)} spellCheck={false} />
        </label>
        <label>
          Sal (64 caracteres hex)
          <input value={sal} onChange={(e) => setSal(e.target.value)} spellCheck={false} />
        </label>
        <label>
          Transacción en Stellar {respaldo?.red === "mainnet" ? "mainnet" : "testnet"}
          <input value={tx} onChange={(e) => setTx(e.target.value)} spellCheck={false} />
        </label>
        <button className="btn primary" disabled={ocupado || !documento || !sal || !tx} onClick={onVerificar}>
          {ocupado ? "Comprobando…" : "Comprobar sello"}
        </button>
      </div>

      <div className="resultado" aria-live="polite">
        {error && <p className="alerta">{error}</p>}
        {!r && !error && (
          <p className="small">
            Aquí se recalcula el Sello con el Documento y la Sal, lee la transacción en Stellar y los compara.
            Todo ocurre en este navegador y nada se envía a un servidor de Pacta.
          </p>
        )}
        {r && (
          <>
            <div className="veredicto">
              <span className={`stamp ${r.coincide ? "ok" : ""}`}>{r.coincide ? "Coincide" : "No coincide"}</span>
              {r.coincide && r.desde ? (
                <p>
                  El documento existía el <strong>{new Date(r.desde).toLocaleString("es-CL")}</strong> y nadie lo ha
                  alterado desde entonces.
                </p>
              ) : (
                <p>{r.motivo}</p>
              )}
            </div>
            {r.advertencias.length > 0 && (
              <div className="alerta">
                <p>El respaldo trae datos que no coinciden con lo registrado en la red:</p>
                <ul>
                  {r.advertencias.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
            {r.coincide && (
              <div className="small">
                <p>
                  <strong>Qué prueba</strong>
                </p>
                <ul className="vinculos">
                  <li>Que este documento existía en esa fecha y hora, registradas por la red Stellar.</li>
                  <li>Que no ha sido alterado desde entonces.</li>
                  <li>Que las firmas corresponden a las claves que figuran en el documento.</li>
                </ul>
                <p>
                  <strong>Qué acredita el Integrador</strong>
                </p>
                <ul className="vinculos">
                  <li>
                    Quiénes son las personas detrás de esas claves, con la identidad que verificó la aplicación.
                  </li>
                  <li>El estado de la deuda: Pacta no lo registra, a propósito.</li>
                  <li>Firma electrónica simple (Ley 19.799), para contratos que no exigen notario.</li>
                </ul>
              </div>
            )}
            <dl className="kv">
              <dt>Sello recalculado</dt>
              <dd className="mono">{r.compromisoCalculado ?? "—"}</dd>
              <dt>Sello en la cadena</dt>
              <dd className="mono">{r.enCadena?.sello.compromiso ?? "—"}</dd>
              <dt>Plantilla</dt>
              <dd className="mono">{r.enCadena?.sello.plantilla ?? "—"}</dd>
              <dt>Transacción</dt>
              <dd>
                {r.enCadena ? (
                  <a href={r.enCadena.url} target="_blank" rel="noreferrer" className="mono">
                    {r.enCadena.tx.slice(0, 16)}…
                  </a>
                ) : (
                  "—"
                )}
              </dd>
              <dt>Firmas</dt>
              <dd>{r.firmasValidas ? "Las dos firmas SEP-53 verifican" : "No verifican o faltan"}</dd>
            </dl>
            <p className="small">
              Quién está detrás de cada firma lo acredita el vínculo persona-clave que guarda el Integrador, y se puede
              exhibir en juicio. La integridad y la fecha se comprueban sin depender de nadie.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
