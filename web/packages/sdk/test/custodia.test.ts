import { describe, expect, it } from "vitest";
import * as sdk from "../src";
import {
  AVISO_RECLAMO,
  crearAlmacenMemoria,
  crearDocumento,
  crearSolicitudSupresion,
  custodiar,
  ErrorBloqueo,
  generarSal,
  recuperar,
  resolverSolicitudSupresion,
  validarRegistroIntegrador,
  type RegistroIntegrador,
} from "../src";
import { PARAMS } from "./fixtures";

describe("Custodia 2 de 3", () => {
  it("dos porciones cualesquiera reconstruyen; una no", async () => {
    const doc = crearDocumento({ parametros: PARAMS });
    const sal = generarSal();
    const c = await custodiar(doc, sal);
    const { acreedor, deudor, integrador } = c.porciones;
    for (const par of [
      [acreedor, deudor],
      [acreedor, integrador],
      [deudor, integrador],
    ]) {
      const r = await recuperar(doc.contratoId, c.cifrado, par);
      expect(r.documento).toEqual(doc);
      expect(r.sal).toBe(sal);
    }
    await expect(recuperar(doc.contratoId, c.cifrado, [integrador])).rejects.toThrow(/dos porciones/);
    await expect(recuperar(doc.contratoId, c.cifrado, [integrador, integrador])).rejects.toThrow(/dos porciones/);
  });

  it("el texto cifrado no contiene datos en claro y está atado al contrato", async () => {
    const doc = crearDocumento({ parametros: PARAMS });
    const c = await custodiar(doc, generarSal());
    const bruto = atob(c.cifrado.datos);
    expect(bruto).not.toContain("Larry");
    await expect(recuperar("ctr_otro", c.cifrado, [c.porciones.acreedor, c.porciones.deudor])).rejects.toThrow(/no abren/);
  });
});

describe("Registro del Integrador: solo ciphertext y su key share", () => {
  async function registro() {
    const doc = crearDocumento({ parametros: PARAMS });
    const sal = generarSal();
    const c = await custodiar(doc, sal);
    const r: RegistroIntegrador = {
      contratoId: doc.contratoId,
      compromiso: "c".repeat(64),
      cifrado: c.cifrado,
      porcionIntegrador: c.porciones.integrador,
      vinculos: [{ rol: "acreedor", verificacion: "ver_ana00001", clavePublica: "GANA" }],
      sellos: [],
    };
    return { doc, sal, c, r };
  }

  it("no tiene la salt ni el documento en plaintext", async () => {
    const { doc, sal, r } = await registro();
    const almacen = crearAlmacenMemoria();
    almacen.guardar(r);
    const guardado = JSON.stringify(almacen.obtener(doc.contratoId));
    expect(guardado).not.toContain(sal);
    for (const dato of ["Ana", "Larry", "150000", "Santiago", doc.texto.slice(0, 30)]) expect(guardado).not.toContain(dato);
    expect(Object.keys(r).sort()).toEqual(["cifrado", "compromiso", "contratoId", "porcionIntegrador", "sellos", "vinculos"]);
  });

  it("falla si el registro trae la salt, el documento o un RUT", async () => {
    const { doc, sal, r } = await registro();
    const almacen = crearAlmacenMemoria();
    expect(() => almacen.guardar({ ...r, sal } as RegistroIntegrador)).toThrow(/sobra: sal/);
    expect(() => almacen.guardar({ ...r, documento: doc } as RegistroIntegrador)).toThrow(/sobra: documento/);
    expect(() =>
      validarRegistroIntegrador({ ...r, vinculos: [{ rol: "deudor", verificacion: "12.345.678-5", clavePublica: "GB" }] }),
    ).toThrow(/RUT/);
    expect(almacen.obtener(doc.contratoId)).toBeUndefined();
  });

  it("con su key share y la de una Parte recupera documento y salt; con una sola, no", async () => {
    const { doc, sal, c, r } = await registro();
    for (const parte of [c.porciones.acreedor, c.porciones.deudor]) {
      const rec = await recuperar(r.contratoId, r.cifrado, [r.porcionIntegrador, parte]);
      expect(rec.documento).toEqual(doc);
      expect(rec.sal).toBe(sal);
    }
    await expect(recuperar(r.contratoId, r.cifrado, [r.porcionIntegrador])).rejects.toThrow(/dos porciones/);
  });
});

