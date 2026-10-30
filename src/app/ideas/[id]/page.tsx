import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { DecisionHistory } from "@/app/ideas/[id]/decision-history";
import { DecisionPanel } from "@/app/ideas/[id]/decision-panel";
import { EvaluationPanel } from "@/app/ideas/[id]/evaluation-panel";
import { FeedbackPanel } from "@/app/ideas/[id]/feedback-panel";
import { LocalAnalysisPanel } from "@/app/ideas/[id]/local-analysis-panel";
import { ProjectProposalPanel } from "@/app/ideas/[id]/project-proposal-panel";
import { AppShell } from "@/app/components/app-shell";
import { parseEnabledModules, requireCompanyContext } from "@/lib/auth";
import { buildProjectProposal } from "@/lib/esg-project-proposal";
import { isAiAvailable } from "@/lib/idea-ai";
import { parseStoredProposal, PROPOSAL_FIELDS } from "@/lib/idea-proposal";
import { ideaStatusLabel, nextStepForAuthor } from "@/lib/idea-status";
import { readLocalAnalysis } from "@/lib/local-analysis";
import { memberDisplayName } from "@/lib/members";
import { findSimilarIdeas } from "@/lib/text-similarity";

export const metadata: Metadata = { title: "Detalhe da ideia" };

