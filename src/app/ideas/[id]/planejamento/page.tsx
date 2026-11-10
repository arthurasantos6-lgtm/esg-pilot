import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { ExecutionPlanView } from "@/app/ideas/[id]/execution-plan-view";
import { PlanQuestionFields, ShownQuestionsInput } from "@/app/ideas/[id]/plan-question-fields";
import { savePlanStep } from "@/app/ideas/planning-actions";
import { AppShell } from "@/app/components/app-shell";
import { SubmitButton } from "@/app/components/submit-button";
import { assertModuleEnabled, requireCompanyContext } from "@/lib/auth";
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
  type PlanStepKey,
} from "@/lib/idea-planning";
import { loadCompanyProfile, planCompanyContext } from "@/lib/company-profile";
import { parseStoredProposal } from "@/lib/idea-proposal";

export const metadata: Metadata = { title: "Planejamento da ideia" };

/**
 * Perguntas por etapas para transformar a ideia em um plano de execução. Cada
 * etapa é salva ao avançar; a pessoa pode voltar, editar e sair a qualquer momento.
 */
export default async function PlanningPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ etapa?: string; error?: string; novas?: string }>;
}) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.guid().safeParse(id).success) notFound();

  const { supabase, user, membership, organization } = await requireCompanyContext();
  assertModuleEnabled(organization.enabled_modules, "ideas", "Ideias");

  const { data: idea } = await supabase
    .from("ideas")
    .select("id, title, original_description, status, author_id, structured_proposal")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (!idea) notFound();
  if (idea.author_id !== user.id || idea.status !== "draft") redirect(`/ideas/${idea.id}`);

  const proposal = parseStoredProposal(idea.structured_proposal);
  const profile = await loadCompanyProfile(supabase, membership.organization_id);
  const plan = withCompany(
    parsePlan(proposal?.plan) ?? emptyPlan(detectInitiativeType(idea.original_description ?? idea.title)),
    planCompanyContext(profile),
  );
  const isPlanView = query.etapa === "plano";
  const step: PlanStepKey = PLAN_STEPS.find(({ key }) => key === query.etapa)?.key ?? "ideia";
  const stepIndex = PLAN_STEPS.findIndex(({ key }) => key === step);
  const questions = visibleQuestions(plan, step);
  const progress = planProgress(plan);
  const base = `/ideas/${idea.id}/planejamento`;

  return (
    <AppShell organizationName={organization.name} userEmail={user.email} membership={membership}>
      <header className="page-header">
        <div>
          <p className="eyebrow">PLANEJAMENTO DA IDEIA</p>
          <h1>Vamos detalhar sua ideia</h1>
          <p className="muted">
            Algumas perguntas para transformar a ideia em um plano que a gestão consiga avaliar. Responda o que souber: quando não
            souber, marque &quot;Não sei informar&quot; ou &quot;Precisa ser avaliado&quot;. Seu progresso é salvo a cada etapa.
          </p>
        </div>
      </header>

      {query.error && <p className="alert alert-error" role="alert">{query.error}</p>}
      {query.novas && !isPlanView && (
        <p className="alert alert-info" role="status">Com base nas suas respostas, surgiram novas perguntas, destacadas abaixo.</p>
      )}

      <div className="plan-progress" aria-label="Progresso do preenchimento">
        <div className="plan-progress-label">
          <span>{progress.handled} de {progress.total} perguntas tratadas</span>
          <span>{progress.percent}%</span>
        </div>
        <div className="bar-track"><span className="bar-fill" style={{ width: `${progress.percent}%` }} /></div>
      </div>

      <nav aria-label="Etapas do planejamento">
        <ol className="plan-stepper">
          {PLAN_STEPS.map((item, index) => {
            const stepProgress = planProgress(plan, item.key);
            return (
              <li key={item.key}>
                <Link href={`${base}?etapa=${item.key}`} aria-current={!isPlanView && item.key === step ? "step" : undefined}>
                  {index + 1}. {item.label}
                  <span className="plan-stepper-count">{stepProgress.handled}/{stepProgress.total}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <Link href={`${base}?etapa=plano`} aria-current={isPlanView ? "step" : undefined}>5. Plano de execução</Link>
          </li>
        </ol>
      </nav>

      {isPlanView ? (
        <section className="panel detail-panel" aria-labelledby="plan-title">
          <p className="eyebrow">PRÉVIA · GERADA POR REGRAS</p>
          <h2 id="plan-title">Plano de execução</h2>
          <p className="small-copy muted">
            Montado a partir das suas respostas. A gestão vai revisar, complementar e fazer a análise de custos e retorno.
          </p>
          <ExecutionPlanView plan={buildExecutionPlan({ title: proposal?.title ?? idea.title, originalText: idea.original_description ?? "", plan })} />
          <div className="form-actions">
            <Link className="button button-secondary" href={`${base}?etapa=ideia`}>Editar respostas</Link>
            <Link className="button button-primary" href={`/ideas/${idea.id}/review`}>
              Revisar e enviar <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      ) : (
        <div className="form-layout">
          <section className="panel idea-form-panel" aria-labelledby="step-title" id="perguntas">
            <p className="eyebrow">ETAPA {stepIndex + 1} DE {PLAN_STEPS.length}</p>
            <h2 id="step-title">{PLAN_STEPS[stepIndex].label}</h2>
            <p className="small-copy muted">{PLAN_STEPS[stepIndex].description}</p>
            <form className="idea-form" action={savePlanStep}>
              <input type="hidden" name="ideaId" value={idea.id} />
              <input type="hidden" name="step" value={step} />
              <ShownQuestionsInput questions={questions} />
              {step === "especificas" && (
                <>
                  <label htmlFor="initiativeType">Tipo de iniciativa</label>
                  <p className="field-hint">
                    Identificamos pelo seu texto. Se não for isso, escolha outro: as perguntas abaixo mudam conforme o tipo.
                  </p>
                  <select id="initiativeType" name="initiativeType" defaultValue={plan.initiativeType}>
                    {INITIATIVE_TYPE_KEYS.map((key) => (
                      <option key={key} value={key}>{INITIATIVE_TYPES[key].label}</option>
                    ))}
                  </select>
                </>
              )}
              {questions.length ? (
                <PlanQuestionFields questions={questions} plan={plan} proposal={proposal} highlightUnanswered={Boolean(query.novas)} />
              ) : (
                <p className="empty-inline">Nenhuma pergunta nesta etapa para este tipo de iniciativa.</p>
              )}
              {/* "Continuar" vem primeiro no código para ser o botão do Enter; a ordem visual é invertida no CSS. */}
              <div className="form-actions form-actions-reverse">
                <SubmitButton name="intent" value="next" className="button button-primary" pendingLabel="Salvando…">
                  {stepIndex < PLAN_STEPS.length - 1 ? "Salvar e continuar" : "Salvar e ver o plano"} <span aria-hidden="true">→</span>
                </SubmitButton>
                <SubmitButton name="intent" value="exit" className="button button-secondary" pendingLabel="Salvando…">
                  Salvar e ir para a revisão
                </SubmitButton>
              </div>
            </form>
          </section>

          <aside className="info-card">
            <span className="info-icon" aria-hidden="true">✎</span>
            <h2>Sua ideia</h2>
            <p className="preserve-lines">{idea.original_description}</p>
            <p className="small-copy">Não é preciso saber tudo. Respostas em branco ficam como pendências para a gestão avaliar.</p>
          </aside>
        </div>
      )}
    </AppShell>
  );
}
