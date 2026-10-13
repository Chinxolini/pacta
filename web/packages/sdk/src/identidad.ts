// Identidad: la verifica el Integrador (cédula, selfie, Soyio, Veriff…), no el
// SDK. El SDK recibe solo un identificador de verificación opaco, nunca el RUT.

import { aleatorio } from "./bytes";

const ALFABETO = "abcdefghijklmnopqrstuvwxyz0123456789";
const RE_RUT = /\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]\b/;

/** Identificador opaco que el Integrador emite al verificar a una persona. */
export function nuevoIdentificadorVerificacion(): string {
  return "ver_" + Array.from(aleatorio(12), (b) => ALFABETO[b % ALFABETO.length]).join("");
}

export function contieneRut(texto: string): boolean {
  return RE_RUT.test(texto);
}

/** Dígito verificador del RUT chileno (módulo 11). Útil para el formulario del Integrador. */
export function digitoVerificador(cuerpo: string): string {
  let suma = 0;
  let factor = 2;
  for (const d of cuerpo.replace(/\D/g, "").split("").reverse()) {
    suma += Number(d) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const r = 11 - (suma % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}

export function rutValido(rut: string): boolean {
  const limpio = rut.replace(/[.\s]/g, "").toUpperCase();
  const m = limpio.match(/^(\d{7,8})-?([\dK])$/);
  return Boolean(m && digitoVerificador(m[1]) === m[2]);
}

/** "12.345.678-5" → "12.345.***-*": lo único que la demo muestra del RUT. */
export function enmascararRut(rut: string): string {
  const limpio = rut.replace(/[.\s-]/g, "");
  const cuerpo = limpio.slice(0, -1);
  const visible = cuerpo.slice(0, cuerpo.length - 3).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${visible}.***-*`;
}
