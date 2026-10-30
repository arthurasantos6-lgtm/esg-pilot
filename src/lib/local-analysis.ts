import { assessCriteria, summarizeAssessment, type AssessmentSummary } from "./esg-assessment.ts";
import { classifyText, type ClassificationResult } from "./esg-classifier.ts";
import type { EsgCriteria } from "./esg-analysis.ts";

/**
 * Resultado do motor local, gravado em `ideas.analysis` no formato que pastas e
 * painéis já leem. Fica congelado no envio, com a versão usada: ideias antigas
 * não são reclassificadas. Falhas viram `analysis_pending` e não impedem o envio.
 */

const NOTICE =
  "Classificação preliminar por regras, sem IA externa. Os escores são heurísticos, não probabilidades, e não aprovam a ideia nem comprovam impacto.";

export type LocalAnalysis = { classification: ClassificationResult; assessment: AssessmentSummary };

export function buildLocalAnalysis(text: string, criteria: EsgCriteria, meta: { criteriaVersionId: string | null; criteriaVersionLabel: string }) {
  try {
    const classification = classifyText(text);
    const assessment = summarizeAssessment(assessCriteria(classification));
    const pillars = classification.primary_pillar ? [classification.primary_pillar, ...classification.secondary_pillars] : [];
    return {
      method: "motor_local",
      notice: NOTICE,
      status: classification.needs_human_review ? "pending_review" : "submitted",
      dimensions: pillars.map((dimension) => ({
        dimension,
        hits: classification.matches
          .filter((match) => match.subcategory.startsWith(dimension) && !match.negated)
          .map((match) => match.matched_text),
        explanation: criteria.dimensions[dimension].explanation,
      })),
      suggestedMetrics: pillars.flatMap((dimension) => criteria.dimensions[dimension].suggestedMetrics),
      criteriaVersionId: meta.criteriaVersionId,
      criteriaVersionLabel: meta.criteriaVersionLabel,
      local: { classification, assessment } satisfies LocalAnalysis,
    };
  } catch {
    return { method: "analysis_pending", notice: "A análise automática não foi concluída; a gestão pode avaliar a ideia normalmente.", dimensions: [], suggestedMetrics: [] };
  }
}

export function readLocalAnalysis(analysis: unknown): LocalAnalysis | null {
  if (!analysis || typeof analysis !== "object") return null;
  const local = (analysis as { local?: unknown }).local;
  if (!local || typeof local !== "object") return null;
  const candidate = local as Partial<LocalAnalysis>;
  return candidate.classification && candidate.assessment ? (candidate as LocalAnalysis) : null;
}

/** Pontuação para listas: final quando todos os critérios têm nota; senão, parcial e identificada. */
export function localScore(analysis: unknown): { value: number; partial: boolean; assessedWeight: number } | null {
  const assessment = readLocalAnalysis(analysis)?.assessment;
  if (!assessment) return null;
  if (assessment.score !== null) return { value: assessment.score, partial: false, assessedWeight: 100 };
  return assessment.partial_score === null
    ? null
    : { value: assessment.partial_score, partial: true, assessedWeight: assessment.assessed_weight };
}
