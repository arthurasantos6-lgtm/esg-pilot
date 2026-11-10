import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { SourceChip, SourcedList } from "@/app/ideas/[id]/execution-plan-view";
import { ReferencesTable } from "@/app/ideas/[id]/viabilidade/research-panel";
import { AppShell } from "@/app/components/app-shell";
import { PrintButton } from "@/app/components/print-button";
import { requireCompanyContext } from "@/lib/auth";
import { buildExecutionPlan } from "@/lib/idea-execution-plan";
import { analyzeFinance, formatBRL, formatNumber } from "@/lib/idea-finance";
import {
  answerStatusLabel,
  detectInitiativeType,
  emptyPlan,
  parsePlan,
  PLAN_STEPS,
  REFERENCE_CATEGORIES,
  VALUE_ORIGINS,
  visibleQuestions,
  type MoneyLine,
  type PlanReference,
} from "@/lib/idea-planning";
import { ideaProtocol, ideaStatusLabel } from "@/lib/idea-status";
import { parseStoredProposal } from "@/lib/idea-proposal";

export const metadata: Metadata = { title: "Relatório da iniciativa" };

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" });

function originChip(origin: keyof typeof VALUE_ORIGINS) {
  return <span className={`source-chip source-chip-${origin}`}>{VALUE_ORIGINS[origin]}</span>;
}

