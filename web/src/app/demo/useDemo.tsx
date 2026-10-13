"use client";

// Estado de la demo, en memoria del navegador. Dos Partes (Ana | Larry) y el
// Integrador comparten este estado porque viven en la misma pantalla; en la
// vida real cada uno tiene su teléfono y el Integrador su servidor.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Keypair } from "@stellar/stellar-sdk";
import {
  anclarSello,
  armarRespaldo,
  construirSello,
  crearCuentaTestnet,
  TESTNET,
  autorizarConPasskey,
  calcularCompromiso,
  crearDocumento,
  desafioDeFirma,
  estaCompleto,
  firmarDocumento,
  generarSal,
  nuevaClaveContrato,
  passkeyDisponible,
  type Autorizacion,
  type Documento,
  type ParametrosPrestamo,
  type RolParte,
} from "@pacta/sdk";

export type Persona = "Ana" | "Larry";
export const PERSONA_DE: Record<RolParte, Persona> = { acreedor: "Ana", deudor: "Larry" };

/** El Sello del contrato firmado. Es el único: los cambios de Estado no se anclan. */
export interface RegistroSello {
  tx: string;
  url: string | null;
  /** Ledger y cuenta que selló, para el Respaldo. Solo en sellos reales. */
  ledger?: number;
  cuenta?: string;
  fecha: string;
  /** true si se selló en modo sin red: no hay transacción real. */
  simulado: boolean;
}

export interface EstadoDemo {
  documento: Documento | null;
  sal: string | null;
  compromiso: string | null;
  sello: RegistroSello | null;
  ocupado: string | null;
  error: string | null;
}

const INICIAL: EstadoDemo = {
  documento: null,
  sal: null,
  compromiso: null,
  sello: null,
  ocupado: null,
  error: null,
};

/**
 * Identidad de cada Parte. La verifica el KYC del Integrador (cédula, selfie,
 * Soyio, Veriff…), no el SDK: al SDK solo llega el identificador opaco
 * `verificacion`. La demo no simula el KYC; asigna un ver_… ficticio.
 */
export interface Identidad {
  nombre: string;
  verificacion: string;
}

interface Api {
  s: EstadoDemo;
  identidades: Record<Persona, Identidad>;
  sinPasskey: boolean;
  setSinPasskey: (v: boolean) => void;
  sinRed: boolean;
  setSinRed: (v: boolean) => void;
  proponer: (p: Pick<ParametrosPrestamo, "monto" | "fechaPago" | "ciudad">) => void;
  firmar: (rol: RolParte) => Promise<void>;
  reiniciar: () => void;
}

interface Secretos {
  claves: Partial<Record<RolParte, Keypair>>;
  /** Cuenta del Integrador en testnet: efímera, financiada por friendbot. Ancla el Sello. */
  integrador: Keypair;
  integradorFinanciado: boolean;
}

// El KYC del Integrador se enchufa aquí. La demo usa un ver_… ficticio y fijo por
// Parte (fijo para que el servidor y el navegador rendericen lo mismo).
const IDENTIDADES: Record<Persona, Identidad> = {
  Ana: { nombre: "Ana", verificacion: "ver_sfz72bd29cst" },
  Larry: { nombre: "Larry", verificacion: "ver_7fvngzs1f9ug" },
};

const Ctx = createContext<Api | null>(null);

const CLAVE_PASSKEY = "pacta:passkey-demo";

/** Respaldo del contrato con ledger, fecha y cuenta del anclaje cuando el sello es real. */
export function respaldoDeSello(doc: Documento, sal: string, sello: RegistroSello) {
  const ancla = sello.simulado || !sello.ledger || !sello.cuenta ? undefined : { ledger: sello.ledger, fecha: sello.fecha, cuenta: sello.cuenta };
  return armarRespaldo(doc, sal, sello.tx, TESTNET, ancla);
}

