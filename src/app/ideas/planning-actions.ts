"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { acceptReferences } from "@/lib/ai/market-research";
import { generateMarketResearch, isWebResearchConfigured, logAiFailure, toUserFacingAiError } from "@/lib/ai/service";
import { requireCompanyContext } from "@/lib/auth";
import { buildExecutionPlan } from "@/lib/idea-execution-plan";
import { isAiAvailable } from "@/lib/idea-ai";
import {
  applyAnswerForm,
  detectInitiativeType,
  emptyPlan,
  INITIATIVE_TYPES,
  INITIATIVE_TYPE_KEYS,
  MAX_RESEARCH_RUNS,
  parseNumber,
  parsePlan,
  planAnswersText,
  PLAN_STEPS,
  REFERENCE_CATEGORIES,
  syncProposalFromPlan,
  VALUE_ORIGINS,
  visibleQuestions,
  type BenefitLine,
  type FinanceInput,
  type IdeaPlan,
  type InitiativeType,
  type MoneyLine,
  type PlanStepKey,
  type ReferenceCategory,
  type ValueOrigin,
} from "@/lib/idea-planning";
import { parseStoredProposal, type StoredProposal } from "@/lib/idea-proposal";
import type { Json } from "@/lib/supabase/database.types";

const idSchema = z.guid();
type CompanyContext = Awaited<ReturnType<typeof requireCompanyContext>>;

const enc = encodeURIComponent;

function blankProposal(title: string): StoredProposal {
  return {
    title,
    problem: null,
    solution: null,
    context: null,
    beneficiaries: null,
    esgDimensions: null,
    expectedBenefits: null,
    indicators: null,
    resourcesAndRisks: null,
    nextSteps: null,
    source: "manual",
    updatedAt: new Date().toISOString(),
  };
}

const IDEA_COLUMNS = "id, title, original_description, status, author_id, structured_proposal" as const;

async function loadIdea(context: CompanyContext, ideaId: string) {
  const { data } = await context.supabase
    .from("ideas")
    .select(IDEA_COLUMNS)
    .eq("id", ideaId)
    .eq("organization_id", context.membership.organization_id)
    .maybeSingle();
  return data;
}

type LoadedIdea = NonNullable<Awaited<ReturnType<typeof loadIdea>>>;

function currentPlan(idea: LoadedIdea) {
  const proposal = parseStoredProposal(idea.structured_proposal) ?? blankProposal(idea.title);
  const plan = parsePlan(proposal.plan) ?? emptyPlan(detectInitiativeType(idea.original_description ?? idea.title));
  return { proposal, plan };
}

async function savePlan(context: CompanyContext, idea: LoadedIdea, proposal: StoredProposal, plan: IdeaPlan, requireDraft: boolean) {
  let query = context.supabase
    .from("ideas")
    .update({ structured_proposal: { ...proposal, plan } as unknown as Json })
    .eq("id", idea.id)
    .eq("organization_id", context.membership.organization_id);
  if (requireDraft) query = query.eq("status", "draft");
  const { error } = await query;
  return !error;
}

const readType = (value: FormDataEntryValue | null): InitiativeType | null =>
  INITIATIVE_TYPE_KEYS.includes(String(value) as InitiativeType) ? (String(value) as InitiativeType) : null;

/** Ids das perguntas que passaram a aparecer depois de salvar (perguntas condicionais). */
function newlyVisible(plan: IdeaPlan, shown: string[], step?: PlanStepKey) {
  return visibleQuestions(plan, step).filter((question) => !shown.includes(question.id) && !plan.answers[question.id]);
}

// ---------------------------------------------------------------------------
// Colaborador: questionário por etapas (somente no próprio rascunho)

