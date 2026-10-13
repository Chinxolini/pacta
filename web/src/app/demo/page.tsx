import type { Metadata } from "next";
import Demo from "./Demo";

export const metadata: Metadata = { title: "Demo del préstamo · Pacta" };

export default function PaginaDemo() {
  return <Demo />;
}
