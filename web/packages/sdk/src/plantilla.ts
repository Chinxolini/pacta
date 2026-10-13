// Plantilla: texto legal público y versionado con variables tipadas y nombradas.
//
// Sigue el estándar abierto del Accord Project: el texto en TemplateMark
// (Markdown con variables {{nombre}}) y los parámetros en un modelo Concerto.
// El motor oficial (@accordproject/template-engine) es pesado para el
// navegador; este módulo valida contra el mismo modelo y rinde las mismas
// variables. Si mañana se genera con el motor oficial en build o servidor,
// la interfaz (validarParametros, generarTexto) no cambia.

export const ID_PLANTILLA_PRESTAMO = "pacta/prestamo";
export const VERSION_PLANTILLA_PRESTAMO = "1.2.0";

/** Modelo Concerto de los parámetros (namespace versionado). */
export const MODELO_CONCERTO = `namespace pacta.prestamo@1.2.0

/** Una Parte, tal como la conoce el Integrador. Nunca el RUT. */
concept Parte {
  o String nombre length=[1,80]
  /** Identificador de verificación emitido por el Integrador */
  o String verificacion regex=/^ver_[a-z0-9]{8,40}$/
}

@template
concept Prestamo {
  o Parte acreedor
  o Parte deudor
  /** Monto en pesos chilenos, entero */
  o Integer monto range=[1,1000000000]
  o String moneda regex=/^CLP$/
  o DateTime fechaEntrega
  o DateTime fechaPago
  o String ciudad length=[1,60]
}
`;

/** Texto TemplateMark de la plantilla vigente. */
export const TEMPLATEMARK = `# Contrato de mutuo de dinero

En {{ciudad}}, a {{fechaEntrega}}, {{acreedor.nombre}}, en adelante «el Acreedor», y {{deudor.nombre}}, en adelante «el Deudor», cuyas identidades el Integrador declara haber verificado bajo su responsabilidad (verificaciones {{acreedor.verificacion}} y {{deudor.verificacion}}), acuerdan lo siguiente:

**Primero. Préstamo.** El Acreedor entrega en préstamo al Deudor la suma de {{monto}}, que el Deudor declara recibir a su entera satisfacción en esta fecha.

**Segundo. Devolución.** El Deudor restituirá la misma suma, en una sola cuota y sin intereses, a más tardar el {{fechaPago}}.

**Tercero. Firma.** Las Partes firman electrónicamente este documento desde su teléfono. Cada firma usa una clave nueva, exclusiva de este contrato.

**Cuarto. Sello.** Una huella de este documento firmado, calculada con una sal secreta, se registra en la red Stellar. Prueba que el documento existía en esa fecha y que nadie lo cambió. La huella es un dato seudonimizado. Sin la sal, no permite saber quiénes son las Partes ni qué dice el documento.

**Quinto. Copias y conservación.** Cada Parte recibe al firmar su copia del documento con la sal y es responsable de guardarla. Qué conserva el Integrador y cómo responde a una solicitud de borrado se rige por las condiciones del Integrador. En la red Stellar solo queda la huella del documento firmado.
`;

/** Texto de la versión 1.1.0, para comprobar contratos sellados con ella. */
const TEMPLATEMARK_1_1_0 = `# Contrato de mutuo de dinero

En {{ciudad}}, a {{fechaEntrega}}, {{acreedor.nombre}}, en adelante «el Acreedor», y {{deudor.nombre}}, en adelante «el Deudor», cuyas identidades verificó el Integrador (verificaciones {{acreedor.verificacion}} y {{deudor.verificacion}}), acuerdan lo siguiente:

**Primero. Préstamo.** El Acreedor entrega en préstamo al Deudor la suma de {{monto}}, que el Deudor declara recibir a su entera satisfacción en esta fecha.

**Segundo. Devolución.** El Deudor restituirá la misma suma, en una sola cuota y sin intereses, a más tardar el {{fechaPago}}.

**Tercero. Firma.** Las Partes firman electrónicamente este documento con la passkey de su teléfono. Cada firma usa una clave nueva, exclusiva de este contrato.

**Cuarto. Sello.** Una huella de este documento firmado, calculada con una sal secreta, se registra en la red Stellar. Prueba que el documento existía en esa fecha y que nadie lo cambió. La huella es un dato seudonimizado. Sin la sal, no permite saber quiénes son las Partes ni qué dice el documento.

**Quinto. Copias y conservación.** Cada Parte recibe al firmar su copia del documento con la sal. El Integrador conserva el documento cifrado y una porción de la clave. Si una Parte pide borrar sus datos, el Integrador bloquea el documento y le responde con el fundamento, porque el documento es prueba para ambas Partes. En la red Stellar solo queda la huella del documento firmado.
`;

const TEXTOS: Record<string, string> = { "1.1.0": TEMPLATEMARK_1_1_0, "1.2.0": TEMPLATEMARK };

export interface Parte {
  nombre: string;
  verificacion: string;
}

export interface ParametrosPrestamo {
  acreedor: Parte;
  deudor: Parte;
  monto: number;
  moneda: "CLP";
  /** AAAA-MM-DD */
  fechaEntrega: string;
  /** AAAA-MM-DD */
  fechaPago: string;
  ciudad: string;
}

