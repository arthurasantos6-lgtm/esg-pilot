import "server-only";
import { isWebResearchConfigured } from "@/lib/ai/service";
import { isAiAvailable } from "@/lib/idea-ai";

export type ResearchProvider = "tavily" | "anthropic";

/**
 * Busca gratuita da Tavily é o padrão (não depende de IA). A pesquisa com IA da
 * Anthropic só é usada se não houver chave da Tavily e a IA externa estiver ativa.
 */
export function researchProvider(): ResearchProvider | null {
  if (process.env.TAVILY_API_KEY?.trim()) return "tavily";
  if (isAiAvailable() && isWebResearchConfigured()) return "anthropic";
  return null;
}
