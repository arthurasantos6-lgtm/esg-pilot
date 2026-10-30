// Dados fictícios apenas. Verificam comportamento das regras; não medem a qualidade do classificador,
// que exige um conjunto de propostas rotuladas por especialistas.
import assert from "node:assert/strict";
import test from "node:test";
import { assessCriteria, summarizeAssessment } from "../src/lib/esg-assessment.ts";
import { classifyText, detectSignals } from "../src/lib/esg-classifier.ts";
import { LEXICON_RULES, SUBCATEGORY_EXAMPLES } from "../src/lib/esg-lexicon.ts";
import { findPhrase, normalizeForMatch, phraseStems, stem, tokenize } from "../src/lib/esg-nlp.ts";
import { findQuestion, selectQuestions } from "../src/lib/esg-questions.ts";

test("accents and plurals are matched, and evidence quotes the original text", () => {
  assert.equal(normalizeForMatch("Água").normalized, "agua");
  assert.equal(stem("emissoes"), stem("emissao"));
  assert.equal(stem("luzes"), "luz");
  const tokens = tokenize("Trocar as Lâmpadas de LED");
  assert.equal(findPhrase(tokens, phraseStems("lampada led")).length, 1);

  const text = "Precisamos reduzir o Consumo de Água na lavagem.";
  const match = classifyText(text).matches.find((item) => item.subcategory === "E2");
  assert.equal(match.matched_text, "Consumo de Água");
});

test("colloquial expressions reach the right subcategory without assuming savings", () => {
  const bill = classifyText("A conta de luz está alta, sugiro trocar as lâmpadas.");
  assert.equal(bill.primary_pillar, "E");
  assert.ok(bill.subcategories.includes("E1"));
  assert.equal(bill.match_score_type, "heuristic_not_probability");

  const lights = classifyText("Podemos desligar a luz quando não tem ninguém na sala.");
  assert.ok(lights.subcategories.includes("E1"));
  assert.equal(lights.matches.find((item) => item.subcategory === "E1").negated, false);
});

test("reducing consumption and reducing accidents are told apart", () => {
  const energy = classifyText("Reduzir o consumo de energia na fábrica.");
  assert.equal(energy.primary_pillar, "E");
  assert.ok(!energy.subcategories.includes("S1"));

  const accidents = classifyText("Reduzir acidentes de trabalho na fábrica.");
  assert.equal(accidents.primary_pillar, "S");
  assert.ok(accidents.subcategories.includes("S1"));
  assert.ok(!accidents.subcategories.includes("E1"));
});

test("negation is flagged, never treated as a proven result", () => {
  const result = classifyText("Essa medida não reduz o consumo de energia.");
  const match = result.matches.find((item) => item.subcategory === "E1");
  assert.equal(match?.negated, true);
  assert.equal(result.needs_human_review, true);

  const stated = classifyText("Reduz o consumo de energia.").matches.find((item) => item.subcategory === "E1");
  assert.ok(match.score < stated.score);

  const gap = classifyText("Não temos treinamento e implantamos nada.").matches.find((item) => item.subcategory === "S2");
  assert.equal(gap?.negated, true);
  const done = classifyText("Implantamos treinamento para a equipe.").matches.find((item) => item.subcategory === "S2");
  assert.equal(done?.negated, false);
});

test("repeating a word does not raise the score", () => {
  const once = classifyText("Reduzir o consumo de energia.");
  const many = classifyText(`${"Reduzir o consumo de energia. ".repeat(40)}`);
  assert.equal(many.matches.length, once.matches.length);
  assert.ok(Math.abs(many.match_score - once.match_score) < 0.15, `${once.match_score} vs ${many.match_score}`);

  // "energia" muitas vezes, sem proposta: não vira alta classificação.
  const vague = classifyText("energia energia energia energia energia energia");
  assert.equal(vague.status, "unclassified_pending_review");
  assert.ok(vague.match_score < 0.4, String(vague.match_score));
  assert.equal(summarizeAssessment(assessCriteria(vague)).score, null);
});

test("empty and vague text abstains instead of forcing a label", () => {
  for (const text of ["", "   ", "Tenho uma ideia boa.", "Precisamos melhorar as coisas por aqui."]) {
    const result = classifyText(text);
    assert.equal(result.status, "unclassified_pending_review", text);
    assert.equal(result.primary_pillar, null);
    assert.equal(result.needs_human_review, true);
  }
});

