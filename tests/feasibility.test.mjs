// Dados fictícios. Verificam a leitura de preços das fontes e o cálculo automático de investimento, payback e ROI.
import assert from "node:assert/strict";
import test from "node:test";
import { computeFeasibility, defaultSelection, parseBrlAmount, priceCandidates } from "../src/lib/feasibility.ts";
import { applyAnswerForm, emptyPlan } from "../src/lib/idea-planning.ts";

const NOW = new Date("2026-11-10T12:00:00Z");

function answer(plan, values) {
  const data = new FormData();
  data.append("shown", Object.keys(values).join(","));
  for (const [id, value] of Object.entries(values)) data.append(`answer:${id}`, value);
  return applyAnswerForm(plan, data, "collaborator", NOW).plan;
}

const ref = (id, category, summary) => ({
  id,
  title: `Fonte ${id}`,
  url: `https://example.com.br/${id}`,
  category,
  summary,
  value: null,
  publishedAt: null,
  consultedAt: NOW.toISOString(),
  origin: "search_api",
});

const REFERENCES = [
  ref("a", "preco_equipamento", "Sensor de presença de teto por R$ 80,00 à vista ou 10x de R$ 8,00."),
  ref("b", "preco_equipamento", "Sensor de presença 360° R$ 120,00 com garantia."),
  ref("c", "preco_equipamento", "Kit completo de automação predial a partir de R$ 15 mil."),
  ref("d", "instalacao", "Instalação de sensor de presença: R$ 50,00 por ponto."),
  ref("e", "manutencao", "Contrato de manutenção elétrica a partir de R$ 300,00."),
  ref("f", "economia", "A tarifa média comercial ficou em R$ 0,80/kWh, e em outra região R$ 1,00 por kWh."),
  ref("g", "caso", "Prédio economizou R$ 40 mil por ano com sensores."),
];

test("money values are read in brazilian format", () => {
  assert.equal(parseBrlAmount("R$ 1.299,90"), 1299.9);
  assert.equal(parseBrlAmount("R$ 15 mil"), 15000);
  assert.equal(parseBrlAmount("R$ 1,2 milhão"), 1200000);
  assert.equal(parseBrlAmount("R$80"), 80);
  assert.equal(parseBrlAmount("sem valor"), null);
});

test("prices become candidates grouped by what they pay for", () => {
  const candidates = priceCandidates(REFERENCES, "iluminacao");
  const byGroup = (group) => candidates.filter((item) => item.group === group).map((item) => item.amount);
  assert.deepEqual(byGroup("equipamento"), [80, 8, 120, 15000]);
  assert.deepEqual(byGroup("instalacao"), [50]);
  assert.deepEqual(byGroup("manutencao"), [300]);
  assert.deepEqual(byGroup("tarifa"), [0.8, 1]);
  assert.ok(candidates.find((item) => item.amount === 8).installment, "10x de R$ 8 é parcela");
  assert.ok(!candidates.some((item) => item.amount === 40000), "estudo de caso não vira preço");
  assert.match(candidates[0].context, /Sensor de presença de teto/);
});

test("the automatic selection drops installments and outliers", () => {
  const candidates = priceCandidates(REFERENCES, "iluminacao");
  const selected = defaultSelection(candidates).map((id) => candidates.find((item) => item.id === id).amount);
  assert.ok(selected.includes(80) && selected.includes(120));
  assert.ok(!selected.includes(8), "parcela fora");
  assert.ok(!selected.includes(15000), "kit muito acima dos demais fora");
});

function lightingPlan() {
  let plan = emptyPlan("iluminacao", NOW);
  plan = answer(plan, { "il-pontos": "10", "il-luminarias": "40", "il-potencia": "20", "il-ociosas": "Quase sempre" });
  return answer(plan, { "il-horas-ociosas": "5" });
}

