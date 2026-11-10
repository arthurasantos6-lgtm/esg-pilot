// Dados fictícios apenas. Verificam as regras do planejamento, do plano de execução e do cálculo financeiro.
import assert from "node:assert/strict";
import test from "node:test";
import { acceptReferences } from "../src/lib/ai/market-research.ts";
import { buildExecutionPlan } from "../src/lib/idea-execution-plan.ts";
import { estimateSavings } from "../src/lib/idea-finance.ts";
import {
  applyAnswerForm,
  detectInitiativeType,
  emptyPlan,
  NOT_KNOWN,
  parseNumber,
  parsePlan,
  planAnswersText,
  planProgress,
  questionsFor,
  syncProposalFromPlan,
  visibleQuestions,
} from "../src/lib/idea-planning.ts";
import { parseStoredProposal, readProposalForm } from "../src/lib/idea-proposal.ts";

const NOW = new Date("2026-11-10T12:00:00Z");

function form(entries) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

function answer(plan, values, by = "collaborator") {
  return applyAnswerForm(plan, form({ shown: Object.keys(values).join(","), ...Object.fromEntries(Object.entries(values).map(([id, value]) => [`answer:${id}`, value])) }), by, NOW);
}

const baseProposal = {
  title: "Sensores",
  problem: null,
  solution: null,
  context: null,
  beneficiaries: null,
  esgDimensions: null,
  expectedBenefits: null,
  indicators: null,
  resourcesAndRisks: null,
  nextSteps: null,
  source: "manual",
  updatedAt: NOW.toISOString(),
};

test("the initiative type follows the idea text", () => {
  assert.equal(detectInitiativeType("Instalar sensores de presença para reduzir o consumo de energia elétrica."), "iluminacao");
  assert.equal(detectInitiativeType("Reaproveitar a água da chuva para as descargas dos banheiros."), "agua_reuso");
  assert.equal(detectInitiativeType("Fazer coleta seletiva do papelão da expedição."), "residuos");
  assert.equal(detectInitiativeType("Treinamento sobre direção defensiva para motoristas."), "capacitacao");
  assert.equal(detectInitiativeType("Palestra sobre reciclagem e economia de energia para as equipes."), "capacitacao");
  assert.equal(detectInitiativeType("Desligar os motores das esteiras no intervalo."), "energia");
  assert.equal(detectInitiativeType("Tenho uma ideia."), "geral");
});

test("questions are specific to the type and do not repeat general ones", () => {
  const ids = questionsFor("iluminacao").map((question) => question.id);
  assert.ok(ids.includes("il-ambientes") && ids.includes("il-luminarias") && ids.includes("il-tarifa"));
  assert.ok(!ids.includes("g-local"), "o local já é perguntado como 'em quais ambientes'");
  assert.ok(!ids.includes("g-fornecedor"), "quem instala substitui a pergunta geral de terceiros");
  // Respostas objetivas: a maioria das perguntas é de escolha ou número.
  const kinds = questionsFor("iluminacao").map((question) => question.kind);
  assert.ok(kinds.filter((kind) => kind === "text").length <= 3);
  const water = questionsFor("agua_reuso").map((question) => question.id);
  assert.ok(water.includes("ar-origem") && water.includes("ar-finalidade") && !water.includes("il-ambientes"));
  // As informações mínimas aparecem em qualquer tipo (a descrição é o texto original e as etapas vêm do plano).
  for (const type of ["iluminacao", "geral", "governanca", "capacitacao"]) {
    const items = new Set(questionsFor(type).map((question) => question.item));
    for (const item of ["problema", "objetivo", "local", "escopo", "materiais", "pessoas", "fornecedores", "prazo", "custoInicial", "custoRecorrente", "beneficios", "indicadores", "riscos"]) {
      assert.ok(items.has(item), `${type} sem ${item}`);
    }
  }
});

test("follow-up questions appear only after the answer that triggers them", () => {
  let plan = emptyPlan("iluminacao", NOW);
  const hidden = visibleQuestions(plan, "especificas").map((question) => question.id);
  assert.ok(!hidden.includes("il-horas-ociosas") && !hidden.includes("il-infra-ajuste"));
  plan = answer(plan, { "il-ociosas": "Quase sempre", "il-infra": "Não", "il-instalacao": "Empresa contratada" }).plan;
  const shown = visibleQuestions(plan).map((question) => question.id);
  assert.ok(shown.includes("il-horas-ociosas") && shown.includes("il-infra-ajuste") && shown.includes("g-fornecedor-qual"));
  plan = answer(plan, { "il-ociosas": "Raramente" }).plan;
  assert.ok(!visibleQuestions(plan).some((question) => question.id === "il-horas-ociosas"));
});

