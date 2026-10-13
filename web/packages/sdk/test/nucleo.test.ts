import { describe, expect, it } from "vitest";
import {
  calcularCompromiso,
  canonicalizar,
  construirSello,
  contenidoFirmable,
  crearDocumento,
  ErrorPlantilla,
  estaCompleto,
  firmarDocumento,
  generarSal,
  generarTexto,
  metadatosSello,
  leerMetadatosSello,
  nuevaClaveContrato,
  validarParametros,
  verificarCompromiso,
  verificarFirmas,
  verificarMensaje,
  firmarMensaje,
} from "../src";
import { PARAMS } from "./fixtures";


const AHORA = new Date("2026-09-25T12:00:00Z");
const SIMULADA = { tipo: "simulada" as const, motivo: "test" };

describe("Plantilla", () => {
  it("genera el texto legal con los parámetros", () => {
    const t = generarTexto(PARAMS);
    expect(t).toContain("En Santiago, a 25 de septiembre de 2026");
    expect(t).toContain("$150.000 (pesos chilenos)");
    expect(t).toContain("25 de octubre de 2026");
    expect(t).not.toMatch(/\{\{/);
  });

  it("rechaza parámetros inválidos con la lista de problemas", () => {
    try {
      validarParametros({ ...PARAMS, monto: -1, fechaPago: "2026-09-01" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorPlantilla);
      expect((e as ErrorPlantilla).problemas).toHaveLength(2);
    }
  });

  it("nunca acepta un RUT como identificador de verificación", () => {
    expect(() =>
      validarParametros({ ...PARAMS, deudor: { nombre: "Larry", verificacion: "12.345.678-9" } }),
    ).toThrow(ErrorPlantilla);
    expect(() => validarParametros({ ...PARAMS, deudor: { nombre: "Larry 12.345.678-9", verificacion: "ver_larry0001" } })).toThrow(
      /RUT/,
    );
  });
});

describe("Documento", () => {
  it("la forma canónica no depende del orden de las claves", () => {
    expect(canonicalizar({ b: 1, a: { d: [1, 2], c: "x" } })).toBe(canonicalizar({ a: { c: "x", d: [1, 2] }, b: 1 }));
    expect(canonicalizar({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("el ID de contrato es aleatorio", () => {
    const a = crearDocumento({ parametros: PARAMS, ahora: AHORA });
    const b = crearDocumento({ parametros: PARAMS, ahora: AHORA });
    expect(a.contratoId).toMatch(/^ctr_[0-9a-f]{32}$/);
    expect(a.contratoId).not.toBe(b.contratoId);
  });
});

describe("Sello", () => {
  const doc = crearDocumento({ parametros: PARAMS, ahora: AHORA, contratoId: "ctr_" + "0".repeat(32) });

  it("es estable ante reordenar claves", async () => {
    const sal = generarSal();
    const invertido = Object.fromEntries(Object.entries(doc).reverse()) as typeof doc;
    expect(await calcularCompromiso(invertido, sal)).toBe(await calcularCompromiso(doc, sal));
  });

  it("cambia con un byte distinto del documento o con otra sal", async () => {
    const sal = generarSal();
    const c = await calcularCompromiso(doc, sal);
    expect(await calcularCompromiso({ ...doc, parametros: { ...doc.parametros, monto: 150001 } }, sal)).not.toBe(c);
    expect(await calcularCompromiso(doc, generarSal())).not.toBe(c);
    expect(await verificarCompromiso(doc, sal, c)).toBe(true);
    expect(await verificarCompromiso(doc, generarSal(), c)).toBe(false);
  });

  it("solo se construye con un compromiso de 32 bytes y no lleva nada de las Partes", async () => {
    const sal = generarSal();
    const compromiso = await calcularCompromiso(doc, sal);
    const sello = construirSello({ compromiso, plantilla: doc.plantilla });
    const onchain = JSON.stringify(sello) + metadatosSello(sello);
    for (const dato of ["Ana", "Larry", "150000", "150.000", "ver_ana", "Santiago", doc.contratoId, sal])
      expect(onchain).not.toContain(dato);
    expect(() => construirSello({ compromiso: "Ana le debe a Larry", plantilla: doc.plantilla })).toThrow();
    expect(leerMetadatosSello(metadatosSello(sello))).toEqual({ version: 1, plantilla: "pacta/prestamo@1.2.0" });
  });

  it("manage_data lleva version;plantilla@versión y nada más: sin Estado", async () => {
    const compromiso = await calcularCompromiso(doc, generarSal());
    const sello = construirSello({ compromiso, plantilla: doc.plantilla });
    expect(metadatosSello(sello)).toBe("1;pacta/prestamo@1.2.0");
    expect(Object.keys(sello).sort()).toEqual(["compromiso", "plantilla", "version"]);
    // Ni por la puerta de atrás: un Estado colado se rechaza.
    expect(() => construirSello({ compromiso, plantilla: doc.plantilla, estado: "pagado" } as never)).toThrow(/Estado/);
  });

  it("el lector acepta los sellos antiguos con Estado y lo ignora", () => {
    for (const estado of ["vigente", "pagado", "resciliado", "bloqueado"])
      expect(leerMetadatosSello(`1;pacta/prestamo@1.0.0;${estado}`)).toEqual({ version: 1, plantilla: "pacta/prestamo@1.0.0" });
    expect(leerMetadatosSello("1;pacta/prestamo@1.0.0;otro")).toBeNull();
    expect(leerMetadatosSello("2;pacta/prestamo@1.0.0")).toBeNull();
  });
});

describe("Firma", () => {
  it("SEP-53: firma y verifica; otra clave o mensaje no verifican", async () => {
    const k = nuevaClaveContrato();
    const f = await firmarMensaje("hola", k);
    expect(await verificarMensaje("hola", f, k.publicKey())).toBe(true);
    expect(await verificarMensaje("hola!", f, k.publicKey())).toBe(false);
    expect(await verificarMensaje("hola", f, nuevaClaveContrato().publicKey())).toBe(false);
  });

  it("dos Partes firman con claves nuevas y el documento queda completo", async () => {
    let doc = crearDocumento({ parametros: PARAMS, ahora: AHORA });
    const ka = nuevaClaveContrato();
    const kb = nuevaClaveContrato();
    doc = await firmarDocumento(doc, "acreedor", ka, SIMULADA, AHORA);
    expect(estaCompleto(doc)).toBe(false);
    doc = await firmarDocumento(doc, "deudor", kb, SIMULADA, AHORA);
    expect(estaCompleto(doc)).toBe(true);
    expect(await verificarFirmas(doc)).toBe(true);
    await expect(firmarDocumento(doc, "deudor", kb, SIMULADA)).rejects.toThrow(/ya firmó/);
  });

  it("alterar el documento después de firmar invalida las firmas", async () => {
    let doc = crearDocumento({ parametros: PARAMS, ahora: AHORA });
    doc = await firmarDocumento(doc, "acreedor", nuevaClaveContrato(), SIMULADA, AHORA);
    doc = await firmarDocumento(doc, "deudor", nuevaClaveContrato(), SIMULADA, AHORA);
    const alterado = { ...doc, parametros: { ...doc.parametros, monto: 15000 } };
    expect(contenidoFirmable(alterado)).not.toBe(contenidoFirmable(doc));
    expect(await verificarFirmas(alterado)).toBe(false);
  });
});
