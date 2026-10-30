// Dados fictícios apenas.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { encodeWav, isWav, MAX_WAV_BYTES, MIN_AUDIBLE_PEAK, normalizeVolume, peakLevel } from "../src/lib/audio-wav.ts";
import { NO_SPEECH_MARKER, readTranscription } from "../src/lib/ai/transcription-response.ts";
import { isTranscriptionOnlyModel, resolveTranscriptionConfig } from "../src/lib/ai/config.ts";
import {
  computeEsgScore,
  ESG_CRITERIA,
  ESG_SUBCATEGORIES,
  humanReviewReasons,
  potentialBand,
  storedEsgScore,
} from "../src/lib/esg-engine.ts";
import { findSimilarIdeas, selectRelevantKnowledge } from "../src/lib/text-similarity.ts";

const allScores = (score) => ESG_CRITERIA.map(({ code }) => ({ code, score }));

test("weights total 100 and there are 12 subcategories", () => {
  assert.equal(ESG_CRITERIA.reduce((sum, { weight }) => sum + weight, 0), 100);
  assert.equal(ESG_SUBCATEGORIES.length, 12);
});

test("the score follows the weighted formula and is computed only with valid notes", () => {
  assert.equal(computeEsgScore(allScores(5)), 100);
  assert.equal(computeEsgScore(allScores(0)), 0);
  assert.equal(computeEsgScore(allScores(3)), 60);
  assert.equal(computeEsgScore(allScores(7)), null, "a note above 5 is rejected");
  assert.equal(computeEsgScore(allScores(2.5)), null);
  assert.equal(computeEsgScore(allScores(3).slice(0, 7)), null, "a missing criterion is rejected");
  const repeated = allScores(3);
  repeated[1] = { code: "C1", score: 3 };
  assert.equal(computeEsgScore(repeated), null, "a repeated criterion is rejected");
});

test("bands do not overlap at their limits", () => {
  assert.equal(potentialBand(100).key, "very_high");
  assert.equal(potentialBand(80).key, "very_high");
  assert.equal(potentialBand(79.99).key, "high");
  assert.equal(potentialBand(60).key, "high");
  assert.equal(potentialBand(59.99).key, "moderate");
  assert.equal(potentialBand(20).key, "low");
  assert.equal(potentialBand(19.99).key, "very_low");
  assert.equal(potentialBand(0).key, "very_low");
});

test("critical cases require human review even with the maximum score", () => {
  const base = { criticalRisks: [], confidenceEstimate: 0.9, criteria: allScores(5) };
  assert.deepEqual(humanReviewReasons(base), []);
  assert.match(humanReviewReasons({ ...base, criticalRisks: ["safety"] })[0], /segurança/);
  assert.match(humanReviewReasons({ ...base, confidenceEstimate: 0.69 })[0], /limiar/);
  assert.equal(humanReviewReasons({ ...base, confidenceEstimate: 0.7 }).length, 0);
  const vague = allScores(1).map((item) => ({ ...item, insufficientInformation: item.code === "C1" }));
  assert.match(humanReviewReasons({ ...base, criteria: vague })[0], /insuficiente/);
});

test("evaluations from before the v2 engine have no potential score", () => {
  assert.equal(storedEsgScore({ summary: "antiga" }), null);
  assert.equal(storedEsgScore(null), null);
  assert.equal(storedEsgScore({ engine: { score: 64 } }), 64);
});

test("similar ideas are suggested, most similar first, without the idea itself", () => {
  const target = { id: "a", text: "Reaproveitar água da lavagem de peças com filtro" };
  const matches = findSimilarIdeas(target, [
    { id: "a", text: target.text },
    { id: "b", text: "Reaproveitar a água usada na lavagem de peças" },
    { id: "c", text: "Treinamento de segurança para novos colaboradores" },
  ]);
  assert.deepEqual(matches.map((match) => match.idea.id), ["b"]);
});

test("knowledge retrieval keeps the rules and only related records, within the limit", () => {
  const rule = { title: "Regra", description: "Avaliar sempre", category: "classification_rule" };
  const water = { title: "Gestão de água", description: "Reúso e perdas", category: "evaluation_criteria" };
  const ethics = { title: "Ética", description: "Conflitos de interesse", category: "evaluation_criteria" };
  const selected = selectRelevantKnowledge([rule, water, ethics], "Reaproveitar a água da lavagem");
  assert.deepEqual(selected, [rule, water]);

  const many = Array.from({ length: 20 }, (_, index) => ({ title: `Água ${index}`, description: "água", category: "concept" }));
  assert.equal(selectRelevantKnowledge(many, "água").length, 8);
});

