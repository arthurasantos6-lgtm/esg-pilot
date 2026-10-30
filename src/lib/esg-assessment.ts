import type { ClassificationResult, Signals } from "./esg-classifier.ts";
import { computeEsgScore, ESG_CRITERIA, type CriterionCode } from "./esg-engine.ts";

/**
 * Avaliação multicritério local. Dá nota só quando o texto traz base explícita:
 * sem base, a nota fica `null` e a pendência é registrada, nunca vira zero.
 * Nenhuma regra aqui deduz impacto ou viabilidade só pela presença de palavras.
 */

export type CriterionAssessment = {
  code: CriterionCode;
  grade: number | null;
  reason: "evidence_in_text" | "insufficient_information";
  justification: string;
};

const pending = (code: CriterionCode, what: string): CriterionAssessment => ({
  code,
  grade: null,
  reason: "insufficient_information",
  justification: `Pendente: o texto não informa ${what}.`,
});

const graded = (code: CriterionCode, grade: number, justification: string): CriterionAssessment => ({
  code,
  grade,
  reason: "evidence_in_text",
  justification,
});

function assessImpact(classification: ClassificationResult, s: Signals) {
  if (classification.status !== "classified" || !s.action) return pending("C1", "uma ação com relação a um tema ESG identificado");
  if (s.quantity && s.baseline && s.measurement) {
    return graded("C1", s.evidence ? 4 : 3, "Há ação, números de referência e forma de medir. O impacto ainda precisa ser comprovado.");
  }
  if (s.problem && (s.audience || s.benefit)) return graded("C1", 2, "Há problema e ação descritos, sem números de referência.");
  return graded("C1", 1, "Há intenção de melhoria, sem detalhar o problema ou quem é afetado.");
}

function assessTechnical(s: Signals) {
  if (!s.resources) return pending("C2", "os recursos ou equipamentos necessários");
  if (s.responsibility && s.deadline) return graded("C2", 4, "Indica recursos, responsáveis e prazo.");
  if (s.responsibility || s.deadline) return graded("C2", 3, "Indica recursos e responsáveis ou prazo.");
  return graded("C2", 2, "Indica recursos, sem responsáveis nem prazo.");
}

function assessEconomic(s: Signals) {
  if (!s.cost && !s.money) return pending("C3", "custos nem orçamento");
  if (s.money && s.quantity && s.benefit) return graded("C3", 3, "Informa valores e benefício esperado, ainda a validar.");
  if (s.money) return graded("C3", 2, "Informa valores, sem comparar com o benefício.");
  return graded("C3", 1, "Menciona custo, sem valores.");
}

function assessMeasurability(s: Signals) {
  if (!s.measurement && !s.quantity) return pending("C6", "como o resultado seria medido");
  if (s.measurement && s.quantity && s.baseline && s.target) return graded("C6", 4, "Traz forma de medir, número de referência e meta.");
  if (s.measurement && s.quantity && s.baseline) return graded("C6", 3, "Traz forma de medir e número de referência, sem meta.");
  if (s.measurement) return graded("C6", 2, "Indica como medir, sem números de referência.");
  return graded("C6", 1, "Traz números, sem dizer como o resultado seria medido.");
}

function assessMaturity(s: Signals) {
  const elements = [s.problem, s.action, s.audience, s.measurement, s.resources].filter(Boolean).length;
  const grade = elements <= 1 ? 1 : elements === 2 ? 2 : elements === 3 ? 3 : 4;
  return graded("C8", grade, `A proposta descreve ${elements} de 5 elementos: problema, ação, público, medição e recursos.`);
}

export function assessCriteria(classification: ClassificationResult): CriterionAssessment[] {
  const s = classification.signals;
  return [
    assessImpact(classification, s),
    assessTechnical(s),
    assessEconomic(s),
    s.innovation ? graded("C4", 2, "Afirma ser algo novo no contexto, ainda a confirmar.") : pending("C4", "o que muda em relação ao que já é feito"),
    s.strategy ? graded("C5", 2, "Menciona objetivo ou meta da empresa, ainda a confirmar.") : pending("C5", "relação com objetivos da empresa; a gestão avalia este critério"),
    assessMeasurability(s),
    s.scale ? graded("C7", 2, "Menciona ampliar ou replicar, sem detalhar como.") : pending("C7", "se pode ser replicada ou ampliada"),
    assessMaturity(s),
  ];
}

export type AssessmentSummary = {
  criteria: CriterionAssessment[];
  /** Só quando todos os critérios têm nota. */
  score: number | null;
  /** Pontuação sobre os critérios com nota: é parcial e deve ser identificada como tal. */
  partial_score: number | null;
  /** Soma dos pesos dos critérios já avaliados, de 0 a 100. */
  assessed_weight: number;
  pending_criteria: CriterionCode[];
};

export function summarizeAssessment(criteria: CriterionAssessment[]): AssessmentSummary {
  const weightOf = (code: string) => ESG_CRITERIA.find((item) => item.code === code)?.weight ?? 0;
  const assessed = criteria.filter((item): item is CriterionAssessment & { grade: number } => item.grade !== null);
  const assessedWeight = assessed.reduce((sum, item) => sum + weightOf(item.code), 0);
  const earned = assessed.reduce((sum, item) => sum + (item.grade / 5) * weightOf(item.code), 0);
  return {
    criteria,
    score: computeEsgScore(assessed.map(({ code, grade }) => ({ code, score: grade }))),
    partial_score: assessedWeight ? (earned / assessedWeight) * 100 : null,
    assessed_weight: assessedWeight,
    pending_criteria: criteria.filter((item) => item.grade === null).map((item) => item.code),
  };
}
