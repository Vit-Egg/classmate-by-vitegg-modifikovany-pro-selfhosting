import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { PwaClient } from "@/components/PwaClient";
import { siteUrl } from "@/lib/site";
import { SelectEnhancer } from "@/components/SelectEnhancer";
import { ThemeSun } from "@/components/ThemeSun";
import { accentCss } from "@/lib/theme";
import { sunIsUp } from "@/lib/sun";
import { seasonInit } from "@/lib/season";
import { ANALYTICS_CLEAN, analyticsConfig } from "@/lib/analytics";

const display = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], variable: "--f-display", display: "swap" });
const body = Instrument_Sans({ subsets: ["latin", "latin-ext"], variable: "--f-body", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Classmate", template: "Classmate · %s" },
  description: "Rozvrh, úkoly, testy a zkoušení, kalendář, známky a poznámky na jednom místě.",
  // server je soukromý, patří jen svým uživatelům; veřejná prezentace je na classmate.cz
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/favicon.ico", sizes: "48x48" }, { url: "/icon.svg", type: "image/svg+xml" }], apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Classmate", statusBarStyle: "black-translucent" },
  applicationName: "Classmate",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f2ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1013" },
  ],
};

const themeInit = `try{var d=document.documentElement,t=localStorage.getItem("theme")||"sun",a=localStorage.getItem("accent");if(t==="sun")t=(${sunIsUp.toString()})(Date.now())?"light":"dark";if(t==="light"||t==="dark")d.dataset.theme=t;if(a&&/^[a-z]+$/.test(a))d.dataset.accent=a}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const stats = analyticsConfig();
  return (
    <html lang="cs" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: accentCss() }} />
        <script dangerouslySetInnerHTML={{ __html: themeInit + seasonInit }} />
      </head>
      <body>
        {children}
        <PwaClient />
        <ThemeSun />
        <SelectEnhancer />
        {stats && (
          <>
            <script dangerouslySetInnerHTML={{ __html: ANALYTICS_CLEAN }} />
            <script defer src={stats.src} data-website-id={stats.siteId} data-before-send="cmStats" data-exclude-search="true" data-do-not-track="true" />
          </>
        )}
      </body>
    </html>
  );
}
