import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { ExecutionPlanView } from "@/app/ideas/[id]/execution-plan-view";
import { PlanQuestionFields, ShownQuestionsInput } from "@/app/ideas/[id]/plan-question-fields";
import { FinancePanel } from "@/app/ideas/[id]/viabilidade/finance-panel";
import { ResearchPanel } from "@/app/ideas/[id]/viabilidade/research-panel";
import { saveManagerAnswers } from "@/app/ideas/planning-actions";
import { AppShell } from "@/app/components/app-shell";
import { SubmitButton } from "@/app/components/submit-button";
import { isWebResearchConfigured } from "@/lib/ai/service";
import { requireCompanyContext } from "@/lib/auth";
import { buildExecutionPlan } from "@/lib/idea-execution-plan";
import { initialFinance } from "@/lib/idea-finance";
import { isAiAvailable } from "@/lib/idea-ai";
import {
  detectInitiativeType,
  emptyPlan,
  INITIATIVE_TYPES,
  INITIATIVE_TYPE_KEYS,
  parsePlan,
  planProgress,
  PLAN_STEPS,
  visibleQuestions,
} from "@/lib/idea-planning";
import { parseStoredProposal } from "@/lib/idea-proposal";

export const metadata: Metadata = { title: "Viabilidade da ideia" };

// A pesquisa na internet pode levar alguns minutos.
export const maxDuration = 300;

const SAVED_MESSAGES: Record<string, string> = {
  coleta: "Informações salvas.",
  financeiro: "Análise financeira salva e recalculada.",
  pesquisa: "Pesquisa concluída.",
  referencia: "Fonte registrada.",
};

