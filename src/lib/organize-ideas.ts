import { classifyIdea, latestEvaluations, type MetricsEvaluation } from "@/lib/dashboard-metrics";
import { storedEsgScore } from "@/lib/esg-engine";
import { localScore } from "@/lib/local-analysis";

/** Dimensões e nota de cada ideia, a partir da avaliação mais recente. */
type ClassifiableIdea = { id: string; analysis: unknown; created_at: string };

export function organizeIdeas<T extends ClassifiableIdea>(ideas: T[], evaluations: MetricsEvaluation[]) {
  const latest = latestEvaluations(evaluations);
  return ideas.map((idea) => {
    const evaluation = latest.get(idea.id);
    const local = localScore(idea.analysis);
    return {
      ...idea,
      dimensions: classifyIdea(idea, evaluation).dimensions,
      potentialScore: (evaluation ? storedEsgScore(evaluation.result) : null) ?? local?.value ?? null,
      potentialIsPartial: Boolean(local?.partial) && !(evaluation && storedEsgScore(evaluation.result) !== null),
    };
  });
}
