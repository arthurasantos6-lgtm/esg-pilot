// Textos fictícios. Verificam o título curto gerado a partir da ideia.
import assert from "node:assert/strict";
import test from "node:test";
import { displayTitle, FALLBACK_TITLE, shortTitle } from "../src/lib/idea-title.ts";

test("the title is short and comes from what the person proposes", () => {
  const cases = [
    ["Sugiro instalar sensores de presença nos corredores e banheiros do prédio. As luzes ficam acesas.", "Instalar sensores de presença nos corredores"],
    ["Na lavagem das caixas usamos muita água limpa. Sugiro instalar um filtro e reutilizar essa água na lavagem.", "Instalar um filtro e reutilizar essa água"],
    ["Acho que dava para melhorar as coisas no refeitório, tenho algumas ideias.", "Melhorar as coisas no refeitório"],
    ["A porta da câmara fria fica aberta. Podemos colocar um sensor com alarme.", "Colocar um sensor com alarme"],
    ["Hoje algumas compras são feitas sem cotação. Proponho exigir três orçamentos para compras acima de R$ 5 mil.", "Exigir três orçamentos para compras"],
  ];
  for (const [text, expected] of cases) assert.equal(shortTitle(text), expected, text);
});

test("titles never exceed the limit and never end on a connector", () => {
  const title = shortTitle("Proponho criar um programa permanente de capacitação ambiental para todos os colaboradores das três unidades.");
  assert.ok(title.split(" ").length <= 7 && title.length <= 60, title);
  assert.ok(!/\s(de|da|do|e|para|com|até)$/i.test(title), title);
  assert.equal(shortTitle(""), FALLBACK_TITLE);
  assert.equal(shortTitle("ok"), FALLBACK_TITLE);
  assert.equal(shortTitle("Sugiro"), FALLBACK_TITLE);
});

test("long saved titles are shown short, short ones are kept", () => {
  assert.equal(
    displayTitle("Acho que a empresa poderia colocar sensores de presença nas áreas onde as luzes…"),
    "Colocar sensores de presença nas áreas",
  );
  assert.equal(displayTitle("Troca de lâmpadas"), "Troca de lâmpadas");
  assert.equal(displayTitle("Uso exagerado de copos de plásticos"), "Uso exagerado de copos de plásticos");
  assert.equal(displayTitle("…", "Sugiro trocar os copos de plástico por canecas."), "Trocar os copos de plástico por canecas");
});
