"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  compararConSello,
  estaCompleto,
  fechaLarga,
  firmaDe,
  pesos,
  verificar,
  type ResultadoVerificacion,
  type RolParte,
} from "@pacta/sdk";
import { CLAVE_TRASPASO } from "../verificar/Verificador";
import { DemoProvider, respaldoDeSello, useDemo, type EstadoDemo, type Persona } from "./useDemo";

export default function Demo() {
  return (
    <DemoProvider>
      <Escena />
    </DemoProvider>
  );
}

/** El recorrido de la demo: un paso por pantalla, como una presentación. */
const PASOS = [
  { titulo: "Ana propone", relato: "Ana le va a prestar plata a Larry. Lo escribe en la app que ya usa." },
  { titulo: "Ana firma", relato: "Ana lee el contrato y lo firma con su huella." },
  { titulo: "Larry firma", relato: "El contrato llega al teléfono de Larry. Lo lee y lo firma." },
  { titulo: "Se sella", relato: "Con las dos firmas, la app sella en Stellar una huella del contrato." },
  { titulo: "Se comprueba", relato: "Cada uno guarda su respaldo. Cualquiera puede comprobarlo, sin depender de nadie." },
] as const;

function pasoActual(s: EstadoDemo): number {
  const doc = s.documento;
  if (!doc) return 1;
  if (!firmaDe(doc, "acreedor")) return 2;
  if (!estaCompleto(doc)) return 3;
  return s.sello ? 5 : 4;
}

function Escena() {
  const { s, sinPasskey, setSinPasskey, sinRed, setSinRed, reiniciar } = useDemo();
  const paso = pasoActual(s);
  return (
    <div className="recorrido">
      <div className="demo-head">
        <div>
          <p className="kicker">Demo · testnet · sin valor real</p>
          <h1>Ana le presta a Larry</h1>
        </div>
        <button className="btn" onClick={reiniciar} disabled={paso === 1}>
          Empezar de nuevo
        </button>
      </div>

      <ol className="pasos" aria-label="Pasos de la demo">
        {PASOS.map((p, i) => (
          <li key={p.titulo} className={i + 1 < paso ? "hecho" : i + 1 === paso ? "actual" : ""} aria-current={i + 1 === paso ? "step" : undefined}>
            <span className="pasos-num">{i + 1 < paso ? "✓" : i + 1}</span>
            {p.titulo}
          </li>
        ))}
      </ol>
      <p className="relato" key={paso} aria-live="polite">
        {PASOS[paso - 1].relato}
      </p>

      {s.error && (
        <p className="alerta" role="alert">
          {s.error}
        </p>
      )}

      <div className="demo-grid">
        <Telefono persona="Ana" rol="acreedor" activo={paso <= 2} fin={paso >= 4}>
          <PantallaAna />
        </Telefono>
        <Centro paso={paso} key={s.documento?.contratoId ?? "sin-contrato"} />
        <Telefono persona="Larry" rol="deudor" activo={paso === 3} fin={paso >= 4}>
          <PantallaLarry />
        </Telefono>
      </div>

      <p className="small demo-limite">
        El Sello prueba que el documento existía en esa fecha y que nadie lo cambió. La identidad de las Partes la verifica
        el Integrador con su propio KYC, que la demo no simula. <Link href="/#limites">Alcance legal</Link>
      </p>
      <details className="ajustes small">
        <summary>Ajustes de la presentación</summary>
        <label>
          <input type="checkbox" checked={sinPasskey} onChange={(e) => setSinPasskey(e.target.checked)} /> firmar sin
          passkey (simulado)
        </label>
        <label>
          <input type="checkbox" checked={sinRed} onChange={(e) => setSinRed(e.target.checked)} /> sin red (Sello
          simulado)
        </label>
      </details>
    </div>
  );
}

function Telefono({
  persona,
  rol,
  activo,
  fin,
  children,
}: {
  persona: Persona;
  rol: RolParte;
  activo: boolean;
  /** Desde el sellado los dos teléfonos se ven a la vez. */
  fin: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`phone-wrap ${activo ? "activo" : fin ? "" : "dormido"}`} aria-label={`Teléfono de ${persona}`}>
      <p className="phone-label">
        <span className="caps">{persona}</span> <span className="small">{rol === "acreedor" ? "presta" : "recibe"}</span>
      </p>
      <div className="phone">
        <div className="phone-status" aria-hidden="true">
          <span>9:41</span>
          <span className="phone-island" />
          <span className="phone-icons">
            <i className="senal" />
            <i className="bateria" />
          </span>
        </div>
        <div className="phone-app">
          <span className="phone-app-nombre">App del Integrador</span>
        </div>
        <div className="screen">{children}</div>
        <div className="phone-home" aria-hidden="true" />
      </div>
    </section>
  );
}

