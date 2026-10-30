import { retryIdeaEvaluation } from "@/app/ideas/actions";
import { EvaluationRefresher } from "@/app/ideas/[id]/evaluation-refresher";
import { SubmitButton } from "@/app/components/submit-button";
import { parseEvaluationResult, type EvaluationResult } from "@/lib/ai/schemas";
import { isEvaluationStale } from "@/lib/ai/evaluation-status";
import { CONFIDENCE_THRESHOLD, ESG_CRITERIA, ESG_SUBCATEGORIES, potentialBand } from "@/lib/esg-engine";
import type { Json } from "@/lib/supabase/database.types";

export type EvaluationRow = {
  status: "pending" | "completed" | "failed";
  result: Json | null;
  error_message: string | null;
  model: string | null;
  criteria_version_label: string | null;
  created_at: string;
  completed_at: string | null;
};

type EvaluationPanelProps = {
  ideaId: string;
  evaluation: EvaluationRow | null;
  aiAvailable: boolean;
  canRetry: boolean;
  /** Gestão pode pedir nova avaliação mesmo após uma concluída (ex.: após complementação). */
  canReevaluate?: boolean;
};

const dimensionNames: Record<string, string> = { E: "Ambiental", S: "Social", G: "Governança" };
const levelLabels: Record<string, string> = { baixa: "baixa", media: "média", alta: "alta" };

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function ListBlock({ title, items, empty }: { title: string; items: string[]; empty?: string }) {
  if (!items.length && !empty) return null;
  return (
    <>
      <h3 className="subsection-title">{title}</h3>
      {items.length ? (
        <ul className="evaluation-list">{items.map((item) => <li key={item}>{item}</li>)}</ul>
      ) : (
        <p className="empty-inline">{empty}</p>
      )}
    </>
  );
}

function RetryForm({ ideaId, label }: { ideaId: string; label: string }) {
  return (
    <form action={retryIdeaEvaluation}>
      <input type="hidden" name="ideaId" value={ideaId} />
      <SubmitButton className="button button-secondary button-small" pendingLabel="Solicitando…">{label}</SubmitButton>
    </form>
  );
}

const bandTone = { very_high: "high", high: "high", moderate: "medium", low: "low", very_low: "low" } as const;

const subcategoryLabels = Object.fromEntries(ESG_SUBCATEGORIES.map(({ code, label }) => [code, label]));

