import assert from "node:assert/strict";
import test from "node:test";
import { analyzeIdea } from "../src/lib/esg-analysis.ts";

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
