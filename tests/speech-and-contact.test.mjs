// Dados fictícios apenas.
import assert from "node:assert/strict";
import test from "node:test";
import { parseCollaboratorEmail } from "../src/lib/access-links.ts";
import { ideaProtocol, isDecisionOffered } from "../src/lib/idea-status.ts";
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

test("requesting information is no longer offered as a decision", () => {
  assert.equal(isDecisionOffered("awaiting_info"), false);
  assert.equal(isDecisionOffered("approved"), true);
  assert.equal(isDecisionOffered("rejected"), true);
});
