// Sello de Pacta: borde ondulado de lacre, anillo con leyenda y dos círculos
// que se cruzan (las dos Partes) con el cruce relleno (el acuerdo sellado).
// Colores planos y trazos vectoriales limpios; sin filtros ni degradados.

const LOBULOS = 28;
const R = 94;
const ONDA = 2.4;
// Radio de la leyenda y su circunferencia: el texto se reparte en la vuelta completa.
const R_TEXTO = 68;
const VUELTA = 2 * Math.PI * R_TEXTO;

// Borde ondulado como curva suave: un punto cada cuarto de lóbulo, unido con
// Béziers cúbicas (Catmull-Rom), para que no se vean segmentos rectos.
function borde(): string {
  const n = LOBULOS * 4;
  const p = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    const r = R + ONDA * Math.cos(LOBULOS * a);
    return [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
  });
  const f = (v: number) => v.toFixed(2);
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n];
    const p1 = p[i];
    const p2 = p[(i + 1) % n];
    const p3 = p[(i + 2) % n];
    d +=
      `C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ` +
      `${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ` +
      `${f(p2[0])},${f(p2[1])}`;
  }
  return `${d}Z`;
}

const BORDE = borde();

export default function Sello({ className = "sello" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" role="img" aria-label="Sello de Pacta">
      <defs>
        <path
          id="sello-arco"
          d={`M${100 - R_TEXTO},100 a${R_TEXTO},${R_TEXTO} 0 1,1 ${2 * R_TEXTO},0 a${R_TEXTO},${R_TEXTO} 0 1,1 ${-2 * R_TEXTO},0`}
        />
        <clipPath id="sello-lente">
          <circle cx="82" cy="100" r="30" />
        </clipPath>
        {/* La cera en relieve: el surco del canto se recorta de la capa superior. */}
        <mask id="sello-surco">
          <rect width="200" height="200" fill="#fff" />
          <circle cx="100" cy="100" r="86" fill="none" stroke="#000" strokeWidth="1.8" />
        </mask>
        {/* Luz desde arriba a la izquierda sobre el alfa suavizado: bisel en el
            borde y en el surco, con el contorno intacto. */}
        <filter id="sello-relieve" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.3" result="alto" />
          <feDiffuseLighting in="alto" surfaceScale="3.2" diffuseConstant="1.155" lightingColor="#fff" result="difusa">
            <feDistantLight azimuth="225" elevation="60" />
          </feDiffuseLighting>
          <feBlend in="SourceGraphic" in2="difusa" mode="multiply" result="sombreado" />
          <feSpecularLighting
            in="alto"
            surfaceScale="3.2"
            specularConstant="0.5"
            specularExponent="40"
            lightingColor="#fff"
            result="brillo"
          >
            <feDistantLight azimuth="225" elevation="60" />
          </feSpecularLighting>
          <feComposite in="sombreado" in2="brillo" operator="arithmetic" k1="0" k2="1" k3="0.35" k4="0" result="luz" />
          <feComposite in="luz" in2="SourceAlpha" operator="in" />
        </filter>
        <filter id="sello-grabado" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0.35" dy="0.5" stdDeviation="0.25" floodColor="#000" floodOpacity="0.32" />
        </filter>
      </defs>
      <path d={BORDE} fill="var(--lacre)" />
      <path d={BORDE} fill="#000" fillOpacity="0.22" />
      <path d={BORDE} fill="var(--lacre)" mask="url(#sello-surco)" filter="url(#sello-relieve)" />
      <g filter="url(#sello-grabado)">
        <circle cx="100" cy="100" r="79" fill="none" stroke="#fbf1e3" strokeOpacity="0.55" strokeWidth="1.2" />
        <circle cx="100" cy="100" r="57" fill="none" stroke="#fbf1e3" strokeOpacity="0.55" strokeWidth="1.2" />
        <text fill="#fbf1e3" fontSize="12.5" style={{ fontFamily: "var(--font-caps), Georgia, serif" }}>
          {/* El espacio final es duro (U+00A0) para que el último punto no se pegue a la primera letra. */}
          <textPath href="#sello-arco" startOffset="0" textLength={VUELTA.toFixed(2)} lengthAdjust="spacing">
            {"Sellado en Stellar · Pacta · Seudonimizado · "}
          </textPath>
        </text>
        <g fill="none" stroke="#fbf1e3" strokeWidth="2.2">
          <circle cx="82" cy="100" r="30" />
          <circle cx="118" cy="100" r="30" />
        </g>
        <circle cx="118" cy="100" r="30" fill="#fbf1e3" clipPath="url(#sello-lente)" />
      </g>
    </svg>
  );
}
