import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateEvaluation,
  isAiConfigured,
  logAiFailure,
  toUserFacingAiError,
} from "@/lib/ai/claude";
import type { CriteriaPromptInput, IdeaPromptInput, KnowledgePromptItem } from "@/lib/ai/prompts";
import { DEFAULT_CRITERIA, parseEsgCriteria } from "@/lib/esg-analysis";
import { PROPOSAL_FIELDS, parseStoredProposal } from "@/lib/idea-proposal";
import { createServiceClient, type ServiceClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";

type AnyClient = SupabaseClient<Database>;

/** Limite de mensagens do colaborador por ideia, para conter uso excessivo da IA. */
export const MAX_USER_MESSAGES_PER_IDEA = 30;

/** Os recursos de IA exigem a chave do provedor e a chave service role do Supabase. */
export function isAiAvailable() {
  return isAiConfigured() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export type ActiveCriteria = CriteriaPromptInput & { id: string | null };

/** Critérios da versão ativa (ou os padrão do código, se não houver versão válida). */
export async function loadActiveCriteria(supabase: AnyClient): Promise<ActiveCriteria> {
  const { data } = await supabase
    .from("esg_criteria_versions")
    .select("id, label, dimensions, potential_thresholds")
    .eq("status", "active")
    .maybeSingle();

  const criteria = data ? parseEsgCriteria(data.dimensions, data.potential_thresholds) : null;
  if (data && criteria) return { id: data.id, label: data.label, criteria };
  return { id: null, label: "Critérios padrão embutidos no código", criteria: DEFAULT_CRITERIA };
}

export async function loadActiveKnowledge(supabase: AnyClient): Promise<KnowledgePromptItem[]> {
  const { data } = await supabase
    .from("esg_knowledge_items")
    .select("title, description, category, source")
    .eq("status", "active")
    .order("category")
    .order("title");
  return data ?? [];
}

type IdeaForPrompt = {
  title: string;
  original_description: string | null;
  problem: string | null;
  solution: string | null;
  area: string | null;
};

/** Ideias anteriores à Fase 3 não têm texto original; usa problema + solução. */
export function toIdeaPromptInput(idea: IdeaForPrompt): IdeaPromptInput {
  return {
    title: idea.title,
    area: idea.area,
    originalDescription:
      idea.original_description ??
      [idea.problem && `Problema: ${idea.problem}`, idea.solution && `Solução: ${idea.solution}`].filter(Boolean).join("\n\n"),
  };
}

function proposalToText(value: Json | null): string | null {
  const proposal = parseStoredProposal(value);
  if (!proposal) return null;
  return [
    `Título: ${proposal.title}`,
    ...PROPOSAL_FIELDS.map(({ key, label }) => `${label}: ${proposal[key] ?? "não informado"}`),
  ].join("\n");
}

function keywordTriageOf(analysis: Json | null) {
  const record = analysis && typeof analysis === "object" && !Array.isArray(analysis) ? analysis : null;
  const potential = typeof record?.potential === "string" ? record.potential : "não calculado";
  const dimensions = Array.isArray(record?.dimensions)
    ? record.dimensions.flatMap((item) =>
        item && typeof item === "object" && !Array.isArray(item) && typeof item.dimension === "string" ? [item.dimension] : [],
      )
    : [];
  return { potential, dimensions };
}

async function runEvaluation(service: ServiceClient, evaluationId: string, ideaId: string, organizationId: string) {
  try {
    const { data: idea, error } = await service
      .from("ideas")
      .select("title, original_description, problem, solution, area, structured_proposal, analysis")
      .eq("id", ideaId)
      .eq("organization_id", organizationId)
      .single();
    if (error || !idea) throw new Error("idea_not_found");

    const [criteria, knowledge] = await Promise.all([loadActiveCriteria(service), loadActiveKnowledge(service)]);
    const { result, usage } = await generateEvaluation(
      {
        idea: toIdeaPromptInput(idea),
        proposalText: proposalToText(idea.structured_proposal),
        keywordTriage: keywordTriageOf(idea.analysis),
      },
      criteria,
      knowledge,
    );

    await service
      .from("idea_evaluations")
      .update({
        status: "completed",
        result: result as unknown as Json,
        model: usage.model,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        criteria_version_id: criteria.id,
        criteria_version_label: criteria.label,
        completed_at: new Date().toISOString(),
      })
      .eq("id", evaluationId);
  } catch (error) {
    logAiFailure("avaliação", ideaId, error);
    await service
      .from("idea_evaluations")
      .update({ status: "failed", error_message: toUserFacingAiError(error), completed_at: new Date().toISOString() })
      .eq("id", evaluationId);
  }
}

/**
 * Registra uma avaliação pendente e agenda o processamento para depois da
 * resposta HTTP. O chamador deve ter verificado antes que o usuário pode ver
 * a ideia. Falhas ficam registradas como "failed" e podem ser reprocessadas;
 * a situação da ideia nunca é alterada aqui.
 */
export async function scheduleIdeaEvaluation(ideaId: string, organizationId: string): Promise<boolean> {
  const service = createServiceClient();
  if (!service || !isAiConfigured()) return false;

  const { data, error } = await service
    .from("idea_evaluations")
    .insert({ idea_id: ideaId, organization_id: organizationId, status: "pending" })
    .select("id")
    .single();
  if (error || !data) {
    console.error(`[ai] não foi possível registrar a avaliação da ideia ${ideaId}`);
    return false;
  }

  after(() => runEvaluation(service, data.id, ideaId, organizationId));
  return true;
}
