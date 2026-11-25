import { requireLogin } from "@/lib/auth";
import { bkInfo } from "@/lib/bk";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireLogin();
  const info = bkInfo();
  return (
    <div className="shell">
      <Sidebar name={info.name ?? ""} cls={info.cls ?? ""} />
      <main className="main">{children}</main>
    </div>
  );
}
