import { EB_Garamond } from "next/font/google";

// Open-source stand-in for the proprietary Equity typeface used on the
// hosted demo (not redistributable, so it is not part of this repository).
export const equityText = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-text",
  display: "swap",
});

export const equityCaps = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-caps",
  display: "swap",
});
