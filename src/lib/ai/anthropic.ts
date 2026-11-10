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

export type WebSource = { url: string; title: string; pageAge: string | null };

const MAX_SEARCH_CONTINUATIONS = 3;

/**
 * Pesquisa na internet com a ferramenta de busca do servidor da Anthropic. Devolve
 * o texto da pesquisa e as páginas que a busca realmente retornou (com a data da
 * página, quando a busca informa), para que só fontes reais sejam aceitas depois.
 */
export async function anthropicWebResearch(config: AiConfig, request: ChatRequest, effort: Effort, maxSearches: number) {
  const client = getClient(config);
  const messages = [...request.messages];
  const sources = new Map<string, WebSource>();
  const texts: string[] = [];
  let usage: AiUsage = { model: config.model, inputTokens: 0, outputTokens: 0 };

  for (let attempt = 0; attempt <= MAX_SEARCH_CONTINUATIONS; attempt += 1) {
    const message = await client.beta.messages.create({
      model: config.model,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort },
      system: request.system,
      messages,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: maxSearches, user_location: { type: "approximate", country: "BR" } }],
    });
    const current = usageOf(message);
    usage = { model: current.model, inputTokens: usage.inputTokens + current.inputTokens, outputTokens: usage.outputTokens + current.outputTokens };
    if (message.stop_reason === "refusal") {
      throw new AiUnavailableError("A pesquisa não pôde ser feita para este conteúdo. Revise o texto da ideia e tente novamente.");
    }
    for (const block of message.content) {
      // Erros da busca chegam como objeto, não lista: são ignorados aqui.
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const result of block.content) sources.set(result.url, { url: result.url, title: result.title, pageAge: result.page_age ?? null });
      }
      if (block.type === "text") {
        texts.push(block.text);
        for (const citation of block.citations ?? []) {
          if (citation.type === "web_search_result_location" && !sources.has(citation.url)) {
            sources.set(citation.url, { url: citation.url, title: citation.title ?? citation.url, pageAge: null });
          }
        }
      }
    }
    // A busca no servidor pode pausar o turno; reenviar a resposta faz a pesquisa continuar.
    if (message.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: message.content });
  }

  return { text: texts.join("\n").trim(), sources: [...sources.values()], usage };
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