function txSimulada(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<EstadoDemo>(INICIAL);
  const [sinPasskey, setSinPasskey] = useState(false);
  const [sinRed, setSinRed] = useState(false);
  const identidades = IDENTIDADES;
  // Secretos fuera del estado visible: claves de firma por contrato y la del Integrador.
  const secretos = useRef<Secretos>({
    claves: {},
    integrador: Keypair.random(),
    integradorFinanciado: false,
  });
  // Una sola passkey de demo por dispositivo, para Ana y Larry, que se reutiliza entre
  // recargas. Así el teléfono de quien presenta no acumula una passkey por prueba.
  const usarPasskey = useCallback(async (desafio: Uint8Array) => {
    let existente: string | undefined;
    try {
      existente = localStorage.getItem(CLAVE_PASSKEY) ?? undefined;
    } catch {
      // Sin almacenamiento: se crea una por sesión.
    }
    let passkey;
    try {
      passkey = await autorizarConPasskey({ etiqueta: "Demo", desafio, credencialExistente: existente });
    } catch (e) {
      // Si la passkey guardada ya no está en el teléfono (la borraron), el próximo intento crea otra.
      if (existente)
        try {
          localStorage.removeItem(CLAVE_PASSKEY);
        } catch {}
      throw e;
    }
    try {
      localStorage.setItem(CLAVE_PASSKEY, passkey.credencial);
    } catch {
      // Ídem.
    }
    return passkey;
  }, []);

  const actualizar = useCallback((f: (s: EstadoDemo) => Partial<EstadoDemo>) => setS((prev) => ({ ...prev, ...f(prev) })), []);

  const sellar = useCallback(
    async (compromiso: string, doc: Documento): Promise<RegistroSello | null> => {
      const sello = construirSello({ compromiso, plantilla: doc.plantilla });
      setS((prev) => ({ ...prev, ocupado: "Integrador sella el contrato firmado en Stellar…", error: null }));
      let registro: RegistroSello;
      let aviso: string | null = null;
      try {
        if (sinRed) {
          // Pausa breve para que el sellado se vea en pantalla.
          await new Promise((r) => setTimeout(r, 1400));
          throw new Error("modo sin red");
        }
        const sec = secretos.current;
        if (!sec.integradorFinanciado) {
          sec.integrador = await crearCuentaTestnet();
          sec.integradorFinanciado = true;
        }
        const a = await anclarSello(sello, sec.integrador, {
          red: TESTNET,
          clavesDePartes: doc.firmas.map((f) => f.clavePublica),
        });
        registro = { tx: a.tx, url: a.url, fecha: a.fecha, ledger: a.ledger, cuenta: a.cuenta, simulado: false };
      } catch (e) {
        if (!sinRed)
          aviso = `Stellar testnet no respondió (${(e as Error).message}). Sellado en modo sin red, rotulado como simulado.`;
        registro = { tx: txSimulada(), url: null, fecha: new Date().toISOString(), simulado: true };
      }
      setS((prev) => ({ ...prev, sello: registro, ocupado: null, error: aviso }));
      return registro;
    },
    [sinRed],
  );

  const proponer = useCallback(
    (p: Pick<ParametrosPrestamo, "monto" | "fechaPago" | "ciudad">) => {
      try {
        const hoy = new Date();
        const fechaEntrega = new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        const documento = crearDocumento({
          parametros: {
            acreedor: identidades.Ana,
            deudor: identidades.Larry,
            moneda: "CLP",
            fechaEntrega,
            ...p,
          },
        });
        secretos.current.claves = {};
        setS({ ...INICIAL, documento, sal: generarSal() });
      } catch (e) {
        actualizar(() => ({ error: (e as Error).message }));
      }
    },
    [actualizar, identidades],
  );

  const firmar = useCallback(
    async (rol: RolParte) => {
      const doc = s.documento;
      if (!doc || !s.sal) return;
      const persona = PERSONA_DE[rol];
      actualizar(() => ({ ocupado: `${persona} firma…`, error: null }));
      try {
        let autorizacion: Autorizacion;
        if (sinPasskey || !passkeyDisponible()) {
          autorizacion = { tipo: "simulada", motivo: passkeyDisponible() ? "modo sin passkey de la demo" : "navegador sin WebAuthn" };
        } else {
          autorizacion = await usarPasskey(await desafioDeFirma(doc));
        }
        const clave = nuevaClaveContrato();
        secretos.current.claves[rol] = clave;
        const firmado = await firmarDocumento(doc, rol, clave, autorizacion);
        const completo = estaCompleto(firmado);
        const compromiso = completo ? await calcularCompromiso(firmado, s.sal) : null;
        setS((prev) => ({ ...prev, documento: firmado, compromiso, ocupado: null }));
        if (completo && compromiso) await sellar(compromiso, firmado);
      } catch (e) {
        const err = e as Error;
        const cancelado = err.name === "NotAllowedError" || /cancel/i.test(err.message);
        actualizar(() => ({
          ocupado: null,
          error: cancelado
            ? "La passkey no autorizó (cancelada o no disponible). Puedes reintentar o activar «firmar sin passkey (simulado)»."
            : err.message,
        }));
      }
    },
    [s.documento, s.sal, sinPasskey, actualizar, sellar, usarPasskey],
  );

  const reiniciar = useCallback(() => {
    secretos.current.claves = {};
    setS(INICIAL);
  }, []);

  const api = useMemo<Api>(
    () => ({ s, identidades, sinPasskey, setSinPasskey, sinRed, setSinRed, proponer, firmar, reiniciar }),
    [s, identidades, sinPasskey, sinRed, proponer, firmar, reiniciar],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useDemo(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error("useDemo fuera de DemoProvider");
  return api;
}
