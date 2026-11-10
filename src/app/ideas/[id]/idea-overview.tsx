import Link from "next/link";
import type { ReactNode } from "react";
import type { FeasibilityScenario } from "@/lib/feasibility";
import type { Recommendation } from "@/lib/esg-project-proposal";
import { formatBRL, formatNumber } from "@/lib/idea-finance";
import { PROPOSAL_FIELDS, type StoredProposal } from "@/lib/idea-proposal";
import { ideaProtocol, ideaStatusLabel } from "@/lib/idea-status";

const PILLARS: Record<string, string> = { E: "Ambiental", S: "Social", G: "Governança" };
const RECOMMENDATION_TONE = { accept: "high", accept_with_conditions: "medium", not_now: "low" } as const;

type HeroProps = {
  idea: { id: string; title: string; status: string; area: string | null; author_name: string | null; author_email: string | null };
  date: string;
  pillars: string[];
  initiativeType: string | null;
  showEmail: boolean;
  backLink: boolean;
  /** Indicadores e atalhos só para a gestão. */
  management: {
    recommendation: Recommendation | null;
    score: { value: number; partial: boolean } | null;
    likely: FeasibilityScenario | null;
    hypothetical: boolean;
  } | null;
};

function Kpi({ label, value, hint, children }: { label: string; value?: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      {children ?? <strong className="kpi-value">{value}</strong>}
      {hint && <span className="kpi-hint">{hint}</span>}
    </div>
  );
}

/** Cabeçalho da ideia: identificação, pilares ESG e, para a gestão, os números principais. */
export function IdeaHero({ idea, date, pillars, initiativeType, showEmail, backLink, management }: HeroProps) {
  const likely = management?.likely ?? null;
  return (
    <header className="panel idea-hero">
      {backLink && <Link className="back-link" href="/ideas">← Voltar para ideias</Link>}
      <div className="idea-hero-top">
        <div>
          <p className="eyebrow">IDEIA ESG · PROTOCOLO {ideaProtocol(idea.id)}</p>
          <h1>{idea.title}</h1>
          <p className="idea-hero-meta">
            {idea.author_name && <span>Por <strong>{idea.author_name}</strong>{showEmail && idea.author_email ? ` (${idea.author_email})` : ""}</span>}
            <span>{date}</span>
            {idea.area && <span>{idea.area}</span>}
          </p>
          {(pillars.length > 0 || initiativeType) && (
            <p className="idea-hero-tags">
              {pillars.map((pillar) => (
                <span key={pillar} className={`pillar-tag dimension-${pillar.toLowerCase()}`}>{PILLARS[pillar] ?? pillar}</span>
              ))}
              {initiativeType && <span className="subtle-tag">{initiativeType}</span>}
            </p>
          )}
        </div>
        <span className={`status-badge status-badge-${idea.status}`}>{ideaStatusLabel(idea.status)}</span>
      </div>

      {management && (
        <>
          <div className="kpi-strip">
            <Kpi label="Recomendação">
              {management.recommendation ? (
                <span className={`score-chip score-${RECOMMENDATION_TONE[management.recommendation.key]}`}>{management.recommendation.label}</span>
              ) : (
                <strong className="kpi-value">—</strong>
              )}
            </Kpi>
            <Kpi
              label="Potencial ESG"
              value={management.score ? `${Math.round(management.score.value)}/100` : "—"}
              hint={management.score?.partial ? "parcial" : undefined}
            />
            <Kpi label="Investimento" value={likely?.investment != null ? formatBRL(likely.investment) : "—"} />
            <Kpi
              label="Payback"
              value={likely?.paybackYears != null ? `${formatNumber(likely.paybackYears)} anos` : "—"}
              hint={management.hypothetical ? "cenário hipotético" : undefined}
            />
            <Kpi
              label="ROI"
              value={likely?.roiPercent != null ? `${formatNumber(likely.roiPercent)}%` : "—"}
              hint={likely?.roiPercent != null ? (management.hypothetical ? "cenário hipotético" : "cenário provável") : undefined}
            />
          </div>
          <div className="idea-hero-actions">
            <Link className="button button-primary" href={`/ideas/${idea.id}/viabilidade`}>Ver viabilidade</Link>
            <a className="button button-secondary" href={`/ideas/${idea.id}/relatorio/pdf`}>Relatório executivo (PDF)</a>
            <a className="button button-secondary" href="#decision">Decidir</a>
          </div>
        </>
      )}
    </header>
  );
}

/** Texto do colaborador em destaque e a proposta em cartões, só com o que foi preenchido. */
export function IdeaContent({
  original,
  fallback,
  author,
  proposal,
}: {
  original: string | null;
  fallback: { problem: string | null; solution: string | null };
  author: string | null;
  proposal: StoredProposal | null;
}) {
  const filled = proposal ? PROPOSAL_FIELDS.filter(({ key }) => proposal[key]) : [];
  const empty = proposal ? PROPOSAL_FIELDS.filter(({ key }) => !proposal[key]) : [];
  return (
    <section className="panel detail-panel" aria-labelledby="idea-content-title">
      <h2 id="idea-content-title">A ideia</h2>
      <blockquote className="idea-quote">
        {original ? (
          <p className="preserve-lines">{original}</p>
        ) : (
          <>
            <p className="preserve-lines"><strong>Problema:</strong> {fallback.problem ?? "Não informado."}</p>
            <p className="preserve-lines"><strong>Solução:</strong> {fallback.solution ?? "Não informado."}</p>
          </>
        )}
        <footer>{author ? `${author}, nas próprias palavras` : "Texto original do colaborador"}</footer>
      </blockquote>

      {proposal && filled.length > 0 && (
        <>
          <div className="panel-heading idea-proposal-heading">
            <h3 className="subsection-title">Proposta organizada</h3>
            <span className="source-tag source-tag-person">
              {proposal.source === "copilot" ? "Com a IA, revisada pelo colaborador" : "Pelo colaborador"}
            </span>
          </div>
          <dl className="proposal-cards">
            {filled.map(({ key, label }) => (
              <div key={key} className={key === "problem" || key === "solution" ? "proposal-card proposal-card-wide" : "proposal-card"}>
                <dt>{label}</dt>
                <dd className="preserve-lines">{proposal[key]}</dd>
              </div>
            ))}
          </dl>
          {empty.length > 0 && (
            <p className="small-copy muted">Não informado: {empty.map(({ label }) => label.toLowerCase()).join(", ")}.</p>
          )}
        </>
      )}
    </section>
  );
}
