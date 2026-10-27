"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  AiUnavailableError,
  generateCopilotReply,
  generateProposalDraft,
  logAiFailure,
  toUserFacingAiError,
} from "@/lib/ai/service";
import { isEvaluationStale } from "@/lib/ai/evaluation-status";
import type { ChatTurn } from "@/lib/ai/prompts";
import { assertModuleEnabled, requireCompanyContext } from "@/lib/auth";
import { analyzeIdeaWithCriteria } from "@/lib/esg-analysis";
import {
  isAiAvailable,
  loadActiveCriteria,
  loadActiveKnowledge,
  MAX_IDEAS_PER_USER_PER_DAY,
  MAX_USER_MESSAGES_PER_IDEA,
  scheduleIdeaEvaluation,
  toIdeaPromptInput,
} from "@/lib/idea-ai";
import { CANNOT_CREATE_IDEAS_MESSAGE, canCreateIdeas } from "@/lib/idea-permissions";
import { columnText, parseStoredProposal, PROPOSAL_FIELDS, readProposalForm } from "@/lib/idea-proposal";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const idSchema = z.string().uuid();

const startIdeaSchema = z.object({
  title: z.string().trim().min(3, "Dê um título com pelo menos 3 caracteres.").max(120, "O título pode ter até 120 caracteres."),
  description: z
    .string()
    .trim()
    .min(10, "Conte um pouco mais sobre a ideia (mínimo 10 caracteres).")
    .max(8000, "A descrição pode ter até 8.000 caracteres."),
  area: z.string().trim().max(100).optional(),
  intent: z.enum(["copilot", "review"]),
});

type CompanyContext = Awaited<ReturnType<typeof requireCompanyContext>>;

/** Carrega um rascunho do próprio usuário; qualquer outro caso vira "não encontrado". */
async function loadOwnDraft(context: CompanyContext, ideaId: string) {
  const { data: idea } = await context.supabase
    .from("ideas")
    .select("id, title, original_description, problem, solution, area, status, author_id, structured_proposal")
    .eq("id", ideaId)
    .eq("organization_id", context.membership.organization_id)
    .eq("author_id", context.user.id)
    .eq("status", "draft")
    .maybeSingle();
  return idea;
}

