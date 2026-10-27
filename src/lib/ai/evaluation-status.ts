/** Avaliações pendentes há mais tempo que isso são tratadas como falha (processo interrompido). */
export const EVALUATION_STALE_AFTER_MS = 10 * 60 * 1000;

export function isEvaluationStale(evaluation: { status: string; created_at: string }, now = Date.now()) {
  return evaluation.status === "pending" && now - new Date(evaluation.created_at).getTime() > EVALUATION_STALE_AFTER_MS;
}
