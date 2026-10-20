import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeIdea,
  analyzeIdeaWithCriteria,
  DEFAULT_CRITERIA,
  parseEsgCriteria,
} from "../src/lib/esg-analysis.ts";

test("identifies multiple dimensions and clearly qualifies the result", () => {
  const result = analyzeIdea(
    "Reduzir energia e água, melhorar a segurança e aumentar a transparência.",
  );

  assert.deepEqual(
    result.dimensions.map(({ dimension }) => dimension),
    ["E", "S", "G"],
  );
  assert.equal(result.potential, "alto");
  assert.match(result.notice, /não é uma avaliação de impacto/);
});

test("does not infer an ESG dimension when no supported terms are present", () => {
  const result = analyzeIdea("Reorganizar o calendário interno da equipe.");

  assert.deepEqual(result.dimensions, []);
  assert.equal(result.potential, "baixo");
  assert.deepEqual(result.suggestedMetrics, []);
});

test("uses the provided criteria version and records which one evaluated the idea", () => {
  const criteria = parseEsgCriteria(
    {
      E: { keywords: ["Frota Elétrica"], explanation: "Mobilidade de baixo carbono.", suggestedMetrics: ["Veículos elétricos"] },
      S: { keywords: ["voluntariado"], explanation: "Engajamento social.", suggestedMetrics: [] },
      G: { keywords: ["auditoria"], explanation: "Controles independentes.", suggestedMetrics: [] },
    },
    { alto: 3, medio: 1 },
  );
  assert.ok(criteria);

  const result = analyzeIdeaWithCriteria("Substituir a frota elétrica antiga.", criteria, {
    criteriaVersionId: "00000000-0000-0000-0000-000000000001",
    criteriaVersionLabel: "v2 - mobilidade",
  });

  assert.deepEqual(result.dimensions.map(({ dimension }) => dimension), ["E"]);
  assert.equal(result.dimensions[0].explanation, "Mobilidade de baixo carbono.");
  assert.equal(result.potential, "médio");
  assert.deepEqual(result.suggestedMetrics, ["Veículos elétricos"]);
  assert.equal(result.criteriaVersionLabel, "v2 - mobilidade");
});

test("rejects malformed criteria so the caller can fall back to the defaults", () => {
  assert.equal(parseEsgCriteria({ E: { keywords: ["x"] } }, { alto: 4, medio: 2 }), null);
  assert.equal(parseEsgCriteria(null, { alto: 4, medio: 2 }), null);
  assert.equal(
    parseEsgCriteria(
      {
        E: DEFAULT_CRITERIA.dimensions.E,
        S: DEFAULT_CRITERIA.dimensions.S,
        G: DEFAULT_CRITERIA.dimensions.G,
      },
      { alto: "4" },
    ),
    null,
  );
});

test("default analysis is labelled as using the built-in criteria", () => {
  const result = analyzeIdea("Programa de capacitação.");
  assert.equal(result.criteriaVersionId, null);
  assert.match(result.criteriaVersionLabel, /padrão/);
});
