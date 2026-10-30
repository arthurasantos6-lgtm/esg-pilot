import { z } from "zod";
import { CRITICAL_RISK_LABELS, ESG_CRITERIA, ESG_SUBCATEGORIES } from "../esg-engine.ts";

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

const subcategoryCodes = ESG_SUBCATEGORIES.map(({ code }) => code) as [string, ...string[]];
const criterionCodes = ESG_CRITERIA.map(({ code }) => code) as [string, ...string[]];
const criticalRisks = Object.keys(CRITICAL_RISK_LABELS) as [keyof typeof CRITICAL_RISK_LABELS, ...(keyof typeof CRITICAL_RISK_LABELS)[]];

const criterionScore = z.object({
  code: z.enum(criterionCodes),
  score: z.number().int().min(0).max(5).describe("Nota inteira de 0 a 5."),
  justification: z.string(),
  evidence: z.array(z.string()).describe("Trechos da proposta que sustentam a nota. Vazio se não houver."),
  insufficientInformation: z.boolean().describe("true se faltam dados para avaliar; a nota é provisória."),
}).strict();

/** Resultado da avaliação ESG gerada pela IA (gravado em `idea_evaluations.result`). */
const evaluationFields = z.object({
  summary: z.string().describe("Resumo objetivo da ideia em 2 a 3 frases."),
  primaryPillar: z.enum(["E", "S", "G"]).nullable().describe("Pilar do impacto predominante; null se o texto não permitir definir."),
  secondaryPillars: z.array(z.enum(["E", "S", "G"])),
  subcategories: z.array(z.enum(subcategoryCodes)),
  criteriaScores: z.array(criterionScore).describe("Exatamente um item para cada critério, de C1 a C8."),
  confidenceEstimate: z.number().min(0).max(1).describe("Estimativa de confiança de 0 a 1; não é probabilidade calibrada."),
  criticalRisks: z.array(z.enum(criticalRisks)),
  unverifiedClaims: z.array(z.string()).describe("Alegações ambientais ou sociais sem evidência, a verificar. Sem acusar greenwashing."),
  complementaryQuestions: z.array(z.string()).describe("Perguntas objetivas para esclarecer lacunas."),
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
}).strict();

export const evaluationResultSchema = evaluationFields.refine(
  ({ criteriaScores }) => ESG_CRITERIA.every(({ code }) => criteriaScores.filter((item) => item.code === code).length === 1),
  { message: "criteriaScores deve ter exatamente um item para cada critério, de C1 a C8." },
);

/** Calculado pelo sistema depois da resposta da IA e congelado junto com a avaliação. */
const engineSnapshot = z.object({
  version: z.string(),
  promptVersion: z.string(),
  score: z.number(),
  humanReviewReasons: z.array(z.string()),
  knowledgeUsed: z.array(z.object({ id: z.string(), version: z.number() })),
});

/** Avaliações antigas foram gravadas antes destes campos e continuam válidas. */
const storedEvaluationSchema = evaluationFields.extend({ engine: engineSnapshot }).partial({
  technicalSummary: true,
  executability: true,
  regulatoryNorms: true,
  primaryPillar: true,
  secondaryPillars: true,
  subcategories: true,
  criteriaScores: true,
  confidenceEstimate: true,
  criticalRisks: true,
  unverifiedClaims: true,
  complementaryQuestions: true,
  engine: true,
});

export type EvaluationResult = z.infer<typeof storedEvaluationSchema>;

export function parseEvaluationResult(value: unknown): EvaluationResult | null {
  const parsed = storedEvaluationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
