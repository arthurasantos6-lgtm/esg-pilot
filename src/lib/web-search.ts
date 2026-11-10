import { INITIATIVE_TYPES, type InitiativeType, type PlanReference, type ReferenceCategory } from "./idea-planning.ts";

/**
 * Pesquisa de mercado gratuita, sem IA: consultas montadas por regras a partir do
 * tipo de iniciativa, busca na API da Tavily (plano gratuito) e extração de
 * valores em reais por expressão regular nos trechos retornados. Nada é
 * resumido ou interpretado: o trecho é o da própria página, a conferir no link.
 */

export const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const RESULTS_PER_QUERY = 4;
const REQUEST_TIMEOUT_MS = 12_000;

/** Termo principal de busca por tipo; "geral" usa o título da ideia. */
const SEARCH_TERMS: Record<InitiativeType, string | null> = {
  iluminacao: "sensor de presença para iluminação",
  solar: "sistema de energia solar fotovoltaica para empresa",
  energia: "eficiência energética em equipamentos industriais",
  agua_reuso: "sistema de reaproveitamento de água",
  agua_consumo: "redução do consumo de água em empresas",
  residuos: "gestão de resíduos e reciclagem em empresas",
  emissoes: "redução de emissões e consumo de combustível em empresas",
  seguranca: "segurança do trabalho medidas de controle",
  capacitacao: "treinamento corporativo",
  social: "projeto social corporativo",
  governanca: "implantação de controles internos e compliance",
  geral: null,
};

export type SearchQuery = { query: string; category: ReferenceCategory };

const TARIFF_QUERIES: Partial<Record<InitiativeType, string>> = {
  iluminacao: "tarifa de energia elétrica comercial R$ por kWh",
  energia: "tarifa de energia elétrica comercial R$ por kWh",
  solar: "tarifa de energia elétrica comercial R$ por kWh",
  agua_reuso: "tarifa de água comercial R$ por m³",
  agua_consumo: "tarifa de água comercial R$ por m³",
};

/** Até 8 consultas por pesquisa (1 crédito cada no plano gratuito), a partir da ideia e do tipo. */
export function buildSearchQueries(type: InitiativeType, title: string, extraTerms: string[] = []): SearchQuery[] {
  const term = SEARCH_TERMS[type] ?? title.trim().slice(0, 100);
  const pillar = INITIATIVE_TYPES[type].pillar;
  const queries: SearchQuery[] = [
    { query: `preço ${term}`, category: "preco_equipamento" },
    { query: `custo de instalação ${term}`, category: "instalacao" },
    { query: `custo de manutenção ${term}`, category: "manutencao" },
    { query: `${term} economia estudo de caso empresa`, category: "caso" },
    { query: `fornecedores ${term} Brasil`, category: "fornecedor" },
  ];
  // Retorno financeiro só faz sentido quando há economia mensurável (pilar ambiental).
  if (pillar === "E") queries.push({ query: `${term} payback retorno do investimento`, category: "roi" });
  const tariff = TARIFF_QUERIES[type];
  if (tariff) queries.push({ query: tariff, category: "economia" });
  // A própria ideia, nas palavras de quem enviou (quando o tipo é genérico, já é o termo principal).
  if (SEARCH_TERMS[type]) queries.push({ query: `${title.trim().slice(0, 90)} custo`, category: "preco_equipamento" });
  // Itens que a pessoa disse que seriam comprados (ex.: "reservatório de 5 m³").
  for (const extra of extraTerms.slice(0, 1)) queries.push({ query: `preço ${extra}`.slice(0, 200), category: "preco_material" });
  return queries.slice(0, 8);
}

/** Valores em reais escritos no trecho ("R$ 89,90", "R$ 12 mil", "R$1.200"). */
export function extractBrlValues(text: string): string[] {
  const pattern = /R\$\s?\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?(?:\s?(?:milhões|milhão|mil))?|R\$\s?\d+(?:,\d{1,2})?(?:\s?(?:milhões|milhão|mil))?/gi;
  const found = text.match(pattern) ?? [];
  return [...new Set(found.map((value) => value.replace(/\s+/g, " ").trim()))].slice(0, 4);
}

