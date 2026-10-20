export type EsgDimension = "E" | "S" | "G";
export type Potential = "baixo" | "médio" | "alto";

const dimensionKeywords: Record<EsgDimension, string[]> = {
  E: [
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
  S: [
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
  G: [
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
};

const explanations: Record<EsgDimension, string> = {
  E: "O texto menciona recursos naturais, energia, resíduos ou emissões.",
  S: "O texto menciona saúde, segurança, inclusão ou desenvolvimento de pessoas.",
  G: "O texto menciona controles, transparência, ética ou conformidade.",
};

export function analyzeIdea(text: string) {
  const normalized = text.toLocaleLowerCase("pt-BR");
  const dimensions = (Object.keys(dimensionKeywords) as EsgDimension[])
    .map((dimension) => ({
      dimension,
      hits: dimensionKeywords[dimension].filter((keyword) =>
        normalized.includes(keyword),
      ),
    }))
    .filter((item) => item.hits.length > 0);
  const hitCount = dimensions.reduce((count, item) => count + item.hits.length, 0);
  const potential: Potential =
    hitCount >= 4 ? "alto" : hitCount >= 2 ? "médio" : "baixo";

  return {
    method: "triagem_por_termos",
    notice:
      "Triagem indicativa por palavras-chave; não é uma avaliação de impacto nem substitui validação especializada.",
    potential,
    dimensions: dimensions.map(({ dimension, hits }) => ({
      dimension,
      hits,
      explanation: explanations[dimension],
    })),
    suggestedMetrics: dimensions.flatMap(({ dimension }) => {
      if (dimension === "E") return ["Consumo de energia (kWh)", "Consumo de água (m³)", "Resíduos desviados de aterro (kg)"];
      if (dimension === "S") return ["Pessoas participantes", "Horas de capacitação", "Taxa de incidentes"];
      return ["Controles revisados", "Não conformidades resolvidas", "Processos com procedimento documentado"];
    }),
  };
}
