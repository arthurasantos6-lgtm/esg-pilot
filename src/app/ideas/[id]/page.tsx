import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { updateIdeaStatus } from "@/app/actions";
import { EvaluationPanel } from "@/app/ideas/[id]/evaluation-panel";
import { AppShell } from "@/app/components/app-shell";
import { requireCompanyContext } from "@/lib/auth";
import { isAiAvailable } from "@/lib/idea-ai";
import { parseStoredProposal, PROPOSAL_FIELDS } from "@/lib/idea-proposal";

export const metadata: Metadata = { title: "Detalhe da ideia" };

// "Tentar novamente" agenda a avaliação da IA para depois da resposta.
export const maxDuration = 300;

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  submitted: "Enviada",
  in_review: "Em análise",
  awaiting_info: "Aguardando informações",
  technical_review: "Avaliação técnica",
  approved: "Aprovada",
  in_progress: "Em implementação",
  implemented: "Implementada",
  rejected: "Rejeitada",
  archived: "Arquivada",
};

const statusOptions = Object.entries(statusLabels).filter(([status]) => !["archived", "draft"].includes(status));

type AnalysisDimension = { dimension: string; explanation: string; hits: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getDimensions(value: unknown): AnalysisDimension[] {
  if (!isRecord(value) || !Array.isArray(value.dimensions)) {
    return [];
  }

  return value.dimensions.filter(
    (item: unknown): item is AnalysisDimension =>
      Boolean(
        item &&
          typeof item === "object" &&
          "dimension" in item &&
          typeof item.dimension === "string" &&
          "explanation" in item &&
          typeof item.explanation === "string" &&
          "hits" in item &&
          Array.isArray(item.hits) &&
          item.hits.every((hit: unknown) => typeof hit === "string"),
      ),
  );
}

function getSuggestedMetrics(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.suggestedMetrics)) return [];
  return value.suggestedMetrics.filter((item: unknown): item is string => typeof item === "string");
}

