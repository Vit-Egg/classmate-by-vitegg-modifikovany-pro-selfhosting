export const metadata = { title: "Povolit přístup" };

export default function OAuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="consent-wrap">{children}</div>;
}