/** Área da gestão: complementar informações, revisar o plano, pesquisar referências e calcular o retorno. */
export default async function FeasibilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; salvo?: string; novas?: string; novas_refs?: string }>;
}) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.guid().safeParse(id).success) notFound();

  const { supabase, user, membership, organization } = await requireCompanyContext();
  if (membership.role !== "company_admin") redirect(`/ideas/${id}`);

  const { data: idea } = await supabase
    .from("ideas")
    .select("id, title, original_description, status, structured_proposal")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (!idea || idea.status === "draft") notFound();

  const proposal = parseStoredProposal(idea.structured_proposal);
  const plan = parsePlan(proposal?.plan) ?? emptyPlan(detectInitiativeType(idea.original_description ?? idea.title));
  const executionPlan = buildExecutionPlan({ title: idea.title, originalText: idea.original_description ?? "", plan });
  const progress = planProgress(plan);
  const questions = visibleQuestions(plan);
  const researchAvailable = isAiAvailable() && isWebResearchConfigured();
  const unavailableReason =
    "A pesquisa automática na internet não está ativa nesta plataforma (requer ESG_EXTERNAL_AI=true, provedor Anthropic e a chave service role no servidor). Registre as fontes manualmente abaixo.";

  let saved = query.salvo ? SAVED_MESSAGES[query.salvo] : null;
  if (query.salvo === "pesquisa" && query.novas_refs !== undefined) {
    const count = Number(query.novas_refs) || 0;
    saved = count ? `Pesquisa concluída: ${count} ${count === 1 ? "nova referência" : "novas referências"}.` : "Pesquisa concluída, mas nenhuma nova referência com fonte verificável foi encontrada.";
  }

  return (
    <AppShell organizationName={organization.name} userEmail={user.email} membership={membership}>
      <header className="page-header">
        <div>
          <Link className="back-link" href={`/ideas/${idea.id}`}>← Voltar para a ideia</Link>
          <p className="eyebrow">PLANO DE EXECUÇÃO E VIABILIDADE</p>
          <h1>{idea.title}</h1>
          <p className="muted">{INITIATIVE_TYPES[plan.initiativeType].label} · {progress.percent}% das perguntas tratadas</p>
        </div>
        <div className="header-actions">
          <Link className="button button-primary" href={`/ideas/${idea.id}/relatorio`}>Relatório consolidado</Link>
        </div>
      </header>

      {query.error && <p className="alert alert-error" role="alert">{query.error}</p>}
      {saved && <p className="alert alert-success" role="status">{saved}</p>}

      <nav className="plan-anchor-nav" aria-label="Seções da análise">
        <a className="subtle-tag" href="#coleta">1. Informações coletadas</a>
        <a className="subtle-tag" href="#plano">2. Plano de execução</a>
        <a className="subtle-tag" href="#pesquisa">3. Pesquisa de mercado</a>
        <a className="subtle-tag" href="#financeiro">4. Investimento e ROI</a>
      </nav>

      <div className="detail-main">
        <section className="panel detail-panel" id="coleta" aria-labelledby="coleta-title">
          <p className="eyebrow">ETAPA 1</p>
          <h2 id="coleta-title">Informações coletadas</h2>
          <p className="small-copy muted">
            Respostas de quem enviou a ideia. A gestão pode complementar o que ficou pendente; o texto original e a proposta do
            colaborador não são alterados.
          </p>
          {query.novas && <p className="alert alert-info" role="status">Novas perguntas apareceram com base nas respostas.</p>}
          <form className="idea-form" action={saveManagerAnswers}>
            <input type="hidden" name="ideaId" value={idea.id} />
            <ShownQuestionsInput questions={questions} />
            <label htmlFor="initiativeType">Tipo de iniciativa</label>
            <select id="initiativeType" name="initiativeType" defaultValue={plan.initiativeType}>
              {INITIATIVE_TYPE_KEYS.map((key) => <option key={key} value={key}>{INITIATIVE_TYPES[key].label}</option>)}
            </select>
            {PLAN_STEPS.map((step) => {
              const stepQuestions = questions.filter((question) => question.step === step.key);
              const stepProgress = planProgress(plan, step.key);
              if (!stepQuestions.length) return null;
              return (
                <details key={step.key} className="proposal-more" open={stepProgress.handled < stepProgress.total || Boolean(query.novas)}>
                  <summary className="small-copy">
                    <strong>{step.label}</strong> · {stepProgress.handled}/{stepProgress.total} tratadas
                  </summary>
                  <PlanQuestionFields questions={stepQuestions} plan={plan} proposal={null} highlightUnanswered={Boolean(query.novas)} />
                </details>
              );
            })}
            <div className="form-actions">
              <SubmitButton className="button button-primary" pendingLabel="Salvando…">Salvar informações</SubmitButton>
            </div>
          </form>
        </section>

        <section className="panel detail-panel" id="plano" aria-labelledby="plano-title">
          <p className="eyebrow">ETAPA 2 · GERADO POR REGRAS</p>
          <h2 id="plano-title">Plano de execução</h2>
          <ExecutionPlanView plan={executionPlan} />
        </section>

        <section className="panel detail-panel" id="pesquisa" aria-labelledby="pesquisa-title">
          <p className="eyebrow">ETAPA 3</p>
          <h2 id="pesquisa-title">Pesquisa de mercado: investimento, custos e retorno</h2>
          <ResearchPanel ideaId={idea.id} research={plan.research} available={researchAvailable} unavailableReason={unavailableReason} />
        </section>

        <section className="panel detail-panel" id="financeiro" aria-labelledby="financeiro-title">
          <p className="eyebrow">ETAPA 4</p>
          <h2 id="financeiro-title">Investimento, payback e ROI</h2>
          <p className="small-copy muted">
            {plan.finance
              ? "Premissas salvas pela gestão."
              : "Ainda não salvo: os campos abaixo trazem o que o colaborador informou e as estimativas calculáveis pelas respostas. Revise antes de salvar."}{" "}
            O ROI só é calculado com investimento, benefício anual e período definidos, e sem itens aguardando cotação.
          </p>
          <FinancePanel ideaId={idea.id} finance={plan.finance ?? initialFinance(plan)} references={plan.research?.references ?? []} />
        </section>
      </div>
    </AppShell>
  );
}
