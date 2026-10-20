import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { startIdea } from "@/app/ideas/actions";
import { AppShell } from "@/app/components/app-shell";
import { SubmitButton } from "@/app/components/submit-button";
import { assertModuleEnabled, requireCompanyContext } from "@/lib/auth";
import { isAiAvailable } from "@/lib/idea-ai";

export const metadata: Metadata = { title: "Registrar ideia" };

// Abrir o copiloto gera a primeira resposta da IA durante a requisição.
export const maxDuration = 120;

export default async function NewIdeaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const { user, membership, organization } = await requireCompanyContext();
  assertModuleEnabled(organization.enabled_modules, "ideas", "Ideias");
  const { error } = await searchParams;
  const aiAvailable = isAiAvailable();

  return (
    <AppShell organizationName={organization.name} userEmail={user.email ?? "Conta"} role={membership.role}>
      <header className="page-header">
        <div>
          <Link className="back-link" href="/ideas">← Voltar para ideias</Link>
          <p className="eyebrow">COMPARTILHE UMA OPORTUNIDADE</p>
          <h1>Registrar nova ideia</h1>
          <p className="muted">Escreva do seu jeito. Não precisa estar completa: você pode amadurecê-la antes de enviar.</p>
        </div>
      </header>

      <div className="form-layout">
        <section className="panel idea-form-panel" aria-labelledby="idea-form-title">
          <h2 id="idea-form-title">Sobre a ideia</h2>
          <p className="muted small-copy">Campos com * são obrigatórios. Não inclua dados pessoais (nomes de colegas, documentos, saúde) nem informações confidenciais.</p>
          {error && <p className="alert alert-error" role="alert">{error}</p>}
          <form className="idea-form" action={startIdea}>
            <label htmlFor="title">Título da ideia <span aria-hidden="true">*</span></label>
            <input id="title" name="title" type="text" maxLength={120} minLength={3} required placeholder="Ex.: Reaproveitar a água da lavagem de peças" />
            <label htmlFor="description">Descreva a ideia <span aria-hidden="true">*</span></label>
            <p id="description-hint" className="field-hint">
              Pode ser um problema que você percebeu, uma oportunidade de melhoria, uma possível solução ou o benefício que espera.
            </p>
            <textarea
              id="description"
              name="description"
              rows={8}
              minLength={10}
              maxLength={8000}
              required
              aria-describedby="description-hint"
              placeholder="Ex.: Na lavagem de peças usamos muita água limpa que vai direto para o esgoto. Acho que daria para filtrar e reutilizar…"
            />
            <label htmlFor="area">Área ou setor relacionado</label>
            <input id="area" name="area" type="text" maxLength={100} placeholder="Ex.: Operações, Pessoas, Compras" />
            <div className="form-actions">
              <Link className="button button-secondary" href="/ideas">Cancelar</Link>
              {aiAvailable && (
                <SubmitButton name="intent" value="review" className="button button-secondary" pendingLabel="Salvando…">
                  Revisar sem copiloto
                </SubmitButton>
              )}
              <SubmitButton
                name="intent"
                value={aiAvailable ? "copilot" : "review"}
                className="button button-primary"
                pendingLabel={aiAvailable ? "Abrindo o copiloto…" : "Salvando…"}
              >
                {aiAvailable ? "Conversar com o copiloto" : "Continuar"} <span aria-hidden="true">→</span>
              </SubmitButton>
            </div>
          </form>
        </section>
        <aside className="info-card">
          <span className="info-icon" aria-hidden="true">✦</span>
          <h2>Como funciona?</h2>
          <p>1. Sua ideia é salva como <strong>rascunho</strong>, visível só para você.</p>
          {aiAvailable ? (
            <p>2. O copiloto de IA faz algumas perguntas para deixar a proposta mais clara e organiza uma versão estruturada.</p>
          ) : (
            <p>2. Você organiza a proposta em campos simples. O copiloto de IA não está disponível nesta plataforma no momento.</p>
          )}
          <p>3. Você revisa tudo e confirma o envio. Seu texto original fica guardado como foi escrito.</p>
          <p className="small-copy">A avaliação ESG é uma recomendação para apoiar a gestão, não uma aprovação nem certificação.</p>
        </aside>
      </div>
    </AppShell>
  );
}
