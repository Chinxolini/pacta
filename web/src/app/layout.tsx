import type { Metadata } from "next";
import Link from "next/link";
import { equityCaps, equityText } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pacta · contratos firmados con el teléfono y sellados en Stellar",
  description:
    "Protocolo y SDK para que dos personas firmen un préstamo desde el teléfono y quede sellado en Stellar. En la cadena queda solo un Sello seudonimizado.",
  metadataBase: new URL("https://pacta-demo.vercel.app"),
  openGraph: {
    title: "Pacta",
    description: "Un papel para lo que se acuerda por WhatsApp. Se firma con passkey y el Sello en Stellar prueba que el documento existía en esa fecha y que nadie lo cambió.",
    locale: "es_CL",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${equityText.variable} ${equityCaps.variable}`}>
      <body>
        <header className="masthead">
          <Link href="/" className="brand">
            Pacta
          </Link>
          <nav>
            <Link href="/demo">Demo</Link>
            <Link href="/verificar">Comprobar sello</Link>
            <Link href="/docs">Documentación</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="colophon">
          <p>
            Pacta · protocolo y SDK sobre Stellar · demo en <em>testnet</em>, sin valor real.
          </p>
          <p className="small">En la cadena queda solo el Sello.</p>
        </footer>
      </body>
    </html>
  );
}
