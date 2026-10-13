import { describe, expect, it } from "vitest";
import { comprobarCuentaIntegrador, leerStellarToml } from "../src";

const CUENTA = "G" + "A".repeat(55);
const OTRA = "G" + "B".repeat(55);

const TOML = `# stellar.toml
VERSION="2.0.0"
ACCOUNTS=[
  "${OTRA}", # otra
  "${CUENTA}"
]

[DOCUMENTATION]
ORG_NAME="Integrador Demo SpA"
`;

type Ruta = { status?: number; body?: unknown; throws?: string };

function falso(rutas: Record<string, Ruta>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const r = rutas[String(url)];
    if (!r) return new Response("", { status: 404 });
    if (r.throws) throw new Error(r.throws);
    const body = typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? {});
    return new Response(body, { status: r.status ?? 200 });
  }) as typeof fetch;
}

const HORIZON = `https://horizon-testnet.stellar.org/accounts/${CUENTA}`;
const TOML_URL = "https://integrador.cl/.well-known/stellar.toml";

describe("comprobarCuentaIntegrador (SEP-1, sin red)", () => {
  it("vínculo completo: home_domain y stellar.toml listan la cuenta", async () => {
    const r = await comprobarCuentaIntegrador(CUENTA, {
      fetch: falso({ [HORIZON]: { body: { home_domain: "Integrador.CL" } }, [TOML_URL]: { body: TOML } }),
    });
    expect(r).toMatchObject({
      estado: "vinculada",
      dominio: "integrador.cl",
      listadaEnDominio: true,
      organizacion: "Integrador Demo SpA",
      motivo: null,
      red: "testnet",
    });
  });

  it("sin home_domain: no vinculada, con motivo", async () => {
    const r = await comprobarCuentaIntegrador(CUENTA, { fetch: falso({ [HORIZON]: { body: {} } }) });
    expect(r.estado).toBe("no_vinculada");
    expect(r.dominio).toBeNull();
    expect(r.motivo).toMatch(/home_domain/);
  });

  it("el toml no lista la cuenta: no vinculada", async () => {
    const toml = `ACCOUNTS=["${OTRA}"]\n[DOCUMENTATION]\nORG_NAME="X"\n`;
    const r = await comprobarCuentaIntegrador(CUENTA, {
      fetch: falso({ [HORIZON]: { body: { home_domain: "integrador.cl" } }, [TOML_URL]: { body: toml } }),
    });
    expect(r).toMatchObject({ estado: "no_vinculada", dominio: "integrador.cl", listadaEnDominio: false });
    expect(r.motivo).toMatch(/no lista/);
  });

  it("el dominio no publica toml: no comprobable", async () => {
    const r = await comprobarCuentaIntegrador(CUENTA, {
      fetch: falso({ [HORIZON]: { body: { home_domain: "integrador.cl" } } }),
    });
    expect(r.estado).toBe("no_comprobable");
    expect(r.motivo).toMatch(/stellar\.toml/);
  });

  it("error de red: no lanza, devuelve no comprobable", async () => {
    const r1 = await comprobarCuentaIntegrador(CUENTA, { fetch: falso({ [HORIZON]: { throws: "ECONNRESET" } }) });
    expect(r1.estado).toBe("no_comprobable");
    expect(r1.motivo).toMatch(/no hubo respuesta/);
    expect(r1.motivo).not.toMatch(/ECONNRESET/);
    const r2 = await comprobarCuentaIntegrador(CUENTA, {
      fetch: falso({ [HORIZON]: { body: { home_domain: "integrador.cl" } }, [TOML_URL]: { throws: "timeout" } }),
    });
    expect(r2.estado).toBe("no_comprobable");
    expect(r2.dominio).toBe("integrador.cl");
  });

  it("cuenta inexistente, mal formada o dominio inválido", async () => {
    expect((await comprobarCuentaIntegrador(CUENTA, { fetch: falso({}) })).motivo).toMatch(/no existe/);
    expect((await comprobarCuentaIntegrador("hola")).estado).toBe("no_comprobable");
    const r = await comprobarCuentaIntegrador(CUENTA, {
      fetch: falso({ [HORIZON]: { body: { home_domain: "x/../evil" } } }),
    });
    expect(r.estado).toBe("no_comprobable");
    expect(r.motivo).toMatch(/dominio/);
  });
});