/** Pontuação do motor v2: potencial de 0 a 100, com a nota de cada critério. */
function PotentialScore({ result }: { result: EvaluationResult }) {
  if (!result.engine) return null;
  const band = potentialBand(result.engine.score);
  const scores = new Map((result.criteriaScores ?? []).map((item) => [item.code, item]));
  return (
    <div className="score-panel">
      <div className="score-total">
        <span className="score-number">{Math.round(result.engine.score)}</span>
        <span className="small-copy muted">de 100 · potencial</span>
        <span className={`score-chip score-${bandTone[band.key]}`}>{band.label}</span>
        <p className="small-copy"><strong>Encaminhamento sugerido:</strong> {band.routing}</p>
      </div>
      <ul className="score-factors">
        {ESG_CRITERIA.map(({ code, label, weight }) => {
          const item = scores.get(code);
          if (!item) return null;
          return (
            <li key={code}>
              <div className="score-factor-heading">
                <strong>{label}</strong>
                <span className="small-copy muted">{item.score}/5 · peso {weight}%</span>
              </div>
              <div className="score-track" aria-hidden="true"><span style={{ width: `${(item.score / 5) * 100}%` }} /></div>
              <p className="small-copy">
                {item.justification}
                {item.insufficientInformation && <strong> Informação insuficiente: nota provisória.</strong>}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CompletedEvaluation({ result }: { result: EvaluationResult }) {
  return (
    <>
      <PotentialScore result={result} />
      {result.engine && result.engine.humanReviewReasons.length > 0 && (
        <p className="alert alert-info"><strong>Revisão humana necessária:</strong> {result.engine.humanReviewReasons.join("; ")}.</p>
      )}
      <p>{result.summary}</p>
      {result.primaryPillar && (
        <p className="small-copy">
          <strong>Pilar principal:</strong> {dimensionNames[result.primaryPillar]}
          {result.secondaryPillars?.length ? ` · secundários: ${result.secondaryPillars.map((pillar) => dimensionNames[pillar]).join(", ")}` : ""}
        </p>
      )}
      {result.subcategories && result.subcategories.length > 0 && (
        <p className="small-copy muted">{result.subcategories.map((code) => `${code} ${subcategoryLabels[code] ?? ""}`).join(" · ")}</p>
      )}
      {result.technicalSummary && (
        <>
          <h3 className="subsection-title">Versão técnica da ideia</h3>
          <p className="small-copy">{result.technicalSummary}</p>
        </>
      )}
      <div className="evaluation-meta">
        <span className={`potential-badge potential-${result.potential}`}>Potencial preliminar {result.potential}</span>
        <span className="subtle-tag">Confiança {levelLabels[result.confidence] ?? result.confidence}</span>
        {result.confidenceEstimate !== undefined && result.confidenceEstimate < CONFIDENCE_THRESHOLD && (
          <span className="subtle-tag subtle-tag-warning">Confiança estimada abaixo do limiar</span>
        )}
        {result.needsHumanReview && <span className="subtle-tag subtle-tag-warning">Requer análise humana</span>}
      </div>
      <p className="small-copy muted"><strong>Por que este potencial:</strong> {result.potentialRationale}</p>
      <p className="small-copy muted"><strong>Sobre a confiança:</strong> {result.confidenceRationale}</p>
      {result.needsHumanReview && result.humanReviewReason && (
        <p className="alert alert-info">{result.humanReviewReason}</p>
      )}

      <h3 className="subsection-title">Dimensões ESG identificadas</h3>
      {result.dimensions.length ? (
        <ul className="dimension-cards">
          {result.dimensions.map((item) => (
            <li key={item.dimension}>
              <span className={`dimension-pill dimension-${item.dimension.toLowerCase()}`}>{item.dimension}</span>
              <div>
                <strong>{dimensionNames[item.dimension]} · relevância {levelLabels[item.relevance] ?? item.relevance}</strong>
                <p className="small-copy">{item.justification}</p>
                {item.criteriaUsed.length > 0 && (
                  <p className="small-copy muted">Critérios usados: {item.criteriaUsed.join("; ")}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-inline">A IA não identificou relação justificável com as dimensões ESG a partir do texto.</p>
      )}

      {result.regulatoryNorms && (
        <>
          <h3 className="subsection-title">Normas relacionadas</h3>
          {result.regulatoryNorms.length ? (
            <ul className="evaluation-list">
              {result.regulatoryNorms.map((item) => <li key={item.norm}><strong>{item.norm}:</strong> {item.relation}</li>)}
            </ul>
          ) : (
            <p className="empty-inline">Nenhuma norma pertinente encontrada na base de conhecimento.</p>
          )}
        </>
      )}

      <ListBlock title="Perguntas para o colaborador" items={result.complementaryQuestions ?? []} />
      <ListBlock title="Alegações a verificar" items={result.unverifiedClaims ?? []} />
      <ListBlock title="Informações faltantes" items={result.missingInformation} empty="Nenhuma lacuna apontada." />
      <ListBlock title="Sugestões de melhoria" items={result.improvementSuggestions} />
      <ListBlock title="Indicadores sugeridos" items={result.suggestedIndicators} />
      <ListBlock title="Riscos e pontos de atenção" items={result.risks} />
      <h3 className="subsection-title">Esforço e recursos</h3>
      <p className={result.effortEstimate ? "small-copy" : "empty-inline"}>
        {result.effortEstimate ?? "Não há dados suficientes para estimar esforço ou recursos."}
      </p>
      <ListBlock title="Próximas etapas recomendadas" items={result.nextSteps} />
      <ListBlock title="Limitações desta avaliação" items={result.limitations} />
    </>
  );
}

/** Avaliação ESG gerada pela IA, sempre identificada como recomendação. */
export function EvaluationPanel({ ideaId, evaluation, aiAvailable, canRetry, canReevaluate = false }: EvaluationPanelProps) {
  const stale = evaluation ? isEvaluationStale(evaluation) : false;
  const result = evaluation?.status === "completed" ? parseEvaluationResult(evaluation.result) : null;

  return (
    <section className="panel detail-panel" aria-labelledby="ai-evaluation-title" aria-busy={evaluation?.status === "pending" && !stale}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">AVALIAÇÃO ESG · GERADA POR IA</p>
          <h2 id="ai-evaluation-title">Avaliação preliminar</h2>
        </div>
        <span className="source-tag source-tag-ai">Recomendação da IA</span>
      </div>
      <p className="muted small-copy">
        Esta análise apoia a decisão da gestão. Não aprova a ideia, não é certificação ESG e não comprova impacto.
      </p>

      {!evaluation && !aiAvailable && (
        <p className="empty-inline">A avaliação por IA não está configurada nesta plataforma. Use a triagem por termos abaixo como referência inicial.</p>
      )}
      {!evaluation && aiAvailable && (
        <div className="evaluation-state">
          <p className="empty-inline">Esta ideia ainda não tem avaliação por IA.</p>
          {canRetry && <RetryForm ideaId={ideaId} label="Gerar avaliação" />}
        </div>
      )}
      {evaluation?.status === "pending" && !stale && (
        <div className="evaluation-state" role="status">
          <EvaluationRefresher />
          <p><span className="chat-pending-dot" aria-hidden="true" /> Avaliação em andamento. Esta página será atualizada automaticamente.</p>
        </div>
      )}
      {(evaluation?.status === "failed" || stale) && (
        <div className="evaluation-state">
          <p className="alert alert-error" role="alert">
            A avaliação por IA não foi concluída{evaluation?.error_message ? `: ${evaluation.error_message}` : "."} A ideia continua registrada normalmente.
          </p>
          {canRetry && aiAvailable && <RetryForm ideaId={ideaId} label="Tentar novamente" />}
        </div>
      )}
      {evaluation?.status === "completed" && !result && (
        <p className="alert alert-error">O resultado desta avaliação está em um formato que não pôde ser exibido.</p>
      )}
      {result && evaluation && (
        <>
          <CompletedEvaluation result={result} />
          <p className="table-subtitle">
            Gerada em {formatDateTime(evaluation.completed_at ?? evaluation.created_at)}
            {evaluation.model ? ` · modelo ${evaluation.model}` : ""}
            {evaluation.criteria_version_label ? ` · critérios: ${evaluation.criteria_version_label}` : ""}
            {result.engine ? ` · motor ${result.engine.version} · prompt ${result.engine.promptVersion}` : ""}
          </p>
          {canReevaluate && aiAvailable && <RetryForm ideaId={ideaId} label="Solicitar nova avaliação" />}
        </>
      )}
    </section>
  );
}
