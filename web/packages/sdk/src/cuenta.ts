// Vínculo entre la cuenta Stellar que sella y un Integrador concreto, con el
// mecanismo estándar SEP-1: la cuenta declara un `home_domain` y ese dominio
// publica /.well-known/stellar.toml listando la cuenta en ACCOUNTS. El vínculo
// es en ambos sentidos: quien controla la cuenta controla el home_domain, y
// quien controla el dominio declara la cuenta.
//
// Este módulo no lanza por errores de red: los devuelve como "no comprobable"
// con un motivo fijo por categoría (nunca el mensaje crudo del error ni
// detalles del host). Como el `home_domain` lo elige quien controla la cuenta,
// la descarga del toml no sigue redirecciones y rechaza dominios internos.

import { TESTNET, type Red } from "./anclaje";

export type EstadoVinculo =
  /** La cuenta declara un dominio y ese dominio la lista en ACCOUNTS. */
  | "vinculada"
  /** Se pudo comprobar y no hay vínculo (sin home_domain, o el toml no la lista). */
  | "no_vinculada"
  /** No se pudo comprobar (red caída, cuenta inexistente, toml ausente o ilegible). */
  | "no_comprobable";

export interface ResultadoCuentaIntegrador {
  cuenta: string;
  red: Red["nombre"];
  estado: EstadoVinculo;
  /** home_domain declarado por la cuenta en Stellar, si lo hay (normalizado). */
  dominio: string | null;
  /** El stellar.toml del dominio lista la cuenta en ACCOUNTS. */
  listadaEnDominio: boolean;
  /** ORG_NAME de [DOCUMENTATION] del stellar.toml, si viene. */
  organizacion: string | null;
  /** Por qué no está vinculada o no se pudo comprobar. null si está vinculada. */
  motivo: string | null;
}

export interface OpcionesCuentaIntegrador {
  red?: Red;
  /** Para tests y entornos sin fetch global. */
  fetch?: typeof fetch;
  /** Milisegundos por solicitud, incluida la lectura del cuerpo. Por defecto 8000. */
  timeoutMs?: number;
  /** Tope de bytes del stellar.toml. Por defecto 102400 (100 KiB). */
  maxBytesToml?: number;
}

export const TIMEOUT_MS_DEFECTO = 8000;
export const MAX_BYTES_TOML_DEFECTO = 100 * 1024;
const MAX_BYTES_HORIZON = 1024 * 1024;

type Categoria = "sin_respuesta" | "invalida" | "redireccion" | "grande" | "tiempo";
const MENSAJE: Record<Categoria, string> = {
  sin_respuesta: "no hubo respuesta del servidor",
  invalida: "la respuesta del servidor no es válida",
  redireccion: "el stellar.toml redirige a otra dirección y debe servirse desde el propio dominio",
  grande: "la respuesta supera el tamaño permitido",
  tiempo: "se agotó el tiempo de espera",
};

class Falla extends Error {
  constructor(readonly categoria: Categoria) {
    super(categoria);
  }
}

const TLD_RESERVADOS = new Set([
  "internal", "local", "localhost", "corp", "lan", "home", "test", "invalid", "example", "intranet", "private", "onion",
]);

