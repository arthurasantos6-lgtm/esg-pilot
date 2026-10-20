import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sessão encerrada", robots: { index: false, follow: false } };

export default function AccessEndedPage() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="ended-title">
        <div className="brand auth-brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>copiloto<span className="brand-accent">ESG</span></span>
        </div>
        <p className="eyebrow">ACESSO DO COLABORADOR</p>
        <h1 id="ended-title">Sessão encerrada</h1>
        <p className="muted">
          Para enviar novas ideias, abra novamente o link de acesso enviado pela sua empresa. As ideias que você já enviou
          continuam registradas com a empresa.
        </p>
      </section>
    </main>
  );
}
