// Dados fictícios apenas.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseCollaboratorName, readCreateLinkForm } from "../src/lib/access-links.ts";
import { memberDisplayName } from "../src/lib/members.ts";

const migration = readFileSync(new URL("../supabase/migrations/20261025_access_links.sql", import.meta.url), "utf8");

function functionBody(name) {
  const start = migration.indexOf(`function public.${name}(`);
  assert.ok(start >= 0, `function ${name} exists`);
  return migration.slice(start, migration.indexOf("$$;", start));
}

test("the collaborator name is trimmed and must have a reasonable length", () => {
  assert.equal(parseCollaboratorName("  Maria   Fictícia "), "Maria Fictícia");
  assert.equal(parseCollaboratorName("A"), null);
  assert.equal(parseCollaboratorName("   "), null);
  assert.equal(parseCollaboratorName("x".repeat(81)), null);
  assert.equal(parseCollaboratorName(null), null);
});

test("link validity becomes an absolute expiration date and only allowed periods are accepted", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const form = new FormData();
  form.set("label", " Unidade fictícia ");
  form.set("expiresInDays", "30");
  assert.deepEqual(readCreateLinkForm(form, now), { label: "Unidade fictícia", expiresAt: "2026-11-19T12:00:00.000Z" });

  const noExpiry = new FormData();
  noExpiry.set("expiresInDays", "");
  assert.deepEqual(readCreateLinkForm(noExpiry, now), { label: null, expiresAt: null });

  const invalid = new FormData();
  invalid.set("expiresInDays", "9999");
  assert.ok("error" in readCreateLinkForm(invalid, now));
});

test("joining through a link only ever grants the collaborator role in the link's organization", () => {
  const join = functionBody("join_organization_with_link");
  assert.match(join, /values \(v_link\.organization_id, v_uid, 'member', 'active', v_link\.id\)/);
  assert.doesNotMatch(join, /company_admin/);
  assert.match(join, /linked_to_other_org/);
  assert.match(join, /l\.status = 'active'/);
  assert.match(join, /l\.expires_at is null or l\.expires_at > now\(\)/);
  assert.match(join, /o\.status in \('active', 'trial'\)/);
  assert.match(join, /platform_admin_cannot_join/);
});

test("tokens are generated in the database, long and random; public lookup exposes only the company name", () => {
  assert.match(migration, /token text not null unique check \(token ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(functionBody("create_access_link"), /gen_random_uuid\(\)::text \|\| gen_random_uuid\(\)::text/);
  assert.match(functionBody("get_access_link_public"), /returns table \(organization_id uuid, organization_name text\)/);
  assert.doesNotMatch(migration, /on public\.organization_access_links for (insert|update|delete|all)/);
});

test("collaborators without e-mail get a neutral display name", () => {
  assert.equal(memberDisplayName({ user_id: "1234567890abcdef", email: null }), "Colaborador por link · 12345678");
  assert.equal(memberDisplayName({ user_id: "x", email: "gestora@exemplo.com" }), "gestora@exemplo.com");
});
