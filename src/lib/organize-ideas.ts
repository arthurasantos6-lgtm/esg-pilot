import { classifyIdea, latestEvaluations, type MetricsEvaluation } from "@/lib/dashboard-metrics";
import { storedEsgScore } from "@/lib/esg-engine";
import { findPrecedents, recommendIdea, type LearningEntry } from "@/lib/esg-project-proposal";
import { localScore, readLocalAnalysis } from "@/lib/local-analysis";

/** Dimensões e nota de cada ideia, a partir da avaliação mais recente. */
type ClassifiableIdea = { id: string; title: string; original_description: string | null; analysis: unknown; created_at: string };

export function organizeIdeas<T extends ClassifiableIdea>(ideas: T[], evaluations: MetricsEvaluation[], learningBase: LearningEntry[] = []) {
  const latest = latestEvaluations(evaluations);
  return ideas.map((idea) => {
    const evaluation = latest.get(idea.id);
    const local = localScore(idea.analysis);
    const localAnalysis = readLocalAnalysis(idea.analysis);
    return {
      ...idea,
      dimensions: classifyIdea(idea, evaluation).dimensions,
      potentialScore: (evaluation ? storedEsgScore(evaluation.result) : null) ?? local?.value ?? null,
      recommendation: localAnalysis
        ? recommendIdea(
            localAnalysis,
            findPrecedents(
              {
                id: idea.id,
                title: idea.title,
                original_description: idea.original_description,
                subcategories: localAnalysis.classification.subcategories,
              },
              learningBase,
            ),
          )
        : null,
      potentialIsPartial: Boolean(local?.partial) && !(evaluation && storedEsgScore(evaluation.result) !== null),
    };
  });
}