export type TavilyResult = { title?: string; url?: string; content?: string; published_date?: string | null };

/** Converte os resultados em referências; sem link http(s) válido, o resultado é descartado. */
export function resultsToReferences(
  batches: { category: ReferenceCategory; results: TavilyResult[] }[],
  now: Date,
  makeId: () => string,
): PlanReference[] {
  const seen = new Set<string>();
  const references: PlanReference[] = [];
  for (const { category, results } of batches) {
    for (const result of results) {
      const url = result.url?.trim() ?? "";
      if (!/^https?:\/\//i.test(url)) continue;
      const key = url.replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const snippet = (result.content ?? "").replace(/\s+/g, " ").trim();
      const values = extractBrlValues(snippet);
      references.push({
        id: makeId(),
        title: (result.title?.trim() || url).slice(0, 300),
        url,
        category,
        summary: snippet ? snippet.slice(0, 600) : null,
        value: values.length ? `${values.join("; ")} (no trecho da página)` : null,
        publishedAt: result.published_date?.trim() || null,
        consultedAt: now.toISOString(),
        origin: "search_api",
      });
    }
  }
  return references;
}

/** Pendências objetivas a partir do que a busca trouxe. */
export function searchGaps(references: PlanReference[]): string[] {
  const gaps: string[] = [];
  if (!references.length) return ["A busca não retornou páginas para esta iniciativa. Registre fontes manualmente ou solicite cotações."];
  if (!references.some((reference) => reference.value)) gaps.push("Nenhum valor em reais apareceu nos trechos encontrados: solicitar cotação a fornecedores.");
  if (!references.some((reference) => reference.category === "caso" || reference.category === "roi")) {
    gaps.push("Nenhum estudo de caso ou indicador de retorno encontrado: a economia precisa ser estimada com dados da própria empresa.");
  }
  gaps.push("Os trechos são automáticos: confirme valores, data e contexto (quantidade, região, impostos) abrindo cada link.");
  return gaps;
}

export class SearchUnavailableError extends Error {}

const STATUS_MESSAGES: Record<number, string> = {
  401: "A chave da Tavily é inválida. Confira a variável TAVILY_API_KEY na Vercel.",
  429: "Muitas buscas seguidas. Aguarde um minuto e tente de novo.",
  432: "O limite gratuito de buscas da Tavily deste mês acabou. Ele renova no dia 1º; até lá, registre as fontes manualmente.",
  433: "O limite de uso da Tavily foi atingido. Até a renovação, registre as fontes manualmente.",
};

async function searchOnce(apiKey: string, query: string, withCountry: boolean): Promise<TavilyResult[]> {
  const response = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: RESULTS_PER_QUERY,
      topic: "general",
      include_answer: false,
      include_published_date: true,
      ...(withCountry ? { country: "brazil" } : {}),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (response.status === 400 || response.status === 422) {
    // Parâmetro opcional recusado (ex.: país): tenta de novo só com a consulta.
    if (withCountry) return searchOnce(apiKey, query, false);
  }
  if (!response.ok) {
    throw new SearchUnavailableError(STATUS_MESSAGES[response.status] ?? `A busca falhou (código ${response.status}). Tente novamente mais tarde.`);
  }
  const body = (await response.json()) as { results?: unknown };
  return Array.isArray(body.results) ? (body.results as TavilyResult[]) : [];
}

/** Executa as consultas em paralelo; falha só se todas falharem. */
export async function runWebSearch(apiKey: string, queries: SearchQuery[]) {
  const settled = await Promise.allSettled(queries.map((item) => searchOnce(apiKey, item.query, true)));
  const batches = settled.flatMap((result, index) =>
    result.status === "fulfilled" ? [{ category: queries[index].category, results: result.value }] : [],
  );
  if (!batches.length) {
    const first = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
    const reason = first?.reason;
    throw reason instanceof SearchUnavailableError ? reason : new SearchUnavailableError("Não foi possível acessar o serviço de busca. Tente novamente.");
  }
  return { batches, failed: settled.length - batches.length };
}
