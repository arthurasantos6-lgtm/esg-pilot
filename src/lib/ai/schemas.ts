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

const executabilityFactor = z.object({
  score: z.number().describe("Nota inteira de 0 a 100."),
  rationale: z.string().describe("Justificativa curta, citando elementos da proposta."),
});

/** Resultado da avaliação ESG gerada pela IA (gravado em `idea_evaluations.result`). */
export const evaluationResultSchema = z.object({
  summary: z.string().describe("Resumo objetivo da ideia em 2 a 3 frases."),
  technicalSummary: z.string().describe("A ideia reescrita em linguagem técnica corporativa, formal e sem erros, sem acrescentar fatos."),
  executability: z.object({
    urgency: executabilityFactor.describe("Urgência: riscos à segurança, à saúde ou de conformidade, ou perdas em andamento."),
    impact: executabilityFactor.describe("Impacto socioambiental esperado, sem presumir resultado comprovado."),
    ease: executabilityFactor.describe("Facilidade de implementação: esforço, dependências e recursos. 100 é muito fácil."),
  }),
  regulatoryNorms: z.array(
    z.object({
      norm: z.string().describe("Nome da norma exatamente como consta na base de conhecimento fornecida."),
      relation: z.string().describe("Por que a ideia se relaciona com esta norma."),
    }),
  ).describe("Somente normas presentes na base de conhecimento fornecida. Vazio se nenhuma se aplica."),
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

/** Avaliações antigas foram gravadas antes destes campos e continuam válidas. */
const storedEvaluationSchema = evaluationResultSchema.partial({
  technicalSummary: true,
  executability: true,
  regulatoryNorms: true,
});

export type EvaluationResult = z.infer<typeof storedEvaluationSchema>;

export function parseEvaluationResult(value: unknown): EvaluationResult | null {
  const parsed = storedEvaluationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
