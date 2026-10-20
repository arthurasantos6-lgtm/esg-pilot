import { z } from "zod";

/**
 * Formato pedido à IA ao organizar a proposta. `null` significa que a
 * conversa não trouxe informação suficiente para o campo.
 */
export const proposalDraftSchema = z.object({
  title: z.string().describe("Título curto e claro, em português, com até 120 caracteres."),
  problem: z.string().nullable(),
  solution: z.string().nullable(),
  context: z.string().nullable(),
  beneficiaries: z.string().nullable(),
  esgDimensions: z.string().nullable(),
  expectedBenefits: z.string().nullable(),
  indicators: z.string().nullable(),
  resourcesAndRisks: z.string().nullable(),
  nextSteps: z.string().nullable(),
});

export type ProposalDraft = z.infer<typeof proposalDraftSchema>;

const level = z.enum(["baixa", "media", "alta"]);

/** Resultado da avaliação ESG gerada pela IA (gravado em `idea_evaluations.result`). */
export const evaluationResultSchema = z.object({
  summary: z.string().describe("Resumo objetivo da ideia em 2 a 3 frases."),
  dimensions: z.array(
    z.object({
      dimension: z.enum(["E", "S", "G"]),
      relevance: level,
      justification: z.string().describe("Por que a ideia se relaciona com esta dimensão, citando trechos da proposta."),
      criteriaUsed: z.array(z.string()).describe("Critérios ou registros da base de conhecimento fornecidos que fundamentam a classificação. Vazio se nenhum se aplica."),
    }),
  ),
  potential: z.enum(["baixo", "médio", "alto"]),
  potentialRationale: z.string(),
  confidence: level,
  confidenceRationale: z.string(),
  missingInformation: z.array(z.string()),
  improvementSuggestions: z.array(z.string()),
  suggestedIndicators: z.array(z.string()),
  risks: z.array(z.string()),
  effortEstimate: z.string().nullable().describe("Estimativa qualitativa de esforço e recursos, ou null se não houver dados suficientes."),
  nextSteps: z.array(z.string()),
  needsHumanReview: z.boolean(),
  humanReviewReason: z.string().nullable(),
  limitations: z.array(z.string()).describe("Limitações desta avaliação, incluindo falta de dados ou de referências na base de conhecimento."),
});

export type EvaluationResult = z.infer<typeof evaluationResultSchema>;

export function parseEvaluationResult(value: unknown): EvaluationResult | null {
  const parsed = evaluationResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