test("answers accept 'não sei', validate numbers and can be cleared", () => {
  let plan = emptyPlan("iluminacao", NOW);
  const invalid = answer(plan, { "il-luminarias": "muitas" });
  assert.equal(invalid.errors.length, 1);
  assert.equal(invalid.plan.answers["il-luminarias"], undefined);

  plan = answer(plan, { "il-luminarias": "1.200", "il-tipo": NOT_KNOWN }).plan;
  assert.equal(plan.answers["il-luminarias"].value, "1.200");
  assert.equal(plan.answers["il-tipo"].status, "unknown");
  assert.equal(plan.answers["il-tipo"].value, null);

  const marked = applyAnswerForm(plan, form({ shown: "g-objetivo", "answer:g-objetivo": "algo", "status:g-objetivo": "to_evaluate" }), "collaborator", NOW).plan;
  assert.equal(marked.answers["g-objetivo"].status, "to_evaluate");

  const cleared = answer(plan, { "il-luminarias": "" }).plan;
  assert.equal(cleared.answers["il-luminarias"], undefined);
  // Perguntas fora do formulário não são alteradas.
  assert.equal(cleared.answers["il-tipo"].status, "unknown");
  // Opção que não existe é ignorada.
  assert.equal(answer(plan, { "il-infra": "Talvez" }).plan.answers["il-infra"], undefined);
});

test("brazilian and international number formats are read", () => {
  assert.equal(parseNumber("1.234,56"), 1234.56);
  assert.equal(parseNumber("R$ 8.000"), 8000);
  assert.equal(parseNumber("0,85"), 0.85);
  assert.equal(parseNumber("1234.5"), 1234.5);
  assert.equal(parseNumber("12 luminárias"), null);
  assert.equal(parseNumber(""), null);
});

test("progress counts answered and marked questions", () => {
  let plan = emptyPlan("geral", NOW);
  const total = planProgress(plan).total;
  plan = answer(plan, { "g-problema": "Desperdício", "g-objetivo": NOT_KNOWN }).plan;
  const progress = planProgress(plan);
  assert.equal(progress.handled, 2);
  assert.equal(progress.answered, 1);
  assert.equal(progress.total, total);
});

test("answers fill empty proposal fields without overwriting edits", () => {
  let plan = answer(emptyPlan("iluminacao", NOW), { "g-problema": "Luzes acesas à noite sem ninguém.", "g-materiais": "Sensores de teto." }).plan;
  let synced = syncProposalFromPlan(baseProposal, plan);
  assert.equal(synced.proposal.problem, "Luzes acesas à noite sem ninguém.");
  assert.match(synced.proposal.resourcesAndRisks, /Sensores de teto/);

  // A pessoa editou o problema na revisão: a nova resposta não sobrescreve.
  const edited = { ...synced.proposal, problem: "Texto revisado pela pessoa." };
  plan = answer(synced.plan, { "g-problema": "Outro texto." }).plan;
  synced = syncProposalFromPlan(edited, plan);
  assert.equal(synced.proposal.problem, "Texto revisado pela pessoa.");

  // Campo ainda igual ao gerado é atualizado.
  plan = answer(synced.plan, { "g-materiais": "Fiação nova." }).plan;
  assert.match(syncProposalFromPlan(synced.proposal, plan).proposal.resourcesAndRisks, /Fiação nova/);
});

test("the plan is stored inside the proposal and survives the review form", () => {
  const plan = answer(emptyPlan("iluminacao", NOW), { "il-luminarias": "40" }).plan;
  const stored = parseStoredProposal(JSON.parse(JSON.stringify({ ...baseProposal, plan })));
  assert.ok(stored);
  assert.equal(parsePlan(stored.plan).answers["il-luminarias"].value, "40");
  // Proposta antiga, sem planejamento, continua válida.
  assert.equal(parsePlan(parseStoredProposal(baseProposal).plan), null);
  // O formulário de revisão não traz o plano; quem salva precisa preservá-lo (ver saveProposal).
  assert.equal(readProposalForm(form({ title: "Sensores" }), "manual", NOW).plan, undefined);
  assert.match(planAnswersText(plan), /Quantas lâmpadas ficariam ligadas a esses sensores, no total\? 40 lâmpadas/);
});

