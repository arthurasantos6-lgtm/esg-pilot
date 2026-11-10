"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logAiFailure, toUserFacingAiError } from "@/lib/ai/service";
import { requireCompanyContext } from "@/lib/auth";
import { DEFAULT_PERIOD_YEARS } from "@/lib/feasibility";
import {
  applyAnswerForm,
  detectInitiativeType,
  emptyPlan,
  INITIATIVE_TYPE_KEYS,
  MAX_RESEARCH_RUNS,
  parseNumber,
  parsePlan,
  PLAN_STEPS,
  REFERENCE_CATEGORIES,
  syncProposalFromPlan,
  visibleQuestions,
  type IdeaPlan,
  type InitiativeType,
  type PlanStepKey,
  type ReferenceCategory,
} from "@/lib/idea-planning";
import { blankProposal, parseStoredProposal, type StoredProposal } from "@/lib/idea-proposal";
import { researchIdea, researchProvider } from "@/lib/research-provider";
import { SearchUnavailableError } from "@/lib/web-search";
import type { Json } from "@/lib/supabase/database.types";

const idSchema = z.guid();
type CompanyContext = Awaited<ReturnType<typeof requireCompanyContext>>;

const enc = encodeURIComponent;

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

/** Itens da pesquisa marcados pela gestão, quantidade, período e economia informada. */
export async function saveSelection(formData: FormData) {
  const { context, idea, url, fail, proposal, plan } = await requireManagedIdea(formData, "calculo");
  const candidateIds = String(formData.get("candidates") ?? "").split(",").filter(Boolean);
  const selected = formData.getAll("selected").map(String).filter((id) => candidateIds.includes(id));
  const number = (name: string, label: string, min: number, max: number) => {
    const raw = String(formData.get(name) ?? "").trim();
    if (!raw) return null;
    const value = parseNumber(raw);
    if (value === null || value < min || value > max) return fail(`Valor inválido em "${label}".`);
    return value;
  };
  const quantity = number("quantity", "Quantidade", 1, 1_000_000);
  const periodYears = number("periodYears", "Período", 1, 30) ?? DEFAULT_PERIOD_YEARS;
  const benefitOverride = number("benefitOverride", "Economia anual", 0, 1_000_000_000);
  const reset = formData.get("intent") === "reset";
  const updated: IdeaPlan = {
    ...plan,
    selection: reset ? null : { selected, quantity, periodYears, benefitOverride, updatedAt: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
  };
  if (!(await savePlan(context, idea, proposal, updated, false))) fail("Não foi possível salvar o cálculo.");
  revalidatePath(url);
  redirect(`${url}?salvo=${reset ? "automatico" : "calculo"}#calculo`);
}

/** Atualiza a pesquisa a pedido da gestão (a primeira é automática). */
export async function runMarketResearch(formData: FormData) {
  const { context, idea, url, fail, proposal, plan } = await requireManagedIdea(formData, "fontes");
  const provider = researchProvider();
  if (!provider) return fail("A pesquisa automática não está disponível nesta plataforma. Registre as referências manualmente.");
  if ((plan.research?.runs ?? 0) >= MAX_RESEARCH_RUNS) fail(`Esta ideia atingiu o limite de ${MAX_RESEARCH_RUNS} pesquisas automáticas.`);
  const before = plan.research?.references.length ?? 0;
  let updated: IdeaPlan;
  try {
    updated = await researchIdea(idea, plan, provider);
  } catch (error) {
    logAiFailure("pesquisa de mercado", idea.id, error);
    return fail(error instanceof SearchUnavailableError ? error.message : toUserFacingAiError(error));
  }
  if (!(await savePlan(context, idea, proposal, updated, false))) fail("A pesquisa foi feita, mas não foi possível salvá-la.");
  revalidatePath(url);
  redirect(`${url}?salvo=pesquisa&novas_refs=${(updated.research?.references.length ?? 0) - before}#fontes`);
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
  const { context, idea, url, fail, proposal, plan } = await requireManagedIdea(formData, "fontes");
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
  redirect(`${url}?salvo=referencia#fontes`);
}

export async function removeReference(formData: FormData) {
  const { context, idea, url, fail, proposal, plan } = await requireManagedIdea(formData, "fontes");
  const referenceId = String(formData.get("referenceId") ?? "");
  if (!plan.research) redirect(`${url}#fontes`);
  // Os preços desta fonte saem também da seleção do cálculo.
  const selection = plan.selection
    ? { ...plan.selection, selected: plan.selection.selected?.filter((id) => !id.startsWith(`${referenceId}:`)) ?? null }
    : plan.selection;
  const updated = {
    ...plan,
    selection,
    research: { ...plan.research, references: plan.research.references.filter((reference) => reference.id !== referenceId) },
    updatedAt: new Date().toISOString(),
  };
  if (!(await savePlan(context, idea, proposal, updated, false))) fail("Não foi possível remover a referência.");
  revalidatePath(url);
  redirect(`${url}#fontes`);
}
