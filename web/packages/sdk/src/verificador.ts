// Verificador: dado Documento + Sal + transacción, dice si coinciden y desde
// cuándo existe el documento. No depende de nadie: recalcula el Sello y lo
// compara con lo que está en la cadena.

import { leerSello, TESTNET, type Anclaje, type Red, type SelloEnCadena } from "./anclaje";
import { estaCompleto, PERFIL_DOCUMENTO, type Documento } from "./documento";
import { verificarFirmas } from "./firma";
import { generarTexto, ID_PLANTILLA_PRESTAMO } from "./plantilla";
import { calcularCompromiso, referenciaPlantilla } from "./sello";

export interface RespaldoContrato {
  perfil: "pacta/respaldo/1";
  documento: Documento;
  sal: string;
  tx: string;
  red: Red["nombre"];
  /**
   * Datos informativos del anclaje, opcionales (los respaldos antiguos no los
   * traen). Sirven para ubicar la transacción en los archivos de historia de
   * Stellar años después. La verificación no depende de ellos: lee la cadena.
   */
  /** Número de ledger que incluyó la transacción. */
  ledger?: number;
  /** Fecha de cierre de ese ledger, ISO 8601. */
  fecha?: string;
  /** Cuenta Stellar (G…) que selló: la del Integrador. */
  cuenta?: string;
}

/** Los campos informativos del anclaje que el Respaldo puede guardar. */
export type DatosAnclaje = Pick<Anclaje, "ledger" | "fecha" | "cuenta">;

export interface ResultadoVerificacion {
  coincide: boolean;
  compromisoCalculado: string | null;
  enCadena: SelloEnCadena | null;
  firmasValidas: boolean;
  plantillaCoincide: boolean;
  /** Fecha del Sello del contrato firmado: desde cuándo existe el documento. */
  desde: string | null;
  motivo: string | null;
  /**
   * Diferencias entre los campos informativos del Respaldo (ledger, fecha,
   * cuenta) y la cadena. No hacen fallar la verificación, pero un Respaldo
   * adulterado en esos campos no debe pasar inadvertido.
   */
  advertencias: string[];
}

/**
 * Respaldo del contrato de una Parte: Documento completo, salt e id de la
 * transacción, en plaintext. Se entrega a cada Parte al firmar y queda en su
 * teléfono; el Integrador no lo conserva (propuesta P7, en evaluación).
 */
export function armarRespaldo(
  documento: Documento,
  sal: string,
  tx: string,
  red: Red = TESTNET,
  ancla?: Partial<DatosAnclaje>,
): RespaldoContrato {
  const r: RespaldoContrato = { perfil: "pacta/respaldo/1", documento, sal, tx, red: red.nombre };
  if (ancla?.ledger !== undefined) r.ledger = ancla.ledger;
  if (ancla?.fecha !== undefined) r.fecha = ancla.fecha;
  if (ancla?.cuenta !== undefined) r.cuenta = ancla.cuenta;
  return r;
}

/** Acepta también "pacta/paquete/1", el perfil de los respaldos descargados antes del 4-oct. */
export function leerRespaldo(texto: string): RespaldoContrato {
  let p: Partial<Omit<RespaldoContrato, "perfil">> & { perfil?: string };
  try {
    p = JSON.parse(texto) as typeof p;
  } catch {
    throw new Error("El archivo no es JSON: no es un respaldo del contrato de Pacta");
  }
  if (
    !p ||
    (p.perfil !== "pacta/respaldo/1" && p.perfil !== "pacta/paquete/1") ||
    !documentoValido(p.documento) ||
    typeof p.sal !== "string" ||
    !/^[0-9a-f]{64}$/i.test(p.sal) ||
    typeof p.tx !== "string" ||
    !p.tx
  )
    throw new Error("No es un respaldo del contrato de Pacta");
  const x = p as Record<string, unknown>;
  if (
    (x.red !== undefined && x.red !== "testnet" && x.red !== "mainnet") ||
    (x.ledger !== undefined && !(typeof x.ledger === "number" && Number.isSafeInteger(x.ledger) && x.ledger > 0)) ||
    (x.fecha !== undefined &&
      !(typeof x.fecha === "string" && /^\d{4}-\d{2}-\d{2}T/.test(x.fecha) && !Number.isNaN(Date.parse(x.fecha)))) ||
    (x.cuenta !== undefined && !(typeof x.cuenta === "string" && /^G[A-Z2-7]{55}$/.test(x.cuenta)))
  )
    throw new Error("El respaldo trae datos de anclaje (red, ledger, fecha o cuenta) con formato inválido");
  return { ...p, perfil: "pacta/respaldo/1" } as RespaldoContrato;
}

