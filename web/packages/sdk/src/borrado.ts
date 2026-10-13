// Solicitud de borrado de una sola Parte: bloqueo y negativa fundada.
// Propuestas P10 a P12, en evaluación.
//
// En la cadena nunca se borra nada: el Sello queda, y sin la salt no apunta a
// nadie. Fuera de la cadena, el Integrador guarda el ciphertext, su key share
// y el vínculo persona-clave.
//
// Reglas:
// - Nunca de oficio. El Integrador no borra por su cuenta.
// - Si una Parte pide borrar sola, el Integrador bloquea el contrato y
//   responde una negativa fundada: el contrato es prueba para ambas Partes
//   (art. 7 inc. 2 numeral vi, texto de la Ley 21.719, vigente desde el
//   1-12-2026; hasta esa fecha, art. 12 inc. 4 del texto original, que admite
//   el bloqueo). Avisa que puede reclamar ante la Agencia (art. 11).
// - El bloqueo es la alternativa a la supresión que prevé la ley (art. 8 ter).
//   Mientras dure, el contrato no se abre por el flujo normal.
// - Queda un registro mínimo, sin contenido ni montos (P12).
// - El borrado a pedido de las dos Partes salió del SDK (P11): queda en
//   backlog con respaldo previo, acta, 14 días de arrepentimiento y registro.

import type { RolParte } from "./documento";
import type { AlmacenIntegrador } from "./integrador";

export const FUNDAMENTO_RETENCION =
  "Ley 19.628, art. 7 inc. 2 numeral vi (texto de la Ley 21.719, vigente desde el 1-12-2026): el tratamiento es necesario para la formulación, ejercicio o defensa de una reclamación administrativa o judicial. Hasta esa fecha rige el art. 12 inc. 4 del texto original, que admite el bloqueo en lugar de la eliminación";

export const MOTIVO_NEGATIVA =
  "El contrato es la prueba de las dos Partes ante un eventual reclamo. Por eso el Integrador no lo borra y lo bloquea. Mientras dure el bloqueo, nadie lo abre por el flujo normal.";

export const AVISO_RECLAMO =
  "Si no estás de acuerdo con esta respuesta, puedes reclamar ante la Agencia de Protección de Datos Personales, dentro del plazo que fija el art. 11 de la Ley 19.628 (texto de la Ley 21.719).";

/** Cómo se autenticó la Parte al pedir. Se registra; nunca se guarda la credencial. */
export type FormaAutenticacion = "passkey" | "simulada" | "otra";

export interface SolicitudSupresion {
  perfil: "pacta/solicitud-supresion/1";
  contratoId: string;
  /** Quién pide. No se guarda en el registro. */
  rol: RolParte;
  autenticacion: FormaAutenticacion;
  recibidaEn: string;
}

export interface RespuestaSupresion {
  decision: "bloqueo-y-negativa";
  contratoId: string;
  bloqueado: true;
  motivo: string;
  fundamento: string;
  avisoReclamo: string;
  fecha: string;
}

/** Registro mínimo de cada solicitud resuelta: sin contenido, sin montos, sin la persona. */
export interface RegistroSupresion {
  perfil: "pacta/registro-supresion/1";
  contratoId: string;
  fecha: string;
  autenticacion: FormaAutenticacion;
  decision: RespuestaSupresion["decision"];
}

export function crearSolicitudSupresion(opciones: {
  contratoId: string;
  rol: RolParte;
  autenticacion: FormaAutenticacion;
  ahora?: Date;
}): SolicitudSupresion {
  return {
    perfil: "pacta/solicitud-supresion/1",
    contratoId: opciones.contratoId,
    rol: opciones.rol,
    autenticacion: opciones.autenticacion,
    recibidaEn: (opciones.ahora ?? new Date()).toISOString(),
  };
}

/**
 * Qué hace el Integrador, como Árbitro, cuando una Parte sola pide borrar sus
 * datos: bloquea el contrato, anota el registro mínimo y devuelve la negativa
 * fundada con el aviso de reclamo.
 */
export function resolverSolicitudSupresion(
  almacen: AlmacenIntegrador,
  solicitud: SolicitudSupresion,
  hoy: Date = new Date(),
): RespuestaSupresion {
  if (solicitud.perfil !== "pacta/solicitud-supresion/1") throw new Error("No es una solicitud de supresión de Pacta");
  if (solicitud.rol !== "acreedor" && solicitud.rol !== "deudor") throw new Error("Solo una Parte puede pedir");
  if (!almacen.existe(solicitud.contratoId)) throw new Error("El Integrador no tiene ese contrato");
  const fecha = hoy.toISOString();
  almacen.bloquear(solicitud.contratoId);
  almacen.anotarSupresion({
    perfil: "pacta/registro-supresion/1",
    contratoId: solicitud.contratoId,
    fecha,
    autenticacion: solicitud.autenticacion,
    decision: "bloqueo-y-negativa",
  });
  return {
    decision: "bloqueo-y-negativa",
    contratoId: solicitud.contratoId,
    bloqueado: true,
    motivo: MOTIVO_NEGATIVA,
    fundamento: FUNDAMENTO_RETENCION,
    avisoReclamo: AVISO_RECLAMO,
    fecha,
  };
}
