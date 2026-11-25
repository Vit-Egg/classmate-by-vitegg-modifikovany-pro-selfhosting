export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-hero cm-hide">
        <div>
          <span className="brand-name">Classmate</span>
          <p className="by">lite · made by vitegg</p>
        </div>
        <p className="tag-line">Rozvrh, známky, absence, Komens a obědy na jednom místě.</p>
      </aside>
      <section className="auth-form">
        <div className="inner">{children}</div>
      </section>
    </div>
  );
}