function conCuerpo(horizonBody: unknown, toml: () => Response, dominio = "integrador.cl"): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = String(url);
    if (u === HORIZON) return new Response(JSON.stringify(horizonBody), { status: 200 });
    if (u === `https://${dominio}/.well-known/stellar.toml`) return toml();
    return new Response("", { status: 404 });
  }) as typeof fetch;
}

/** Cuerpo que entrega un trozo y luego nunca termina. */
function cuerpoColgado(): Response {
  const s = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode("ACCOUNTS=["));
    },
  });
  return new Response(s, { status: 200 });
}

describe("comprobarCuentaIntegrador: límites y SSRF", () => {
  const dom = (home_domain: string) => ({ home_domain });

  it("cuerpo que nunca termina: no_comprobable por tiempo, sin colgarse", async () => {
    const t0 = Date.now();
    const r = await comprobarCuentaIntegrador(CUENTA, {
      timeoutMs: 80,
      fetch: conCuerpo(dom("integrador.cl"), cuerpoColgado),
    });
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(r.estado).toBe("no_comprobable");
    expect(r.motivo).toMatch(/tiempo/);
  });

  it("cabeceras que nunca llegan también agotan el tiempo", async () => {
    const f = (async (url: string | URL | Request) => {
      if (String(url) === HORIZON) return new Response(JSON.stringify(dom("integrador.cl")));
      return new Promise<Response>(() => undefined);
    }) as typeof fetch;
    const r = await comprobarCuentaIntegrador(CUENTA, { timeoutMs: 80, fetch: f });
    expect(r.motivo).toMatch(/tiempo/);
  });

  it("cuerpo que excede el tope (sin content-length): no_comprobable", async () => {
    const grande = "# " + "x".repeat(5000) + "\n";
    const r = await comprobarCuentaIntegrador(CUENTA, {
      maxBytesToml: 1000,
      fetch: conCuerpo(dom("integrador.cl"), () => new Response(new TextEncoder().encode(grande), { status: 200 })),
    });
    expect(r.estado).toBe("no_comprobable");
    expect(r.motivo).toMatch(/tamaño/);
  });

  it("el tope mide bytes, no caracteres", async () => {
    // 600 caracteres de 2 bytes = 1200 bytes > 1000, aunque 600 < 1000.
    const r = await comprobarCuentaIntegrador(CUENTA, {
      maxBytesToml: 1000,
      fetch: conCuerpo(dom("integrador.cl"), () => new Response("# " + "é".repeat(600), { status: 200 })),
    });
    expect(r.motivo).toMatch(/tamaño/);
  });

  it("content-length declarado sobre el tope se rechaza", async () => {
    const r = await comprobarCuentaIntegrador(CUENTA, {
      maxBytesToml: 1000,
      fetch: conCuerpo(
        dom("integrador.cl"),
        () => new Response("ACCOUNTS=[]", { status: 200, headers: { "content-length": "999999" } }),
      ),
    });
    expect(r.motivo).toMatch(/tamaño/);
  });

  it("redirección: no_comprobable, sin seguirla", async () => {
    let llamadas = 0;
    const f = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === HORIZON) return new Response(JSON.stringify(dom("integrador.cl")));
      llamadas++;
      expect(init?.redirect).toBe("manual");
      return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } });
    }) as typeof fetch;
    const r = await comprobarCuentaIntegrador(CUENTA, { fetch: f });
    expect(llamadas).toBe(1);
    expect(r.estado).toBe("no_comprobable");
    expect(r.motivo).toMatch(/redirige/);
    expect(r.motivo).not.toMatch(/169/);
  });

  it("rechaza dominios internos, reservados, de un rótulo y direcciones IP, sin consultar el toml", async () => {
    for (const d of ["servidor.internal", "intranet", "localhost", "x.local", "a.corp", "b.lan", "c.home", "d.test", "e.invalid", "f.example", "10.0.0.1", "a b.com", "a.com:8080", "a.com/x", "-a.com"]) {
      let tomlPedido = false;
      const f = (async (url: string | URL | Request) => {
        if (String(url) === HORIZON) return new Response(JSON.stringify(dom(d)));
        tomlPedido = true;
        return new Response("");
      }) as typeof fetch;
      const r = await comprobarCuentaIntegrador(CUENTA, { fetch: f });
      expect(r.estado, d).toBe("no_comprobable");
      expect(r.motivo, d).toMatch(/dominio público válido/);
      expect(tomlPedido, d).toBe(false);
    }
  });

  it("acepta TLD punycode y punto final (normalizado)", async () => {
    const r1 = await comprobarCuentaIntegrador(CUENTA, {
      fetch: conCuerpo(dom("banco.xn--p1ai"), () => new Response(TOML), "banco.xn--p1ai"),
    });
    expect(r1).toMatchObject({ estado: "vinculada", dominio: "banco.xn--p1ai" });
    const r2 = await comprobarCuentaIntegrador(CUENTA, {
      fetch: conCuerpo(dom("Integrador.CL."), () => new Response(TOML)),
    });
    expect(r2).toMatchObject({ estado: "vinculada", dominio: "integrador.cl" });
  });

  it("los motivos no filtran el mensaje del error ni el host", async () => {
    const f = (async (url: string | URL | Request) => {
      if (String(url) === HORIZON) return new Response(JSON.stringify(dom("integrador.cl")));
      throw new Error("connect ECONNREFUSED 10.1.2.3:443");
    }) as typeof fetch;
    const r = await comprobarCuentaIntegrador(CUENTA, { fetch: f });
    expect(r.motivo).not.toMatch(/ECONNREFUSED|10\.1\.2\.3|integrador/);
  });

  it("respuesta no UTF-8 o Horizon sin JSON: no_comprobable", async () => {
    const r1 = await comprobarCuentaIntegrador(CUENTA, {
      fetch: conCuerpo(dom("integrador.cl"), () => new Response(new Uint8Array([0xff, 0xfe, 0xfd]))),
    });
    expect(r1.motivo).toMatch(/no es válida/);
    const f = (async () => new Response("<html>", { status: 200 })) as typeof fetch;
    expect((await comprobarCuentaIntegrador(CUENTA, { fetch: f })).motivo).toMatch(/no es válida/);
  });
});

