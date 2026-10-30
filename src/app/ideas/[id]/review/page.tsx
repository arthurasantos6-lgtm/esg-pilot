import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { saveProposal } from "@/app/ideas/actions";
import { AppShell } from "@/app/components/app-shell";
import { SubmitButton } from "@/app/components/submit-button";
import { assertModuleEnabled, requireCompanyContext } from "@/lib/auth";
import { isAiAvailable, toIdeaPromptInput } from "@/lib/idea-ai";
import { parseStoredProposal, PROPOSAL_FIELD_MAX_LENGTH, PROPOSAL_FIELDS } from "@/lib/idea-proposal";

export const metadata: Metadata = { title: "Revisar proposta" };

// O envio agenda a avaliação da IA para depois da resposta (after()).
export const maxDuration = 300;

export default async function ReviewProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; organized?: string }>;
}) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.guid().safeParse(id).success) notFound();

  const { supabase, user, membership, organization } = await requireCompanyContext();
  assertModuleEnabled(organization.enabled_modules, "ideas", "Ideias");

  const { data: idea } = await supabase
    .from("ideas")
    .select("id, title, original_description, problem, solution, area, status, author_id, structured_proposal")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  if (!idea) notFound();
  if (idea.author_id !== user.id || idea.status !== "draft") redirect(`/ideas/${idea.id}`);

  const proposal = parseStoredProposal(idea.structured_proposal);
  const original = toIdeaPromptInput(idea).originalDescription;
  const aiAvailable = isAiAvailable();
  const filledFields = PROPOSAL_FIELDS.filter(({ key }) => proposal?.[key]);
  const emptyFields = PROPOSAL_FIELDS.filter(({ key }) => !proposal?.[key]);
  const renderField = ({ key, label, hint }: (typeof PROPOSAL_FIELDS)[number]) => (
    <div key={key} className="proposal-field">
      <label htmlFor={key}>{label}</label>
      <p id={`${key}-hint`} className="field-hint">{hint}</p>
      <textarea
        id={key}
        name={key}
        rows={key === "problem" || key === "solution" ? 4 : 3}
        maxLength={PROPOSAL_FIELD_MAX_LENGTH}
        aria-describedby={`${key}-hint`}
        defaultValue={proposal?.[key] ?? ""}
        placeholder="Não informado"
      />
    </div>
  );

  return (
    <AppShell organizationName={organization.name} userEmail={user.email} membership={membership}>
      <header className="page-header">
        <div>
          <p className="eyebrow">REVISÃO ANTES DO ENVIO</p>
          <h1>Revisar proposta</h1>
          <p className="muted">
            <span className="status-badge status-badge-draft">Rascunho</span> Edite o que quiser. Campos vazios ficam como &quot;não informado&quot;.
          </p>
        </div>
        {aiAvailable && (
          <div className="header-actions">
            <Link className="button button-secondary" href={`/ideas/${idea.id}/copilot`}>← Voltar à conversa</Link>
          </div>
        )}
      </header>

      {query.error && <p className="alert alert-error" role="alert">{query.error}</p>}
      {query.saved && <p className="alert alert-success" role="status">Rascunho salvo.</p>}
      {query.organized && (
        <p className="alert alert-info" role="status">
          O copiloto organizou a proposta a partir da conversa. Confira cada campo: o texto foi gerado por IA e pode conter imprecisões.
        </p>
      )}

      <div className="form-layout">
        <section className="panel idea-form-panel" aria-labelledby="proposal-title">
          <h2 id="proposal-title">Proposta estruturada</h2>
          {proposal?.source === "copilot" && (
            <p className="small-copy muted"><span className="source-tag source-tag-ai">Sugerido pela IA</span> e editável por você.</p>
          )}
          <form className="idea-form" action={saveProposal}>
            <input type="hidden" name="ideaId" value={idea.id} />
            <label htmlFor="title">Título <span aria-hidden="true">*</span></label>
            <input id="title" name="title" type="text" minLength={3} maxLength={120} required defaultValue={proposal?.title ?? idea.title} />

            {filledFields.map(renderField)}
            {emptyFields.length > 0 && (
              <details className="proposal-more">
                <summary className="small-copy">Adicionar mais detalhes (opcional)</summary>
                {emptyFields.map(renderField)}
              </details>
            )}

            <label htmlFor="area">Área ou setor relacionado</label>
            <input id="area" name="area" type="text" maxLength={100} defaultValue={idea.area ?? ""} />

            <div className="checkbox-row confirm-row">
              <input id="confirmReview" name="confirmReview" type="checkbox" />
              <label htmlFor="confirmReview">
                Revisei a proposta e quero enviá-la para avaliação. Entendo que, após o envio, a gestão da empresa verá a
                ideia e a proposta.
              </label>
            </div>

            <div className="form-actions">
              <SubmitButton name="intent" value="save" className="button button-secondary" pendingLabel="Salvando…">
                Salvar rascunho
              </SubmitButton>
              <SubmitButton name="intent" value="submit" className="button button-primary" pendingLabel="Enviando…">
                Enviar para avaliação <span aria-hidden="true">→</span>
              </SubmitButton>
            </div>
          </form>
        </section>

        <aside className="info-card">
          <span className="info-icon" aria-hidden="true">✎</span>
          <h2>Seu texto original</h2>
          <p className="preserve-lines">{original}</p>
          <p className="small-copy">Preservado como você escreveu. Ele continua visível junto da proposta para comparação.</p>
        </aside>
      </div>
    </AppShell>
  );
}
