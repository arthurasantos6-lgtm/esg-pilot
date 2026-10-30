import "server-only";
import type { z } from "zod";
import type { AiConfig } from "@/lib/ai/config";
import { AiUnavailableError, ProviderHttpError } from "@/lib/ai/errors";
import { describeSchemaIssues, extractJsonObject, jsonInstructions, providerErrorDetail } from "@/lib/ai/json-output";
import { retryOnTemporaryFailure } from "@/lib/ai/retry";
import type { AiUsage, ChatRequest } from "@/lib/ai/types";

/**
 * Provedores com API compatível com OpenAI (Ollama local, Google Gemini,
 * Groq e outros), chamados com `fetch` — sem SDK adicional.
 */

type OpenAiMessage = { role: "system" | "user" | "assistant"; content: string };

type CompletionResponse = {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

const MAX_CHAT_TOKENS = 1500;
const MAX_JSON_TOKENS = 4000;

function toOpenAiMessages(request: ChatRequest, extraSystem?: string): OpenAiMessage[] {
  const system = extraSystem ? `${request.system}\n\n${extraSystem}` : request.system;
  return [
    { role: "system", content: system },
    ...request.messages.map((message) => ({
      role: message.role,
      content:
        typeof message.content === "string"
          ? message.content
          : message.content
              .map((block) => (block.type === "text" ? block.text : ""))
              .join("\n"),
    })),
  ];
}

async function complete(config: AiConfig, messages: OpenAiMessage[], jsonMode: boolean) {
  const send = (withFormat: boolean) =>
    fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.3,
        // Provedores gratuitos limitam tokens por minuto, contando o que é pedido aqui.
        max_tokens: jsonMode ? MAX_JSON_TOKENS : MAX_CHAT_TOKENS,
        ...(withFormat ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(180_000),
      cache: "no-store",
    });

  let response = await retryOnTemporaryFailure(() => send(jsonMode));
  // Alguns provedores/modelos não aceitam response_format; repete sem ele.
  if (jsonMode && response.status === 400) response = await retryOnTemporaryFailure(() => send(false));
  if (!response.ok) {
    const errorBody: unknown = await response.json().catch(() => null);
    throw new ProviderHttpError(response.status, providerErrorDetail(errorBody, config.apiKey));
  }

  const body = (await response.json()) as CompletionResponse;
  const choice = body.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new AiUnavailableError("A resposta da IA ficou incompleta. Tente novamente.");
  }
  const text = choice?.message?.content?.trim() ?? "";
  const usage: AiUsage = {
    model: body.model ?? config.model,
    inputTokens: body.usage?.prompt_tokens ?? 0,
    outputTokens: body.usage?.completion_tokens ?? 0,
  };
  return { text, usage };
}

export async function openAiCompatibleChat(config: AiConfig, request: ChatRequest) {
  return complete(config, toOpenAiMessages(request), false);
}

/** Pede JSON, valida com Zod e faz uma nova tentativa com o motivo da falha. */
export async function openAiCompatibleJson<T extends z.ZodType>(config: AiConfig, request: ChatRequest, schema: T) {
  const messages = toOpenAiMessages(request, jsonInstructions(schema));
  const first = await complete(config, messages, true);
  const firstParsed = schema.safeParse(extractJsonObject(first.text));
  if (firstParsed.success) return { data: firstParsed.data as z.infer<T>, usage: first.usage };

  const retryMessages: OpenAiMessage[] = [
    ...messages,
    { role: "assistant", content: first.text.slice(0, 8000) },
    {
      role: "user",
      content: `A resposta anterior não seguiu o JSON Schema (${describeSchemaIssues(firstParsed.error)}). Responda novamente apenas com o objeto JSON válido.`,
    },
  ];
  const second = await complete(config, retryMessages, true);
  const secondParsed = schema.safeParse(extractJsonObject(second.text));
  if (!secondParsed.success) {
    throw new AiUnavailableError("A IA retornou uma resposta em formato inválido. Tente novamente.");
  }
  return {
    data: secondParsed.data as z.infer<T>,
    usage: {
      model: second.usage.model,
      inputTokens: first.usage.inputTokens + second.usage.inputTokens,
      outputTokens: first.usage.outputTokens + second.usage.outputTokens,
    },
  };
}
