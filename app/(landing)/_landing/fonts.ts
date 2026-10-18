import localFont from "next/font/local";

/** Geist ships with the repository (OFL); the landing makes no font requests. */
export const landingFont = localFont({
  src: [
    { path: "../../studio/fonts/Geist-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../studio/fonts/Geist-SemiBold.ttf", weight: "600", style: "normal" },
  ],
  variable: "--font-landing",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});