export async function savePlanStep(formData: FormData) {
  const ideaId = idSchema.safeParse(formData.get("ideaId"));
  if (!ideaId.success) redirect("/ideas/new");
  const step = PLAN_STEPS.find(({ key }) => key === formData.get("step"))?.key ?? "ideia";
  const intent = String(formData.get("intent") ?? "next");
  const base = `/ideas/${ideaId.data}/planejamento`;
  const stepUrl = `${base}?etapa=${step}`;

  const context = await requireCompanyContext();
  const idea = await loadIdea(context, ideaId.data);
  if (!idea || idea.author_id !== context.user.id) redirect("/ideas/new?error=Rascunho%20n%C3%A3o%20encontrado.");
  if (idea.status !== "draft") redirect(`/ideas/${idea.id}`);

  const current = currentPlan(idea);
  let plan = current.plan;
  const chosenType = readType(formData.get("initiativeType"));
  const typeChanged = Boolean(chosenType && chosenType !== plan.initiativeType);
  if (chosenType) plan = { ...plan, initiativeType: chosenType };

  const applied = applyAnswerForm(plan, formData, "collaborator");
  if (applied.errors.length) redirect(`${stepUrl}&error=${enc(applied.errors[0])}`);
  const synced = syncProposalFromPlan(current.proposal, applied.plan);
  const saved = await savePlan(context, idea, { ...synced.proposal, updatedAt: new Date().toISOString() }, synced.plan, true);
  if (!saved) redirect(`${stepUrl}&error=${enc("Não foi possível salvar as respostas. Tente novamente.")}`);

  revalidatePath(base);
  if (intent === "exit") redirect(`/ideas/${idea.id}/review?saved=1`);
  const shown = String(formData.get("shown") ?? "").split(",").filter(Boolean);
  if (typeChanged || newlyVisible(synced.plan, shown, step).length) redirect(`${stepUrl}&novas=1#perguntas`);
  const index = PLAN_STEPS.findIndex(({ key }) => key === step);
  const next = PLAN_STEPS[index + 1]?.key;
  redirect(next ? `${base}?etapa=${next}` : `${base}?etapa=plano`);
}

// ---------------------------------------------------------------------------
// Gestão: complementar respostas, pesquisa e análise financeira

async function requireManagedIdea(formData: FormData, anchor: string) {
  const ideaId = idSchema.safeParse(formData.get("ideaId"));
  if (!ideaId.success) redirect("/ideas?error=Ideia%20inv%C3%A1lida.");
  const url = `/ideas/${ideaId.data}/viabilidade`;
  const context = await requireCompanyContext();
  if (context.membership.role !== "company_admin") redirect(`/ideas/${ideaId.data}?error=${enc("Apenas a gestão pode editar a análise de viabilidade.")}`);
  const idea = await loadIdea(context, ideaId.data);
  if (!idea || idea.status === "draft") redirect("/ideas?error=Ideia%20n%C3%A3o%20encontrada.");
  const fail = (message: string): never => redirect(`${url}?error=${enc(message)}#${anchor}`);
  return { context, idea, url, fail, ...currentPlan(idea) };
}

export async function saveManagerAnswers(formData: FormData) {
  const { context, idea, url, fail, proposal, plan: loaded } = await requireManagedIdea(formData, "coleta");
  const chosenType = readType(formData.get("initiativeType"));
  const plan = chosenType ? { ...loaded, initiativeType: chosenType } : loaded;
  const applied = applyAnswerForm(plan, formData, "management");
  if (applied.errors.length) fail(applied.errors[0]);
  // A proposta escrita pelo colaborador não é alterada: só o planejamento.
  if (!(await savePlan(context, idea, proposal, applied.plan, false))) fail("Não foi possível salvar as respostas.");
  revalidatePath(url);
  const shown = String(formData.get("shown") ?? "").split(",").filter(Boolean);
  const more = chosenType !== null && chosenType !== loaded.initiativeType ? true : newlyVisible(applied.plan, shown).length > 0;
  redirect(`${url}?salvo=coleta${more ? "&novas=1" : ""}#coleta`);
}

const ROWS = { investment: 6, recurring: 4, benefits: 4 } as const;
const originOf = (value: FormDataEntryValue | null): ValueOrigin =>
  (Object.keys(VALUE_ORIGINS) as ValueOrigin[]).includes(String(value) as ValueOrigin) ? (String(value) as ValueOrigin) : "estimado";

function readAmount(formData: FormData, name: string, label: string, errors: string[]) {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return null;
  const value = parseNumber(raw);
  if (value === null || value < 0) {
    errors.push(`Valor inválido em "${label}". Use apenas números, como 1.500,00.`);
    return null;
  }
  return value;
}

