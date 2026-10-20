import type Anthropic from "@anthropic-ai/sdk";

export type AiUsage = { model: string; inputTokens: number; outputTokens: number };

export type Effort = "low" | "medium" | "high";

/** Requisição neutra de provedor: os builders de prompt produzem só conteúdo em texto. */
export type ChatRequest = {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
};
