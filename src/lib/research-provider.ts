import "server-only";
import { randomUUID } from "node:crypto";
import { acceptReferences } from "@/lib/ai/market-research";
import { generateMarketResearch, isWebResearchConfigured, logAiFailure } from "@/lib/ai/service";
import { buildExecutionPlan } from "@/lib/idea-execution-plan";
import { isAiAvailable } from "@/lib/idea-ai";
import { answerText, INITIATIVE_TYPES, planAnswersText, type IdeaPlan, type PlanReference, type ResearchData } from "@/lib/idea-planning";
import { buildSearchQueries, resultsToReferences, runWebSearch, searchGaps } from "@/lib/web-search";

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

type IdeaInput = { id: string; title: string; original_description: string | null };
type Outcome = { references: PlanReference[]; gaps: string[]; notes: string | null; model: string };

/** Busca gratuita (Tavily, sem IA): consultas por regras a partir da ideia e trechos das próprias páginas. */
async function searchWithTavily(idea: IdeaInput, plan: IdeaPlan): Promise<Outcome> {
  const materials = answerText(plan, "g-materiais");
  const queries = buildSearchQueries(plan.initiativeType, idea.title, materials ? [materials.slice(0, 80)] : []);
  const { batches, failed } = await runWebSearch(process.env.TAVILY_API_KEY?.trim() ?? "", queries);
  const references = resultsToReferences(batches, new Date(), randomUUID);
  const notes = [`Consultas: ${queries.map((item) => `"${item.query}"`).join(", ")}.`, failed ? `${failed} de ${queries.length} consultas falharam.` : null]
    .filter(Boolean)
    .join(" ");
  return { references, gaps: searchGaps(references), notes, model: "Tavily (busca, sem IA)" };
}

/** Pesquisa com IA (Anthropic), usada só sem chave da Tavily e com a IA externa ativa. */
async function searchWithAi(idea: IdeaInput, plan: IdeaPlan): Promise<Outcome> {
  const executionPlan = buildExecutionPlan({ title: idea.title, originalText: idea.original_description ?? "", plan });
  const result = await generateMarketResearch({
    title: idea.title,
    description: idea.original_description ?? "",
    initiativeType: INITIATIVE_TYPES[plan.initiativeType].label,
    details: planAnswersText(plan),
    resources: executionPlan.resources.flatMap(({ label, items }) => items.map((item) => `${label}: ${item.text}`)).slice(0, 25),
  });
  const { references } = acceptReferences(result.output, result.sources, new Date(), randomUUID);
  return { references, gaps: result.output.gaps, notes: result.output.notes, model: result.usage.model };
}

/**
 * Executa a pesquisa e devolve o plano com as novas referências somadas às
 * anteriores (nada é apagado). Lança erro se o serviço falhar.
 */
export async function researchIdea(idea: IdeaInput, plan: IdeaPlan, provider: ResearchProvider): Promise<IdeaPlan> {
  const previous = plan.research ?? { runs: 0, lastRunAt: null, model: null, references: [], gaps: [], notes: null };
  const result = provider === "tavily" ? await searchWithTavily(idea, plan) : await searchWithAi(idea, plan);
  const normalize = (url: string) => url.replace(/\/+$/, "").toLowerCase();
  const known = new Set(previous.references.map((item) => normalize(item.url)));
  const fresh = result.references.filter((item) => !known.has(normalize(item.url)));
  const now = new Date().toISOString();
  const research: ResearchData = {
    runs: previous.runs + 1,
    lastRunAt: now,
    model: result.model,
    references: [...previous.references, ...fresh].slice(0, 80),
    gaps: result.gaps.slice(0, 15).map((gap) => gap.slice(0, 500)),
    notes: result.notes?.slice(0, 2000) ?? null,
  };
  return { ...plan, research, updatedAt: now };
}

/**
 * Pesquisa automática (envio da ideia ou primeira abertura pela gestão): só com
 * a busca gratuita, e sem interromper o fluxo se o serviço falhar.
 */
export async function researchAutomatically(idea: IdeaInput, plan: IdeaPlan): Promise<IdeaPlan> {
  if (plan.research || researchProvider() !== "tavily") return plan;
  try {
    return await researchIdea(idea, plan, "tavily");
  } catch (error) {
    logAiFailure("pesquisa automática", idea.id, error);
    return plan;
  }
}
