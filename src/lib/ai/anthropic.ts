import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { AiConfig } from "@/lib/ai/config";
import { AiUnavailableError } from "@/lib/ai/errors";
import type { AiUsage, ChatRequest, Effort } from "@/lib/ai/types";

// Em caso de recusa por classificador de segurança, a própria API repete a
// requisição em um modelo alternativo (fallback do servidor).
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const clients = new Map<string, Anthropic>();

function getClient(config: AiConfig) {
  const key = config.apiKey ?? "";
  let client = clients.get(key);
  if (!client) {
    client = new Anthropic({ apiKey: config.apiKey ?? undefined, timeout: 120_000, maxRetries: 2 });
    clients.set(key, client);
  }
  return client;
}

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

export async function anthropicChat(config: AiConfig, request: ChatRequest, effort: Effort) {
  const message = await getClient(config).beta.messages.create({
    model: config.model,
    max_tokens: 8000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort },
    cache_control: { type: "ephemeral" },
    system: request.system,
    messages: request.messages,
  });
  assertUsable(message);
  const text = message.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return { text, usage: usageOf(message) };
}

export async function anthropicJson<T extends z.ZodType>(config: AiConfig, request: ChatRequest, schema: T, effort: Effort) {
  const message = await getClient(config).beta.messages.parse({
    model: config.model,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort, format: zodOutputFormat(schema) },
    system: request.system,
    messages: request.messages,
  });
  assertUsable(message);
  if (!message.parsed_output) throw new AiUnavailableError("A IA retornou uma resposta em formato inválido. Tente novamente.");
  return { data: message.parsed_output as z.infer<T>, usage: usageOf(message) };
}
