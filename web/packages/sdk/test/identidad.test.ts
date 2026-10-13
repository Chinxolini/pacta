import { describe, expect, it } from "vitest";
import { contieneRut, enmascararRut, nuevoIdentificadorVerificacion, rutValido, validarParametros } from "../src";
import { PARAMS } from "./fixtures";

describe("Identidad", () => {
  it("el identificador de verificación es opaco y aceptado por la Plantilla", () => {
    const v = nuevoIdentificadorVerificacion();
    expect(v).toMatch(/^ver_[a-z0-9]{12}$/);
    expect(contieneRut(v)).toBe(false);
    expect(() => validarParametros({ ...PARAMS, acreedor: { nombre: "Ana", verificacion: v } })).not.toThrow();
  });

  it("valida y enmascara el RUT del lado del Integrador", () => {
    expect(rutValido("12.345.678-5")).toBe(true);
    expect(rutValido("12.345.678-4")).toBe(false);
    expect(enmascararRut("12.345.678-5")).toBe("12.345.***-*");
  });
});
