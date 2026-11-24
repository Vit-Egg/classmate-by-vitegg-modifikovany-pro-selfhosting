import { requireLogin } from "@/lib/auth";
import { Nav } from "./Nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireLogin();
  return (
    <div className="shell">
      <Nav />
      <main className="main">{children}</main>
    </div>
  );
}