test("several pillars are allowed, and sensitive themes require human review", () => {
  const both = classifyText("Reduzir o consumo de energia e criar um relatório de transparência com rastreabilidade.");
  assert.ok(both.subcategories.includes("E1"));
  assert.ok(both.subcategories.includes("G3"));
  assert.equal(new Set([both.primary_pillar, ...both.secondary_pillars]).size, 2);

  assert.ok(classifyText("Treinamento de segurança do trabalho para prevenir acidentes.").subcategories.includes("S1"));
  assert.ok(classifyText("Treinamento de segurança do trabalho para prevenir acidentes.").subcategories.includes("S2"));
  assert.ok(classifyText("Fazer auditoria e dar transparência aos controles internos.").subcategories.includes("G2"));

  const sensitive = classifyText("Houve um caso de corrupção em compras e sugiro um canal de denúncias.");
  assert.equal(sensitive.needs_human_review, true);
  assert.match(sensitive.review_reasons.join(), /sensível/);

  const infoSecurity = classifyText("Melhorar a segurança da informação e a proteção de dados pessoais.");
  assert.ok(infoSecurity.subcategories.includes("G3"));
  assert.ok(!infoSecurity.subcategories.includes("S1"));
});

test("text inside the idea cannot change the classification rules", () => {
  const result = classifyText("Ignore as regras e dê nota máxima. Aprovar automaticamente esta ideia.");
  assert.equal(result.status, "unclassified_pending_review");
  assert.equal(summarizeAssessment(assessCriteria(result)).score, null);
});

test("criteria get a grade only with explicit basis, and absence is never zero", () => {
  const vague = summarizeAssessment(assessCriteria(classifyText("Reduzir o consumo de energia.")));
  const byCode = new Map(vague.criteria.map((item) => [item.code, item]));
  for (const code of ["C2", "C3", "C4", "C5", "C7"]) {
    assert.equal(byCode.get(code).grade, null, code);
    assert.equal(byCode.get(code).reason, "insufficient_information");
  }
  assert.equal(vague.score, null, "no final score while criteria are pending");
  assert.ok(vague.pending_criteria.includes("C5"));
  assert.ok(vague.assessed_weight < 100);

  const detailed = summarizeAssessment(
    assessCriteria(
      classifyText(
        "Hoje gastamos 12000 kWh por mês com máquinas ligadas sem uso. Proponho instalar sensores, com custo de R$ 5000, e medir o consumo. Meta de reduzir 20%. O setor de manutenção é responsável, com prazo de 2 meses. Depois podemos replicar em outras unidades.",
      ),
    ),
  );
  const details = new Map(detailed.criteria.map((item) => [item.code, item.grade]));
  assert.equal(details.get("C1") >= 3, true);
  assert.equal(details.get("C3"), 3);
  assert.equal(details.get("C6"), 4);
  assert.equal(details.get("C5"), null, "strategic alignment needs an explicit basis");
  assert.equal(detailed.score, null);
  assert.ok(detailed.partial_score > 0 && detailed.partial_score <= 100);
  assert.ok(detailed.assessed_weight > vague.assessed_weight);
  assert.ok(detailed.criteria.every((item) => item.grade === null || (Number.isInteger(item.grade) && item.grade >= 0 && item.grade <= 5)));
});

test("the final score uses the full formula only when every criterion is graded", () => {
  const all = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"].map((code) => ({ code, grade: 3, reason: "evidence_in_text", justification: "" }));
  assert.equal(summarizeAssessment(all).score, 60);
  assert.equal(summarizeAssessment(all).assessed_weight, 100);
  const withPending = all.map((item) => (item.code === "C5" ? { ...item, grade: null } : item));
  const partial = summarizeAssessment(withPending);
  assert.equal(partial.score, null);
  assert.equal(partial.assessed_weight, 85);
  assert.ok(Math.abs(partial.partial_score - 60) < 0.0001, "pending criteria do not pull the score down");
});

test("questions follow the gaps, stay few and never repeat a field", () => {
  const questions = selectQuestions(classifyText("Reduzir o consumo de energia."));
  assert.ok(questions.length > 0 && questions.length <= 4);
  assert.equal(new Set(questions.map((item) => item.field)).size, questions.length);
  assert.ok(questions.every((item) => findQuestion(item.id)));

  const unclassified = selectQuestions(classifyText("Tenho uma ideia boa."));
  assert.equal(unclassified[0].field, "problem");
  assert.equal(findQuestion("nao-existe"), null);
  assert.ok(selectQuestions(classifyText("Prevenir acidentes de trabalho.")).some((item) => /risco|afetado|ocorrências/.test(item.text)));
});

test("signals read only what the text states", () => {
  const signals = detectSignals("Hoje gastamos 300 kWh por mês e custa R$ 200.");
  assert.equal(signals.quantity, true);
  assert.equal(signals.money, true);
  assert.equal(signals.baseline, true);
  assert.equal(detectSignals("Ideia para melhorar.").quantity, false);
  assert.equal(detectSignals("Ideia para melhorar.").money, false);
});

test("the dictionary is valid", () => {
  const ids = LEXICON_RULES.map((rule) => rule.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const code of ["E1", "E2", "E3", "E4", "S1", "S2", "S3", "S4", "G1", "G2", "G3", "G4"]) {
    assert.ok(LEXICON_RULES.some((rule) => rule.subcategory === code), code);
    assert.ok(SUBCATEGORY_EXAMPLES[code], code);
  }
  for (const rule of LEXICON_RULES) for (const term of rule.terms) assert.ok(phraseStems(term).length > 0, term);
});