/** Normaliza (minúsculas, sin punto final) y valida un dominio público. null si no sirve. */
export function normalizarDominio(entrada: string): string | null {
  let d = entrada.trim().toLowerCase();
  if (d.endsWith(".")) d = d.slice(0, -1);
  if (d.length > 253) return null;
  const rotulos = d.split(".");
  if (rotulos.length < 2) return null;
  if (!rotulos.every((r) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(r))) return null;
  const tld = rotulos[rotulos.length - 1];
  if (!/^([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld) || TLD_RESERVADOS.has(tld)) return null;
  return d;
}

// ---- TOML mínimo -----------------------------------------------------------

/**
 * Quita comentarios y reemplaza el contenido de cadenas multilínea por "".
 * Devuelve null si el texto es dudoso (cadena sin cerrar).
 */
function sanear(t: string): string | null {
  let o = "";
  let i = 0;
  const n = t.length;
  while (i < n) {
    const c = t[i];
    if (c === "#") {
      while (i < n && t[i] !== "\n") i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const triple = c.repeat(3);
      if (t.startsWith(triple, i)) {
        let j = i + 3;
        let cerrada = false;
        while (j < n) {
          if (c === '"' && t[j] === "\\") {
            j += 2;
            continue;
          }
          if (t.startsWith(triple, j)) {
            j += 3;
            for (let k = 0; k < 2 && t[j] === c; k++) j++;
            cerrada = true;
            break;
          }
          j++;
        }
        if (!cerrada) return null;
        o += c + c;
        i = j;
        continue;
      }
      let j = i + 1;
      while (j < n && t[j] !== c && t[j] !== "\n") {
        if (c === '"' && t[j] === "\\") j++;
        j++;
      }
      if (t[j] !== c) return null;
      o += t.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    o += c;
    i++;
  }
  return o;
}

function desescapar(s: string): string {
  return s.replace(/\\(["\\])/g, "$1");
}

/** Lee un arreglo de cadenas que empieza en `[`. "abierto" si falta el `]`. */
function leerArreglo(buf: string): { estado: "ok" | "abierto" | "malo"; items: string[] } {
  const t = buf.trimStart();
  if (!t.startsWith("[")) return { estado: "malo", items: [] };
  const items: string[] = [];
  let i = 1;
  while (i < t.length) {
    const c = t[i];
    if (c === "]") return { estado: "ok", items };
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < t.length && t[j] !== c) {
        if (c === '"' && t[j] === "\\") j++;
        j++;
      }
      if (j >= t.length) return { estado: "abierto", items };
      const crudo = t.slice(i + 1, j);
      items.push(c === '"' ? desescapar(crudo) : crudo);
      i = j + 1;
      continue;
    }
    if (c === "[") return { estado: "malo", items: [] };
    i++;
  }
  return { estado: "abierto", items };
}

/**
 * Extrae lo mínimo de un TOML: ACCOUNTS de la raíz y ORG_NAME de [DOCUMENTATION].
 * Ante cualquier duda (ACCOUNTS que no es arreglo, repetido o mal cerrado,
 * cadenas sin cerrar) devuelve ACCOUNTS vacío: el resultado seguro es "no lista".
 */
export function leerStellarToml(texto: string): { cuentas: string[]; organizacion: string | null } {
  const san = sanear(texto.replace(/^\uFEFF/, ""));
  if (san === null) return { cuentas: [], organizacion: null };
  const lineas = san.split(/\r?\n/);
  let cuentas: string[] = [];
  let organizacion: string | null = null;
  let tabla = "";
  let veces = 0;
  let malo = false;
  for (let k = 0; k < lineas.length; k++) {
    const l = lineas[k].trim();
    if (!l) continue;
    const t = /^\[\[?\s*([^\]]+?)\s*\]\]?$/.exec(l);
    if (t) {
      tabla = t[1];
      continue;
    }
    if (tabla === "" && /^ACCOUNTS\s*=/.test(l)) {
      veces++;
      let buf = l.slice(l.indexOf("=") + 1);
      let r = leerArreglo(buf);
      while (r.estado === "abierto" && k + 1 < lineas.length) {
        buf += "\n" + lineas[++k];
        r = leerArreglo(buf);
      }
      if (r.estado !== "ok") malo = true;
      else cuentas = r.items;
      continue;
    }
    if (tabla === "DOCUMENTATION") {
      const m = /^ORG_NAME\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/.exec(l);
      if (m) organizacion = m[1] !== undefined ? desescapar(m[1]) : m[2];
    }
  }
  if (malo || veces > 1) cuentas = [];
  return { cuentas, organizacion };
}

// ---- Descarga acotada ------------------------------------------------------

/**
 * Descarga con un único plazo que cubre cabeceras y cuerpo, tope de bytes real
 * (se mide lo recibido, no los caracteres) y sin seguir redirecciones.
 * Con status no-2xx devuelve el status sin leer el cuerpo.
 */
async function descargar(
  f: typeof fetch,
  url: string,
  ms: number,
  maxBytes: number,
): Promise<{ status: number; ok: boolean; bytes: Uint8Array }> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lector: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    timer = setTimeout(() => {
      ctl.abort();
      rechazar(new Falla("tiempo"));
    }, ms);
  });
  const trabajo = (async () => {
    let res: Response;
    try {
      res = await f(url, { signal: ctl.signal, redirect: "manual" });
    } catch {
      throw new Falla("sin_respuesta");
    }
    if (res.type === "opaqueredirect" || res.redirected || (res.status >= 300 && res.status < 400))
      throw new Falla("redireccion");
    if (!res.ok) return { status: res.status, ok: false, bytes: new Uint8Array(0) };
    const declarado = Number(res.headers.get("content-length"));
    if (Number.isFinite(declarado) && declarado > maxBytes) throw new Falla("grande");
    if (!res.body) {
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length > maxBytes) throw new Falla("grande");
      return { status: res.status, ok: true, bytes: buf };
    }
    lector = res.body.getReader();
    const partes: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) throw new Falla("grande");
      partes.push(value);
    }
    const bytes = new Uint8Array(total);
    let pos = 0;
    for (const p of partes) {
      bytes.set(p, pos);
      pos += p.length;
    }
    return { status: res.status, ok: true, bytes };
  })();
  trabajo.catch(() => undefined);
  try {
    return await Promise.race([trabajo, limite]);
  } catch (e) {
    throw e instanceof Falla ? e : new Falla("sin_respuesta");
  } finally {
    clearTimeout(timer);
    ctl.abort();
    lector?.cancel().catch(() => undefined);
  }
}

