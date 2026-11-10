import { displayTitle } from "@/lib/idea-title";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { ExecutionPlanView } from "@/app/ideas/[id]/execution-plan-view";
import { PlanQuestionFields, ShownQuestionsInput } from "@/app/ideas/[id]/plan-question-fields";
import { FeasibilityForm, FeasibilitySummary } from "@/app/ideas/[id]/viabilidade/feasibility-panel";
import { ResearchPanel } from "@/app/ideas/[id]/viabilidade/research-panel";
import { saveManagerAnswers } from "@/app/ideas/planning-actions";
import { AppShell } from "@/app/components/app-shell";
import { SubmitButton } from "@/app/components/submit-button";
import { requireCompanyContext } from "@/lib/auth";
import { computeFeasibility } from "@/lib/feasibility";
import { buildExecutionPlan } from "@/lib/idea-execution-plan";
import {
  detectInitiativeType,
  emptyPlan,
  INITIATIVE_TYPES,
  INITIATIVE_TYPE_KEYS,
  parsePlan,
  planProgress,
  PLAN_STEPS,
  visibleQuestions,
  withCompany,
} from "@/lib/idea-planning";
import { loadCompanyProfile, planCompanyContext } from "@/lib/company-profile";
import { blankProposal, parseStoredProposal } from "@/lib/idea-proposal";
import { researchAutomatically, researchProvider } from "@/lib/research-provider";
import type { Json } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Viabilidade da ideia" };

// A pesquisa automática da primeira abertura pode levar alguns segundos.
export const maxDuration = 120;

const SAVED_MESSAGES: Record<string, string> = {
  coleta: "Respostas salvas. O cálculo foi atualizado.",
  calculo: "Cálculo atualizado com os itens marcados.",
  automatico: "Seleção automática restaurada.",
  referencia: "Fonte registrada.",
};

