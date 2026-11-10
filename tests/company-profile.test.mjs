// Dados fictícios. Verificam o perfil da empresa e o uso dele nas perguntas, na busca e no cálculo.
import assert from "node:assert/strict";
import test from "node:test";
import { parseCompanyProfile, planCompanyContext, profileCompleteness, readList, readProfileForm } from "../src/lib/company-profile.ts";
import { computeFeasibility } from "../src/lib/feasibility.ts";
import { applyAnswerForm, emptyPlan, visibleQuestions, withCompany } from "../src/lib/idea-planning.ts";
import { buildSearchQueries } from "../src/lib/web-search.ts";

const NOW = new Date("2026-11-10T12:00:00Z");

function form(entries) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

test("the company form is read with brazilian numbers and one item per line", () => {
  const profile = readProfileForm(
    form([
      ["profile-employees", "1.200"],
      ["profile-state", "es"],
      ["profile-city", "Serra"],
      ["profile-units", "Matriz\nCentro de distribuição\nMatriz"],
      ["profile-areas", "Produção; Manutenção\n\nAdministrativo"],
      ["profile-operatingDays", "300"],
      ["profile-energyTariff", "0,85"],
      ["profile-waterTariff", "abc"],
      ["profile-priorities", "Energia"],
      ["profile-priorities", "Inventada"],
    ]),
  );
  assert.equal(profile.employees, 1200);
  assert.equal(profile.state, "ES");
  assert.deepEqual(profile.units, ["Matriz", "Centro de distribuição"]);
  assert.deepEqual(profile.areas, ["Produção", "Manutenção", "Administrativo"]);
  assert.equal(profile.operatingDays, 300);
  assert.equal(profile.energyTariff, 0.85);
  assert.equal(profile.waterTariff, null, "valor inválido fica vazio");
  assert.deepEqual(profile.priorities, ["Energia"]);
  assert.equal(profileCompleteness(profile).filled, 7);
  assert.deepEqual(readList(""), []);
});

test("an old or missing profile is read as empty", () => {
  assert.equal(parseCompanyProfile(null).employees, null);
  assert.deepEqual(parseCompanyProfile({}).areas, []);
  assert.equal(parseCompanyProfile({ employees: "muitos" }).employees, null);
  assert.equal(planCompanyContext(parseCompanyProfile({})), undefined);
});

test("the company's own areas and units become options in the questions", () => {
  const company = planCompanyContext(parseCompanyProfile({ units: ["Matriz"], areas: ["Produção", "Expedição"], state: "ES" }));
  const generic = visibleQuestions(emptyPlan("seguranca", NOW));
  assert.equal(generic.find((question) => question.id === "se-setor").kind, "text");

  const plan = withCompany(emptyPlan("seguranca", NOW), company);
  const questions = visibleQuestions(plan);
  assert.ok(!questions.some((question) => question.id === "g-local"), "em segurança, o setor já cobre o local");
  const local = visibleQuestions(withCompany(emptyPlan("capacitacao", NOW), company)).find((question) => question.id === "g-local");
  assert.equal(local.kind, "multi");
  assert.deepEqual(local.options, ["Matriz", "Produção", "Expedição"]);
  const sector = questions.find((question) => question.id === "se-setor");
  assert.equal(sector.kind, "choice");
  assert.deepEqual(sector.options, ["Produção", "Expedição"]);
  assert.deepEqual(questions.find((question) => question.id === "g-pessoas").options, ["Produção", "Expedição"]);

  // As respostas são validadas contra as opções da empresa.
  const answered = applyAnswerForm(plan, form([["shown", "se-setor"], ["answer:se-setor", "Expedição"]]), "collaborator", NOW).plan;
  assert.equal(answered.answers["se-setor"].value, "Expedição");
  const training = withCompany(emptyPlan("capacitacao", NOW), company);
  const picked = applyAnswerForm(training, form([["shown", "g-local"], ["answer:g-local", "Matriz"], ["answer:g-local", "Inventada"]]), "collaborator", NOW).plan;
  assert.equal(picked.answers["g-local"].value, "Matriz", "opção fora da lista da empresa é ignorada");
});

test("the tariff search uses the company's state", () => {
  const queries = buildSearchQueries("iluminacao", "Sensores", [], "ES");
  assert.ok(queries.some((item) => /tarifa .* ES$/.test(item.query)));
});

test("company tariff and operating days replace hypotheses in the calculation", () => {
  let plan = emptyPlan("iluminacao", NOW);
  const data = form([["shown", "il-luminarias,il-potencia,il-ociosas"], ["answer:il-luminarias", "40"], ["answer:il-potencia", "20"], ["answer:il-ociosas", "Quase sempre"]]);
  plan = applyAnswerForm(plan, data, "collaborator", NOW).plan;
  plan = applyAnswerForm(plan, form([["shown", "il-horas-ociosas"], ["answer:il-horas-ociosas", "5"]]), "collaborator", NOW).plan;

  const without = computeFeasibility(plan, []);
  assert.equal(without.tariff.source, "hipotetico");

  const company = parseCompanyProfile({ energyTariff: 0.8, operatingDays: 300 });
  const result = computeFeasibility(plan, [], {}, company);
  assert.equal(result.tariff.source, "empresa");
  // 40 × 20 W × 5 h × 300 dias ÷ 1000 = 1200 kWh × R$ 0,80
  assert.equal(result.scenarios[1].annualBenefit, 960);
  assert.ok(!result.hypotheses.some((item) => /Tarifa de referência/.test(item)));
  assert.ok(result.memory.some((item) => /cadastro da empresa/.test(item)));

  // Solar sem conta informada usa a conta de energia do cadastro.
  const solar = computeFeasibility(emptyPlan("solar", NOW), [], {}, parseCompanyProfile({ energyBill: 10000 }));
  assert.equal(solar.scenarios[1].annualBenefit, 96000);
});
