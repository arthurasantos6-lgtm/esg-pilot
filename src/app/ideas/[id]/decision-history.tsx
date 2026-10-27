import { AI_AGREEMENT_LABELS, ideaStatusLabel, PRIORITY_LABELS } from "@/lib/idea-status";

export type DecisionRow = {
  id: string;
  actor_id: string | null;
  from_status: string;
  to_status: string;
  justification: string;
  responsible_id: string | null;
  follow_up_date: string | null;
  priority: string | null;
  human_potential: string | null;
  human_dimensions: string[] | null;
  ai_agreement: string | null;
  created_at: string;
};

const dimensionNames: Record<string, string> = { E: "Ambiental", S: "Social", G: "Governança" };

/** Histórico de decisões humanas (interno da gestão). */
export function DecisionHistory({ decisions, emailById }: { decisions: DecisionRow[]; emailById: Map<string, string> }) {
  const latestAssessment = decisions.find((decision) => decision.ai_agreement || decision.human_potential || decision.human_dimensions?.length);

  return (
    <section className="panel detail-panel" aria-labelledby="decisions-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">DECISÕES HUMANAS · INTERNO DA GESTÃO</p>
          <h2 id="decisions-title">Histórico de decisões</h2>
        </div>
        <span className="source-tag source-tag-decision">Decisão da empresa</span>
      </div>

      {latestAssessment && (
        <div className="human-assessment">
          <h3 className="subsection-title">Avaliação humana mais recente</h3>
          <ul className="evaluation-list">
            {latestAssessment.ai_agreement && <li>{AI_AGREEMENT_LABELS[latestAssessment.ai_agreement]}</li>}
            {latestAssessment.human_potential && <li>Potencial na avaliação da gestão: {latestAssessment.human_potential}</li>}
            {latestAssessment.human_dimensions?.length ? (
              <li>Dimensões: {latestAssessment.human_dimensions.map((item) => dimensionNames[item] ?? item).join(", ")}</li>
            ) : null}
          </ul>
          <p className="small-copy muted">Justificativa: {latestAssessment.justification}</p>
        </div>
      )}

      {!decisions.length ? (
        <p className="empty-inline">Nenhuma decisão registrada ainda.</p>
      ) : (
        <ol className="decision-list">
          {decisions.map((decision) => (
            <li key={decision.id}>
              <p className="decision-heading">
                <strong>
                  {decision.from_status === decision.to_status
                    ? `Acompanhamento atualizado (${ideaStatusLabel(decision.to_status)})`
                    : `${ideaStatusLabel(decision.from_status)} → ${ideaStatusLabel(decision.to_status)}`}
                </strong>
                <span className="small-copy muted">
                  {new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(decision.created_at))}
                  {" · "}
                  {(decision.actor_id && emailById.get(decision.actor_id)) ?? "Usuário removido"}
                </span>
              </p>
              <p className="preserve-lines small-copy">{decision.justification}</p>
              <p className="small-copy muted">
                {[
                  decision.responsible_id && `Responsável: ${emailById.get(decision.responsible_id) ?? "usuário removido"}`,
                  decision.follow_up_date &&
                    `Prazo: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(decision.follow_up_date))}`,
                  decision.priority && `Prioridade: ${PRIORITY_LABELS[decision.priority]}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
