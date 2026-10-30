import type { ProjectProposal } from "@/lib/esg-project-proposal";

const recommendationTone = { accept: "high", accept_with_conditions: "medium", not_now: "low" } as const;

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={value ? "preserve-lines" : "empty-inline"}>{value ?? "Não informado"}</dd>
    </div>
  );
}

/** Proposta gerada por regras a partir da ideia, com a recomendação à gestão. */
export function ProjectProposalPanel({ proposal }: { proposal: ProjectProposal }) {
  const { adoption, recommendation } = proposal;

  return (
    <section className="panel detail-panel" aria-labelledby="project-proposal-title">
      <p className="eyebrow">PROPOSTA DE PROJETO · GERADA POR REGRAS</p>
      <h2 id="project-proposal-title">Devemos aceitar esta ideia?</h2>

      <div className="recommendation-box">
        <div className="recommendation-row">
          <span className={`score-chip score-${recommendationTone[recommendation.key]}`}>{recommendation.label}</span>
          <span className="subtle-tag">Adesão: {adoption.label}</span>
        </div>
        <ul className="evaluation-list">{recommendation.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        {recommendation.conditions.length > 0 && (
          <>
            <h3 className="subsection-title">O que falta para decidir com segurança</h3>
            <ul className="evaluation-list">{recommendation.conditions.map((item) => <li key={item}>{item}</li>)}</ul>
          </>
        )}
        <p className="small-copy muted">
          Sugestão por regras, ainda não calibradas com especialistas. A decisão é da gestão e não muda a situação da ideia. A adesão
          é uma estimativa pelo que o texto define{adoption.present.length > 0 ? ` (${adoption.present.join(", ")})` : ""}, não uma previsão.
        </p>
      </div>

      <h3 className="subsection-title">Proposta</h3>
      <p className="small-copy">{proposal.objective}</p>
      <dl className="proposal-list">
        <Field label="Situação atual" value={proposal.problem} />
        <Field label="O que fazer" value={proposal.solution} />
        <Field label="Quem é envolvido" value={proposal.beneficiaries} />
        <Field label="Recursos" value={proposal.resources} />
        <Field label="Prazo mencionado" value={proposal.deadline} />
        <Field label="Custos mencionados" value={proposal.costs} />
      </dl>

      {proposal.indicators.length > 0 && (
        <>
          <h3 className="subsection-title">Indicadores possíveis</h3>
          <ul className="evaluation-list">{proposal.indicators.map((item) => <li key={item}>{item}</li>)}</ul>
        </>
      )}
      <h3 className="subsection-title">Próximos passos sugeridos</h3>
      <ol className="evaluation-list">{proposal.nextSteps.map((item) => <li key={item}>{item}</li>)}</ol>
    </section>
  );
}