/** Lê a análise financeira do formulário; linhas totalmente vazias são ignoradas. */
function readFinanceForm(formData: FormData, plan: IdeaPlan): { finance: FinanceInput; errors: string[] } {
  const errors: string[] = [];
  const references = new Set((plan.research?.references ?? []).map((reference) => reference.id));
  const text = (name: string, max = 200) => String(formData.get(name) ?? "").trim().slice(0, max);
  const ref = (name: string) => (references.has(text(name)) ? text(name) : null);

  const moneyLines = (prefix: "inv" | "rec", count: number, fallback: string): MoneyLine[] =>
    Array.from({ length: count }, (_, index) => index).flatMap((index) => {
      const label = text(`${prefix}-label-${index}`) || `${fallback} ${index + 1}`;
      const amount = readAmount(formData, `${prefix}-amount-${index}`, label, errors);
      const origin = originOf(formData.get(`${prefix}-origin-${index}`));
      const hasLabel = Boolean(text(`${prefix}-label-${index}`));
      if (amount === null && !(hasLabel && origin === "cotacao")) return [];
      return [{ label, amount, origin, referenceId: ref(`${prefix}-ref-${index}`) }];
    });

  const benefits: BenefitLine[] = Array.from({ length: ROWS.benefits }, (_, index) => index).flatMap((index) => {
    const label = text(`ben-label-${index}`) || `Benefício ${index + 1}`;
    const conservative = readAmount(formData, `ben-c-${index}`, label, errors);
    const likely = readAmount(formData, `ben-l-${index}`, label, errors);
    const optimistic = readAmount(formData, `ben-o-${index}`, label, errors);
    if (conservative === null && likely === null && optimistic === null) return [];
    return [{ label, conservative, likely, optimistic, origin: originOf(formData.get(`ben-origin-${index}`)), referenceId: ref(`ben-ref-${index}`), basis: text(`ben-basis-${index}`, 500) || null }];
  });

  const period = readAmount(formData, "periodYears", "Período de análise", errors);
  if (period !== null && (period <= 0 || period > 50)) errors.push("O período de análise deve ficar entre 1 e 50 anos.");

  return {
    finance: {
      periodYears: period,
      investment: moneyLines("inv", ROWS.investment, "Investimento"),
      recurring: moneyLines("rec", ROWS.recurring, "Custo recorrente"),
      benefits,
      nonFinancialBenefits: text("nonFinancialBenefits", 3000) || null,
      assumptions: text("assumptions", 3000) || null,
      updatedAt: new Date().toISOString(),
    },
    errors,
  };
}

export async function saveFinance(formData: FormData) {
  const { context, idea, url, fail, proposal, plan } = await requireManagedIdea(formData, "financeiro");
  const { finance, errors } = readFinanceForm(formData, plan);
  if (errors.length) fail(errors[0]);
  if (!(await savePlan(context, idea, proposal, { ...plan, finance, updatedAt: new Date().toISOString() }, false))) {
    fail("Não foi possível salvar a análise financeira.");
  }
  revalidatePath(url);
  redirect(`${url}?salvo=financeiro#financeiro`);
}

export async function runMarketResearch(formData: FormData) {
  const { context, idea, url, fail, proposal, plan } = await requireManagedIdea(formData, "pesquisa");
  if (!isAiAvailable() || !isWebResearchConfigured()) {
    fail("A pesquisa automática não está disponível nesta plataforma. Registre as referências manualmente.");
  }
  const research = plan.research ?? { runs: 0, lastRunAt: null, model: null, references: [], gaps: [], notes: null };
  if (research.runs >= MAX_RESEARCH_RUNS) fail(`Esta ideia atingiu o limite de ${MAX_RESEARCH_RUNS} pesquisas automáticas.`);

  const executionPlan = buildExecutionPlan({ title: idea.title, originalText: idea.original_description ?? "", plan });
  let result: Awaited<ReturnType<typeof generateMarketResearch>>;
  try {
    result = await generateMarketResearch({
      title: idea.title,
      description: idea.original_description ?? "",
      initiativeType: INITIATIVE_TYPES[plan.initiativeType].label,
      details: planAnswersText(plan),
      resources: executionPlan.resources.flatMap(({ label, items }) => items.map((item) => `${label}: ${item.text}`)).slice(0, 25),
    });
  } catch (error) {
    logAiFailure("pesquisa de mercado", idea.id, error);
    return fail(toUserFacingAiError(error));
  }
  const now = new Date();
  const { references } = acceptReferences(result.output, result.sources, now, randomUUID);
  // Referências anteriores são mantidas; só entram as novas que ainda não existem.
  const known = new Set(research.references.map((item) => `${item.url}|${item.category}|${item.value ?? ""}`));
  const merged = [...research.references, ...references.filter((item) => !known.has(`${item.url}|${item.category}|${item.value ?? ""}`))];
  const updated: IdeaPlan = {
    ...plan,
    research: {
      runs: research.runs + 1,
      lastRunAt: now.toISOString(),
      model: result.usage.model,
      references: merged.slice(0, 80),
      gaps: result.output.gaps.slice(0, 15).map((gap) => gap.slice(0, 500)),
      notes: result.output.notes?.slice(0, 2000) ?? null,
    },
    updatedAt: now.toISOString(),
  };
  if (!(await savePlan(context, idea, proposal, updated, false))) fail("A pesquisa foi feita, mas não foi possível salvá-la.");
  revalidatePath(url);
  redirect(`${url}?salvo=pesquisa&novas_refs=${references.length}#pesquisa`);
}