function hoyMas(dias: number): string {
  const d = new Date(Date.now() + dias * 86400000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function PantallaAna() {
  const { s, proponer, firmar } = useDemo();
  const [monto, setMonto] = useState(150000);
  const [fechaPago, setFechaPago] = useState(hoyMas(30));
  const doc = s.documento;

  if (!doc)
    return (
      <form
        className="form entra"
        onSubmit={(e) => {
          e.preventDefault();
          proponer({ monto, fechaPago, ciudad: "Santiago" });
        }}
      >
        <h3>Préstamo a Larry</h3>
        <label>
          Monto (CLP)
          <input type="number" min={1} step={1} value={monto} onChange={(e) => setMonto(Number(e.target.value))} />
        </label>
        <label>
          Devuelve a más tardar
          <input type="date" value={fechaPago} min={hoyMas(1)} onChange={(e) => setFechaPago(e.target.value)} />
        </label>
        <button className="btn primary block" type="submit">
          Ver el contrato
        </button>
      </form>
    );

  if (!firmaDe(doc, "acreedor"))
    return (
      <div className="entra">
        <TextoContrato texto={doc.texto} />
        <Huella ocupado={Boolean(s.ocupado)} onFirmar={() => firmar("acreedor")} />
      </div>
    );

  if (!s.sello)
    return (
      <Estado marca="✓" titulo="Firmaste">
        {estaCompleto(doc) ? "Larry también firmó. Se está sellando." : "El contrato va camino al teléfono de Larry."}
      </Estado>
    );

  return <Sellado persona="Ana" />;
}

function PantallaLarry() {
  const { s, firmar } = useDemo();
  const doc = s.documento;
  if (!doc || !firmaDe(doc, "acreedor")) return <Estado titulo="Sin solicitudes">Aquí llega lo que Ana te proponga.</Estado>;
  if (!firmaDe(doc, "deudor"))
    return (
      <div className="entra">
        <p className="aviso">
          <strong>Ana</strong> te presta <strong>{pesos(doc.parametros.monto)}</strong>. Los devuelves el{" "}
          {fechaLarga(doc.parametros.fechaPago)}.
        </p>
        <TextoContrato texto={doc.texto} />
        <Huella ocupado={Boolean(s.ocupado)} onFirmar={() => firmar("deudor")} />
      </div>
    );
  if (!s.sello)
    return (
      <Estado marca="✓" titulo="Firmaste">
        Se está sellando.
      </Estado>
    );
  return <Sellado persona="Larry" />;
}

/** Botón de firma: la huella del teléfono. */
function Huella({ ocupado, onFirmar }: { ocupado: boolean; onFirmar: () => void }) {
  return (
    <div className="huella-zona">
      <button className={`huella ${ocupado ? "leyendo" : ""}`} disabled={ocupado} onClick={onFirmar} aria-label="Firmar con huella">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M14 38c-3-6-3-14 0-19a12 12 0 0 1 21 1c2 5 2 12 0 18" />
          <path d="M19 40c-2-6-3-13-1-17a7 7 0 0 1 13 1c1 5 1 11-1 16" />
          <path d="M24 41c0-5-1-10 0-16" />
          <path d="M10 26c0-8 5-15 14-15s14 7 14 15" />
        </svg>
      </button>
      <p className="small">{ocupado ? "Firmando…" : "Firmar con huella"}</p>
    </div>
  );
}

function Sellado({ persona }: { persona: Persona }) {
  const { s } = useDemo();
  const doc = s.documento!;
  const respaldo = JSON.stringify(respaldoDeSello(doc, s.sal!, s.sello!), null, 2);
  return (
    <Estado marca="✓" titulo="Sellado">
      {pesos(doc.parametros.monto)} · devolución el {fechaLarga(doc.parametros.fechaPago)}.
      <span className="respaldo-linea">
        <a
          className="btn"
          download={`contrato-prestamo-pacta-${new Date().toISOString().slice(0, 10)}-${persona.toLowerCase()}.json`}
          href={`data:application/json;charset=utf-8,${encodeURIComponent(respaldo)}`}
        >
          Guardar mi respaldo
        </a>
      </span>
      <span className="small">Tu copia del contrato. Guárdala tú: la app no la conserva.</span>
    </Estado>
  );
}

function Estado({ titulo, marca, children }: { titulo: string; marca?: string; children: ReactNode }) {
  return (
    <div className="estado entra">
      {marca && <span className="marca">{marca}</span>}
      <h3>{titulo}</h3>
      <p>{children}</p>
    </div>
  );
}

function TextoContrato({ texto }: { texto: string }) {
  const bloques = texto
    .split("\n\n")
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <div className="contrato">
      {bloques.map((b, i) =>
        b.startsWith("# ") ? (
          <h4 key={i}>{b.slice(2)}</h4>
        ) : (
          <p key={i}>
            {b.split(/(\*\*[^*]+\*\*)/).map((t, j) => (t.startsWith("**") ? <strong key={j}>{t.slice(2, -2)}</strong> : t))}
          </p>
        ),
      )}
    </div>
  );
}

type Comprobacion = { r: Omit<ResultadoVerificacion, "desde"> & { desde?: string | null }; alterado: boolean };

/** Entre los dos teléfonos: el contrato que viaja, el Sello en Stellar y su comprobación. */
function Centro({ paso }: { paso: number }) {
  const { s } = useDemo();
  const [c, setC] = useState<Comprobacion | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const doc = s.documento;
  const sello = s.sello;

  async function comprobar() {
    if (!doc || !s.sal || !sello) return;
    setOcupado(true);
    setError(null);
    try {
      setC({ r: await verificar({ documento: doc, sal: s.sal, tx: sello.tx }), alterado: false });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  // El mismo contrato con otro monto, contra el mismo Sello: no puede coincidir.
  async function alterar() {
    if (!doc || !s.sal || !c) return;
    const falso = { ...doc, parametros: { ...doc.parametros, monto: doc.parametros.monto * 10 } };
    setC({ r: await compararConSello(falso, s.sal, c.r.enCadena), alterado: true });
  }

  function abrirVerificador() {
    if (!doc || !s.sal || !sello) return;
    try {
      localStorage.setItem(CLAVE_TRASPASO, JSON.stringify(respaldoDeSello(doc, s.sal, sello)));
    } catch {
      // Sin almacenamiento: se carga el respaldo a mano.
    }
    window.open("/verificar", "_blank", "noopener");
  }

  return (
    <div className="centro" data-paso={paso}>
      <div className="riel" aria-hidden="true">
        {paso === 3 && <span className="papel" />}
      </div>
      <div className={`lacre ${paso === 4 ? "sellando" : paso === 5 ? "puesto" : ""}`}>
        <span>{paso === 5 ? "Sellado" : paso === 4 ? "Sellando" : "Stellar"}</span>
      </div>

      {paso < 4 && <p className="small centro-nota">Nada en la cadena todavía.</p>}
      {paso === 4 && <p className="small centro-nota">La app envía la huella del contrato a Stellar…</p>}

      {paso === 5 && sello && (
        <div className="entra centro-cuerpo">
          <p className="small">Lo único que quedó en la cadena:</p>
          <p className="mono huella-hex">{s.compromiso}</p>
          <p className="small">
            Ni nombres, ni montos, ni fechas.{" "}
            {sello.url ? (
              <a href={sello.url} target="_blank" rel="noreferrer">
                Ver la transacción
              </a>
            ) : (
              "Sello simulado: no hay transacción real."
            )}
          </p>

          {!sello.simulado && !c && (
            <button className="btn primary" disabled={ocupado} onClick={comprobar}>
              {ocupado ? "Comprobando…" : "Comprobar el sello"}
            </button>
          )}
          {error && <p className="alerta">{error}</p>}
          {c && (
            <div className="veredicto entra" key={String(c.alterado)}>
              <span className={`stamp ${c.r.coincide ? "ok" : ""}`}>{c.r.coincide ? "Coincide" : "No coincide"}</span>
              {c.r.coincide ? (
                <p>
                  Existía el <strong>{c.r.desde ? new Date(c.r.desde).toLocaleString("es-CL") : "—"}</strong> y nadie lo
                  cambió. Las dos firmas verifican.
                </p>
              ) : (
                <p>{c.alterado ? "Con el monto cambiado, el Sello ya no calza." : c.r.motivo}</p>
              )}
              <div className="fila centrada">
                {c.alterado ? (
                  <button className="btn" onClick={comprobar} disabled={ocupado}>
                    Volver al original
                  </button>
                ) : (
                  c.r.coincide && (
                    <button className="btn" onClick={alterar}>
                      ¿Y si alguien cambia el monto?
                    </button>
                  )
                )}
              </div>
            </div>
          )}
          {!sello.simulado && (
            <p className="small">
              <button className="enlace" onClick={abrirVerificador}>
                Abrir el verificador completo
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