async function loadHistory(context: CompanyContext, ideaId: string): Promise<ChatTurn[]> {
  const { data } = await context.supabase
    .from("idea_copilot_messages")
    .select("role, content")
    .eq("idea_id", ideaId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

/** Gera e grava a resposta do copiloto (gravação apenas pelo servidor). */
async function replyAsCopilot(
  context: CompanyContext,
  idea: NonNullable<Awaited<ReturnType<typeof loadOwnDraft>>>,
  history: ChatTurn[],
) {
  const service = createServiceClient();
  if (!service) throw new AiUnavailableError("O copiloto de IA não está configurado nesta plataforma.");

  const [criteria, knowledge] = await Promise.all([
    loadActiveCriteria(context.supabase),
    loadActiveKnowledge(context.supabase),
  ]);
  const { text, usage } = await generateCopilotReply(toIdeaPromptInput(idea), criteria, knowledge, history);
  const { error } = await service.from("idea_copilot_messages").insert({
    organization_id: context.membership.organization_id,
    idea_id: idea.id,
    role: "assistant",
    content: text,
    model: usage.model,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
  });
  if (error) throw new Error("copilot_message_not_saved");
}

export async function startIdea(formData: FormData) {
  const parsed = startIdeaSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    area: formData.get("area") || undefined,
    intent: formData.get("intent"),
  });
  if (!parsed.success) {
    redirect(`/ideas/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const context = await requireCompanyContext();
  assertModuleEnabled(context.organization.enabled_modules, "ideas", "Ideias");
  if (!canCreateIdeas(context.membership)) {
    redirect(`/ideas?error=${encodeURIComponent(CANNOT_CREATE_IDEAS_MESSAGE)}`);
  }

  const { count: recentIdeas } = await context.supabase
    .from("ideas")
    .select("id", { count: "exact", head: true })
    .eq("author_id", context.user.id)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((recentIdeas ?? 0) >= MAX_IDEAS_PER_USER_PER_DAY) {
    redirect(
      `/ideas/new?error=${encodeURIComponent(
        `Você atingiu o limite de ${MAX_IDEAS_PER_USER_PER_DAY} novas ideias em 24 horas. Continue amanhã ou revise seus rascunhos.`,
      )}`,
    );
  }

  const { data: idea, error } = await context.supabase
    .from("ideas")
    .insert({
      organization_id: context.membership.organization_id,
      author_id: context.user.id,
      title: parsed.data.title,
      original_description: parsed.data.description,
      area: parsed.data.area || null,
      status: "draft",
    })
    .select("id, title, original_description, problem, solution, area, status, author_id, structured_proposal")
    .single();

  if (error || !idea) {
    redirect(`/ideas/new?error=${encodeURIComponent("Não foi possível salvar a ideia. Tente novamente.")}`);
  }

  revalidatePath("/ideas");

  if (parsed.data.intent === "review" || !isAiAvailable()) {
    redirect(`/ideas/${idea.id}/review`);
  }

  let copilotError: string | null = null;
  try {
    await replyAsCopilot(context, idea, []);
  } catch (aiError) {
    logAiFailure("abertura do copiloto", idea.id, aiError);
    copilotError = toUserFacingAiError(aiError);
  }
  redirect(`/ideas/${idea.id}/copilot${copilotError ? `?error=${encodeURIComponent(copilotError)}` : ""}`);
}

export type CopilotFormState = { error: string | null; sentAt: number | null };

/**
 * Envia uma mensagem ao copiloto. Mensagem vazia com a última fala sendo do
 * colaborador (ou conversa vazia) apenas pede uma nova resposta — usado no
 * "tentar novamente" após falha da IA. A mensagem do colaborador é gravada
 * antes da chamada à IA, para não se perder se ela falhar.
 */
export async function sendCopilotMessage(_previous: CopilotFormState, formData: FormData): Promise<CopilotFormState> {
  const ideaId = idSchema.safeParse(formData.get("ideaId"));
  const message = String(formData.get("message") ?? "").trim();
  if (!ideaId.success) return { error: "Ideia inválida.", sentAt: null };
  if (message.length > 2000) return { error: "A mensagem pode ter até 2.000 caracteres.", sentAt: null };
  if (!isAiAvailable()) return { error: "O copiloto de IA não está configurado nesta plataforma.", sentAt: null };

  const context = await requireCompanyContext();
  const idea = await loadOwnDraft(context, ideaId.data);
  if (!idea) return { error: "Esta ideia não está mais disponível para conversa.", sentAt: null };

  let history = await loadHistory(context, idea.id);
  const lastTurn = history.at(-1);

  if (message) {
    const userMessages = history.filter((turn) => turn.role === "user").length;
    if (userMessages >= MAX_USER_MESSAGES_PER_IDEA) {
      return {
        error: `Esta conversa atingiu o limite de ${MAX_USER_MESSAGES_PER_IDEA} mensagens. Organize a proposta para seguir.`,
        sentAt: null,
      };
    }
    const { error } = await context.supabase.from("idea_copilot_messages").insert({
      organization_id: context.membership.organization_id,
      idea_id: idea.id,
      role: "user",
      content: message,
    });
    if (error) return { error: "Não foi possível registrar sua mensagem. Tente novamente.", sentAt: null };
    history = [...history, { role: "user", content: message }];
  } else if (lastTurn && lastTurn.role === "assistant") {
    return { error: "Escreva uma mensagem antes de enviar.", sentAt: null };
  }

  try {
    await replyAsCopilot(context, idea, history);
  } catch (aiError) {
    logAiFailure("resposta do copiloto", idea.id, aiError);
    revalidatePath(`/ideas/${idea.id}/copilot`);
    return { error: `${toUserFacingAiError(aiError)} Sua mensagem foi salva.`, sentAt: null };
  }

  revalidatePath(`/ideas/${idea.id}/copilot`);
  return { error: null, sentAt: Date.now() };
}

export async function organizeProposal(formData: FormData) {
  const ideaId = idSchema.safeParse(formData.get("ideaId"));
  if (!ideaId.success) redirect("/ideas?error=Ideia%20inv%C3%A1lida.");

  const context = await requireCompanyContext();
  const idea = await loadOwnDraft(context, ideaId.data);
  if (!idea) redirect("/ideas?error=Rascunho%20n%C3%A3o%20encontrado.");

  const copilotUrl = `/ideas/${idea.id}/copilot`;
  if (!isAiAvailable()) redirect(`/ideas/${idea.id}/review`);

  let proposal;
  try {
    const history = await loadHistory(context, idea.id);
    const { draft } = await generateProposalDraft(toIdeaPromptInput(idea), history);
    proposal = { ...draft, title: draft.title.trim().slice(0, 120) || idea.title, source: "copilot" as const, updatedAt: new Date().toISOString() };
  } catch (aiError) {
    logAiFailure("organização da proposta", idea.id, aiError);
    redirect(`${copilotUrl}?error=${encodeURIComponent(toUserFacingAiError(aiError))}`);
  }

  const { error } = await context.supabase
    .from("ideas")
    .update({ structured_proposal: proposal as unknown as Json })
    .eq("id", idea.id)
    .eq("status", "draft");
  if (error) redirect(`${copilotUrl}?error=${encodeURIComponent("Não foi possível salvar a proposta organizada.")}`);

  revalidatePath(`/ideas/${idea.id}/review`);
  redirect(`/ideas/${idea.id}/review?organized=1`);
}

export async function saveProposal(formData: FormData) {
  const ideaId = idSchema.safeParse(formData.get("ideaId"));
  if (!ideaId.success) redirect("/ideas?error=Ideia%20inv%C3%A1lida.");
  const intent = formData.get("intent") === "submit" ? "submit" : "save";
  const reviewUrl = `/ideas/${ideaId.data}/review`;

  const context = await requireCompanyContext();
  assertModuleEnabled(context.organization.enabled_modules, "ideas", "Ideias");
  const idea = await loadOwnDraft(context, ideaId.data);
  if (!idea) redirect("/ideas?error=Rascunho%20n%C3%A3o%20encontrado%20ou%20j%C3%A1%20enviado.");

  const previous = parseStoredProposal(idea.structured_proposal);
  const proposal = readProposalForm(formData, previous?.source ?? "manual");
  if (proposal.title.length < 3) {
    redirect(`${reviewUrl}?error=${encodeURIComponent("Dê um título com pelo menos 3 caracteres.")}`);
  }
  const area = String(formData.get("area") ?? "").trim().slice(0, 100) || null;

  if (intent === "save") {
    const { error } = await context.supabase
      .from("ideas")
      .update({ title: proposal.title, area, structured_proposal: proposal as unknown as Json })
      .eq("id", idea.id)
      .eq("status", "draft");
    if (error) redirect(`${reviewUrl}?error=${encodeURIComponent("Não foi possível salvar o rascunho.")}`);
    revalidatePath(reviewUrl);
    redirect(`${reviewUrl}?saved=1`);
  }

  if (formData.get("confirmReview") !== "on") {
    redirect(`${reviewUrl}?error=${encodeURIComponent("Marque a confirmação de que revisou a proposta antes de enviar.")}`);
  }

  // Triagem por termos (determinística) sobre o texto original e a proposta revisada.
  const criteria = await loadActiveCriteria(context.supabase);
  const triageText = [
    idea.original_description ?? "",
    ...PROPOSAL_FIELDS.map(({ key }) => proposal[key] ?? ""),
  ].join(" ");
  const analysis = analyzeIdeaWithCriteria(
    triageText,
    criteria.criteria,
    criteria.id ? { criteriaVersionId: criteria.id, criteriaVersionLabel: criteria.label } : undefined,
  );

  // O filtro por status impede envio duplicado (duplo clique ou duas abas).
  const { data: submitted, error } = await context.supabase
    .from("ideas")
    .update({
      title: proposal.title,
      area,
      structured_proposal: proposal as unknown as Json,
      problem: columnText(proposal.problem),
      solution: columnText(proposal.solution),
      analysis,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", idea.id)
    .eq("status", "draft")
    .select("id");

  if (error || !submitted?.length) {
    redirect(`${reviewUrl}?error=${encodeURIComponent("Não foi possível enviar a ideia. Seu rascunho foi mantido; tente novamente.")}`);
  }

  await scheduleIdeaEvaluation(idea.id, context.membership.organization_id);

  revalidatePath("/dashboard");
  revalidatePath("/ideas");
  redirect(`/ideas/${idea.id}?submitted=1`);
}

/** Reprocessa a avaliação da IA (autor após falha; gestão a qualquer momento). */
export async function retryIdeaEvaluation(formData: FormData) {
  const ideaId = idSchema.safeParse(formData.get("ideaId"));
  if (!ideaId.success) redirect("/ideas?error=Ideia%20inv%C3%A1lida.");
  const detailUrl = `/ideas/${ideaId.data}`;

  const context = await requireCompanyContext();
  const { data: idea } = await context.supabase
    .from("ideas")
    .select("id, author_id, status")
    .eq("id", ideaId.data)
    .eq("organization_id", context.membership.organization_id)
    .maybeSingle();

  if (!idea || idea.status === "draft") redirect("/ideas?error=Ideia%20n%C3%A3o%20encontrada.");
  if (idea.author_id !== context.user.id && context.membership.role !== "company_admin") {
    redirect(`${detailUrl}?error=${encodeURIComponent("Você não tem permissão para reprocessar esta avaliação.")}`);
  }

  const { data: latest } = await context.supabase
    .from("idea_evaluations")
    .select("status, created_at")
    .eq("idea_id", idea.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // A gestão pode pedir nova avaliação a qualquer momento (ex.: após complementação);
  // o autor, apenas quando a anterior falhou.
  const inProgress = latest?.status === "pending" && !isEvaluationStale(latest);
  const authorBlocked = context.membership.role !== "company_admin" && latest?.status === "completed";
  if (inProgress || authorBlocked) {
    redirect(`${detailUrl}?error=${encodeURIComponent("Já existe uma avaliação concluída ou em andamento.")}`);
  }

  const scheduled = await scheduleIdeaEvaluation(idea.id, context.membership.organization_id);
  if (!scheduled) {
    redirect(`${detailUrl}?error=${encodeURIComponent("A avaliação por IA não está disponível nesta plataforma.")}`);
  }

  revalidatePath(detailUrl);
  redirect(detailUrl);
}

const decisionErrorMessages: Record<string, string> = {
  access_denied: "Apenas a gestão da empresa pode registrar decisões.",
  idea_not_submitted: "Rascunhos não podem receber decisões.",
  invalid_transition: "Esta mudança de situação não é permitida a partir da situação atual.",
  justification_required: "Registre uma justificativa com pelo menos 10 caracteres.",
  author_message_required: "Ao solicitar complementação, escreva a mensagem que o colaborador verá.",
  invalid_responsible: "O responsável precisa ser um usuário ativo da sua empresa.",
  no_pending_request: "Não há pedido de complementação pendente para esta ideia.",
  content_required: "Escreva sua resposta antes de enviar.",
};

function databaseErrorMessage(error: { message: string }, fallback: string) {
  const known = Object.keys(decisionErrorMessages).find((code) => error.message.includes(code));
  return known ? decisionErrorMessages[known] : fallback;
}

const optionalEnum = <T extends [string, ...string[]]>(values: T) =>
  z.preprocess((value) => (value === "" || value === null ? undefined : value), z.enum(values).optional());

const decisionSchema = z.object({
  ideaId: z.string().uuid(),
  toStatus: z.string().min(1),
  justification: z.string().trim().min(10, "Registre uma justificativa com pelo menos 10 caracteres.").max(2000),
  authorMessage: z.string().trim().max(4000).optional(),
  responsibleId: z.preprocess((value) => (value === "" ? undefined : value), z.string().uuid().optional()),
  followUpDate: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.").optional(),
  ),
  priority: optionalEnum(["baixa", "media", "alta"]),
  humanPotential: optionalEnum(["baixo", "médio", "alto"]),
  humanDimensions: z.array(z.enum(["E", "S", "G"])),
  aiAgreement: optionalEnum(["agrees", "partially", "disagrees"]),
});

/** Decisão humana da gestão; a validação de fluxo e o histórico ficam no banco (record_idea_decision). */
export async function recordIdeaDecision(formData: FormData) {
  const rawId = String(formData.get("ideaId") ?? "");
  const detailUrl = idSchema.safeParse(rawId).success ? `/ideas/${rawId}` : "/ideas";
  const parsed = decisionSchema.safeParse({
    ideaId: rawId,
    toStatus: formData.get("toStatus"),
    justification: formData.get("justification"),
    authorMessage: formData.get("authorMessage") || undefined,
    responsibleId: formData.get("responsibleId") ?? "",
    followUpDate: formData.get("followUpDate") ?? "",
    priority: formData.get("priority") ?? "",
    humanPotential: formData.get("humanPotential") ?? "",
    humanDimensions: formData.getAll("humanDimensions"),
    aiAgreement: formData.get("aiAgreement") ?? "",
  });
  if (!parsed.success) {
    redirect(`${detailUrl}?error=${encodeURIComponent(parsed.error.issues[0].message)}#decision`);
  }

  const context = await requireCompanyContext();
  if (context.membership.role !== "company_admin") {
    redirect(`${detailUrl}?error=${encodeURIComponent(decisionErrorMessages.access_denied)}`);
  }

  const { error } = await context.supabase.rpc("record_idea_decision", {
    p_idea_id: parsed.data.ideaId,
    p_to_status: parsed.data.toStatus,
    p_justification: parsed.data.justification,
    p_author_message: parsed.data.authorMessage ?? null,
    p_responsible_id: parsed.data.responsibleId ?? null,
    p_follow_up_date: parsed.data.followUpDate ?? null,
    p_priority: parsed.data.priority ?? null,
    p_human_potential: parsed.data.humanPotential ?? null,
    p_human_dimensions: parsed.data.humanDimensions.length ? parsed.data.humanDimensions : null,
    p_ai_agreement: parsed.data.aiAgreement ?? null,
  });

  if (error) {
    redirect(`${detailUrl}?error=${encodeURIComponent(databaseErrorMessage(error, "Não foi possível registrar a decisão."))}#decision`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/ideas");
  revalidatePath(detailUrl);
  redirect(`${detailUrl}?decided=1`);
}

/** Resposta do colaborador a um pedido de complementação; dispara nova avaliação da IA. */
export async function respondToInfoRequest(formData: FormData) {
  const ideaId = idSchema.safeParse(formData.get("ideaId"));
  if (!ideaId.success) redirect("/ideas?error=Ideia%20inv%C3%A1lida.");
  const detailUrl = `/ideas/${ideaId.data}`;
  const content = String(formData.get("content") ?? "").trim();
  if (content.length < 2 || content.length > 4000) {
    redirect(`${detailUrl}?error=${encodeURIComponent("Escreva uma resposta de até 4.000 caracteres.")}#feedback`);
  }

  const context = await requireCompanyContext();
  const { error } = await context.supabase.rpc("respond_to_info_request", { p_idea_id: ideaId.data, p_content: content });
  if (error) {
    redirect(`${detailUrl}?error=${encodeURIComponent(databaseErrorMessage(error, "Não foi possível enviar sua resposta."))}#feedback`);
  }

  await scheduleIdeaEvaluation(ideaId.data, context.membership.organization_id);

  revalidatePath("/ideas");
  revalidatePath(detailUrl);
  redirect(`${detailUrl}?responded=1`);
}