test("investment, cost, savings, payback and ROI are calculated automatically", () => {
  const result = computeFeasibility(lightingPlan(), REFERENCES);
  const [conservative, likely, optimistic] = result.scenarios;
  // Equipamento: 80 a 120 (mediana 100) × 10 sensores; instalação 50 × 10.
  assert.equal(likely.investment, 100 * 10 + 50 * 10);
  assert.equal(conservative.investment, 120 * 10 + 500);
  assert.equal(optimistic.investment, 80 * 10 + 500);
  assert.equal(likely.recurring, 300);
  // Economia: 40 × 20 W × 5 h × 250 dias ÷ 1000 = 1000 kWh/ano × tarifa pesquisada (0,80 a 1,00).
  assert.equal(result.tariff.source, "pesquisa");
  assert.equal(likely.annualBenefit, 900);
  assert.equal(conservative.annualBenefit, 800);
  assert.equal(optimistic.annualBenefit, 1000);
  assert.equal(likely.netAnnual, 600);
  assert.equal(likely.paybackYears, 2.5);
  assert.equal(likely.roiPercent, 100); // (600 × 5 − 1500) / 1500
  assert.ok(result.calculable);
  assert.equal(result.quantity.value, 10);
  assert.match(result.quantity.source, /colaborador/);
  assert.ok(result.memory.some((line) => line.includes("ROI")));
});

test("the manager's choices change the calculation", () => {
  const plan = lightingPlan();
  const candidates = priceCandidates(REFERENCES, "iluminacao");
  const only80 = candidates.filter((item) => item.amount === 80 || item.group === "tarifa").map((item) => item.id);
  const result = computeFeasibility(plan, REFERENCES, { selected: only80, quantity: 20, periodYears: 10, benefitOverride: null });
  assert.equal(result.scenarios[1].investment, 80 * 20, "sem instalação marcada, só o equipamento × 20");
  assert.equal(result.scenarios[1].recurring, 0);
  assert.equal(result.periodYears, 10);
  const override = computeFeasibility(plan, REFERENCES, { selected: only80, benefitOverride: 2000, periodYears: 5, quantity: null });
  assert.equal(override.scenarios[0].annualBenefit, 2000);
  assert.equal(override.benefitSource, "gestao");
});

test("the collaborator's tariff wins over the researched one", () => {
  const plan = answer(lightingPlan(), { "il-tarifa": "0,70" });
  const result = computeFeasibility(plan, REFERENCES);
  assert.equal(result.tariff.source, "colaborador");
  assert.equal(result.scenarios[1].annualBenefit, 700);
});

test("without enough data, nothing is invented and the gaps are listed", () => {
  const empty = computeFeasibility(emptyPlan("iluminacao", NOW), []);
  assert.equal(empty.calculable, false);
  assert.equal(empty.scenarios[1].investment, null);
  assert.ok(empty.missing.some((item) => /Preço dos itens/.test(item)));
  assert.ok(empty.missing.some((item) => /il-luminarias/.test(item)));

  const informed = computeFeasibility(answer(emptyPlan("capacitacao", NOW), { "g-custo-inicial": "3000" }), []);
  assert.equal(informed.scenarios[1].investment, 3000, "usa a estimativa do colaborador se não há preço pesquisado");
  assert.equal(informed.scenarios[1].roiPercent, null, "sem economia, sem ROI");
  assert.ok(informed.missing.some((item) => /não tem cálculo automático/.test(item)));

  const noTariff = computeFeasibility(lightingPlan(), REFERENCES.filter((item) => item.id !== "f"));
  assert.equal(noTariff.scenarios[1].annualBenefit, null);
  assert.ok(noTariff.missing.some((item) => /tarifa/.test(item)));

  const losing = computeFeasibility(lightingPlan(), [...REFERENCES, ref("h", "manutencao", "Manutenção anual R$ 1.000,00.")], {
    selected: priceCandidates([...REFERENCES, ref("h", "manutencao", "Manutenção anual R$ 1.000,00.")], "iluminacao").filter((item) => item.amount !== 300 && !item.installment && item.amount < 10000).map((item) => item.id),
    periodYears: 5,
    quantity: null,
    benefitOverride: null,
  });
  assert.equal(losing.scenarios[1].paybackYears, null);
  assert.ok(losing.scenarios[1].notes.some((note) => /não cobre/.test(note)));
});
