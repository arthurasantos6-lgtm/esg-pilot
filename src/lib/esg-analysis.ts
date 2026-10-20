export type EsgDimension = "E" | "S" | "G";
export type Potential = "baixo" | "médio" | "alto";

export type DimensionCriteria = {
  keywords: string[];
  explanation: string;
  suggestedMetrics: string[];
};

export type PotentialThresholds = {
  alto: number;
  medio: number;
};

export type EsgCriteria = {
  dimensions: Record<EsgDimension, DimensionCriteria>;
  thresholds: PotentialThresholds;
};

/**
 * Critérios embutidos no código, usados quando nenhuma versão de critérios
 * está ativa no banco (ex.: testes automatizados ou ambiente ainda não
 * configurado pelo administrador da plataforma).
 */
export const DEFAULT_CRITERIA: EsgCriteria = {
  thresholds: { alto: 4, medio: 2 },
  dimensions: {
    E: {
      keywords: [
        "energia",
        "água",
        "agua",
        "resíduo",
        "residuo",
        "reciclagem",
        "emissão",
        "emissao",
        "carbono",
        "ambient",
        "recurso natural",
      ],
      explanation: "O texto menciona recursos naturais, energia, resíduos ou emissões.",
      suggestedMetrics: ["Consumo de energia (kWh)", "Consumo de água (m³)", "Resíduos desviados de aterro (kg)"],
    },
    S: {
      keywords: [
        "segurança",
        "seguranca",
        "saúde",
        "saude",
        "capacitação",
        "capacitacao",
        "inclusão",
        "inclusao",
        "comunidade",
        "acessibilidade",
        "bem-estar",
      ],
      explanation: "O texto menciona saúde, segurança, inclusão ou desenvolvimento de pessoas.",
      suggestedMetrics: ["Pessoas participantes", "Horas de capacitação", "Taxa de incidentes"],
    },
    G: {
      keywords: [
        "governança",
        "governanca",
        "transparência",
        "transparencia",
        "conformidade",
        "ética",
        "etica",
        "rastreabilidade",
        "controle",
        "política",
        "politica",
      ],
      explanation: "O texto menciona controles, transparência, ética ou conformidade.",
      suggestedMetrics: ["Controles revisados", "Não conformidades resolvidas", "Processos com procedimento documentado"],
    },
  },
};

type AnalysisMeta = {
  criteriaVersionId?: string | null;
  criteriaVersionLabel?: string;
};

function isDimensionCriteria(value: unknown): value is DimensionCriteria {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as Partial<DimensionCriteria>).keywords) &&
      (value as Partial<DimensionCriteria>).keywords!.every((item) => typeof item === "string") &&
      typeof (value as Partial<DimensionCriteria>).explanation === "string" &&
      Array.isArray((value as Partial<DimensionCriteria>).suggestedMetrics) &&
      (value as Partial<DimensionCriteria>).suggestedMetrics!.every((item) => typeof item === "string"),
  );
}

/**
 * Valida e converte os campos `dimensions`/`potential_thresholds` vindos do
 * banco (jsonb) para o formato tipado esperado pelo motor de triagem.
 * Retorna `null` quando a estrutura é inválida, para que o chamador possa
 * recorrer aos critérios padrão em vez de quebrar o fluxo de envio da ideia.
 */
export function parseEsgCriteria(dimensionsJson: unknown, thresholdsJson: unknown): EsgCriteria | null {
  if (!dimensionsJson || typeof dimensionsJson !== "object") return null;
  const raw = dimensionsJson as Record<string, unknown>;
  const dimensions = {} as Record<EsgDimension, DimensionCriteria>;

  for (const key of ["E", "S", "G"] as EsgDimension[]) {
    const candidate = raw[key];
    if (!isDimensionCriteria(candidate)) return null;
    dimensions[key] = candidate;
  }

  const thresholds = thresholdsJson as Partial<PotentialThresholds> | null;
  if (
    !thresholds ||
    typeof thresholds.alto !== "number" ||
    typeof thresholds.medio !== "number"
  ) {
    return null;
  }

  return { dimensions, thresholds: { alto: thresholds.alto, medio: thresholds.medio } };
}

/**
 * Executa a triagem por palavras-chave usando um conjunto de critérios
 * explícito (tipicamente carregado da versão ativa em `esg_criteria_versions`).
 */
export function analyzeIdeaWithCriteria(text: string, criteria: EsgCriteria, meta?: AnalysisMeta) {
  const normalized = text.toLocaleLowerCase("pt-BR");
  const dimensionKeys = Object.keys(criteria.dimensions) as EsgDimension[];
  const dimensions = dimensionKeys
    .map((dimension) => ({
      dimension,
      hits: criteria.dimensions[dimension].keywords.filter((keyword) =>
        normalized.includes(keyword.toLocaleLowerCase("pt-BR")),
      ),
    }))
    .filter((item) => item.hits.length > 0);
  const hitCount = dimensions.reduce((count, item) => count + item.hits.length, 0);
  const potential: Potential =
    hitCount >= criteria.thresholds.alto ? "alto" : hitCount >= criteria.thresholds.medio ? "médio" : "baixo";

  return {
    method: "triagem_por_termos",
    notice:
      "Triagem indicativa por palavras-chave; não é uma avaliação de impacto nem substitui validação especializada.",
    potential,
    dimensions: dimensions.map(({ dimension, hits }) => ({
      dimension,
      hits,
      explanation: criteria.dimensions[dimension].explanation,
    })),
    suggestedMetrics: dimensions.flatMap(
      ({ dimension }) => criteria.dimensions[dimension].suggestedMetrics,
    ),
    criteriaVersionId: meta?.criteriaVersionId ?? null,
    criteriaVersionLabel: meta?.criteriaVersionLabel ?? "Critérios padrão embutidos no código",
  };
}

/** Triagem com os critérios padrão embutidos no código (compatibilidade e testes). */
export function analyzeIdea(text: string) {
  return analyzeIdeaWithCriteria(text, DEFAULT_CRITERIA);
}
