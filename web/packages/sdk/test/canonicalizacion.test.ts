import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalizar, crearDocumento, type Documento } from "../src";
import { PARAMS } from "./fixtures";

function documentoFijo(): Documento {
  const doc = crearDocumento({
    parametros: PARAMS,
    ahora: new Date("2026-09-25T12:00:00Z"),
    contratoId: "ctr_00000000000000000000000000000001",
  });
  doc.firmas = [
    {
      rol: "acreedor",
      clavePublica: "GAAA",
      firma: "AAAA",
      firmadoEn: "2026-09-25T12:01:00.000Z",
      autorizacion: { tipo: "passkey", credencial: "cred/+=", desafio: 'd"é\n' },
    },
    {
      rol: "deudor",
      clavePublica: "GBBB",
      firma: "BBBB",
      firmadoEn: "2026-09-25T12:02:00.000Z",
      autorizacion: { tipo: "simulada", motivo: "test" },
    },
  ];
  return doc;
}

const j = (t: string) => t.replaceAll("~", String.fromCharCode(92));

describe("Canonicalización: regresión (no se rompen los Sellos ya emitidos)", () => {
  it("el Documento fijo da los mismos bytes que antes de adoptar RFC 8785 estricto", () => {
    // Valores calculados con la implementación anterior, antes del cambio.
    const c = canonicalizar(documentoFijo());
    expect(c.length).toBe(2115);
    expect(createHash("sha256").update(c, "utf8").digest("hex")).toBe(
      "08fc1008f881703fba8cb3dd6e6bd4819eaf9e0d9291d5b5329978266b46a666",
    );
  });
});

describe("Canonicalización: RFC 8785", () => {
  it("3.2.2: primitivos (números ECMAScript, escapes de cadenas, orden de claves)", () => {
    // "~" hace de barra invertida para que el JSON del RFC quede legible aquí.
    const entrada = j(
      `{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],"string":"~u20ac$~u000F~u000aA'~u0042~u0022~u005c~~~"/","literals":[null,true,false]}`,
    );
    const esperado = j(`{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"@$~u000f~nA'B~"~~~~~"/"}`);
    expect(canonicalizar(JSON.parse(entrada))).toBe(esperado.replace("@", String.fromCharCode(0x20ac)));
  });

  it("3.2.3: claves ordenadas por unidades de código UTF-16", () => {
    const entrada = JSON.parse(
      j(
        `{"~u20ac":"Euro Sign","~r":"Carriage Return","~ufb33":"Hebrew Letter Dalet With Dagesh","1":"One","~ud83d~ude00":"Emoji: Grinning Face","~u0080":"Control","~u00f6":"Latin Small Letter O With Diaeresis"}`,
      ),
    ) as Record<string, string>;
    const c = (...u: number[]) => String.fromCharCode(...u);
    // Orden esperado: U+000D, "1", U+0080, U+00F6, U+20AC, U+D83D U+DE00, U+FB33.
    expect(canonicalizar(entrada)).toBe(
      `{"${j("~r")}":"Carriage Return","1":"One","${c(0x80)}":"Control","${c(0xf6)}":"Latin Small Letter O With Diaeresis",` +
        `"${c(0x20ac)}":"Euro Sign","${c(0xd83d, 0xde00)}":"Emoji: Grinning Face","${c(0xfb33)}":"Hebrew Letter Dalet With Dagesh"}`,
    );
  });

  it("Apéndice B: serialización de números", () => {
    expect(canonicalizar([0, -0, 1, 4.5, 0.002, 1e21, 1e-7, 9007199254740993, 123456789012345680000, 5e-324, 1.7976931348623157e308])).toBe(
      "[0,0,1,4.5,0.002,1e+21,1e-7,9007199254740992,123456789012345680000,5e-324,1.7976931348623157e+308]",
    );
  });

  it("sin espacios, arreglos en orden y anidación", () => {
    expect(canonicalizar({ b: [3, { z: 1, a: [] }, "x"], a: {} })).toBe('{"a":{},"b":[3,{"a":[],"z":1},"x"]}');
  });

  it("cadenas: no escapa / ni no ASCII; escapa los caracteres de control en minúscula", () => {
    const c = String.fromCharCode;
    const entrada = "a/" + c(0xe9, 0x20ac, 0x1f, 0x7f, 8, 9, 12);
    expect(canonicalizar(entrada)).toBe(j('"a/') + c(0xe9, 0x20ac) + j("~u001f") + c(0x7f) + j('~b~t~f"'));
  });

  it("omite claves con valor undefined (comportamiento heredado)", () => {
    expect(canonicalizar({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("rechaza lo que no es JSON, con error claro", () => {
    const casos: [unknown, RegExp][] = [
      [NaN, /no finito/],
      [Infinity, /no finito/],
      [-Infinity, /no finito/],
      [undefined, /no JSON/],
      [[1, undefined], /no JSON/],
      [() => 1, /no JSON/],
      [10n, /no JSON/],
      [Symbol("x"), /no JSON/],
      [{ a: 1n }, /no JSON/],
      [new Date(), /no JSON/],
      [new Map(), /no JSON/],
      ["\ud800", /sustituto/],
      [{ ["\udc00"]: 1 }, /sustituto/],
    ];
    for (const [v, re] of casos) expect(() => canonicalizar(v)).toThrow(re);
    const c: Record<string, unknown> = {};
    c.yo = c;
    expect(() => canonicalizar(c)).toThrow(/circular/);
  });

  it("un par sustituto válido sí pasa", () => {
    const par = String.fromCharCode(0xd83d, 0xde00);
    expect(canonicalizar(par)).toBe(`"${par}"`);
  });
});