export default async function IdeaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string; error?: string }>;
}) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, user, membership, organization } = await requireCompanyContext();
  const { data: idea, error } = await supabase
    .from("ideas")
    .select("id, title, problem, solution, original_description, structured_proposal, area, status, author_id, created_at, submitted_at, analysis")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  if (error) throw new Error(`Não foi possível carregar a ideia: ${error.message}`);
  if (!idea) notFound();

  const isAuthor = idea.author_id === user.id;
  const isCompanyAdmin = membership.role === "company_admin";
  const isDraft = idea.status === "draft";

  // RLS limita a conversa ao autor e, após o envio, à gestão da empresa.
  const [{ data: evaluation }, { data: messages }] = await Promise.all([
    supabase
      .from("idea_evaluations")
      .select("status, result, error_message, model, criteria_version_label, created_at, completed_at")
      .eq("idea_id", idea.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("idea_copilot_messages")
      .select("id, role, content, created_at")
      .eq("idea_id", idea.id)
      .order("created_at", { ascending: true }),
  ]);

  const proposal = parseStoredProposal(idea.structured_proposal);
  const dimensions = getDimensions(idea.analysis);
  const analysisObject = isRecord(idea.analysis) ? idea.analysis : null;
  const notice =
    analysisObject && "notice" in analysisObject && typeof analysisObject.notice === "string"
      ? analysisObject.notice
      : "A classificação e as sugestões são indicativas e precisam de validação.";
  const potential =
    analysisObject && "potential" in analysisObject && typeof analysisObject.potential === "string"
      ? analysisObject.potential
      : null;
  const criteriaVersionLabel =
    analysisObject && "criteriaVersionLabel" in analysisObject && typeof analysisObject.criteriaVersionLabel === "string"
      ? analysisObject.criteriaVersionLabel
      : null;
  const suggestedMetrics = getSuggestedMetrics(idea.analysis);
  const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" });

  return (
    <AppShell organizationName={organization.name} userEmail={user.email ?? "Conta"} role={membership.role}>
      <header className="page-header">
        <div>
          <Link className="back-link" href="/ideas">← Voltar para ideias</Link>
          <p className="eyebrow">IDEIA ESG</p>
          <h1>{idea.title}</h1>
          <p className="muted">
            {idea.submitted_at
              ? `Enviada em ${dateFormat.format(new Date(idea.submitted_at))}`
              : `Criada em ${dateFormat.format(new Date(idea.created_at))}`}
            {idea.area ? ` · ${idea.area}` : ""}
          </p>
        </div>
        <span className={`status-badge status-badge-${idea.status}`}>{statusLabels[idea.status] ?? idea.status}</span>
      </header>

      {query.submitted && (
        <p className="alert alert-success" role="status">
          Ideia enviada para avaliação. Acompanhe a situação por aqui.
        </p>
      )}
      {query.error && <p className="alert alert-error" role="alert">{query.error}</p>}
      {isDraft && isAuthor && (
        <div className="alert alert-info" role="status">
          Esta ideia ainda é um rascunho, visível só para você.{" "}
          <Link className="text-link" href={`/ideas/${idea.id}/copilot`}>Continuar com o copiloto</Link> ou{" "}
          <Link className="text-link" href={`/ideas/${idea.id}/review`}>revisar e enviar</Link>.
        </div>
      )}

      <div className="detail-grid">
        <div className="detail-main">
          {idea.original_description ? (
            <section className="panel detail-panel" aria-labelledby="original-title">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">TEXTO ORIGINAL</p>
                  <h2 id="original-title">Como o colaborador descreveu</h2>
                </div>
                <span className="source-tag source-tag-person">Escrito pelo colaborador</span>
              </div>
              <p className="preserve-lines">{idea.original_description}</p>
            </section>
          ) : (
            <section className="panel detail-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">OPORTUNIDADE</p>
                  <h2>Problema ou oportunidade</h2>
                </div>
                <span className="source-tag source-tag-person">Escrito pelo colaborador</span>
              </div>
              <p className="preserve-lines">{idea.problem ?? "Não informado."}</p>
              <hr />
              <h2>Solução proposta</h2>
              <p className="preserve-lines">{idea.solution ?? "Não informado."}</p>
            </section>
          )}

          {proposal && (
            <section className="panel detail-panel" aria-labelledby="proposal-title">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">PROPOSTA ESTRUTURADA</p>
                  <h2 id="proposal-title">{proposal.title}</h2>
                </div>
                <span className="source-tag source-tag-person">
                  {proposal.source === "copilot" ? "Organizada com a IA e revisada pelo colaborador" : "Organizada pelo colaborador"}
                </span>
              </div>
              <dl className="proposal-list">
                {PROPOSAL_FIELDS.map(({ key, label }) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd className={proposal[key] ? "preserve-lines" : "empty-inline"}>{proposal[key] ?? "Não informado"}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {!isDraft && (
            <EvaluationPanel
              ideaId={idea.id}
              evaluation={evaluation}
              aiAvailable={isAiAvailable()}
              canRetry={isAuthor || isCompanyAdmin}
            />
          )}

          {analysisObject && (
            <section className="panel detail-panel" aria-labelledby="analysis-title">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">TRIAGEM AUTOMÁTICA · SEM IA</p>
                  <h2 id="analysis-title">Triagem por termos</h2>
                </div>
                {potential && <span className={`potential-badge potential-${potential}`}>Potencial {potential}</span>}
              </div>
              <p className="muted small-copy">{notice}</p>
              {dimensions.length ? (
                <ul className="dimension-cards">
                  {dimensions.map((item) => (
                    <li key={item.dimension}>
                      <span className={`dimension-pill dimension-${item.dimension.toLowerCase()}`}>{item.dimension}</span>
                      <div><strong>{item.explanation}</strong><p className="small-copy muted">Termos encontrados: {item.hits.join(", ")}</p></div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-inline">Nenhuma dimensão foi identificada pelos termos atuais. Isso não significa ausência de potencial ESG.</p>
              )}
              {suggestedMetrics.length > 0 && (
                <>
                  <h3 className="subsection-title">Indicadores para considerar</h3>
                  <ul className="metric-suggestions">{suggestedMetrics.map((metric) => <li key={metric}>{metric}</li>)}</ul>
                </>
              )}
              {criteriaVersionLabel && (
                <p className="table-subtitle">Critérios usados nesta triagem: {criteriaVersionLabel}</p>
              )}
            </section>
          )}

          {messages && messages.length > 0 && (
            <section className="panel detail-panel" aria-labelledby="conversation-title">
              <details>
                <summary>
                  <span className="eyebrow">COPILOTO · HISTÓRICO</span>
                  <h2 id="conversation-title">Conversa com o copiloto ({messages.length} mensagens)</h2>
                </summary>
                <ol className="chat-log chat-log-readonly">
                  {messages.map((message) => (
                    <li key={message.id} className={`chat-message chat-message-${message.role}`}>
                      <span className="chat-author">{message.role === "user" ? "Colaborador" : "Copiloto (IA)"}</span>
                      <p className="preserve-lines">{message.content}</p>
                    </li>
                  ))}
                </ol>
              </details>
            </section>
          )}
        </div>

        <aside className="detail-aside">
          <section className="panel workflow-panel" aria-labelledby="workflow-title">
            <p className="eyebrow">DECISÃO DA EMPRESA</p>
            <h2 id="workflow-title">Próximos passos</h2>
            <p className="muted small-copy">
              A situação da ideia é definida por pessoas da gestão da empresa. A recomendação da IA não altera a situação.
            </p>
            {isCompanyAdmin && !isDraft ? (
              <form className="status-form" action={updateIdeaStatus}>
                <input type="hidden" name="ideaId" value={idea.id} />
                <label htmlFor="status">Atualizar situação</label>
                <select id="status" name="status" defaultValue={idea.status}>
                  {statusOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
                <button className="button button-primary button-full" type="submit">Salvar situação</button>
              </form>
            ) : (
              <div className="status-timeline">
                <span className={`status-dot status-${idea.status}`} aria-hidden="true" />
                <div>
                  <strong>{statusLabels[idea.status] ?? idea.status}</strong>
                  <p className="muted small-copy">
                    {isDraft ? "Envie a ideia para que a gestão possa avaliá-la." : "O administrador da empresa pode atualizar esta etapa."}
                  </p>
                </div>
              </div>
            )}
          </section>
          <div className="privacy-note">
            <span aria-hidden="true">⌑</span>
            <p><strong>Dados protegidos por organização</strong><br />Esta ideia só pode ser acessada por pessoas autorizadas do ambiente da sua empresa.</p>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