// "Tentar novamente" agenda a avaliação da IA para depois da resposta.
export const maxDuration = 300;

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
  searchParams: Promise<{ error?: string; decided?: string; responded?: string }>;
}) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, user, membership, organization } = await requireCompanyContext();
  const { data: idea, error } = await supabase
    .from("ideas")
    .select("id, title, problem, solution, original_description, structured_proposal, area, status, author_id, author_name, author_email, created_at, submitted_at, analysis, responsible_id, follow_up_date, priority")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  if (error) throw new Error(`Não foi possível carregar a ideia: ${error.message}`);
  if (!idea) notFound();

  const isAuthor = idea.author_id === user.id;
  const isCompanyAdmin = membership.role === "company_admin";
  const isDraft = idea.status === "draft";

  const showManagement = isCompanyAdmin && !isDraft;
  const empty = { data: null };

  // RLS limita conversa e mensagens ao autor e à gestão; decisões e lista de
  // membros só são consultadas (e só retornam dados) para a gestão.
  const [
    { data: evaluation },
    { data: messages },
    { data: feedback },
    { data: decisions },
    { data: transitions },
    { data: members },
    { data: otherIdeas },
  ] = await Promise.all([
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
    supabase
      .from("idea_feedback")
      .select("id, kind, content, created_at")
      .eq("idea_id", idea.id)
      .order("created_at", { ascending: true }),
    showManagement
      ? supabase
          .from("idea_decisions")
          .select("id, actor_id, from_status, to_status, justification, responsible_id, follow_up_date, priority, human_potential, human_dimensions, ai_agreement, created_at")
          .eq("idea_id", idea.id)
          .order("created_at", { ascending: false })
      : empty,
    showManagement
      ? supabase
          .from("idea_status_transitions")
          .select("to_status, action_label")
          .eq("from_status", idea.status)
          .order("sort_order")
      : empty,
    showManagement ? supabase.rpc("org_list_members", { target_org_id: membership.organization_id }) : empty,
    showManagement
      ? supabase
          .from("ideas")
          .select("id, title, original_description")
          .eq("organization_id", membership.organization_id)
          .neq("status", "draft")
          .neq("id", idea.id)
          .order("created_at", { ascending: false })
          .limit(300)
      : empty,
  ]);
  const similarIdeas = findSimilarIdeas(
    { id: idea.id, text: `${idea.title} ${idea.original_description ?? ""}` },
    (otherIdeas ?? []).map((other) => ({ ...other, text: `${other.title} ${other.original_description ?? ""}` })),
  ).slice(0, 5);
  const emailById = new Map((members ?? []).map((member) => [member.user_id, memberDisplayName(member)]));

  const proposal = parseStoredProposal(idea.structured_proposal);
  const localAnalysis = readLocalAnalysis(idea.analysis);
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
    <AppShell organizationName={organization.name} userEmail={user.email} membership={membership}>
      <header className="page-header">
        <div>
          {isCompanyAdmin && <Link className="back-link" href="/ideas">← Voltar para ideias</Link>}
          <p className="eyebrow">IDEIA ESG</p>
          <h1>{idea.title}</h1>
          <p className="muted">
            {idea.submitted_at
              ? `Enviada em ${dateFormat.format(new Date(idea.submitted_at))}`
              : `Criada em ${dateFormat.format(new Date(idea.created_at))}`}
            {idea.area ? ` · ${idea.area}` : ""}
            {idea.author_name ? ` · por ${idea.author_name}` : ""}
            {isCompanyAdmin && idea.author_email ? ` · ${idea.author_email}` : ""}
          </p>
        </div>
        <span className={`status-badge status-badge-${idea.status}`}>{ideaStatusLabel(idea.status)}</span>
      </header>

      {query.responded && (
        <p className="alert alert-success" role="status">Resposta enviada. A ideia voltou para avaliação da gestão.</p>
      )}
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

          {showManagement && localAnalysis && (
            <ProjectProposalPanel
              proposal={buildProjectProposal({
                title: idea.title,
                originalText: idea.original_description ?? "",
                proposal,
                analysis: localAnalysis,
              })}
            />
          )}

          {showManagement && localAnalysis && <LocalAnalysisPanel analysis={localAnalysis} notice={notice} />}

          {showManagement && (evaluation || isAiAvailable()) && (
            <EvaluationPanel
              ideaId={idea.id}
              evaluation={evaluation}
              aiAvailable={isAiAvailable()}
              canRetry
              canReevaluate
            />
          )}

          {showManagement && similarIdeas.length > 0 && (
            <section className="panel detail-panel" aria-labelledby="similar-title">
              <p className="eyebrow">POSSÍVEL DUPLICIDADE</p>
              <h2 id="similar-title">Ideias semelhantes</h2>
              <p className="muted small-copy">Sugestão por termos em comum, para você comparar. Nada é excluído ou mesclado automaticamente.</p>
              <ul className="evaluation-list">
                {similarIdeas.map(({ idea: other, similarity }) => (
                  <li key={other.id}>
                    <Link className="text-link" href={`/ideas/${other.id}`}>{other.title}</Link> · {Math.round(similarity * 100)}% de termos em comum
                  </li>
                ))}
              </ul>
            </section>
          )}

          <FeedbackPanel
            ideaId={idea.id}
            feedback={feedback ?? []}
            canRespond={isAuthor && idea.status === "awaiting_info"}
            viewerIsAuthor={isAuthor}
          />

          {showManagement && <DecisionHistory decisions={decisions ?? []} emailById={emailById} />}

          {analysisObject && !localAnalysis && (
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
          {showManagement ? (
            <DecisionPanel
              ideaId={idea.id}
              status={idea.status}
              transitions={transitions ?? []}
              members={members ?? []}
              responsibleId={idea.responsible_id}
              followUpDate={idea.follow_up_date}
              priority={idea.priority}
              projectsEnabled={parseEnabledModules(organization.enabled_modules).includes("projects")}
            />
          ) : (
            <section className="panel workflow-panel" aria-labelledby="workflow-title">
              <p className="eyebrow">ACOMPANHAMENTO</p>
              <h2 id="workflow-title">Próximos passos</h2>
              <div className="status-timeline">
                <span className={`status-dot status-${idea.status}`} aria-hidden="true" />
                <div>
                  <strong>{ideaStatusLabel(idea.status)}</strong>
                  <p className="muted small-copy">
                    {isAuthor ? nextStepForAuthor(idea.status) : "A situação é definida pela gestão da empresa."}
                  </p>
                </div>
              </div>
              {isAuthor && idea.status === "awaiting_info" && (
                <a className="button button-primary button-full" href="#feedback">Responder à gestão</a>
              )}
            </section>
          )}
          <div className="privacy-note">
            <span aria-hidden="true">⌑</span>
            <p><strong>Dados protegidos por organização</strong><br />Esta ideia só pode ser acessada por pessoas autorizadas do ambiente da sua empresa.</p>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
