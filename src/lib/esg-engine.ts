/**
 * Motor ESG v2.0: taxonomia, matriz multicritério e regras determinísticas.
 * A IA devolve notas e justificativas; pontuação, faixa e necessidade de
 * revisão humana são calculadas aqui. Módulo puro para testes.
 */

export const ENGINE_VERSION = "v2.0";
export const PROMPT_VERSION = "avaliacao-2026-11";

export const ESG_SUBCATEGORIES = [
  { code: "E1", pillar: "E", label: "Eficiência energética e fontes renováveis" },
  { code: "E2", pillar: "E", label: "Água, efluentes e recursos hídricos" },
  { code: "E3", pillar: "E", label: "Resíduos, reciclagem e economia circular" },
  { code: "E4", pillar: "E", label: "Emissões, clima, biodiversidade e poluição" },
  { code: "S1", pillar: "S", label: "Saúde, segurança e bem-estar" },
  { code: "S2", pillar: "S", label: "Educação, capacitação e desenvolvimento" },
  { code: "S3", pillar: "S", label: "Diversidade, inclusão e direitos humanos" },
  { code: "S4", pillar: "S", label: "Comunidades, fornecedores e impacto social" },
  { code: "G1", pillar: "G", label: "Ética, integridade e anticorrupção" },
  { code: "G2", pillar: "G", label: "Conformidade, riscos e controles internos" },
  { code: "G3", pillar: "G", label: "Transparência, prestação de contas e dados" },
  { code: "G4", pillar: "G", label: "Gestão responsável, compras e cadeia de valor" },
] as const;

export const ESG_CRITERIA = [
  { code: "C1", label: "Impacto ESG potencial", weight: 25 },
  { code: "C2", label: "Viabilidade técnica", weight: 15 },
  { code: "C3", label: "Viabilidade econômica", weight: 10 },
  { code: "C4", label: "Inovação", weight: 10 },
  { code: "C5", label: "Alinhamento estratégico", weight: 15 },
  { code: "C6", label: "Mensurabilidade", weight: 10 },
  { code: "C7", label: "Escalabilidade", weight: 5 },
  { code: "C8", label: "Maturidade da proposta", weight: 10 },
] as const;

export const CRITICAL_RISK_LABELS = {
  legal: "Risco legal",
  regulatory: "Risco regulatório",
  safety: "Risco à segurança",
  rights: "Risco a direitos",
  privacy: "Risco à privacidade",
  environmental: "Risco ambiental",
} as const;

export type CriterionCode = (typeof ESG_CRITERIA)[number]["code"];
export type CriticalRisk = keyof typeof CRITICAL_RISK_LABELS;

/** Limiar inicial, ainda não calibrado com avaliações de especialistas. */
export const CONFIDENCE_THRESHOLD = 0.7;

export const POTENTIAL_BANDS = [
  { key: "very_high", min: 80, label: "Muito alto", routing: "Priorizar estudo de implementação" },
  { key: "high", min: 60, label: "Alto", routing: "Avaliação técnica" },
  { key: "moderate", min: 40, label: "Moderado", routing: "Solicitar melhorias ou informações" },
  { key: "low", min: 20, label: "Baixo", routing: "Recomendar reformulação" },
  { key: "very_low", min: 0, label: "Muito baixo", routing: "Manter em triagem ou arquivar com justificativa" },
] as const;

export type CriterionScore = { code: string; score: number; insufficientInformation?: boolean };

/** Σ((nota / 5) × peso). `null` se faltar critério, repetir código ou houver nota fora de 0 a 5. */
export function computeEsgScore(scores: CriterionScore[]): number | null {
  if (scores.length !== ESG_CRITERIA.length) return null;
  let total = 0;
  for (const { code, weight } of ESG_CRITERIA) {
    const matches = scores.filter((item) => item.code === code);
    if (matches.length !== 1) return null;
    const { score } = matches[0];
    if (!Number.isInteger(score) || score < 0 || score > 5) return null;
    total += (score / 5) * weight;
  }
  return total;
}

export function potentialBand(score: number) {
  return POTENTIAL_BANDS.find(({ min }) => score >= min) ?? POTENTIAL_BANDS[POTENTIAL_BANDS.length - 1];
}

/** Regras críticas: têm prioridade sobre a pontuação, mesmo quando ela é alta. */
export function humanReviewReasons(input: {
  criticalRisks: CriticalRisk[];
  confidenceEstimate: number;
  criteria: CriterionScore[];
}): string[] {
  const reasons: string[] = input.criticalRisks.map((risk) => CRITICAL_RISK_LABELS[risk]);
  if (input.confidenceEstimate < CONFIDENCE_THRESHOLD) reasons.push("Confiança estimada abaixo do limiar");
  if (input.criteria.some((item) => item.code === "C1" && item.insufficientInformation)) {
    reasons.push("Informação insuficiente para estimar o impacto");
  }
  return reasons;
}

/** Pontuação gravada em uma avaliação concluída; `null` em avaliações anteriores ao motor v2. */
export function storedEsgScore(result: unknown): number | null {
  if (!result || typeof result !== "object") return null;
  const engine = (result as { engine?: unknown }).engine;
  if (!engine || typeof engine !== "object") return null;
  const score = (engine as { score?: unknown }).score;
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}
