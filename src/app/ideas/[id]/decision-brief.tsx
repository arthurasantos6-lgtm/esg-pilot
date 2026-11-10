import Link from "next/link";
import type { EvaluationResult } from "@/lib/ai/schemas";
import { potentialBand } from "@/lib/esg-engine";
import type { ProjectProposal } from "@/lib/esg-project-proposal";
import type { Feasibility } from "@/lib/feasibility";
import type { ExecutionPlan } from "@/lib/idea-execution-plan";
import { formatBRL, formatNumber } from "@/lib/idea-finance";
import type { PlanReference } from "@/lib/idea-planning";
import type { LocalAnalysis } from "@/lib/local-analysis";

/**
 * Painel de apoio à decisão (seções 1 a 4 da janela): só dados já produzidos
 * pelas etapas anteriores. Nada é pesquisado nem calculado de novo aqui além do
 * que as funções existentes já calculam; o que não existe aparece como pendente.
 */

type Tone = "pesquisa" | "calculado" | "informado" | "estimado" | "hipotetico" | "pendente";
const TONE_LABEL: Record<Tone, string> = {
  pesquisa: "Pesquisado",
  calculado: "Calculado",
  informado: "Informado",
  estimado: "Estimado",
  hipotetico: "Hipotético",
  pendente: "Pendente",
};

/** Rótulos da recomendação, sem mudar o significado dos estados existentes. */
const RECOMMENDATION = {
  accept: { label: "Favorável", tone: "high" },
  accept_with_conditions: { label: "Favorável com condições", tone: "medium" },
  not_now: { label: "Requer análise", tone: "low" },
} as const;

