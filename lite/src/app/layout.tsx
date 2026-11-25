import type { Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";
import "@/lib/embed/cm.css";
import { accentCss } from "@/lib/theme";
import { sunIsUp } from "@/lib/sun";
import { CM_FRAME_SCRIPT } from "@/lib/embed/core";

const display = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], variable: "--f-display", display: "swap" });
const body = Instrument_Sans({ subsets: ["latin", "latin-ext"], variable: "--f-body", display: "swap" });

export const metadata = {
  title: { default: "Classmate lite", template: "Classmate lite · %s" },
  robots: { index: false, follow: false },
  icons: { icon: [{ url: "/favicon.ico", sizes: "48x48" }, { url: "/icon.svg", type: "image/svg+xml" }] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f2ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1013" },
  ],
};

// stejný motiv jako ve starém Classmate (světlý přes den, tmavý po západu slunce, nebo volba v Nastavení); v rámu Classmate pak platí motiv z Classmate
const themeInit = `try{var d=document.documentElement,t=localStorage.getItem("theme")||"sun",a=localStorage.getItem("accent");if(t==="sun")t=(${sunIsUp.toString()})(Date.now())?"light":"dark";if(t==="light"||t==="dark")d.dataset.theme=t;if(a&&/^[a-z]+$/.test(a))d.dataset.accent=a}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: accentCss() }} />
        <script dangerouslySetInnerHTML={{ __html: themeInit + CM_FRAME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
