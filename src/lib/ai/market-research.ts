import { z } from "zod";
import { REFERENCE_CATEGORIES, type PlanReference, type ReferenceCategory } from "../idea-planning.ts";

/**
 * Pesquisa de mercado para a análise de viabilidade: prompts, esquema e a
 * conferência das fontes. Só entram referências cujo link a busca realmente
 * retornou; valores são trechos extraídos por IA e precisam de conferência.
 */

export const RESEARCH_SYSTEM_PROMPT = `Você apoia a análise de viabilidade de iniciativas ESG de empresas brasileiras.
Pesquise na internet referências reais para estimar investimento, custos e retorno da iniciativa descrita.

Busque, quando fizer sentido para a iniciativa: preços de equipamentos e materiais, custos de instalação e de mão de obra,
custos de manutenção, serviços especializados, fornecedores e soluções disponíveis no Brasil, projetos semelhantes já
implementados, estudos de caso, economia financeira potencial e indicadores de retorno (ROI, payback).

Priorize fontes confiáveis: fabricantes, fornecedores, empresas especializadas, estudos técnicos, publicações acadêmicas,
órgãos governamentais, relatórios de sustentabilidade e estudos de caso de empresas. Prefira fontes brasileiras e recentes.

Regras:
- Nunca invente preços, fornecedores, indicadores ou estudos. Use apenas o que encontrar nas páginas pesquisadas.
- Para cada valor, diga de qual página ele veio e a que se refere (unidade, quantidade, ano, região), quando a página informar.
- Diga claramente quando não encontrar dados suficientes e quais informações adicionais seriam necessárias.
- Escreva em português do Brasil.`;

export const RESEARCH_STRUCTURE_PROMPT = `Você organiza o resultado de uma pesquisa de mercado em referências estruturadas.
Use somente as informações do texto da pesquisa e somente os links da lista de páginas fornecida.
Não acrescente fatos, valores ou links que não estejam ali. Se um valor não estiver explícito, use null.
Escreva em português do Brasil.`;

const categoryKeys = Object.keys(REFERENCE_CATEGORIES) as [ReferenceCategory, ...ReferenceCategory[]];

export const researchOutputSchema = z.object({
  references: z.array(
    z.object({
      url: z.string().describe("Link exatamente como aparece na lista de páginas pesquisadas."),
      title: z.string(),
      category: z.enum(categoryKeys),
      summary: z.string().describe("O que a página informa de relevante para esta iniciativa, em até duas frases."),
      value: z
        .string()
        .nullable()
        .describe("Valor encontrado na página, com unidade e contexto (ex.: 'R$ 89 por sensor, preço de varejo'). null se não houver."),
    }),
  ),
  gaps: z.array(z.string()).describe("Informações que faltaram para estimar custos e retorno com segurança."),
  notes: z.string().nullable().describe("Ressalvas gerais sobre a qualidade ou a atualidade das fontes."),
});

export type ResearchInput = {
  title: string;
  description: string;
  initiativeType: string;
  details: string;
  resources: string[];
};

export function buildResearchRequest(input: ResearchInput) {
  return [
    `Iniciativa: ${input.title}`,
    `Tipo: ${input.initiativeType}`,
    `Descrição do colaborador:\n${input.description}`,
    input.details && `Informações levantadas:\n${input.details}`,
    input.resources.length > 0 && `Recursos previstos no plano:\n- ${input.resources.join("\n- ")}`,
    "Pesquise referências de investimento, custos e retorno para esta iniciativa no Brasil.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildStructureRequest(researchText: string, sources: { url: string; title: string }[]) {
  return [
    "Texto da pesquisa:",
    researchText || "(a pesquisa não retornou texto)",
    "Páginas pesquisadas (use somente estes links):",
    sources.map((source) => `- ${source.url} | ${source.title}`).join("\n") || "(nenhuma)",
  ].join("\n\n");
}

const normalizeUrl = (url: string) => url.trim().replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();

/**
 * Mantém só as referências com link retornado pela busca e usa a data da página
 * informada pela própria busca (nunca uma data escrita pela IA).
 */
export function acceptReferences(
  output: z.infer<typeof researchOutputSchema>,
  sources: { url: string; title: string; pageAge: string | null }[],
  now: Date,
  makeId: () => string,
): { references: PlanReference[]; discarded: number } {
  const byUrl = new Map(sources.map((source) => [normalizeUrl(source.url), source]));
  const seen = new Set<string>();
  const references: PlanReference[] = [];
  let discarded = 0;
  for (const item of output.references) {
    const source = byUrl.get(normalizeUrl(item.url));
    if (!source || !/^https?:\/\//i.test(source.url)) {
      discarded += 1;
      continue;
    }
    const key = `${normalizeUrl(source.url)}|${item.category}|${item.value ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    references.push({
      id: makeId(),
      title: (item.title || source.title).slice(0, 300),
      url: source.url,
      category: item.category,
      summary: item.summary.slice(0, 1000) || null,
      value: item.value?.slice(0, 500) ?? null,
      publishedAt: source.pageAge,
      consultedAt: now.toISOString(),
      origin: "web_search",
    });
  }
  return { references, discarded };
}
