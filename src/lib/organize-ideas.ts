import { classifyIdea, latestEvaluations, type MetricsEvaluation } from "@/lib/dashboard-metrics";
import { executabilityScore } from "@/lib/executability";

/** Dimensões e nota de cada ideia, a partir da avaliação mais recente. */
type ClassifiableIdea = { id: string; analysis: unknown; created_at: string };

export function organizeIdeas<T extends ClassifiableIdea>(ideas: T[], evaluations: MetricsEvaluation[]) {
  const latest = latestEvaluations(evaluations);
  return ideas.map((idea) => {
    const evaluation = latest.get(idea.id);
    return {
      ...idea,
      dimensions: classifyIdea(idea, evaluation).dimensions,
      score: evaluation ? executabilityScore(evaluation.result) : null,
    };
  });
}
