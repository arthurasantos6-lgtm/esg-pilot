import "server-only";
import type { z } from "zod";
import { anthropicChat, anthropicJson } from "@/lib/ai/anthropic";
import { resolveAiConfig, type AiConfig } from "@/lib/ai/config";
import { AiUnavailableError } from "@/lib/ai/errors";
import { openAiCompatibleChat, openAiCompatibleJson } from "@/lib/ai/openai-compatible";
import {
  buildCopilotMessages,
  buildEvaluationMessages,
  buildStructureMessages,
  COPILOT_SYSTEM_PROMPT,
  EVALUATION_SYSTEM_PROMPT,
  STRUCTURE_SYSTEM_PROMPT,
  type ChatTurn,
  type CriteriaPromptInput,
  type EvaluationPromptInput,
  type IdeaPromptInput,
  type KnowledgePromptItem,
} from "@/lib/ai/prompts";
import { evaluationResultSchema, proposalDraftSchema } from "@/lib/ai/schemas";
import type { ChatRequest, Effort } from "@/lib/ai/types";

export { AiUnavailableError, logAiFailure, toUserFacingAiError } from "@/lib/ai/errors";

/** Configuração lida do ambiente a cada chamada (sem cache de segredos em módulo). */
export function getAiConfig() {
  return resolveAiConfig(process.env);
}

export function isAiConfigured() {
  return getAiConfig() !== null;
}

function requireConfig(): AiConfig {
  const config = getAiConfig();
  if (!config) throw new AiUnavailableError("O copiloto de IA não está configurado nesta plataforma.");
  return config;
}

async function chat(request: ChatRequest, effort: Effort) {
  const config = requireConfig();
  const result =
    config.kind === "anthropic" ? await anthropicChat(config, request, effort) : await openAiCompatibleChat(config, request);
  if (!result.text) throw new AiUnavailableError("O copiloto não retornou uma resposta. Tente novamente.");
  return result;
}

async function json<T extends z.ZodType>(request: ChatRequest, schema: T, effort: Effort) {
  const config = requireConfig();
  return config.kind === "anthropic"
    ? anthropicJson(config, request, schema, effort)
    : openAiCompatibleJson(config, request, schema);
}

export async function generateCopilotReply(
  idea: IdeaPromptInput,
  criteria: CriteriaPromptInput,
  knowledge: KnowledgePromptItem[],
  history: ChatTurn[],
) {
  const { text, usage } = await chat(
    { system: COPILOT_SYSTEM_PROMPT, messages: buildCopilotMessages(idea, criteria, knowledge, history) },
    "low",
  );
  return { text: text.slice(0, 8000), usage };
}

export async function generateProposalDraft(idea: IdeaPromptInput, history: ChatTurn[]) {
  const { data, usage } = await json(
    { system: STRUCTURE_SYSTEM_PROMPT, messages: buildStructureMessages(idea, history) },
    proposalDraftSchema,
    "medium",
  );
  return { draft: data, usage };
}

export async function generateEvaluation(
  input: EvaluationPromptInput,
  criteria: CriteriaPromptInput,
  knowledge: KnowledgePromptItem[],
) {
  const { data, usage } = await json(
    { system: EVALUATION_SYSTEM_PROMPT, messages: buildEvaluationMessages(input, criteria, knowledge) },
    evaluationResultSchema,
    "high",
  );
  return { result: data, usage };
}

/** Chamada mínima para o administrador verificar a integração (sem dados de clientes). */
export async function testAiConnection() {
  const startedAt = Date.now();
  const { usage } = await chat(
    {
      system: "Você verifica se uma integração está funcionando.",
      messages: [{ role: "user", content: "Responda apenas com a palavra: ok" }],
    },
    "low",
  );
  return { model: usage.model, latencyMs: Date.now() - startedAt };
}