function MoneyTable({ lines, references, empty }: { lines: MoneyLine[]; references: PlanReference[]; empty: string }) {
  if (!lines.length) return <p className="empty-inline">{empty}</p>;
  return (
    <div className="table-wrap">
      <table className="plan-table">
        <thead><tr><th>Item</th><th>Valor</th><th>Origem</th><th>Fonte</th></tr></thead>
        <tbody>
          {lines.map((line, index) => {
            const reference = references.find((item) => item.id === line.referenceId);
            return (
              <tr key={`${line.label}-${index}`}>
                <td>{line.label}</td>
                <td>{line.amount === null ? "A cotar" : formatBRL(line.amount)}</td>
                <td>{originChip(line.origin)}</td>
                <td>{reference ? <a className="text-link" href={reference.url} target="_blank" rel="noopener noreferrer">{reference.title}</a> : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Relatório consolidado para avaliação da gestão (imprimível). */
export default async function InitiativeReportPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();

  const { supabase, user, membership, organization } = await requireCompanyContext();
  if (membership.role !== "company_admin") redirect(`/ideas/${id}`);

  const { data: idea } = await supabase
    .from("ideas")
    .select("id, title, original_description, status, author_name, submitted_at, area, structured_proposal")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (!idea || idea.status === "draft") notFound();

  const proposal = parseStoredProposal(idea.structured_proposal);
  const plan = parsePlan(proposal?.plan) ?? emptyPlan(detectInitiativeType(idea.original_description ?? idea.title));
  const execution = buildExecutionPlan({ title: idea.title, originalText: idea.original_description ?? "", plan });
  const finance = plan.finance;
  const analysis = analyzeFinance(finance);
  const references = plan.research?.references ?? [];
  const likely = analysis.scenarios.find((scenario) => scenario.key === "likely");
  const pending = [
    ...execution.pending,
    ...analysis.missing.map((item) => `Análise financeira: ${item}`),
    ...analysis.pending,
    ...(plan.research?.gaps ?? []).map((gap) => `Pesquisa: ${gap}`),
  ];
  const questions = visibleQuestions(plan);

  return (
    <AppShell organizationName={organization.name} userEmail={user.email} membership={membership}>
      <header className="page-header">
        <div>
          <Link className="back-link no-print" href={`/ideas/${idea.id}/viabilidade`}>← Voltar para a viabilidade</Link>
          <p className="eyebrow">RELATÓRIO DA INICIATIVA · {ideaProtocol(idea.id)}</p>
          <h1>{idea.title}</h1>
          <p className="muted">
            {execution.identification.pillar} · {execution.identification.initiativeType} · {ideaStatusLabel(idea.status)}
            {idea.submitted_at ? ` · enviada em ${dateFormat.format(new Date(idea.submitted_at))}` : ""}
            {idea.author_name ? ` · por ${idea.author_name}` : ""}
            {idea.area ? ` · ${idea.area}` : ""}
          </p>
        </div>
        <div className="header-actions"><PrintButton /></div>
      </header>

      <p className="alert alert-info">
        Documento de apoio à decisão, gerado em {dateFormat.format(new Date())}. Reúne o que foi informado pelo colaborador e pela gestão,
        sugestões do sistema por regras e referências pesquisadas. Itens marcados como sugestão, estimativa ou IA não foram verificados.
      </p>

      <div className="detail-main">
        <section className="panel detail-panel report-section">
          <h2 className="subsection-title">1. Ideia original do colaborador</h2>
          <p className="preserve-lines">{idea.original_description ?? "Não informado."}</p>
        </section>

        <section className="panel detail-panel report-section">
          <h2 className="subsection-title">2. Descrição detalhada da iniciativa</h2>
          <p>{execution.execution.summary}</p>
          {execution.identification.location && (
            <p className="small-copy"><strong>Local:</strong> {execution.identification.location.text} <SourceChip source={execution.identification.location.source} /></p>
          )}
          <SourcedList items={execution.identification.scope} empty="Escopo não detalhado." />
          <details>
            <summary className="small-copy">Todas as respostas coletadas</summary>
            {PLAN_STEPS.map((step) => {
              const stepQuestions = questions.filter((question) => question.step === step.key);
              if (!stepQuestions.length) return null;
              return (
                <div key={step.key}>
                  <h3 className="subsection-title">{step.label}</h3>
                  <dl className="proposal-list">
                    {stepQuestions.map((question) => {
                      const answer = plan.answers[question.id];
                      return (
                        <div key={question.id}>
                          <dt>{question.text}</dt>
                          {answer?.status === "answered" ? (
                            <dd>
                              {answer.value}{question.unit ? ` ${question.unit}` : ""}
                              <SourceChip source={answer.by === "management" ? "gestao" : "colaborador"} />
                            </dd>
                          ) : (
                            <dd className="empty-inline">{answer ? answerStatusLabel(answer.status) : "Sem resposta"}</dd>
                          )}
                        </div>
                      );
                    })}
                  </dl>
                </div>
              );
            })}
          </details>
        </section>

        <section className="panel detail-panel report-section">
          <h2 className="subsection-title">3. Problema identificado</h2>
          {execution.identification.problem ? (
            <p>{execution.identification.problem.text} <SourceChip source={execution.identification.problem.source} /></p>
          ) : (
            <p className="empty-inline">Não informado.</p>
          )}
        </section>

        <section className="panel detail-panel report-section">
          <h2 className="subsection-title">4. Objetivos</h2>
          {execution.identification.objective ? (
            <p>{execution.identification.objective.text} <SourceChip source={execution.identification.objective.source} /></p>
          ) : (
            <p className="empty-inline">Não informado.</p>
          )}
        </section>

        <section className="panel detail-panel report-section">
          <h2 className="subsection-title">5. Plano de execução passo a passo</h2>
          <ol className="evaluation-list">
            {execution.steps.map((step) => <li key={step.key}><strong>{step.title}.</strong> {step.activity}</li>)}
          </ol>
          <p className="small-copy muted">Sequência sugerida por regras, a validar.</p>
        </section>

        <section className="panel detail-panel report-section">
          <h2 className="subsection-title">6. Recursos necessários</h2>
          <dl className="proposal-list">
            {execution.resources.map((group) => (
              <div key={group.label}>
                <dt>{group.label}</dt>
                {group.items.length ? <dd><SourcedList items={group.items} empty="" /></dd> : <dd className="empty-inline">A levantar</dd>}
              </div>
            ))}
          </dl>
        </section>

        <section className="panel detail-panel report-section">
          <h2 className="subsection-title">7. Cronograma</h2>
          {execution.informedDeadline && <p className="small-copy">Prazo total imaginado pelo colaborador: {execution.informedDeadline}.</p>}
          <div className="table-wrap">
            <table className="plan-table">
              <thead><tr><th>#</th><th>Etapa</th><th>Prazo estimado</th><th>Depende de</th><th>Responsável sugerido</th></tr></thead>
              <tbody>
                {execution.steps.map((step) => (
                  <tr key={step.key}>
                    <td>{step.order}</td>
                    <td>{step.title}</td>
                    <td>{step.duration}</td>
                    <td>{step.dependsOn.length ? step.dependsOn.map((order) => `Etapa ${order}`).join(", ") : "—"}</td>
                    <td>{step.responsible}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel detail-panel report-section">
          <h2 className="subsection-title">8. Investimento estimado</h2>
          <MoneyTable lines={finance?.investment ?? []} references={references} empty="Investimento ainda não levantado pela gestão." />
          {analysis.investmentTotal !== null && <p><strong>Total: {formatBRL(analysis.investmentTotal)}</strong></p>}
        </section>

        <section className="panel detail-panel report-section">
          <h2 className="subsection-title">9. Custos recorrentes</h2>
          <MoneyTable lines={finance?.recurring ?? []} references={references} empty="Nenhum custo recorrente registrado." />
          <p><strong>Total anual: {formatBRL(analysis.recurringAnnual)}</strong></p>
        </section>

        <section className="panel detail-panel report-section">
          <h2 className="subsection-title">10. Benefícios esperados</h2>
          {execution.results.informed && <p>{execution.results.informed.text} <SourceChip source={execution.results.informed.source} /></p>}
          <dl className="proposal-list">
            <div><dt>Ambientais</dt><dd><SourcedList items={execution.results.environmental} empty="—" /></dd></div>
            <div><dt>Sociais</dt><dd><SourcedList items={execution.results.social} empty="—" /></dd></div>
            <div><dt>Econômicos</dt><dd><SourcedList items={execution.results.economic} empty="—" /></dd></div>
          </dl>
          {finance?.benefits.length ? (
            <div className="table-wrap">
              <table className="plan-table">
                <thead><tr><th>Benefício financeiro anual</th><th>Conservador</th><th>Provável</th><th>Otimista</th><th>Origem</th><th>Base</th></tr></thead>
                <tbody>
                  {finance.benefits.map((line, index) => (
                    <tr key={`${line.label}-${index}`}>
                      <td>{line.label}</td>
                      <td>{line.conservative === null ? "—" : formatBRL(line.conservative)}</td>
                      <td>{line.likely === null ? "—" : formatBRL(line.likely)}</td>
                      <td>{line.optimistic === null ? "—" : formatBRL(line.optimistic)}</td>
                      <td>{originChip(line.origin)}</td>
                      <td>{line.basis ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {execution.savings && (
            <p className="small-copy">
              Estimativa física: {formatNumber(execution.savings.quantity)} {execution.savings.unit} ({execution.savings.formula}). Premissas:{" "}
              {execution.savings.assumptions.join(" ")}
            </p>
          )}
          <h3 className="subsection-title">Benefícios não monetizados</h3>
          <p className={finance?.nonFinancialBenefits ? "preserve-lines" : "empty-inline"}>
            {finance?.nonFinancialBenefits ?? "Não descritos pela gestão. Benefícios ambientais e sociais não recebem valor em reais sem fundamento."}
          </p>
        </section>

        <section className="panel detail-panel report-section">
          <h2 className="subsection-title">11. Indicadores ESG</h2>
          <ul className="evaluation-list">
            {execution.results.indicators.map((indicator) => (
              <li key={indicator.name}>{indicator.name}: {indicator.how} <SourceChip source={indicator.source} /></li>
            ))}
          </ul>
        </section>

        <section className="panel detail-panel report-section">
          <h2 className="subsection-title">12. Pesquisa de mercado e fontes consultadas</h2>
          <ReferencesTable references={references} editable={false} />
          {references.length > 0 && (
            <p className="small-copy muted">
              Tipos: {[...new Set(references.map((reference) => REFERENCE_CATEGORIES[reference.category]))].join(", ")}. Valores de busca
              automática são trechos das páginas (ou extraídos por IA, quando indicado) e precisam de conferência na fonte.
            </p>
          )}
        </section>

        <section className="panel detail-panel report-section">
          <h2 className="subsection-title">13. ROI estimado</h2>
          {analysis.calculable ? (
            <ul className="evaluation-list">
              {analysis.scenarios.map((scenario) => (
                <li key={scenario.key}>
                  <strong>{scenario.label}:</strong> {scenario.roiPercent === null ? `não calculado. ${scenario.notes.join(" ")}` : `${formatNumber(scenario.roiPercent)}% em ${formatNumber(analysis.periodYears ?? 0)} anos`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-inline">Não calculado: dados insuficientes ({[...analysis.missing, ...analysis.pending].join("; ") || "ver observações dos cenários"}).</p>
          )}
          {analysis.memory.length > 0 && (
            <>
              <h3 className="subsection-title">Premissas e memória de cálculo</h3>
              {finance?.assumptions && <p className="preserve-lines small-copy">{finance.assumptions}</p>}
              <ul className="evaluation-list small-copy">{analysis.memory.map((item) => <li key={item}>{item}</li>)}</ul>
              <p className="small-copy muted">ROI (%) = [(benefício líquido anual × período − investimento) / investimento] × 100, sem correção monetária.</p>
            </>
          )}
        </section>

        <section className="panel detail-panel report-section">
          <h2 className="subsection-title">14. Payback estimado</h2>
          {analysis.scenarios.some((scenario) => scenario.paybackYears !== null) ? (
            <ul className="evaluation-list">
              {analysis.scenarios.filter((scenario) => scenario.paybackYears !== null).map((scenario) => (
                <li key={scenario.key}><strong>{scenario.label}:</strong> {formatNumber(scenario.paybackYears ?? 0)} anos</li>
              ))}
            </ul>
          ) : (
            <p className="empty-inline">
              Não calculado{likely?.notes.length ? `: ${likely.notes.join(" ")}` : ": depende de investimento e benefício líquido anual positivo conhecidos."}
            </p>
          )}
        </section>

        <section className="panel detail-panel report-section">
          <h2 className="subsection-title">15. Riscos e pontos de atenção</h2>
          <SourcedList items={execution.risks} empty="Nenhum risco registrado." />
        </section>

        <section className="panel detail-panel report-section">
          <h2 className="subsection-title">16. Informações pendentes de validação</h2>
          {pending.length ? <ul className="evaluation-list">{pending.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="empty-inline">Nenhuma pendência.</p>}
        </section>
      </div>
    </AppShell>
  );
}