describe("leerStellarToml: casos dudosos dan 'no lista'", () => {
  it("ACCOUNTS que no es arreglo no absorbe las cadenas siguientes", () => {
    const t = leerStellarToml(`ACCOUNTS = "${OTRA}"\nOTRA = ["${CUENTA}"]\n`);
    expect(t.cuentas).toEqual([]);
  });

  it("cadenas multilínea: [T] y ACCOUNTS dentro no cuentan", () => {
    const toml = `DESC = """\n[DOCUMENTATION]\nACCOUNTS = ["${CUENTA}"]\n"""\nACCOUNTS = ["${OTRA}"]\n[DOCUMENTATION]\nORG_NAME = "Org"\n`;
    expect(leerStellarToml(toml)).toEqual({ cuentas: [OTRA], organizacion: "Org" });
    const lit = `D = '''\n[T]\nACCOUNTS = ["${CUENTA}"]\n'''\nX = 1\n`;
    expect(leerStellarToml(lit).cuentas).toEqual([]);
    // Un [T] dentro de la cadena no debe sacar a ACCOUNTS de la raíz.
    const raiz = `D = """\n[T]\n"""\nACCOUNTS = ["${CUENTA}"]\n`;
    expect(leerStellarToml(raiz).cuentas).toEqual([CUENTA]);
  });

  it("cadena multilínea sin cerrar: resultado vacío", () => {
    expect(leerStellarToml(`D = """\nACCOUNTS = ["${CUENTA}"]\n`).cuentas).toEqual([]);
  });

  it("ACCOUNTS repetido en la raíz es TOML inválido: vacío", () => {
    const t = leerStellarToml(`ACCOUNTS = ["${OTRA}"]\nACCOUNTS = ["${CUENTA}"]\n`);
    expect(t.cuentas).toEqual([]);
  });

  it("un ] dentro de una cadena no corta el arreglo", () => {
    expect(leerStellarToml(`ACCOUNTS = ["a]b", "${CUENTA}"]\n`).cuentas).toEqual(["a]b", CUENTA]);
  });

  it("arreglo sin cerrar: vacío", () => {
    expect(leerStellarToml(`ACCOUNTS = [\n"${CUENTA}"\n`).cuentas).toEqual([]);
  });
});

describe("leerStellarToml", () => {
  it("ACCOUNTS en una línea, comentarios y comillas simples", () => {
    const t = leerStellarToml(`ACCOUNTS = ['${CUENTA}', "${OTRA}"] # fin\n[DOCUMENTATION]\nORG_NAME = 'Org'\n`);
    expect(t).toEqual({ cuentas: [CUENTA, OTRA], organizacion: "Org" });
  });

  it("ignora ACCOUNTS dentro de otras tablas", () => {
    const t = leerStellarToml(`[[CURRENCIES]]\nACCOUNTS=["${CUENTA}"]\n`);
    expect(t.cuentas).toEqual([]);
  });
});