test("recordings become valid WAV files within the upload limit", () => {
  const wav = encodeWav(new Float32Array([0, 1, -1, 2]), 16_000);
  assert.equal(wav.length, 44 + 8);
  assert.equal(isWav(wav), true);
  assert.equal(isWav(new TextEncoder().encode("não é áudio, apenas um texto qualquer bem longo para o teste")), false);
  const view = new DataView(wav.buffer);
  assert.equal(view.getInt16(46, true), 32767);
  assert.equal(view.getInt16(48, true), -32768);
  assert.equal(view.getInt16(50, true), 32767, "out-of-range samples are clamped");
  assert.ok(MAX_WAV_BYTES < 4.5 * 1024 * 1024);
});

test("quiet recordings are amplified, silence is detected and loud ones stay as they are", () => {
  const quiet = new Float32Array([0.1, -0.2, 0.05]);
  assert.ok(Math.abs(peakLevel(normalizeVolume(quiet)) - 0.9) < 0.0001);
  const loud = new Float32Array([0.95, -0.1]);
  assert.equal(normalizeVolume(loud), loud);
  assert.deepEqual([...normalizeVolume(new Float32Array(2))], [0, 0]);
  assert.ok(peakLevel(new Float32Array(10)) < MIN_AUDIBLE_PEAK);
});

test("an empty model answer is not confused with audio without speech", () => {
  const answer = (parts, extra = {}) => ({ candidates: [{ finishReason: "STOP", content: { parts }, ...extra }] });
  assert.deepEqual(readTranscription(answer([{ text: " Olá, " }, { text: "tudo bem? " }])), { kind: "text", text: "Olá, tudo bem?" });
  assert.deepEqual(readTranscription(answer([{ text: "rascunho interno", thought: true }, { text: "Olá" }])), { kind: "text", text: "Olá" });
  assert.deepEqual(readTranscription(answer([{ text: NO_SPEECH_MARKER }])), { kind: "no_speech" });
  assert.deepEqual(readTranscription(answer([])), { kind: "empty", detail: "resposta sem texto (finishReason=STOP, partes=0)" });
  assert.match(readTranscription({ promptFeedback: { blockReason: "SAFETY" } }).detail, /bloqueio=SAFETY/);
  assert.match(readTranscription({}).detail, /finishReason=ausente/);
});

test("transcription has its own model and falls back to the main one", () => {
  const base = { AI_PROVIDER: "gemini", AI_API_KEY: "segredo-123", AI_MODEL: "conversa" };
  assert.deepEqual(resolveTranscriptionConfig(base)?.models, ["conversa"]);
  assert.deepEqual(resolveTranscriptionConfig({ ...base, AI_TRANSCRIPTION_MODEL: "models/audio" })?.models, ["audio", "conversa"]);
  assert.deepEqual(resolveTranscriptionConfig({ ...base, AI_TRANSCRIPTION_MODEL: "conversa" })?.models, ["conversa"]);
  assert.deepEqual(resolveTranscriptionConfig({ AI_PROVIDER: "groq", AI_API_KEY: "k", AI_MODEL: "m" }), {
    provider: "groq",
    models: ["whisper-large-v3-turbo"],
    apiKey: "k",
  });
  assert.deepEqual(resolveTranscriptionConfig({ AI_PROVIDER: "groq", AI_API_KEY: "k", AI_TRANSCRIPTION_MODEL: "whisper-large-v3" })?.models, ["whisper-large-v3"]);
  assert.equal(resolveTranscriptionConfig({ AI_PROVIDER: "groq", AI_MODEL: "m" }), null);
  assert.equal(resolveTranscriptionConfig({ AI_PROVIDER: "ollama", AI_API_KEY: "k", AI_MODEL: "m" }), null);
  assert.equal(resolveTranscriptionConfig({ AI_PROVIDER: "gemini", AI_MODEL: "m" }), null);
  assert.equal(isTranscriptionOnlyModel("gemini-3.5-transcribe"), true);
  assert.equal(isTranscriptionOnlyModel("gemini-3.8-flash"), false);
  assert.equal(isTranscriptionOnlyModel("whisper-large-v3-turbo"), true);
  assert.equal(isTranscriptionOnlyModel("llama-3.3-70b-versatile"), false);
  assert.equal(isTranscriptionOnlyModel(null), false);
});

test("the knowledge import has 40 unique records, allowed categories and is safe to rerun", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261101_seed_knowledge_base.sql", import.meta.url), "utf8");
  const slugs = [...sql.matchAll(/^\s*\('(esg-\d\d-[a-z0-9-]+)'/gm)].map((match) => match[1]);
  assert.equal(slugs.length, 40);
  assert.equal(new Set(slugs).size, 40);
  const categories = new Set([...sql.matchAll(/', '(concept|evaluation_criteria|classification_rule|recommendation|reference|guiding_question)', '/g)].map((match) => match[1]));
  assert.deepEqual([...categories].sort(), ["classification_rule", "concept", "evaluation_criteria", "recommendation"]);
  assert.match(sql, /on conflict \(slug\) do nothing/);
  assert.match(sql, /where not exists/);
  assert.doesNotMatch(sql, /do update|\bdelete\b|\bdrop\b/i);
});
