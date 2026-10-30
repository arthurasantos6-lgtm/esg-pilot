/**
 * Indicadores do painel da gestão, calculados apenas a partir de registros
 * reais (ideias enviadas, avaliações e decisões). Módulo puro para testes.
 */

export type PeriodPreset = "30d" | "90d" | "12m" | "all";

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  "12m": "Últimos 12 meses",
  all: "Todo o período",
};

export function parsePeriod(value: string | undefined): PeriodPreset {
  return value === "30d" || value === "90d" || value === "all" ? value : "12m";
}

export function periodStart(preset: PeriodPreset, now = new Date()): Date | null {
  if (preset === "all") return null;
  const start = new Date(now);
  if (preset === "30d") start.setUTCDate(start.getUTCDate() - 30);
  if (preset === "90d") start.setUTCDate(start.getUTCDate() - 90);
  if (preset === "12m") start.setUTCMonth(start.getUTCMonth() - 12);
  return start;
}

export type MetricsIdea = {
  id: string;
  status: string;
  area: string | null;
  priority: string | null;
  created_at: string;
  submitted_at: string | null;
  analysis: unknown;
};

export type MetricsEvaluation = { idea_id: string; result: unknown; created_at: string };
export type MetricsDecision = { idea_id: string; from_status: string; to_status: string; created_at: string };

export type DimensionSource = "ai" | "keyword" | "none";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function dimensionsOf(value: unknown): string[] {
  const dims = record(value)?.dimensions;
  if (!Array.isArray(dims)) return [];
  const found = dims.flatMap((item) => {
    const dimension = record(item)?.dimension;
    return dimension === "E" || dimension === "S" || dimension === "G" ? [dimension] : [];
  });
  return [...new Set(found)];
}

function potentialOf(value: unknown): string | null {
  const potential = record(value)?.potential;
  return potential === "baixo" || potential === "médio" || potential === "alto" ? potential : null;
}

/** A avaliação por IA tem precedência; sem ela, usa a triagem por termos. */
export function classifyIdea(idea: Pick<MetricsIdea, "analysis">, evaluation: MetricsEvaluation | undefined) {
  const aiDimensions = evaluation ? dimensionsOf(evaluation.result) : [];
  const aiPotential = evaluation ? potentialOf(evaluation.result) : null;
  if (evaluation && (aiDimensions.length || aiPotential)) {
    return { dimensions: aiDimensions, potential: aiPotential, source: "ai" as DimensionSource };
  }
  const keywordDimensions = dimensionsOf(idea.analysis);
  const keywordPotential = potentialOf(idea.analysis);
  if (keywordDimensions.length || keywordPotential) {
    return { dimensions: keywordDimensions, potential: keywordPotential, source: "keyword" as DimensionSource };
  }
  return { dimensions: [] as string[], potential: null, source: "none" as DimensionSource };
}

/** A avaliação concluída mais recente de cada ideia. */
export function latestEvaluations(evaluations: MetricsEvaluation[]) {
  const latest = new Map<string, MetricsEvaluation>();
  for (const evaluation of evaluations) {
    const current = latest.get(evaluation.idea_id);
    if (!current || evaluation.created_at > current.created_at) latest.set(evaluation.idea_id, evaluation);
  }
  return latest;
}

export type ManagerFilters = { status?: string; dimension?: string; area?: string };

/** Rótulo de área usado em filtros e agrupamentos. */
export function areaLabel(area: string | null) {
  return area?.trim() || "Não informada";
}

const FINAL_DECISION_STATUSES = new Set(["approved", "rejected"]);
const DAY_MS = 86_400_000;

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function monthsBetween(first: string, last: string) {
  const months: string[] = [];
  let [year, month] = first.split("-").map(Number);
  const [lastYear, lastMonth] = last.split("-").map(Number);
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export function computeManagerMetrics(input: {
  ideas: MetricsIdea[];
  evaluations: MetricsEvaluation[];
  decisions: MetricsDecision[];
  filters?: ManagerFilters;
  periodFrom?: Date | null;
  now?: Date;
}) {
  const filters = input.filters ?? {};
  const latestEvaluation = latestEvaluations(input.evaluations);

  const rows = input.ideas
    .map((idea) => ({ idea, sentAt: idea.submitted_at ?? idea.created_at, ...classifyIdea(idea, latestEvaluation.get(idea.id)) }))
    .filter(({ idea, dimensions }) =>
      (!filters.status || idea.status === filters.status) &&
      (!filters.area || areaLabel(idea.area) === filters.area) &&
      (!filters.dimension || dimensions.includes(filters.dimension)),
    );

  const ids = new Set(rows.map(({ idea }) => idea.id));
  const decisionsByIdea = new Map<string, MetricsDecision[]>();
  for (const decision of input.decisions) {
    if (!ids.has(decision.idea_id)) continue;
    const list = decisionsByIdea.get(decision.idea_id) ?? [];
    list.push(decision);
    decisionsByIdea.set(decision.idea_id, list);
  }

  const byStatus: Record<string, number> = {};
  const byDimension = { E: 0, S: 0, G: 0 };
  const byPotential = { baixo: 0, médio: 0, alto: 0, sem: 0 };
  const byPriority = { alta: 0, media: 0, baixa: 0, sem: 0 };
  const sources = { ai: 0, keyword: 0, none: 0 };
  const areas = new Map<string, number>();
  const monthly = new Map<string, number>();
  const daysToFirst: number[] = [];
  const daysToFinal: number[] = [];

  for (const { idea, sentAt, dimensions, potential, source } of rows) {
    byStatus[idea.status] = (byStatus[idea.status] ?? 0) + 1;
    for (const dimension of dimensions) byDimension[dimension as keyof typeof byDimension] += 1;
    byPotential[(potential ?? "sem") as keyof typeof byPotential] += 1;
    byPriority[(idea.priority ?? "sem") as keyof typeof byPriority] += 1;
    sources[source] += 1;
    const area = areaLabel(idea.area);
    areas.set(area, (areas.get(area) ?? 0) + 1);
    monthly.set(monthKey(sentAt), (monthly.get(monthKey(sentAt)) ?? 0) + 1);

    const decisions = (decisionsByIdea.get(idea.id) ?? [])
      .filter((decision) => decision.from_status !== decision.to_status)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const sent = new Date(sentAt).getTime();
    if (decisions[0]) daysToFirst.push(Math.max(0, (new Date(decisions[0].created_at).getTime() - sent) / DAY_MS));
    const final = decisions.find((decision) => FINAL_DECISION_STATUSES.has(decision.to_status));
    if (final) daysToFinal.push(Math.max(0, (new Date(final.created_at).getTime() - sent) / DAY_MS));
  }

  const now = input.now ?? new Date();
  const sentMonths = [...monthly.keys()].sort();
  const firstMonth = input.periodFrom ? monthKey(input.periodFrom.toISOString()) : sentMonths[0];
  const months = firstMonth ? monthsBetween(firstMonth, monthKey(now.toISOString())) : [];

  return {
    total: rows.length,
    byStatus,
    byDimension,
    byPotential,
    byPriority,
    sources,
    byArea: [...areas.entries()].map(([area, count]) => ({ area, count })).sort((a, b) => b.count - a.count || a.area.localeCompare(b.area)),
    monthly: months.map((month) => ({ month, count: monthly.get(month) ?? 0 })),
    avgDaysToFirstDecision: { value: average(daysToFirst), count: daysToFirst.length },
    avgDaysToFinalDecision: { value: average(daysToFinal), count: daysToFinal.length },
  };
}

export type ManagerMetrics = ReturnType<typeof computeManagerMetrics>;
