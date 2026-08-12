import type { Metadata } from "next";
import { Anton, Inter, Space_Mono } from "next/font/google";
import "./globals.css";

/*
 * Fuentes del sistema (libres, uso comercial):
 *   Anton      → display / titulares   (--font-anton)
 *   Inter      → cuerpo y UI           (--font-inter)
 *   Space Mono → precios y datos       (--font-space-mono)
 * theme.css las consume vía --font-display / --font-body / --font-mono.
 */
const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-space-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Prospector",
  description: "Demos profesionales para restaurantes de Montevideo",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      className={`${anton.variable} ${inter.variable} ${spaceMono.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
