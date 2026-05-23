import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Inter } from "next/font/google";
import "./globals.css";

// Fuentes self-hosted por Next (sin <link> bloqueante a Google) → primer paint
// más rápido y sin parpadeo. Se exponen como CSS vars que usa globals.css.
const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bebas",
});
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Fichero Mítico",
  description: "Control de asistencia — Mítico Pizzería & Cocktail Bar",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fichero Mítico",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0d0d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${bebasNeue.variable} ${inter.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
