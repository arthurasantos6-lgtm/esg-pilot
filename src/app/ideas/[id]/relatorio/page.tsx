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
import { loadCompanyProfile } from "@/lib/company-profile";
import { computeFeasibility, type Feasibility } from "@/lib/feasibility";
import { formatBRL, formatNumber } from "@/lib/idea-finance";
import {
  answerStatusLabel,
  detectInitiativeType,
  emptyPlan,
  parsePlan,
  PLAN_STEPS,
  REFERENCE_CATEGORIES,
  visibleQuestions,
} from "@/lib/idea-planning";
import { ideaProtocol, ideaStatusLabel } from "@/lib/idea-status";
import { parseStoredProposal } from "@/lib/idea-proposal";

export const metadata: Metadata = { title: "Relatório da iniciativa" };

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" });

function GroupTable({ feasibility, role, empty }: { feasibility: Feasibility; role: "investment" | "recurring"; empty: string }) {
  const groups = feasibility.groups.filter((group) => group.role === role);
  if (!groups.length) return <p className="empty-inline">{empty}</p>;
  return (
    <div className="table-wrap">
      <table className="plan-table">
        <thead><tr><th>Item</th><th>Preço encontrado</th><th>Quantidade</th><th>Total (faixa)</th><th>Fontes</th></tr></thead>
        <tbody>
          {groups.map((group) => {
            const sources = feasibility.candidates.filter((item) => item.group === group.group && feasibility.selectedIds.includes(item.id));
            return (
              <tr key={group.group}>
                <td>{group.label}</td>
                <td>{formatBRL(group.unitPrice.min)} a {formatBRL(group.unitPrice.max)}</td>
                <td>{formatNumber(group.quantity)}</td>
                <td>{formatBRL(group.total.min)} a {formatBRL(group.total.max)} (provável {formatBRL(group.total.median)})</td>
                <td>
                  {[...new Map(sources.map((item) => [item.url, item])).values()].map((item) => (
                    <a key={item.url} className="text-link small-copy" href={item.url} target="_blank" rel="noopener noreferrer">{item.sourceTitle}<br /></a>
                  ))}
                </td>
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
  const companyProfile = await loadCompanyProfile(supabase, membership.organization_id);
  const feasibility = computeFeasibility(plan, plan.research?.references ?? [], plan.selection ?? {}, companyProfile);
  const references = plan.research?.references ?? [];
  const likely = feasibility.scenarios[1];
  const pending = [
    ...execution.pending,
    ...feasibility.missing.map((item) => `Análise financeira: ${item}`),
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
        <div className="header-actions">
          <a className="button button-primary no-print" href={`/ideas/${idea.id}/relatorio/pdf`}>Relatório executivo (PDF)</a>
          <PrintButton label="Imprimir esta página" />
        </div>
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
          <GroupTable feasibility={feasibility} role="investment" empty="Nenhum preço da pesquisa foi usado." />
          {feasibility.informedInvestment !== null && <p className="small-copy">Estimativa do colaborador: {formatBRL(feasibility.informedInvestment)}.</p>}
          <p><strong>Total provável: {likely.investment === null ? "não calculado" : formatBRL(likely.investment)}</strong></p>
        </section>

        <section className="panel detail-panel report-section">
          <h2 className="subsection-title">9. Custos recorrentes</h2>
          <GroupTable feasibility={feasibility} role="recurring" empty="Nenhum preço de manutenção da pesquisa foi usado." />
          {feasibility.informedRecurring !== null && <p className="small-copy">Informado pelo colaborador: {formatBRL(feasibility.informedRecurring)} por ano.</p>}
          <p><strong>Total anual provável: {formatBRL(likely.recurring)}</strong></p>
        </section>

        <section className="panel detail-panel report-section">
          <h2 className="subsection-title">10. Benefícios esperados</h2>
          {execution.results.informed && <p>{execution.results.informed.text} <SourceChip source={execution.results.informed.source} /></p>}
          <dl className="proposal-list">
            <div><dt>Ambientais</dt><dd><SourcedList items={execution.results.environmental} empty="—" /></dd></div>
            <div><dt>Sociais</dt><dd><SourcedList items={execution.results.social} empty="—" /></dd></div>
            <div><dt>Econômicos</dt><dd><SourcedList items={execution.results.economic} empty="—" /></dd></div>
          </dl>
          <p>
            <strong>Economia financeira anual (provável): {likely.annualBenefit === null ? "não calculada" : formatBRL(likely.annualBenefit)}</strong>
            {feasibility.benefitSource === "gestao" && " (informada pela gestão)"}
            {feasibility.tariff && ` · tarifa ${feasibility.tariff.source === "colaborador" ? "informada pelo colaborador" : "pesquisada"}`}
          </p>
          {execution.savings && (
            <p className="small-copy">
              Estimativa física: {formatNumber(execution.savings.quantity)} {execution.savings.unit}. Premissas: {execution.savings.assumptions.join(" ")}
            </p>
          )}
          <p className="small-copy muted">Benefícios ambientais e sociais acima não recebem valor em reais sem fundamento.</p>
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
          {feasibility.calculable ? (
            <ul className="evaluation-list">
              {feasibility.scenarios.map((scenario) => (
                <li key={scenario.key}>
                  <strong>{scenario.label}:</strong> {scenario.roiPercent === null ? "não calculado" : `${formatNumber(scenario.roiPercent)}% em ${formatNumber(feasibility.periodYears)} anos`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-inline">Não calculado: {feasibility.missing.join("; ") || "dados insuficientes"}.</p>
          )}
          {feasibility.hypothetical && (
            <div className="hypothesis-box">
              <p><span className="source-chip source-chip-cotacao">Cenário hipotético</span> Este cálculo usa suposições do sistema onde faltaram dados reais:</p>
              <ul className="evaluation-list small-copy">{feasibility.hypotheses.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          )}
          <p className="small-copy muted">Cenários pela faixa de valores: conservador usa o investimento mais alto e a menor economia; otimista, o contrário.</p>
          {feasibility.memory.length > 0 && (
            <>
              <h3 className="subsection-title">Premissas e memória de cálculo</h3>
              <ul className="evaluation-list small-copy">{feasibility.memory.map((item) => <li key={item}>{item}</li>)}</ul>
            </>
          )}
        </section>

        <section className="panel detail-panel report-section">
          <h2 className="subsection-title">14. Payback estimado</h2>
          {feasibility.scenarios.some((scenario) => scenario.paybackYears !== null) ? (
            <ul className="evaluation-list">
              {feasibility.scenarios.filter((scenario) => scenario.paybackYears !== null).map((scenario) => (
                <li key={scenario.key}><strong>{scenario.label}:</strong> {formatNumber(scenario.paybackYears ?? 0)} anos</li>
              ))}
            </ul>
          ) : (
            <p className="empty-inline">Não calculado{likely.notes.length ? `: ${likely.notes.join(" ")}` : ": depende de investimento e de economia anual maior que o custo anual."}</p>
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