test("the execution plan adapts its steps to the answers", () => {
  const original = "Instalar sensores de presença nos corredores para reduzir o consumo de energia.";
  let plan = emptyPlan("iluminacao", NOW);
  let execution = buildExecutionPlan({ title: "Sensores", originalText: original, plan });
  const keys = (value) => value.steps.map((step) => step.key);
  assert.ok(keys(execution).includes("avaliacao") && keys(execution).includes("monitoramento"));
  assert.ok(!keys(execution).includes("infraestrutura"));
  assert.ok(!keys(execution).includes("comunicacao"), "sensores não dependem de mudança de rotina");
  assert.equal(execution.identification.pillar, "Ambiental");
  assert.ok(execution.pending.length > 10, "tudo sem resposta fica pendente");

  plan = answer(plan, { "il-infra": "Não", "il-instalacao": "Empresa contratada", "g-prazo": "De 1 a 3 meses" }).plan;
  plan = answer(plan, { "il-infra-ajuste": "Separar circuitos" }).plan;
  execution = buildExecutionPlan({ title: "Sensores", originalText: original, plan });
  assert.ok(keys(execution).includes("fornecedores") && keys(execution).includes("cotacao") && keys(execution).includes("infraestrutura"));
  const infra = execution.steps.find((step) => step.key === "infraestrutura");
  assert.match(infra.activity, /Separar circuitos/);
  assert.equal(execution.informedDeadline, "De 1 a 3 meses");
  // Cada etapa depende de etapas anteriores existentes.
  for (const step of execution.steps) for (const order of step.dependsOn) assert.ok(order < step.order);
  // Nada de valores em reais inventados no plano.
  assert.equal(execution.savings, null);
});

test("savings are estimated only with the needed numbers, with explicit premises", () => {
  let plan = answer(emptyPlan("iluminacao", NOW), { "il-luminarias": "40", "il-potencia": "20", "il-ociosas": "Quase sempre" }).plan;
  assert.equal(estimateSavings(plan), null, "sem horas ociosas não há estimativa");
  plan = answer(plan, { "il-horas-ociosas": "5" }).plan;
  const kwhOnly = estimateSavings(plan);
  assert.equal(kwhOnly.quantity, 1000); // 40 × 20 W × 5 h × 250 dias ÷ 1000
  assert.equal(kwhOnly.annualValue, null, "sem tarifa não há valor em reais");
  plan = answer(plan, { "il-tarifa": "0,80" }).plan;
  assert.equal(estimateSavings(plan).annualValue, 800);
  assert.ok(estimateSavings(plan).assumptions.length > 0);
  // A tarifa pesquisada só é usada quando o colaborador não informou a dele.
  assert.equal(estimateSavings(answer(plan, { "il-tarifa": "" }).plan, 0.5).annualValue, 500);
});

test("research keeps only references whose link the search returned", () => {
  const sources = [
    { url: "https://fabricante.example.com.br/sensor", title: "Sensor de presença", pageAge: "2026-05-02" },
    { url: "https://gov.example.br/estudo/", title: "Estudo de eficiência", pageAge: null },
  ];
  const output = {
    references: [
      { url: "https://fabricante.example.com.br/sensor", title: "Sensor", category: "preco_equipamento", summary: "Preço de lista.", value: "R$ 89 por unidade" },
      { url: "https://gov.example.br/estudo", title: "Estudo", category: "caso", summary: "Economia em prédios públicos.", value: null },
      { url: "https://inventado.example.com/preco", title: "Fonte inventada", category: "preco_material", summary: "x", value: "R$ 1" },
    ],
    gaps: [],
    notes: null,
  };
  let next = 0;
  const { references, discarded } = acceptReferences(output, sources, NOW, () => `ref-${(next += 1)}`);
  assert.equal(discarded, 1);
  assert.deepEqual(references.map((reference) => reference.url), sources.map((source) => source.url));
  assert.equal(references[0].publishedAt, "2026-05-02", "data da página vem da busca");
  assert.equal(references[1].publishedAt, null);
  assert.equal(references[0].consultedAt, NOW.toISOString());
  assert.ok(references.every((reference) => reference.origin === "web_search"));
});
