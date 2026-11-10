// Dados fictícios; a API da Tavily é simulada (nenhuma chamada real).
import assert from "node:assert/strict";
import test from "node:test";
import { buildSearchQueries, extractBrlValues, resultsToReferences, runWebSearch, searchGaps, SearchUnavailableError } from "../src/lib/web-search.ts";

const NOW = new Date("2026-11-10T12:00:00Z");
let counter = 0;
const makeId = () => `ref-${(counter += 1)}`;

test("queries come from the initiative type, without AI", () => {
  const queries = buildSearchQueries("iluminacao", "Sensores nos corredores");
  assert.ok(queries.some((item) => item.query === "preço sensor de presença para iluminação" && item.category === "preco_equipamento"));
  assert.ok(queries.some((item) => item.category === "roi"), "iniciativa ambiental busca retorno");
  assert.ok(queries.length <= 8);
  assert.ok(queries.some((item) => item.query === "Sensores nos corredores custo"), "busca também pelas palavras da ideia");
  assert.ok(queries.some((item) => item.category === "manutencao") && queries.some((item) => /tarifa/.test(item.query)));
  assert.ok(!buildSearchQueries("capacitacao", "x").some((item) => item.category === "roi"));
  assert.ok(buildSearchQueries("geral", "Horta comunitária no pátio")[0].query.includes("Horta comunitária"));
  assert.equal(buildSearchQueries("residuos", "x", ["baias de madeira"]).at(-1).query, "preço baias de madeira");
});

test("real values are copied from the snippet, never invented", () => {
  assert.deepEqual(extractBrlValues("Sensor por R$ 89,90 à vista ou R$1.299,00 o kit; projetos de R$ 12 mil."), ["R$ 89,90", "R$1.299,00", "R$ 12 mil"]);
  assert.deepEqual(extractBrlValues("Economia de 30% na conta de luz."), []);
});

test("results become references with link, dates and snippet", () => {
  const references = resultsToReferences(
    [
      { category: "preco_equipamento", results: [
        { title: "Sensor de presença", url: "https://loja.example.com.br/sensor", content: "Sensor de teto  R$ 79,90 unidade", published_date: "2026-04-01" },
        { title: "Sem link", url: "javascript:alert(1)", content: "R$ 1" },
      ] },
      { category: "caso", results: [
        { title: "Repetida", url: "https://loja.example.com.br/sensor/", content: "..." },
        { title: "Estudo", url: "https://gov.example.br/estudo", content: "Economia de 40% em prédios públicos." },
      ] },
    ],
    NOW,
    makeId,
  );
  assert.equal(references.length, 2, "descarta link inválido e repetido");
  assert.equal(references[0].value, "R$ 79,90 (no trecho da página)");
  assert.equal(references[0].summary, "Sensor de teto R$ 79,90 unidade");
  assert.equal(references[0].publishedAt, "2026-04-01");
  assert.equal(references[0].consultedAt, NOW.toISOString());
  assert.equal(references[0].origin, "search_api");
  assert.equal(references[1].value, null);
  assert.equal(references[1].publishedAt, null);

  const gaps = searchGaps(references);
  assert.ok(gaps.some((gap) => /confirme/.test(gap)));
  assert.ok(searchGaps([])[0].includes("não retornou"));
  assert.ok(searchGaps([references[1]]).some((gap) => /cotação/.test(gap)));
});

function mockFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, auth: init.headers.Authorization });
    return handler(body, calls.length);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("search calls Tavily with the key and retries without the country if refused", async () => {
  const mock = mockFetch((body) => (body.country ? json(400, { detail: "invalid country" }) : json(200, { results: [{ title: "A", url: "https://a.example.com", content: "R$ 10" }] })));
  try {
    const { batches, failed } = await runWebSearch("tvly-test", [{ query: "preço sensor", category: "preco_equipamento" }]);
    assert.equal(failed, 0);
    assert.equal(batches[0].results.length, 1);
    assert.equal(mock.calls[0].auth, "Bearer tvly-test");
    assert.equal(mock.calls[0].body.include_answer, false, "nunca pede resposta gerada por IA");
    assert.equal(mock.calls[1].body.country, undefined);
  } finally {
    mock.restore();
  }
});

test("free quota exhaustion becomes a clear message; partial failures are tolerated", async () => {
  let mock = mockFetch(() => json(432, { detail: "limit" }));
  try {
    await assert.rejects(runWebSearch("k", [{ query: "a", category: "outro" }]), (error) => error instanceof SearchUnavailableError && /limite gratuito/.test(error.message));
  } finally {
    mock.restore();
  }
  mock = mockFetch((_body, call) => (call === 1 ? json(500, {}) : json(200, { results: [] })));
  try {
    const { batches, failed } = await runWebSearch("k", [{ query: "a", category: "outro" }, { query: "b", category: "caso" }]);
    assert.equal(failed, 1);
    assert.equal(batches.length, 1);
  } finally {
    mock.restore();
  }
});
