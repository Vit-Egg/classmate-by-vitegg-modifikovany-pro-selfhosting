import "./globals.css";

export const metadata = { title: { default: "Classmate lite", template: "%s · Classmate lite" }, robots: { index: false, follow: false }, icons: { icon: "/icon.svg" } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