describe("Solicitud de borrado de una sola Parte: bloqueo y negativa fundada", () => {
  async function almacenCon() {
    const doc = crearDocumento({ parametros: PARAMS });
    const c = await custodiar(doc, generarSal());
    const almacen = crearAlmacenMemoria();
    almacen.guardar({
      contratoId: doc.contratoId,
      compromiso: "c".repeat(64),
      cifrado: c.cifrado,
      porcionIntegrador: c.porciones.integrador,
      vinculos: [{ rol: "acreedor", verificacion: "ver_ana00001", clavePublica: "GANA" }],
      sellos: [],
    });
    return { doc, almacen };
  }
  const HOY = new Date("2026-12-15T12:00:00Z");

  it("recibe la solicitud y devuelve decisión, motivo, fundamento y aviso de reclamo", async () => {
    const { doc, almacen } = await almacenCon();
    const solicitud = crearSolicitudSupresion({ contratoId: doc.contratoId, rol: "deudor", autenticacion: "passkey", ahora: HOY });
    const r = resolverSolicitudSupresion(almacen, solicitud, HOY);
    expect(r.decision).toBe("bloqueo-y-negativa");
    expect(r.bloqueado).toBe(true);
    expect(r.motivo).toMatch(/prueba de las dos Partes/);
    expect(r.fundamento).toMatch(/art\. 7 inc\. 2 numeral vi/);
    expect(r.fundamento).toMatch(/Ley 21\.719/);
    expect(r.fundamento).toMatch(/art\. 12 inc\. 4/);
    expect(r.avisoReclamo).toBe(AVISO_RECLAMO);
    expect(r.avisoReclamo).toMatch(/Agencia/);
    expect(r.avisoReclamo).toMatch(/art\. 11/);
    expect(JSON.stringify(r)).not.toMatch(/letra/);
  });

  it("el contrato bloqueado no se recupera por el flujo normal", async () => {
    const { doc, almacen } = await almacenCon();
    expect(almacen.obtener(doc.contratoId)).toBeDefined();
    resolverSolicitudSupresion(almacen, crearSolicitudSupresion({ contratoId: doc.contratoId, rol: "acreedor", autenticacion: "simulada" }));
    expect(almacen.estaBloqueado(doc.contratoId)).toBe(true);
    expect(() => almacen.obtener(doc.contratoId)).toThrow(ErrorBloqueo);
    // Sigue existiendo: bloquear no es borrar.
    expect(almacen.existe(doc.contratoId)).toBe(true);
  });

  it("el registro guarda id, fecha, autenticación y decisión; sin contenido", async () => {
    const { doc, almacen } = await almacenCon();
    resolverSolicitudSupresion(
      almacen,
      crearSolicitudSupresion({ contratoId: doc.contratoId, rol: "deudor", autenticacion: "passkey", ahora: HOY }),
      HOY,
    );
    const [reg] = almacen.supresiones();
    expect(reg).toEqual({
      perfil: "pacta/registro-supresion/1",
      contratoId: doc.contratoId,
      fecha: HOY.toISOString(),
      autenticacion: "passkey",
      decision: "bloqueo-y-negativa",
    });
    for (const dato of ["Ana", "Larry", "150000", "Santiago", "ver_", "deudor", "acreedor"])
      expect(JSON.stringify(reg)).not.toContain(dato);
  });

  it("rechaza solicitudes de un contrato que el Integrador no tiene", async () => {
    const { almacen } = await almacenCon();
    expect(() =>
      resolverSolicitudSupresion(almacen, crearSolicitudSupresion({ contratoId: "ctr_otro", rol: "deudor", autenticacion: "passkey" })),
    ).toThrow(/no tiene/);
  });

  it("el SDK no borra: sin ejecutarBorrado, sin eliminar en el almacén, sin ciclo de Estados", () => {
    expect("ejecutarBorrado" in sdk).toBe(false);
    expect("resolverSolicitudBorrado" in sdk).toBe(false);
    expect("validarTransicion" in sdk).toBe(false);
    expect("eliminar" in crearAlmacenMemoria()).toBe(false);
  });
});
