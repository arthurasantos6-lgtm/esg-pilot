import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { createIdea } from "@/app/actions";
import { AppShell } from "@/app/components/app-shell";
import { assertModuleEnabled, requireCompanyContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Registrar ideia" };

export default async function NewIdeaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const { user, membership, organization } = await requireCompanyContext();
  assertModuleEnabled(organization.enabled_modules, "ideas", "Ideias");
  const { error } = await searchParams;

  return (
    <AppShell organizationName={organization.name} userEmail={user.email ?? "Conta"} role={membership.role}>
      <header className="page-header">
        <div>
          <Link className="back-link" href="/ideas">← Voltar para ideias</Link>
          <p className="eyebrow">COMPARTILHE UMA OPORTUNIDADE</p>
          <h1>Registrar nova ideia</h1>
          <p className="muted">Conte o que pode melhorar. Você poderá acompanhar os próximos passos por aqui.</p>
        </div>
      </header>

      <div className="form-layout">
        <section className="panel idea-form-panel" aria-labelledby="idea-form-title">
          <h2 id="idea-form-title">Sobre a ideia</h2>
          <p className="muted small-copy">Campos com * são obrigatórios. Não inclua dados pessoais sensíveis ou informações confidenciais.</p>
          {error && <p className="alert alert-error" role="alert">{error}</p>}
          <form className="idea-form" action={createIdea}>
            <label htmlFor="title">Título da ideia <span aria-hidden="true">*</span></label>
            <input id="title" name="title" type="text" maxLength={120} minLength={3} required placeholder="Ex.: Reduzir o consumo de água na unidade" />
            <label htmlFor="problem">Qual problema ou oportunidade você identificou? <span aria-hidden="true">*</span></label>
            <textarea id="problem" name="problem" rows={5} minLength={10} maxLength={4000} required placeholder="Descreva o cenário atual e por que ele pode ser melhorado." />
            <label htmlFor="solution">Qual solução você propõe? <span aria-hidden="true">*</span></label>
            <textarea id="solution" name="solution" rows={5} minLength={10} maxLength={4000} required placeholder="Explique como a mudança poderia funcionar." />
            <label htmlFor="area">Área ou setor relacionado</label>
            <input id="area" name="area" type="text" maxLength={100} placeholder="Ex.: Operações, Pessoas, Compras" />
            <div className="form-actions">
              <Link className="button button-secondary" href="/ideas">Cancelar</Link>
              <button className="button button-primary" type="submit">Enviar ideia <span aria-hidden="true">→</span></button>
            </div>
          </form>
        </section>
        <aside className="info-card">
          <span className="info-icon" aria-hidden="true">✦</span>
          <h2>Como funciona a triagem?</h2>
          <p>Ao enviar, o sistema procura termos relacionados às dimensões Ambiental, Social e Governança para sugerir pontos de reflexão.</p>
          <p className="small-copy">Esta triagem é baseada em palavras-chave. Não é uma avaliação feita por inteligência artificial nem comprova impacto ESG. A equipe deve validar cada sugestão.</p>
        </aside>
      </div>
    </AppShell>
  );
}