export interface ReferenciaPlantilla {
  id: string;
  version: string;
}

export const PLANTILLA_PRESTAMO: ReferenciaPlantilla = {
  id: ID_PLANTILLA_PRESTAMO,
  version: VERSION_PLANTILLA_PRESTAMO,
};

export class ErrorPlantilla extends Error {
  constructor(public readonly problemas: string[]) {
    super("Parámetros inválidos: " + problemas.join("; "));
    this.name = "ErrorPlantilla";
  }
}

const RE_VERIFICACION = /^ver_[a-z0-9]{8,40}$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
// RUT chileno con o sin puntos: nunca debe llegar al SDK.
const RE_RUT = /\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]\b/;

function fechaValida(s: unknown): s is string {
  if (typeof s !== "string" || !RE_FECHA.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function validarParte(p: unknown, rol: string, problemas: string[]): void {
  const parte = p as Partial<Parte> | undefined;
  if (!parte || typeof parte !== "object") {
    problemas.push(`${rol}: falta`);
    return;
  }
  if (typeof parte.nombre !== "string" || parte.nombre.trim().length === 0 || parte.nombre.length > 80)
    problemas.push(`${rol}.nombre: entre 1 y 80 caracteres`);
  else if (RE_RUT.test(parte.nombre)) problemas.push(`${rol}.nombre: no puede contener un RUT`);
  if (typeof parte.verificacion !== "string" || !RE_VERIFICACION.test(parte.verificacion))
    problemas.push(`${rol}.verificacion: debe ser un identificador ver_… del Integrador, nunca el RUT`);
}

/** Valida los parámetros contra el modelo Concerto. Lanza ErrorPlantilla con la lista de problemas. */
export function validarParametros(entrada: unknown): ParametrosPrestamo {
  const p = entrada as Partial<ParametrosPrestamo> | undefined;
  const problemas: string[] = [];
  if (!p || typeof p !== "object") throw new ErrorPlantilla(["parámetros: falta el objeto"]);
  validarParte(p.acreedor, "acreedor", problemas);
  validarParte(p.deudor, "deudor", problemas);
  if (
    p.acreedor &&
    p.deudor &&
    typeof p.acreedor.verificacion === "string" &&
    p.acreedor.verificacion === p.deudor.verificacion
  )
    problemas.push("acreedor y deudor deben ser personas distintas");
  if (typeof p.monto !== "number" || !Number.isInteger(p.monto) || p.monto < 1 || p.monto > 1_000_000_000)
    problemas.push("monto: entero entre 1 y 1.000.000.000");
  if (p.moneda !== "CLP") problemas.push("moneda: solo CLP en esta versión");
  if (!fechaValida(p.fechaEntrega)) problemas.push("fechaEntrega: fecha AAAA-MM-DD");
  if (!fechaValida(p.fechaPago)) problemas.push("fechaPago: fecha AAAA-MM-DD");
  if (fechaValida(p.fechaEntrega) && fechaValida(p.fechaPago) && p.fechaPago <= p.fechaEntrega)
    problemas.push("fechaPago: debe ser posterior a fechaEntrega");
  if (typeof p.ciudad !== "string" || p.ciudad.trim().length === 0 || p.ciudad.length > 60)
    problemas.push("ciudad: entre 1 y 60 caracteres");
  if (problemas.length) throw new ErrorPlantilla(problemas);
  return {
    acreedor: { nombre: p.acreedor!.nombre.trim(), verificacion: p.acreedor!.verificacion },
    deudor: { nombre: p.deudor!.nombre.trim(), verificacion: p.deudor!.verificacion },
    monto: p.monto!,
    moneda: "CLP",
    fechaEntrega: p.fechaEntrega!,
    fechaPago: p.fechaPago!,
    ciudad: p.ciudad!.trim(),
  };
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

export function pesos(monto: number): string {
  // Separador de miles con punto, sin depender de Intl del entorno.
  return "$" + String(monto).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Genera el texto legal a partir de parámetros válidos. Determinista. */
export function generarTexto(parametros: ParametrosPrestamo, version: string = VERSION_PLANTILLA_PRESTAMO): string {
  const plantilla = TEXTOS[version];
  if (!plantilla) throw new Error(`versión de plantilla desconocida: ${version}`);
  const p = validarParametros(parametros);
  const valores: Record<string, string> = {
    ciudad: p.ciudad,
    fechaEntrega: fechaLarga(p.fechaEntrega),
    fechaPago: fechaLarga(p.fechaPago),
    monto: `${pesos(p.monto)} (pesos chilenos)`,
    "acreedor.nombre": p.acreedor.nombre,
    "acreedor.verificacion": p.acreedor.verificacion,
    "deudor.nombre": p.deudor.nombre,
    "deudor.verificacion": p.deudor.verificacion,
  };
  return plantilla.replace(/\{\{([a-zA-Z.]+)\}\}/g, (_, k: string) => {
    if (!(k in valores)) throw new Error(`variable sin valor: ${k}`);
    return valores[k];
  });
}
