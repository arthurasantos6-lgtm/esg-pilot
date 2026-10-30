import { ESG_CRITERIA, ESG_SUBCATEGORIES, potentialBand } from "@/lib/esg-engine";
import type { LocalAnalysis } from "@/lib/local-analysis";

const pillarNames: Record<string, string> = { E: "Ambiental", S: "Social", G: "Governança" };
const subcategoryLabels = Object.fromEntries(ESG_SUBCATEGORIES.map(({ code, label }) => [code, label]));

/** Classificação e avaliação do motor local: campos separados, com as evidências de cada um. */
export function LocalAnalysisPanel({ analysis, notice }: { analysis: LocalAnalysis; notice: string | null }) {
  const { classification, assessment } = analysis;
  const grades = new Map(assessment.criteria.map((item) => [item.code, item]));

  return (
    <section className="panel detail-panel" aria-labelledby="local-analysis-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">ANÁLISE AUTOMÁTICA · SEM IA EXTERNA</p>
          <h2 id="local-analysis-title">Classificação e critérios</h2>
        </div>
        <span className="subtle-tag">Motor {classification.engine_version}</span>
      </div>
      {notice && <p className="muted small-copy">{notice}</p>}

      {classification.review_reasons.length > 0 && (
        <p className="alert alert-info"><strong>Revisão humana necessária:</strong> {classification.review_reasons.join("; ")}.</p>
      )}

      <h3 className="subsection-title">Classificação temática</h3>
      {classification.primary_pillar ? (
        <>
          <p className="small-copy">
            <strong>Pilar principal:</strong> {pillarNames[classification.primary_pillar]}
            {classification.secondary_pillars.length > 0 && ` · secundários: ${classification.secondary_pillars.map((pillar) => pillarNames[pillar]).join(", ")}`}
          </p>
          <p className="small-copy muted">{classification.subcategories.map((code) => `${code} ${subcategoryLabels[code] ?? ""}`).join(" · ")}</p>
          <p className="small-copy muted">Escore heurístico de correspondência: {classification.match_score.toFixed(2).replace(".", ",")} (não é probabilidade).</p>
        </>
      ) : (
        <p className="empty-inline">Sem classificação: evidências insuficientes. Aguardando a análise da gestão.</p>
      )}
      {classification.matches.length > 0 && (
        <ul className="evaluation-list">
          {classification.matches.map((match) => (
            <li key={match.rule_id}>
              <strong>“{match.matched_text}”</strong> → {match.subcategory}: {match.explanation}
              {match.negated && " Aparece em forma negativa ou como ausência."}
            </li>
          ))}
        </ul>
      )}

      <h3 className="subsection-title">Avaliação por critérios</h3>
      <p className="small-copy">
        {assessment.score !== null ? (
          <><strong>Pontuação: {Math.round(assessment.score)} de 100</strong> · {potentialBand(assessment.score).label} · {potentialBand(assessment.score).routing}</>
        ) : assessment.partial_score !== null ? (
          <><strong>Pontuação parcial: {Math.round(assessment.partial_score)} de 100</strong>, sobre {assessment.assessed_weight}% dos pesos. Os critérios pendentes não contam como zero.</>
        ) : (
          <strong>Pontuação pendente: nenhum critério tem base no texto.</strong>
        )}
      </p>
      <ul className="score-factors">
        {ESG_CRITERIA.map(({ code, label, weight }) => {
          const item = grades.get(code);
          if (!item) return null;
          return (
            <li key={code}>
              <div className="score-factor-heading">
                <strong>{label}</strong>
                <span className="small-copy muted">{item.grade === null ? "Pendente" : `${item.grade}/5`} · peso {weight}%</span>
              </div>
              {item.grade !== null && <div className="score-track" aria-hidden="true"><span style={{ width: `${(item.grade / 5) * 100}%` }} /></div>}
              <p className="small-copy">{item.justification}</p>
            </li>
          );
        })}
      </ul>

      {classification.missing_information.length > 0 && (
        <>
          <h3 className="subsection-title">O texto não informa</h3>
          <ul className="evaluation-list">{classification.missing_information.map((item) => <li key={item}>{item}</li>)}</ul>
        </>
      )}
    </section>
  );
}
