// Sello de Pacta: borde ondulado de lacre, anillo con leyenda y dos círculos
// que se cruzan (las dos Partes) con el cruce relleno (el acuerdo sellado).
// Colores planos y relieve de dos tonos; sin degradados brillantes.

const LOBULOS = 28;
const R = 94;

function borde(): string {
  const pts: string[] = [];
  for (let i = 0; i < 360; i += 2) {
    const a = (i * Math.PI) / 180;
    const r = R + 2.4 * Math.cos(LOBULOS * a);
    pts.push(`${(100 + r * Math.cos(a)).toFixed(2)},${(100 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

const BORDE = borde();

export default function Sello({ className = "sello" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" role="img" aria-label="Sello de Pacta">
      <defs>
        <path id="sello-arco" d="M100,100 m-68,0 a68,68 0 1,1 136,0 a68,68 0 1,1 -136,0" />
        <clipPath id="sello-lente">
          <circle cx="82" cy="100" r="30" />
        </clipPath>
        <filter id="sello-cera" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" />
        </filter>
      </defs>
      <g filter="url(#sello-cera)">
        <path d={BORDE} transform="translate(1.5 2)" fill="#000" opacity="0.28" />
        <path d={BORDE} fill="var(--lacre)" />
        <path d={BORDE} fill="none" stroke="#fff" strokeOpacity="0.18" strokeWidth="1.2" transform="translate(-1 -1)" />
      </g>
      <circle cx="100" cy="100" r="79" fill="none" stroke="#fbf1e3" strokeOpacity="0.55" strokeWidth="1.2" />
      <circle cx="100" cy="100" r="57" fill="none" stroke="#fbf1e3" strokeOpacity="0.55" strokeWidth="1.2" />
      <text
        fill="#fbf1e3"
        fontSize="12.5"
        letterSpacing="3.2"
        style={{ fontFamily: "var(--font-caps), Georgia, serif" }}
      >
        <textPath href="#sello-arco" startOffset="0">
          Sellado en Stellar · Pacta · Seudonimizado ·
        </textPath>
      </text>
      <g fill="none" stroke="#fbf1e3" strokeWidth="2.2">
        <circle cx="82" cy="100" r="30" />
        <circle cx="118" cy="100" r="30" />
      </g>
      <circle cx="118" cy="100" r="30" fill="#fbf1e3" clipPath="url(#sello-lente)" />
    </svg>
  );
}
