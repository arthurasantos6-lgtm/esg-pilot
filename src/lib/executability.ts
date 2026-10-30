/**
 * Score de executabilidade (0 a 100). A IA avalia cada fator; a nota final é
 * calculada aqui, com pesos fixos, para ser explicável e igual entre ideias.
 * Módulo puro para testes.
 */

export const EXECUTABILITY_FACTORS = [
  { key: "impact", label: "Impacto socioambiental", weight: 0.4 },
  { key: "urgency", label: "Urgência", weight: 0.3 },
  { key: "ease", label: "Facilidade de implementação", weight: 0.3 },
] as const;

export type ExecutabilityFactor = (typeof EXECUTABILITY_FACTORS)[number]["key"];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function factorScore(value: unknown): number | null {
  const score = record(value)?.score;
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  return Math.min(100, Math.max(0, score));
}

/** Nota final de um resultado de avaliação; `null` em avaliações sem os três fatores. */
export function executabilityScore(result: unknown): number | null {
  const factors = record(record(result)?.executability);
  if (!factors) return null;
  let total = 0;
  for (const { key, weight } of EXECUTABILITY_FACTORS) {
    const score = factorScore(factors[key]);
    if (score === null) return null;
    total += score * weight;
  }
  return Math.round(total);
}

export function executabilityLevel(score: number) {
  if (score >= 70) return { key: "high", label: "Alta" } as const;
  if (score >= 40) return { key: "medium", label: "Média" } as const;
  return { key: "low", label: "Baixa" } as const;
}