const clip = (text: string | null | undefined, max = 220) => (!text ? null : text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function Card({ label, value, tone, hint }: { label: string; value: string; tone: Tone; hint?: string }) {
  return (
    <div className={`brief-card brief-card-${tone}`}>
      <span className="brief-card-label">{label}</span>
      <strong className="brief-card-value">{value}</strong>
      <span className={`brief-tone brief-tone-${tone}`}>{TONE_LABEL[tone]}</span>
      {hint && <span className="brief-card-hint">{hint}</span>}
    </div>
  );
}

function Field({ label, value, missing = "Não informado" }: { label: string; value: string | null; missing?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={value ? undefined : "empty-inline"}>{value ?? missing}</dd>
    </div>
  );
}

export type DecisionBriefProps = {
  ideaId: string;
  original: string | null;
  solution: string | null;
  plan: ExecutionPlan;
  feasibility: Feasibility;
  references: PlanReference[];
  proposal: ProjectProposal | null;
  analysis: LocalAnalysis | null;
  score: { value: number; partial: boolean } | null;
  aiEvaluation: EvaluationResult | null;
};

export function DecisionBrief({ ideaId, original, solution, plan, feasibility, references, proposal, analysis, score, aiEvaluation }: DecisionBriefProps) {
  const id = plan.identification;
  const [conservative, likely, optimistic] = feasibility.scenarios;
  const period = formatNumber(feasibility.periodYears);

  // ---- Seção 2: origem de cada valor -------------------------------------
  const investmentTone: Tone = { pesquisa: "pesquisa", colaborador: "informado", hipotetico: "hipotetico" }[feasibility.investmentSource] as Tone;
  const benefitTone: Tone = (
    { gestao: "informado", estimativa: feasibility.tariff?.source === "pesquisa" ? "estimado" : "calculado", hipotetico: "hipotetico", meta: "hipotetico" } as const
  )[feasibility.benefitSource];
  const recurringFound = feasibility.groups.some((group) => group.role === "recurring");
  const recurringTone: Tone = recurringFound ? "pesquisa" : feasibility.informedRecurring !== null ? "informado" : "pendente";
  // ROI e payback herdam a origem menos confiável entre investimento e economia.
  const returnTone: Tone = feasibility.hypothetical ? "hipotetico" : investmentTone === "pesquisa" || benefitTone === "estimado" ? "estimado" : "calculado";
  const range = (low: number, high: number) => (Math.abs(high - low) < 0.5 ? undefined : `faixa: ${formatBRL(Math.min(low, high))} a ${formatBRL(Math.max(low, high))}`);

  // ---- Seção 4: justificativa a partir dos dados ---------------------------
  const grade = (code: string) => analysis?.assessment.criteria.find((item) => item.code === code)?.grade ?? null;
  const impact = grade("C1");
  const maturity = grade("C8");
  const favorable: string[] = [];
  const attention: string[] = [];
  if (impact !== null && impact >= 3) favorable.push(`Impacto ESG potencial ${impact} de 5 na avaliação por critérios.`);
  if (proposal && proposal.adoption.level !== "baixo") favorable.push(`Potencial de adesão ${proposal.adoption.label.toLowerCase()}: a proposta define ${proposal.adoption.present.slice(0, 3).join(", ")}.`);
  if (!feasibility.hypothetical && likely.paybackYears !== null && likely.paybackYears <= feasibility.periodYears) {
    favorable.push(`Retorno estimado: payback de ${formatNumber(likely.paybackYears)} anos, dentro do período de ${period} anos.`);
  }
  if (feasibility.investmentSource === "pesquisa") favorable.push("Investimento baseado em preços encontrados na pesquisa.");
  const approvedPrecedents = proposal?.precedents.filter((item) => item.outcome === "approved") ?? [];
  if (approvedPrecedents.length) favorable.push(`Parecida com ${approvedPrecedents.length === 1 ? "uma ideia já aprovada" : `${approvedPrecedents.length} ideias já aprovadas`} na empresa.`);

  if (feasibility.hypothetical) attention.push("Custos e retorno usam cenário hipotético: não são dados financeiros confirmados.");
  if (likely.netAnnual <= 0) attention.push("A economia estimada não cobre os custos anuais.");
  if (maturity !== null && maturity <= 2) attention.push(`Proposta pouco madura (maturidade ${maturity} de 5): faltam elementos básicos.`);
  if (plan.steps.some((step) => step.key === "fornecedores")) attention.push("Depende de fornecedor ou serviço contratado.");
  if (plan.steps.some((step) => step.key === "licencas")) attention.push("Exige licenças, normas ou validações externas.");
  for (const reason of analysis?.classification.review_reasons ?? []) attention.push(reason);
  for (const precedent of proposal?.precedents.filter((item) => item.outcome === "rejected") ?? []) {
    attention.push(`Parecida com uma ideia não priorizada: "${precedent.title}".`);
  }
  for (const risk of plan.risks.filter((item) => item.source !== "regra").slice(0, 2)) attention.push(`Risco apontado pelo colaborador: ${risk.text}`);
  for (const claim of aiEvaluation?.unverifiedClaims?.slice(0, 2) ?? []) attention.push(`Alegação a verificar (IA): ${claim}`);

  const pending = [
    ...(proposal?.recommendation.conditions ?? []),
    ...feasibility.missing,
    ...(aiEvaluation?.complementaryQuestions?.slice(0, 2).map((question) => `Pergunta da IA: ${question}`) ?? []),
  ].filter((item, index, list) => list.indexOf(item) === index).slice(0, 7);
  const recommendation = proposal ? RECOMMENDATION[proposal.recommendation.key] : null;
  const band = score ? potentialBand(score.value) : null;
  const resources = plan.resources.filter((group) => group.items.length).slice(0, 4);

  return (
    <div className="decision-brief-sections">
      {/* 1. Resumo executivo */}
      <section className="brief-section" aria-labelledby="brief-summary">
        <h3 id="brief-summary"><span>1</span> Resumo da ideia</h3>
        <dl className="brief-summary">
          <Field label="Problema" value={clip(id.problem?.text)} />
          <Field label="Solução proposta" value={clip(solution ?? original)} />
          <Field label="Local" value={clip(id.location?.text, 120)} />
          <Field label="Principal benefício" value={clip(plan.results.informed?.text ?? plan.results.economic[0]?.text ?? plan.results.environmental[0]?.text ?? plan.results.social[0]?.text, 160)} missing="Não estimado" />
          <Field label="Categoria ESG" value={`${id.pillar} · ${id.initiativeType}`} />
        </dl>
        {aiEvaluation?.summary && <p className="small-copy"><strong>Parecer da IA:</strong> {clip(aiEvaluation.summary, 320)}</p>}
      </section>

      {/* 2. Investimento e retorno */}
      <section className="brief-section" aria-labelledby="brief-finance">
        <h3 id="brief-finance"><span>2</span> Investimento e retorno</h3>
        {feasibility.hypothetical && (
          <div className="hypothesis-box">
            <p><strong>Valores não confirmados.</strong> Faltam dados reais; parte dos números é suposição do sistema:</p>
            <ul className="evaluation-list small-copy">{feasibility.hypotheses.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        )}
        <div className="brief-cards">
          <Card label="Investimento" value={formatBRL(likely.investment)} tone={investmentTone} hint={range(optimistic.investment, conservative.investment)} />
          <Card
            label={feasibility.benefitSource === "meta" ? "Economia necessária/ano" : "Economia anual"}
            value={formatBRL(likely.annualBenefit)}
            tone={benefitTone}
            hint={feasibility.benefitSource === "meta" ? "meta para o payback, não estimativa" : range(conservative.annualBenefit, optimistic.annualBenefit)}
          />
          <Card label="Manutenção/ano" value={recurringTone === "pendente" ? "Não informado" : formatBRL(likely.recurring)} tone={recurringTone} />
          <Card label={`ROI em ${period} anos`} value={likely.roiPercent === null ? "—" : `${formatNumber(likely.roiPercent)}%`} tone={returnTone} hint="cenário provável" />
          <Card label="Payback" value={likely.paybackYears === null ? "Não se paga" : `${formatNumber(likely.paybackYears)} anos`} tone={returnTone} />
          <Card label="Prazo de implantação" value={plan.informedDeadline ?? "Não informado"} tone={plan.informedDeadline ? "informado" : "pendente"} />
          <Card label="Potencial ESG" value={score ? `${Math.round(score.value)}/100` : "Não avaliado"} tone={score ? "calculado" : "pendente"} hint={band ? `${band.label}${score?.partial ? " · parcial" : ""}` : undefined} />
        </div>
        <p className="small-copy muted">
          ROI = (economia − custo anual) × {period} anos − investimento, ÷ investimento. Payback = investimento ÷ (economia − custo anual).
          Cenário provável; faixa entre o mais caro e o mais barato encontrado.
        </p>
        {references.length > 0 ? (
          <details className="brief-details">
            <summary>Fontes da pesquisa ({references.length})</summary>
            <ul className="evaluation-list small-copy">
              {references.slice(0, 8).map((reference) => (
                <li key={reference.id}>
                  <a className="text-link" href={reference.url} target="_blank" rel="noopener noreferrer">{clip(reference.title, 80)}</a>
                  <span className="muted"> · {host(reference.url)}{reference.value ? ` · ${clip(reference.value, 60)}` : ""}</span>
                </li>
              ))}
            </ul>
            <Link className="text-link small-copy" href={`/ideas/${ideaId}/viabilidade`}>Ver preços usados no cálculo →</Link>
          </details>
        ) : (
          <p className="small-copy muted">Sem fontes de pesquisa para esta ideia.</p>
        )}
      </section>

      {/* 3. Plano de execução */}
      <section className="brief-section" aria-labelledby="brief-plan">
        <h3 id="brief-plan"><span>3</span> Como será executada</h3>
        <ol className="brief-steps">
          {plan.steps.map((step) => <li key={step.key}>{step.title}</li>)}
        </ol>
        <details className="brief-details">
          <summary>Plano de execução detalhado</summary>
          <ol className="evaluation-list small-copy">
            {plan.steps.map((step) => (
              <li key={step.key}>
                <strong>{step.title}</strong> · {step.duration} · {step.responsible}
                <br />
                <span className="muted">{step.activity}</span>
              </li>
            ))}
          </ol>
          {resources.length > 0 && (
            <>
              <h4 className="subsection-title">Recursos necessários</h4>
              <ul className="evaluation-list small-copy">
                {resources.map((group) => <li key={group.label}><strong>{group.label}:</strong> {group.items.slice(0, 3).map((item) => item.text).join("; ")}</li>)}
              </ul>
            </>
          )}
          {plan.risks.length > 0 && (
            <>
              <h4 className="subsection-title">Riscos e dependências</h4>
              <ul className="evaluation-list small-copy">{plan.risks.slice(0, 5).map((risk) => <li key={risk.text}>{risk.text}</li>)}</ul>
            </>
          )}
          <p className="small-copy muted">Etapas, prazos e responsáveis sugeridos por regras, a validar.</p>
        </details>
      </section>

      {/* 4. Recomendação justificada */}
      <section className="brief-section" aria-labelledby="brief-recommendation">
        <h3 id="brief-recommendation"><span>4</span> Recomendação do sistema</h3>
        {recommendation && proposal ? (
          <p className="brief-verdict">
            <strong className={`score-chip score-${recommendation.tone}`}>{recommendation.label}</strong>
            <span className="small-copy muted">({proposal.recommendation.label.toLowerCase()})</span>
          </p>
        ) : (
          <p className="empty-inline">Recomendação pendente: a ideia ainda não passou pela análise automática.</p>
        )}
        <div className="brief-reasons">
          <div>
            <h4>Pontos favoráveis</h4>
            {favorable.length ? <ul>{favorable.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="empty-inline">Nenhum identificado com os dados atuais.</p>}
          </div>
          <div>
            <h4>Pontos de atenção</h4>
            {attention.length ? <ul>{attention.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="empty-inline">Nenhum identificado com os dados atuais.</p>}
          </div>
          <div>
            <h4>Pendências para decidir</h4>
            {pending.length ? <ul>{pending.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="empty-inline">Nenhuma pendência.</p>}
          </div>
        </div>
        {score && band && (
          <p className="small-copy muted">
            Potencial ESG {Math.round(score.value)}/100 ({band.label.toLowerCase()}): média ponderada de 8 critérios (impacto, viabilidade, economia,
            inovação, alinhamento, mensurabilidade, escala e maturidade){score.partial ? ", só com os critérios que o texto permite avaliar" : ""}. Encaminhamento
            sugerido: {band.routing.toLowerCase()}.
          </p>
        )}
        <p className="small-copy muted">A recomendação é consultiva: a decisão é sua.</p>
      </section>
    </div>
  );
}
