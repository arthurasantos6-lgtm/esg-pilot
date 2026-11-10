import { SOURCE_LABELS, type ExecutionPlan, type Sourced } from "@/lib/idea-execution-plan";
import { formatBRL, formatNumber } from "@/lib/idea-finance";

const SHORT_SOURCE = { colaborador: "Colaborador", gestao: "Gestão", regra: "Sugestão" } as const;

export function SourceChip({ source }: { source: Sourced["source"] }) {
  return (
    <span className={`source-chip source-chip-${source}`} title={SOURCE_LABELS[source]}>
      {SHORT_SOURCE[source]}
    </span>
  );
}

export function SourcedList({ items, empty }: { items: Sourced[]; empty: string }) {
  if (!items.length) return <p className="empty-inline">{empty}</p>;
  return (
    <ul className="evaluation-list">
      {items.map((item, index) => (
        <li key={`${item.text}-${index}`}>
          <span className="preserve-lines">{item.text}</span>
          <SourceChip source={item.source} />
        </li>
      ))}
    </ul>
  );
}

function SourcedValue({ item }: { item: Sourced | null }) {
  if (!item) return <dd className="empty-inline">Não informado</dd>;
  return (
    <dd>
      <span className="preserve-lines">{item.text}</span>
      <SourceChip source={item.source} />
    </dd>
  );
}

/**
 * Plano de execução gerado por regras. Cada item mostra a origem; sugestões do
 * sistema e prazos por etapa são estimativas para a gestão validar.
 */
export function ExecutionPlanView({ plan, headingLevel = 3 }: { plan: ExecutionPlan; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const { identification: id, results } = plan;
  return (
    <div>
      <p className="small-copy muted">
        Origem de cada item: <SourceChip source="colaborador" /> informado por quem enviou, <SourceChip source="gestao" /> complementado pela
        gestão, <SourceChip source="regra" /> sugestão do sistema por regras (a validar). Nada aqui foi verificado tecnicamente.
      </p>

      <section className="plan-section report-section">
        <H className="subsection-title">A. Identificação da iniciativa</H>
        <dl className="proposal-list">
          <div><dt>Nome</dt><dd>{id.name}</dd></div>
          <div><dt>Categoria ESG</dt><dd>{id.pillar} · {id.initiativeType}{id.themes.length > 0 ? ` · ${id.themes.join("; ")}` : ""}</dd></div>
          <div><dt>Descrição (texto original)</dt><dd className="preserve-lines">{id.description || "Não informado"}</dd></div>
          <div><dt>Objetivo</dt><SourcedValue item={id.objective} /></div>
          <div><dt>Problema a resolver</dt><SourcedValue item={id.problem} /></div>
          <div><dt>Local</dt><SourcedValue item={id.location} /></div>
          <div>
            <dt>Escopo</dt>
            {id.scope.length ? (
              <dd><SourcedList items={id.scope} empty="" /></dd>
            ) : (
              <dd className="empty-inline">Não informado</dd>
            )}
          </div>
        </dl>
      </section>

      <section className="plan-section report-section">
        <H className="subsection-title">B. Descrição da execução</H>
        <p>{plan.execution.summary}</p>
        <SourcedList items={plan.execution.activities} empty="Sem atividades definidas." />
        <p className="small-copy"><strong>Áreas envolvidas:</strong> {plan.execution.areas.map((area) => area.text).join("; ")}</p>
      </section>

      <section className="plan-section report-section">
        <H className="subsection-title">C. Etapas de implementação e E. Cronograma</H>
        {plan.informedDeadline && (
          <p className="small-copy">Prazo total imaginado por quem enviou: <strong>{plan.informedDeadline}</strong> <SourceChip source="colaborador" /></p>
        )}
        <div className="table-wrap">
          <table className="plan-table">
            <thead>
              <tr><th>#</th><th>Etapa</th><th>Atividade</th><th>Prazo estimado</th><th>Depende de</th><th>Responsável sugerido</th></tr>
            </thead>
            <tbody>
              {plan.steps.map((step) => (
                <tr key={step.key}>
                  <td>{step.order}</td>
                  <td><strong>{step.title}</strong></td>
                  <td>{step.activity}</td>
                  <td>{step.duration}</td>
                  <td>{step.dependsOn.length ? step.dependsOn.map((order) => `Etapa ${order}`).join(", ") : "—"}</td>
                  <td>{step.responsible}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small-copy muted">Sequência, prazos e responsáveis são sugestões por regras, a ajustar pela gestão.</p>
      </section>

      <section className="plan-section report-section">
        <H className="subsection-title">D. Recursos necessários</H>
        <dl className="proposal-list">
          {plan.resources.map((group) => (
            <div key={group.label}>
              <dt>{group.label}</dt>
              {group.items.length ? <dd><SourcedList items={group.items} empty="" /></dd> : <dd className="empty-inline">A levantar</dd>}
            </div>
          ))}
        </dl>
      </section>

      <section className="plan-section report-section">
        <H className="subsection-title">F. Resultados esperados</H>
        {results.informed && (
          <p className="small-copy"><strong>Benefícios esperados por quem enviou:</strong> {results.informed.text} <SourceChip source={results.informed.source} /></p>
        )}
        <dl className="proposal-list">
          <div><dt>Benefícios ambientais</dt><dd><SourcedList items={results.environmental} empty="Nenhum identificado por regra." /></dd></div>
          <div><dt>Benefícios sociais</dt><dd><SourcedList items={results.social} empty="Nenhum identificado por regra." /></dd></div>
          <div><dt>Benefícios econômicos</dt><dd><SourcedList items={results.economic} empty="Nenhum identificado por regra." /></dd></div>
        </dl>
        {plan.savings && (
          <div className="recommendation-box">
            <p className="small-copy">
              <strong>Estimativa a partir das respostas:</strong> {plan.savings.label}: {formatNumber(plan.savings.quantity)} {plan.savings.unit}
              {plan.savings.annualValue !== null && ` (≈ ${formatBRL(plan.savings.annualValue)} por ano)`}.
              <span className="source-chip source-chip-estimado">Estimativa</span>
            </p>
            <p className="small-copy muted">Cálculo: {plan.savings.formula}. Premissas: {plan.savings.assumptions.join(" ")}</p>
          </div>
        )}
        <h4 className="subsection-title">Indicadores de desempenho e forma de medir</h4>
        {results.indicators.length ? (
          <div className="table-wrap">
            <table className="plan-table">
              <thead><tr><th>Indicador</th><th>Como medir</th><th>Origem</th></tr></thead>
              <tbody>
                {results.indicators.map((indicator) => (
                  <tr key={indicator.name}>
                    <td>{indicator.name}</td>
                    <td>{indicator.how}</td>
                    <td><SourceChip source={indicator.source} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-inline">Indicadores a definir.</p>
        )}
      </section>

      <section className="plan-section report-section">
        <H className="subsection-title">Riscos e pontos de atenção</H>
        <SourcedList items={plan.risks} empty="Nenhum risco registrado." />
      </section>

      <section className="plan-section report-section">
        <H className="subsection-title">Informações pendentes de validação</H>
        {plan.pending.length ? (
          <ul className="evaluation-list">{plan.pending.map((item) => <li key={item}>{item}</li>)}</ul>
        ) : (
          <p className="empty-inline">Todas as perguntas foram respondidas.</p>
        )}
      </section>
    </div>
  );
}