const referenceSchema = z.object({
  title: z.string().trim().min(3, "Informe o título da fonte.").max(300),
  url: z
    .string()
    .trim()
    .max(1000)
    .refine((value) => /^https?:\/\/[^\s]+\.[^\s]+/i.test(value), "Informe um link válido, começando com http:// ou https://."),
  category: z.enum(Object.keys(REFERENCE_CATEGORIES) as [ReferenceCategory, ...ReferenceCategory[]]),
  value: z.string().trim().max(500),
  summary: z.string().trim().max(1000),
  publishedAt: z.string().trim().max(40),
  consultedAt: z.preprocess((value) => (value ? value : undefined), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de consulta inválida.").optional()),
});

export async function addReference(formData: FormData) {
  const { context, idea, url, fail, proposal, plan } = await requireManagedIdea(formData, "pesquisa");
  const parsed = referenceSchema.safeParse({
    title: formData.get("title") ?? "",
    url: formData.get("url") ?? "",
    category: formData.get("category") ?? "",
    value: formData.get("value") ?? "",
    summary: formData.get("summary") ?? "",
    publishedAt: formData.get("publishedAt") ?? "",
    consultedAt: formData.get("consultedAt") ?? "",
  });
  if (!parsed.success) fail(parsed.error.issues[0].message);
  const data = parsed.data!;
  const research = plan.research ?? { runs: 0, lastRunAt: null, model: null, references: [], gaps: [], notes: null };
  const reference = {
    id: randomUUID(),
    title: data.title,
    url: data.url,
    category: data.category,
    summary: data.summary || null,
    value: data.value || null,
    publishedAt: data.publishedAt || null,
    consultedAt: data.consultedAt ? new Date(`${data.consultedAt}T12:00:00Z`).toISOString() : new Date().toISOString(),
    origin: "management" as const,
  };
  const updated = { ...plan, research: { ...research, references: [...research.references, reference].slice(0, 80) }, updatedAt: new Date().toISOString() };
  if (!(await savePlan(context, idea, proposal, updated, false))) fail("Não foi possível salvar a referência.");
  revalidatePath(url);
  redirect(`${url}?salvo=referencia#pesquisa`);
}

export async function removeReference(formData: FormData) {
  const { context, idea, url, fail, proposal, plan } = await requireManagedIdea(formData, "pesquisa");
  const referenceId = String(formData.get("referenceId") ?? "");
  const finance = plan.finance;
  const inUse = finance && [...finance.investment, ...finance.recurring, ...finance.benefits].some((line) => line.referenceId === referenceId);
  if (inUse) fail("Esta referência está sendo usada na análise financeira. Remova o vínculo antes de excluí-la.");
  if (!plan.research) redirect(`${url}#pesquisa`);
  const updated = {
    ...plan,
    research: { ...plan.research, references: plan.research.references.filter((reference) => reference.id !== referenceId) },
    updatedAt: new Date().toISOString(),
  };
  if (!(await savePlan(context, idea, proposal, updated, false))) fail("Não foi possível remover a referência.");
  revalidatePath(url);
  redirect(`${url}#pesquisa`);
}
