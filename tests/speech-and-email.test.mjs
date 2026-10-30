// Dados fictícios apenas.
import assert from "node:assert/strict";
import test from "node:test";
import { parseCollaboratorEmail } from "../src/lib/access-links.ts";
import { ideaDecisionMessage, ideaProtocol, ideaReceivedMessage } from "../src/lib/email-messages.ts";
import { splitForSpeech } from "../src/lib/speech.ts";

test("speech text is split without losing content or exceeding the limit", () => {
  assert.deepEqual(splitForSpeech("   "), []);
  assert.deepEqual(splitForSpeech("Olá. Tudo bem?"), ["Olá. Tudo bem?"]);
  const long = `${"palavra ".repeat(100)}fim. Outra frase.`;
  const chunks = splitForSpeech(long);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 220));
  assert.match(chunks.at(-1), /Outra frase\.$/);
});

test("the email is optional, but must be valid when informed", () => {
  assert.deepEqual(parseCollaboratorEmail(""), { email: null });
  assert.deepEqual(parseCollaboratorEmail(null), { email: null });
  assert.deepEqual(parseCollaboratorEmail("  Maria@Exemplo.com "), { email: "maria@exemplo.com" });
  assert.equal(parseCollaboratorEmail("não é e-mail").email, undefined);
  assert.ok(parseCollaboratorEmail("sem-arroba").error);
});

test("the protocol is short and stable", () => {
  assert.equal(ideaProtocol("3f2a9c1e-0000-4000-8000-000000000000"), "3F2A9C1E");
});

test("the receipt email does not repeat text typed by the sender", () => {
  const { text, subject } = ideaReceivedMessage({ organizationName: "Empresa Demo", protocol: "ABC12345" });
  assert.match(subject, /ABC12345/);
  assert.match(text, /Empresa Demo/);
});

test("decision emails exist only for the collaborator's outcomes", () => {
  const base = { organizationName: "Empresa Demo", protocol: "ABC12345", title: "Reúso de água" };
  assert.match(ideaDecisionMessage({ ...base, status: "approved" }).text, /foi aceita/);
  assert.match(ideaDecisionMessage({ ...base, status: "rejected" }).text, /não seguirá adiante/);
  assert.equal(ideaDecisionMessage({ ...base, status: "in_review" }), null);
  assert.equal(ideaDecisionMessage({ ...base, status: "prioritized" }), null);

  const info = ideaDecisionMessage({ ...base, status: "awaiting_info", managerMessage: "Qual é o consumo?", ideaUrl: "https://exemplo.com/ideas/1" });
  assert.match(info.text, /Qual é o consumo\?/);
  assert.match(info.text, /https:\/\/exemplo\.com\/ideas\/1/);
  assert.doesNotMatch(ideaDecisionMessage({ ...base, status: "approved", ideaUrl: "https://exemplo.com/x" }).text, /exemplo\.com/);
});
