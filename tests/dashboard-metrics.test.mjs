// Dados fictícios apenas.
import assert from "node:assert/strict";
import test from "node:test";
import { classifyIdea, computeManagerMetrics, parsePeriod, periodStart } from "../src/lib/dashboard-metrics.ts";

const ideas = [
  {
    id: "a",
    status: "approved",
    area: "Operações",
    priority: "alta",
    created_at: "2026-08-01T10:00:00Z",
    submitted_at: "2026-08-02T10:00:00Z",
    analysis: { potential: "baixo", dimensions: [{ dimension: "G" }] },
  },
  {
    id: "b",
    status: "in_review",
    area: null,
    priority: null,
    created_at: "2026-10-01T10:00:00Z",
    submitted_at: "2026-10-01T10:00:00Z",
    analysis: { potential: "médio", dimensions: [{ dimension: "S" }] },
  },
  {
    id: "c",
    status: "submitted",
    area: "Operações",
    priority: null,
    created_at: "2026-10-05T10:00:00Z",
    submitted_at: null,
    analysis: null,
  },
];

const evaluations = [
  { idea_id: "a", created_at: "2026-08-03T00:00:00Z", result: { potential: "médio", dimensions: [{ dimension: "E" }] } },
  { idea_id: "a", created_at: "2026-08-10T00:00:00Z", result: { potential: "alto", dimensions: [{ dimension: "E" }, { dimension: "S" }] } },
];

const decisions = [
  { idea_id: "a", from_status: "submitted", to_status: "submitted", created_at: "2026-08-03T10:00:00Z" },
  { idea_id: "a", from_status: "submitted", to_status: "in_review", created_at: "2026-08-04T10:00:00Z" },
  { idea_id: "a", from_status: "in_review", to_status: "approved", created_at: "2026-08-12T10:00:00Z" },
];

test("AI evaluation takes precedence over keyword triage, using the latest evaluation", () => {
  const metrics = computeManagerMetrics({ ideas, evaluations, decisions, now: new Date("2026-10-20T00:00:00Z") });
  assert.equal(metrics.total, 3);
  assert.deepEqual(metrics.byDimension, { E: 1, S: 2, G: 0 });
  assert.deepEqual(metrics.byPotential, { baixo: 0, médio: 1, alto: 1, sem: 1 });
  assert.deepEqual(metrics.sources, { ai: 1, keyword: 1, none: 1 });
  assert.equal(classifyIdea(ideas[2], undefined).source, "none");
});

test("decision times ignore follow-up updates and count only real transitions", () => {
  const metrics = computeManagerMetrics({ ideas, evaluations, decisions, now: new Date("2026-10-20T00:00:00Z") });
  assert.deepEqual(metrics.avgDaysToFirstDecision, { value: 2, count: 1 });
  assert.deepEqual(metrics.avgDaysToFinalDecision, { value: 10, count: 1 });
});

test("monthly volume includes empty months so gaps are visible, and areas are grouped", () => {
  const metrics = computeManagerMetrics({ ideas, evaluations, decisions, now: new Date("2026-10-20T00:00:00Z") });
  assert.deepEqual(metrics.monthly, [
    { month: "2026-08", count: 1 },
    { month: "2026-09", count: 0 },
    { month: "2026-10", count: 2 },
  ]);
  assert.deepEqual(metrics.byArea, [
    { area: "Operações", count: 2 },
    { area: "Não informada", count: 1 },
  ]);
});

test("filters by status, area and dimension", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  assert.equal(computeManagerMetrics({ ideas, evaluations, decisions, now, filters: { dimension: "E" } }).total, 1);
  assert.equal(computeManagerMetrics({ ideas, evaluations, decisions, now, filters: { area: "Operações" } }).total, 2);
  assert.equal(computeManagerMetrics({ ideas, evaluations, decisions, now, filters: { status: "submitted" } }).total, 1);
  assert.equal(computeManagerMetrics({ ideas, evaluations, decisions, now, filters: { area: "Não informada" } }).total, 1);
});

test("no data produces zeros and empty averages, never invented values", () => {
  const metrics = computeManagerMetrics({ ideas: [], evaluations: [], decisions: [] });
  assert.equal(metrics.total, 0);
  assert.equal(metrics.avgDaysToFirstDecision.value, null);
  assert.deepEqual(metrics.monthly, []);
});

test("period presets", () => {
  assert.equal(parsePeriod("x"), "12m");
  assert.equal(periodStart("all"), null);
  assert.equal(periodStart("30d", new Date("2026-10-20T00:00:00Z"))?.toISOString(), "2026-09-20T00:00:00.000Z");
});
