import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
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

/** Modelo padrão; pode ser trocado por `ANTHROPIC_MODEL` sem alterar código. */
export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

// Em caso de recusa por classificador de segurança, a própria API repete a
// requisição em um modelo alternativo (fallback do servidor).
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function isAiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Erro já traduzido para exibição; nunca contém o conteúdo da ideia. */
export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

let client: Anthropic | null = null;

function getClient() {
  if (!isAiConfigured()) {
    throw new AiUnavailableError("O copiloto de IA não está configurado nesta plataforma.");
  }
  client ??= new Anthropic({ timeout: 120_000, maxRetries: 2 });
  return client;
}

export type AiUsage = { model: string; inputTokens: number; outputTokens: number };

function usageOf(message: Anthropic.Beta.BetaMessage): AiUsage {
  return {
    model: message.model,
    inputTokens:
      message.usage.input_tokens +
      (message.usage.cache_read_input_tokens ?? 0) +
      (message.usage.cache_creation_input_tokens ?? 0),
    outputTokens: message.usage.output_tokens,
  };
}

function assertUsable(message: Anthropic.Beta.BetaMessage) {
  if (message.stop_reason === "refusal") {
    throw new AiUnavailableError("O copiloto não conseguiu processar este conteúdo. Revise o texto e tente novamente.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new AiUnavailableError("A resposta do copiloto ficou incompleta. Tente novamente.");
  }
}

/** Converte erros do SDK em mensagens seguras para o usuário. */
export function toUserFacingAiError(error: unknown): string {
  if (error instanceof AiUnavailableError) return error.message;
  if (error instanceof Anthropic.RateLimitError) return "O copiloto está com muitas solicitações agora. Aguarde um pouco e tente novamente.";
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return "A integração de IA está com problema de credencial. Avise o administrador da plataforma.";
  }
  if (error instanceof Anthropic.APIConnectionError) return "Não foi possível conectar ao serviço de IA. Tente novamente em instantes.";
  if (error instanceof Anthropic.APIError) return "O serviço de IA está indisponível no momento. Tente novamente mais tarde.";
  return "Ocorreu um erro inesperado ao processar com a IA.";
}

/** Registra a falha sem o conteúdo da ideia ou da conversa. */
export function logAiFailure(operation: string, ideaId: string, error: unknown) {
  const detail = error instanceof Anthropic.APIError ? `status=${error.status}` : error instanceof Error ? error.name : "unknown";
  console.error(`[ai] ${operation} falhou para a ideia ${ideaId}: ${detail}`);
}

export async function generateCopilotReply(
  idea: IdeaPromptInput,
  criteria: CriteriaPromptInput,
  knowledge: KnowledgePromptItem[],
  history: ChatTurn[],
) {
  const message = await getClient().beta.messages.create({
    model: AI_MODEL,
    max_tokens: 8000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "low" },
    cache_control: { type: "ephemeral" },
    system: COPILOT_SYSTEM_PROMPT,
    messages: buildCopilotMessages(idea, criteria, knowledge, history),
  });
  assertUsable(message);

  const text = message.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!text) throw new AiUnavailableError("O copiloto não retornou uma resposta. Tente novamente.");

  return { text: text.slice(0, 8000), usage: usageOf(message) };
}

export async function generateProposalDraft(idea: IdeaPromptInput, history: ChatTurn[]) {
  const message = await getClient().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "medium", format: zodOutputFormat(proposalDraftSchema) },
    system: STRUCTURE_SYSTEM_PROMPT,
    messages: buildStructureMessages(idea, history),
  });
  assertUsable(message);
  if (!message.parsed_output) throw new AiUnavailableError("Não foi possível organizar a proposta. Tente novamente.");
  return { draft: message.parsed_output, usage: usageOf(message) };
}

export async function generateEvaluation(
  input: EvaluationPromptInput,
  criteria: CriteriaPromptInput,
  knowledge: KnowledgePromptItem[],
) {
  const message = await getClient().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "high", format: zodOutputFormat(evaluationResultSchema) },
    system: EVALUATION_SYSTEM_PROMPT,
    messages: buildEvaluationMessages(input, criteria, knowledge),
  });
  assertUsable(message);
  if (!message.parsed_output) throw new AiUnavailableError("A avaliação da IA retornou em formato inválido.");
  return { result: message.parsed_output, usage: usageOf(message) };
}