function aTexto(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Falla("invalida");
  }
}

/**
 * Comprueba si una cuenta Stellar pertenece a un Integrador por SEP-1.
 * Lee `home_domain` en Horizon y busca la cuenta en el stellar.toml de ese
 * dominio. Nunca lanza por fallas de red: responde "no_comprobable" con el motivo.
 */
export async function comprobarCuentaIntegrador(
  cuenta: string,
  opciones: OpcionesCuentaIntegrador = {},
): Promise<ResultadoCuentaIntegrador> {
  const red = opciones.red ?? TESTNET;
  const f = opciones.fetch ?? globalThis.fetch;
  const ms = opciones.timeoutMs ?? TIMEOUT_MS_DEFECTO;
  const maxToml = opciones.maxBytesToml ?? MAX_BYTES_TOML_DEFECTO;
  const base: ResultadoCuentaIntegrador = {
    cuenta,
    red: red.nombre,
    estado: "no_comprobable",
    dominio: null,
    listadaEnDominio: false,
    organizacion: null,
    motivo: null,
  };
  const fin = (p: Partial<ResultadoCuentaIntegrador>): ResultadoCuentaIntegrador => ({ ...base, ...p });

  if (!/^G[A-Z2-7]{55}$/.test(cuenta)) return fin({ motivo: "La cuenta no tiene formato de clave pública Stellar (G…)" });
  if (typeof f !== "function") return fin({ motivo: "No hay fetch disponible para consultar la red" });

  let dominio: string | null;
  try {
    const r = await descargar(f, `${red.horizon}/accounts/${cuenta}`, ms, MAX_BYTES_HORIZON);
    if (r.status === 404) return fin({ motivo: `La cuenta no existe en ${red.nombre}` });
    if (!r.ok) return fin({ motivo: "No se pudo leer la cuenta en Horizon: Horizon respondió con un error" });
    let j: { home_domain?: unknown };
    try {
      j = JSON.parse(aTexto(r.bytes)) as typeof j;
    } catch {
      throw new Falla("invalida");
    }
    dominio = typeof j?.home_domain === "string" && j.home_domain.trim() ? j.home_domain : null;
  } catch (e) {
    return fin({ motivo: `No se pudo leer la cuenta en Horizon: ${MENSAJE[e instanceof Falla ? e.categoria : "sin_respuesta"]}` });
  }
  if (!dominio) return fin({ estado: "no_vinculada", motivo: "La cuenta no declara home_domain: nada la une a un dominio" });
  const dom = normalizarDominio(dominio);
  if (!dom) return fin({ motivo: "El home_domain declarado no es un dominio público válido" });

  let toml: string;
  try {
    const r = await descargar(f, `https://${dom}/.well-known/stellar.toml`, ms, maxToml);
    if (r.status === 404) return fin({ dominio: dom, motivo: "El dominio no publica /.well-known/stellar.toml" });
    if (!r.ok) return fin({ dominio: dom, motivo: "No se pudo obtener el stellar.toml: el dominio respondió con un error" });
    toml = aTexto(r.bytes);
  } catch (e) {
    return fin({
      dominio: dom,
      motivo: `No se pudo obtener el stellar.toml: ${MENSAJE[e instanceof Falla ? e.categoria : "sin_respuesta"]}`,
    });
  }

  const { cuentas, organizacion } = leerStellarToml(toml);
  if (!cuentas.includes(cuenta))
    return fin({ estado: "no_vinculada", dominio: dom, organizacion, motivo: "El stellar.toml del dominio no lista esta cuenta en ACCOUNTS" });
  return fin({ estado: "vinculada", dominio: dom, listadaEnDominio: true, organizacion, motivo: null });
}
