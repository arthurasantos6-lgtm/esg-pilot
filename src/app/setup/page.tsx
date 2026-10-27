import type { Metadata } from "next";

export const metadata: Metadata = { title: "Configuração necessária" };

export default function SetupPage() {
  return (
    <main className="auth-page">
      <section className="auth-card setup-card" aria-labelledby="setup-title">
        <span className="brand-mark" aria-hidden="true">C</span>
        <p className="eyebrow">CONFIGURAÇÃO INICIAL</p>
        <h1 id="setup-title">Conecte seu projeto Supabase</h1>
        <p className="muted">
          A aplicação ainda não está conectada a um banco. Configure as variáveis
          de ambiente e aplique a migração antes de usar os fluxos autenticados.
        </p>
        <ol className="setup-steps">
          <li>Copie <code>.env.example</code> para <code>.env.local</code>.</li>
          <li>Preencha a URL e a chave pública do seu projeto Supabase.</li>
          <li>Aplique <code>supabase/migrations/20261020_initial_schema.sql</code>.</li>
          <li>Cadastre uma conta e associe-a a uma organização no painel Supabase.</li>
        </ol>
        <p className="auth-footnote">Após configurar o ambiente, recarregue esta página para acessar o login.</p>
      </section>
    </main>
  );
}