/**
 * Painel da gestão: a pesquisa e o cálculo já chegam prontos (feitos no envio da
 * ideia ou na primeira abertura). A gestão confere os preços usados e ajusta.
 */
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
  const profile = await loadCompanyProfile(supabase, membership.organization_id);
  let plan = withCompany(
    parsePlan(proposal?.plan) ?? emptyPlan(detectInitiativeType(idea.original_description ?? idea.title)),
    planCompanyContext(profile),
  );

  // Ideias enviadas antes da pesquisa automática (ou se ela falhou no envio): pesquisa agora, uma vez.
  if (!plan.research) {
    const researched = await researchAutomatically(idea, plan);
    if (researched.research) {
      plan = researched;
      await supabase
        .from("ideas")
        .update({ structured_proposal: { ...(proposal ?? blankProposal(idea.title)), plan } as unknown as Json })
        .eq("id", idea.id)
        .eq("organization_id", membership.organization_id);
    }
  }

  const references = plan.research?.references ?? [];
  const feasibility = computeFeasibility(plan, references, plan.selection ?? {}, profile);
  const executionPlan = buildExecutionPlan({ title: idea.title, originalText: idea.original_description ?? "", plan });
  const progress = planProgress(plan);
  const questions = visibleQuestions(plan);
  const provider = researchProvider();

  let saved = query.salvo ? SAVED_MESSAGES[query.salvo] : null;
  if (query.salvo === "pesquisa") {
    const count = Number(query.novas_refs) || 0;
    saved = count ? `Pesquisa atualizada: ${count} ${count === 1 ? "nova fonte" : "novas fontes"}.` : "Pesquisa atualizada, sem fontes novas.";
  }

  return (
    <AppShell organizationName={organization.name} userEmail={user.email} membership={membership}>
      <header className="page-header">
        <div>
          <Link className="back-link" href={`/ideas/${idea.id}`}>← Voltar para a ideia</Link>
          <p className="eyebrow">VIABILIDADE</p>
          <h1>{displayTitle(idea.title, idea.original_description)}</h1>
          <p className="muted">
            {INITIATIVE_TYPES[plan.initiativeType].label} · {references.length} fontes pesquisadas · {progress.percent}% das perguntas respondidas
          </p>
        </div>
        <div className="header-actions">
          <a className="button button-primary" href={`/ideas/${idea.id}/relatorio/pdf`}>Relatório executivo (PDF)</a>
          <Link className="button button-secondary" href={`/ideas/${idea.id}/relatorio`}>Relatório completo</Link>
        </div>
      </header>

      {query.error && <p className="alert alert-error" role="alert">{query.error}</p>}
      {saved && <p className="alert alert-success" role="status">{saved}</p>}

      <div className="detail-main">
        <section className="panel detail-panel" aria-labelledby="resumo-title">
          <h2 id="resumo-title">Retorno do investimento</h2>
          <p className="small-copy muted">
            Calculado automaticamente com os preços da pesquisa e as respostas do colaborador. O valor em destaque é o cenário
            provável; a faixa vai do preço mais baixo ao mais alto encontrado.
          </p>
          <FeasibilitySummary feasibility={feasibility} />
        </section>

        <section className="panel detail-panel" id="calculo" aria-labelledby="calculo-title">
          <h2 id="calculo-title">Preços usados no cálculo</h2>
          <FeasibilityForm ideaId={idea.id} feasibility={feasibility} stored={plan.selection ?? null} />
          {feasibility.memory.length > 0 && (
            <details>
              <summary className="small-copy">Memória de cálculo</summary>
              <ul className="evaluation-list small-copy">{feasibility.memory.map((item) => <li key={item}>{item}</li>)}</ul>
              <p className="small-copy muted">
                ROI = (economia anual − custo anual) × período − investimento, dividido pelo investimento. Payback = investimento ÷
                (economia anual − custo anual). Sem correção monetária.
              </p>
            </details>
          )}
        </section>

        <section className="panel detail-panel" aria-label="Detalhes">
          <details id="plano">
            <summary><strong>Plano de execução</strong> <span className="small-copy muted">· {executionPlan.steps.length} etapas</span></summary>
            <ExecutionPlanView plan={executionPlan} />
          </details>
          <hr />
          <details id="fontes">
            <summary><strong>Fontes da pesquisa</strong> <span className="small-copy muted">· {references.length}</span></summary>
            <ResearchPanel
              ideaId={idea.id}
              research={plan.research}
              provider={provider}
              unavailableReason="A pesquisa automática não está ativa: falta a variável TAVILY_API_KEY no servidor. Registre as fontes manualmente abaixo."
            />
          </details>
          <hr />
          <details id="coleta" open={Boolean(query.novas)}>
            <summary><strong>Respostas do colaborador</strong> <span className="small-copy muted">· {progress.handled} de {progress.total} · completar o que falta</span></summary>
            <form className="idea-form" action={saveManagerAnswers}>
              <input type="hidden" name="ideaId" value={idea.id} />
              <ShownQuestionsInput questions={questions} />
              <label htmlFor="initiativeType">Tipo de iniciativa</label>
              <select id="initiativeType" name="initiativeType" defaultValue={plan.initiativeType}>
                {INITIATIVE_TYPE_KEYS.map((key) => <option key={key} value={key}>{INITIATIVE_TYPES[key].label}</option>)}
              </select>
              {PLAN_STEPS.map((step) => {
                const stepQuestions = questions.filter((question) => question.step === step.key);
                if (!stepQuestions.length) return null;
                return (
                  <fieldset key={step.key} className="form-fieldset-reset">
                    <legend className="subsection-title">{step.label}</legend>
                    <PlanQuestionFields questions={stepQuestions} plan={plan} proposal={null} highlightUnanswered={Boolean(query.novas)} />
                  </fieldset>
                );
              })}
              <div className="form-actions">
                <SubmitButton className="button button-primary" pendingLabel="Salvando…">Salvar respostas</SubmitButton>
              </div>
            </form>
          </details>
        </section>
      </div>
    </AppShell>
  );
}
