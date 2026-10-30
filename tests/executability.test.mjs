// Dados fictícios apenas.
import assert from "node:assert/strict";
import test from "node:test";
import { executabilityLevel, executabilityScore } from "../src/lib/executability.ts";
import { splitForSpeech } from "../src/lib/speech.ts";

const result = (urgency, impact, ease) => ({
  executability: { urgency: { score: urgency }, impact: { score: impact }, ease: { score: ease } },
});

test("the score applies fixed weights and rounds", () => {
  assert.equal(executabilityScore(result(50, 80, 60)), 65);
  assert.equal(executabilityScore(result(100, 100, 100)), 100);
  assert.equal(executabilityScore(result(0, 0, 0)), 0);
});

test("out-of-range factors are clamped", () => {
  assert.equal(executabilityScore(result(500, 500, 500)), 100);
  assert.equal(executabilityScore(result(-20, -20, -20)), 0);
});

test("evaluations without all factors have no score", () => {
  assert.equal(executabilityScore(null), null);
  assert.equal(executabilityScore({ summary: "antiga" }), null);
  assert.equal(executabilityScore({ executability: { urgency: { score: 50 }, impact: { score: 50 } } }), null);
  assert.equal(executabilityScore(result("alta", 50, 50)), null);
});

test("score levels", () => {
  assert.equal(executabilityLevel(70).key, "high");
  assert.equal(executabilityLevel(69).key, "medium");
  assert.equal(executabilityLevel(40).key, "medium");
  assert.equal(executabilityLevel(39).key, "low");
});

test("speech text is split without losing content or exceeding the limit", () => {
  assert.deepEqual(splitForSpeech("   "), []);
  assert.deepEqual(splitForSpeech("Olá. Tudo bem?"), ["Olá. Tudo bem?"]);
  const long = `${"palavra ".repeat(100)}fim. Outra frase.`;
  const chunks = splitForSpeech(long);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 220));
  assert.match(chunks.at(-1), /Outra frase\.$/);
});
