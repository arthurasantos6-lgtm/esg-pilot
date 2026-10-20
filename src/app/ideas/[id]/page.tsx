import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { updateIdeaStatus } from "@/app/actions";
import { AppShell } from "@/app/components/app-shell";
import { requireCompanyContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Detalhe da ideia" };

const statusLabels: Record<string, string> = {
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

const statusOptions = Object.entries(statusLabels).filter(([status]) => status !== "archived");

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
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, user, membership, organization } = await requireCompanyContext();
  const { data: idea, error } = await supabase
    .from("ideas")
    .select("id, title, problem, solution, area, status, created_at, analysis")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  if (error) throw new Error(`Não foi possível carregar a ideia: ${error.message}`);
  if (!idea) notFound();

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

  return (
    <AppShell organizationName={organization.name} userEmail={user.email ?? "Conta"} role={membership.role}>
      <header className="page-header">
        <div>
          <Link className="back-link" href="/ideas">← Voltar para ideias</Link>
          <p className="eyebrow">IDEIA ESG</p>
          <h1>{idea.title}</h1>
          <p className="muted">
            Registrada em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(idea.created_at))}
            {idea.area ? ` · ${idea.area}` : ""}
          </p>
        </div>
        <span className={`status-badge status-badge-${idea.status}`}>{statusLabels[idea.status] ?? idea.status}</span>
      </header>

      <div className="detail-grid">
        <div className="detail-main">
          <section className="panel detail-panel">
            <p className="eyebrow">OPORTUNIDADE</p>
            <h2>Problema ou oportunidade</h2>
            <p className="preserve-lines">{idea.problem}</p>
            <hr />
            <h2>Solução proposta</h2>
            <p className="preserve-lines">{idea.solution}</p>
          </section>

          <section className="panel detail-panel" aria-labelledby="analysis-title">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">COPILOTO ESG</p>
                <h2 id="analysis-title">Triagem indicativa</h2>
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
              <p className="table-subtitle">Critérios usados nesta avaliação: {criteriaVersionLabel}</p>
            )}
          </section>
        </div>

        <aside className="detail-aside">
          <section className="panel workflow-panel" aria-labelledby="workflow-title">
            <p className="eyebrow">FLUXO DE AVALIAÇÃO</p>
            <h2 id="workflow-title">Próximos passos</h2>
            <p className="muted small-copy">Acompanhe a situação da ideia com o administrador da sua organização.</p>
            {membership.role === "company_admin" ? (
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
                <div><strong>{statusLabels[idea.status] ?? idea.status}</strong><p className="muted small-copy">O administrador da empresa pode atualizar esta etapa.</p></div>
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
