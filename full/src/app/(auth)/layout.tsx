import Link from "next/link";
import { AppBridge } from "@/components/AppBridge";
import { ClearOfflinePages } from "@/components/PwaClient";

export const metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <ClearOfflinePages />
      <AppBridge signedIn={false} />
      <aside className="auth-hero cm-hide">
        <div>
          <Link href="/" className="brand-name" aria-label="Zpět na úvodní stránku">Classmate</Link>
        </div>
        <p className="tag-line">Rozvrh, úkoly, testy a zkoušení a známky na jednom místě.</p>
      </aside>
      <section className="auth-form">
        <div className="inner">{children}</div>
      </section>
    </div>
  );
}
