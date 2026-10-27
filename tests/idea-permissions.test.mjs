// Dados fictícios apenas.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canCreateIdeas } from "../src/lib/idea-permissions.ts";

const migration = readFileSync(new URL("../supabase/migrations/20261027_ideas_from_link_only.sql", import.meta.url), "utf8");

test("only collaborators who joined through the company link can create ideas", () => {
  assert.equal(canCreateIdeas({ role: "member", access_link_id: "link-1" }), true);
  assert.equal(canCreateIdeas({ role: "member", access_link_id: null }), false);
  assert.equal(canCreateIdeas({ role: "company_admin", access_link_id: null }), false);
  assert.equal(canCreateIdeas({ role: "company_admin", access_link_id: "link-1" }), false);
});

test("the database enforces the same rule on idea inserts", () => {
  const helper = migration.slice(migration.indexOf("function public.is_link_collaborator"), migration.indexOf("$$;"));
  assert.match(helper, /m\.role = 'member'/);
  assert.match(helper, /m\.access_link_id is not null/);
  assert.match(helper, /m\.status = 'active'/);

  const policy = migration.slice(migration.indexOf("create policy \"Link collaborators can create draft ideas"));
  assert.match(policy, /public\.is_link_collaborator\(organization_id\)/);
  assert.match(policy, /author_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /drop policy "Members can create draft ideas as themselves"/);
});

test("nobody can turn an existing membership into a link collaborator", () => {
  assert.match(migration, /create trigger memberships_protect_access_link/);
  assert.match(migration, /new\.access_link_id is not null\s+and new\.access_link_id is distinct from old\.access_link_id/);
});
