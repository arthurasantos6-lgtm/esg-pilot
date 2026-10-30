import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { resolveAiConfig } from "../src/lib/ai/config.ts";
import { retryOnTemporaryFailure } from "../src/lib/ai/retry.ts";
import { describeSchemaIssues, extractJsonObject, jsonInstructions, providerErrorDetail } from "../src/lib/ai/json-output.ts";

test("no AI is configured when no provider variables are set", () => {
  assert.equal(resolveAiConfig({}), null);
});

test("free local Ollama works with only provider and model", () => {
  const config = resolveAiConfig({ AI_PROVIDER: "ollama", AI_MODEL: "qwen2.5:7b" });
  assert.equal(config?.kind, "openai-compatible");
  assert.equal(config?.baseUrl, "http://localhost:11434/v1");
  assert.equal(config?.apiKey, null);
});

test("hosted free tiers require a key and a model", () => {
  assert.equal(resolveAiConfig({ AI_PROVIDER: "gemini", AI_MODEL: "modelo-x" }), null);
  assert.equal(resolveAiConfig({ AI_PROVIDER: "groq", AI_API_KEY: "k" }), null);
  const gemini = resolveAiConfig({ AI_PROVIDER: "gemini", AI_MODEL: "modelo-x", AI_API_KEY: "k" });
  assert.equal(gemini?.baseUrl, "https://generativelanguage.googleapis.com/v1beta/openai");
});

test("generic OpenAI-compatible endpoints and unknown providers", () => {
  const custom = resolveAiConfig({ AI_PROVIDER: "openai-compatible", AI_BASE_URL: "https://ia.exemplo.com/v1/", AI_MODEL: "m" });
  assert.equal(custom?.baseUrl, "https://ia.exemplo.com/v1");
  assert.equal(resolveAiConfig({ AI_PROVIDER: "desconhecido", AI_MODEL: "m", AI_BASE_URL: "https://x" }), null);
});

test("Anthropic is used when its key is present, with the default model", () => {
  const config = resolveAiConfig({ ANTHROPIC_API_KEY: "sk-ant-teste" });
  assert.equal(config?.kind, "anthropic");
  assert.equal(config?.model, "claude-opus-5-5");
  assert.equal(resolveAiConfig({ AI_PROVIDER: "anthropic" }), null);
});

test("provider error details handle Gemini's list format and redact the key", () => {
  assert.equal(providerErrorDetail([{ error: { code: 400, message: "Please pass a valid API key" } }], "segredo-123"), "Please pass a valid API key");
  assert.equal(providerErrorDetail({ error: { message: "bad key segredo-123" } }, "segredo-123"), "bad key [chave]");
  assert.equal(providerErrorDetail({ error: "limite" }, null), "limite");
  assert.equal(providerErrorDetail(null, "k"), null);
  assert.equal(providerErrorDetail({}, "k"), null);
});

test("temporary provider failures are retried and other responses are returned at once", async () => {
  const run = async (statuses) => {
    const queue = [...statuses];
    const waits = [];
    let calls = 0;
    const response = await retryOnTemporaryFailure(
      async () => {
        calls += 1;
        return new Response(null, { status: queue.shift() });
      },
      [1, 2],
      async (ms) => waits.push(ms),
    );
    return { status: response.status, calls, waits };
  };

  assert.deepEqual(await run([200]), { status: 200, calls: 1, waits: [] });
  assert.deepEqual(await run([404]), { status: 404, calls: 1, waits: [] });
  assert.deepEqual(await run([429]), { status: 429, calls: 1, waits: [] });
  assert.deepEqual(await run([503, 200]), { status: 200, calls: 2, waits: [1] });
  assert.deepEqual(await run([503, 503, 503]), { status: 503, calls: 3, waits: [1, 2] });
});

test("JSON is extracted from fenced or wrapped answers and invalid answers are rejected", () => {
  assert.deepEqual(extractJsonObject('Claro!\n```json\n{"a": 1}\n```'), { a: 1 });
  assert.deepEqual(extractJsonObject('texto {"a": {"b": 2}} fim'), { a: { b: 2 } });
  assert.equal(extractJsonObject("sem json aqui"), null);
  assert.equal(extractJsonObject("{quebrado"), null);

  const schema = z.object({ title: z.string(), note: z.string().nullable() });
  assert.match(jsonInstructions(schema), /"title"/);
  const result = schema.safeParse({ title: 1 });
  assert.equal(result.success, false);
  assert.match(describeSchemaIssues(result.error), /title/);
});
