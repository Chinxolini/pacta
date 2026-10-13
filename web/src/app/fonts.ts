import { Spectral, Spectral_SC } from "next/font/google";

// Open-source pair with true small caps. The hosted demo uses Equity
// (proprietary, not redistributable), so it is not part of this repository.
export const equityText = Spectral({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  variable: "--font-text",
  display: "swap",
});

export const equityCaps = Spectral_SC({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-caps",
  display: "swap",
});