function documentoValido(d: unknown): d is Documento {
  const doc = d as Documento;
  return Boolean(doc && doc.perfil === PERFIL_DOCUMENTO && Array.isArray(doc.firmas) && doc.plantilla && doc.contratoId);
}

function textoEsDeLaPlantilla(doc: Documento): boolean {
  try {
    return doc.plantilla.id === ID_PLANTILLA_PRESTAMO && doc.texto === generarTexto(doc.parametros, doc.plantilla.version);
  } catch {
    return false;
  }
}

function advertenciasDeRespaldo(respaldo: Partial<DatosAnclaje> | undefined, c: SelloEnCadena | null): string[] {
  if (!respaldo || !c) return [];
  const a: string[] = [];
  if (respaldo.ledger !== undefined && respaldo.ledger !== c.ledger)
    a.push(`El ledger del respaldo (${respaldo.ledger}) no coincide con la cadena (${c.ledger})`);
  if (respaldo.fecha !== undefined && Date.parse(respaldo.fecha) !== Date.parse(c.fecha))
    a.push(`La fecha del respaldo (${respaldo.fecha}) no coincide con la de la cadena (${c.fecha})`);
  if (respaldo.cuenta !== undefined && respaldo.cuenta !== c.cuenta)
    a.push(`La cuenta que selló según el respaldo no es la de la cadena (${c.cuenta})`);
  return a;
}

/** Compara Documento + Sal con un Sello ya leído de la cadena. Sin red. */
export async function compararConSello(
  documento: unknown,
  sal: string,
  enCadena: SelloEnCadena | null,
  respaldo?: Partial<DatosAnclaje>,
): Promise<Omit<ResultadoVerificacion, "desde">> {
  const advertencias = advertenciasDeRespaldo(respaldo, enCadena);
  const base = { enCadena, compromisoCalculado: null, firmasValidas: false, plantillaCoincide: false, advertencias };
  if (!documentoValido(documento)) return { ...base, coincide: false, motivo: "El archivo no es un Documento de Pacta" };
  if (!/^[0-9a-f]{64}$/i.test(sal.trim())) return { ...base, coincide: false, motivo: "La Sal debe tener 64 caracteres hex" };
  const compromisoCalculado = await calcularCompromiso(documento, sal.trim().toLowerCase());
  const firmasValidas = estaCompleto(documento) && (await verificarFirmas(documento));
  if (!enCadena)
    return { ...base, compromisoCalculado, firmasValidas, coincide: false, motivo: "La transacción no porta un Sello de Pacta" };
  const plantillaCoincide = enCadena.sello.plantilla === referenciaPlantilla(documento.plantilla);
  const selloCoincide = enCadena.sello.compromiso === compromisoCalculado;
  const textoFiel = textoEsDeLaPlantilla(documento);
  // Un Sello que calza no basta: sin firmas válidas o con otro texto, no es el contrato firmado.
  const coincide = selloCoincide && plantillaCoincide && firmasValidas && textoFiel;
  return {
    enCadena,
    compromisoCalculado,
    firmasValidas,
    plantillaCoincide,
    coincide,
    advertencias,
    motivo: coincide
      ? null
      : !selloCoincide
        ? "El Sello recalculado no coincide: el documento o la Sal no son los sellados"
        : !plantillaCoincide
          ? "La plantilla del documento no es la del Sello"
          : !firmasValidas
            ? "El Sello calza, pero las firmas no verifican o faltan"
            : "El Sello calza, pero el texto no es el que genera la plantilla con esos datos",
  };
}

export async function verificar(opciones: {
  documento: unknown;
  sal: string;
  tx: string;
  red?: Red;
  /** Campos informativos del Respaldo (ledger, fecha, cuenta): se contrastan con la cadena y solo generan advertencias. */
  respaldo?: Partial<DatosAnclaje>;
}): Promise<ResultadoVerificacion> {
  const red = opciones.red ?? TESTNET;
  let enCadena: SelloEnCadena | null = null;
  try {
    enCadena = await leerSello(opciones.tx.trim(), red);
  } catch (e) {
    const r = await compararConSello(opciones.documento, opciones.sal, null, opciones.respaldo);
    return { ...r, desde: null, motivo: `No se pudo leer la transacción en ${red.nombre}: ${(e as Error).message}` };
  }
  const r = await compararConSello(opciones.documento, opciones.sal, enCadena, opciones.respaldo);
  return { ...r, desde: r.coincide && enCadena ? enCadena.fecha : null };
}
