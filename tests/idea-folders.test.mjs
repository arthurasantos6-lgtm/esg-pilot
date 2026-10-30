// Dados fictícios apenas.
import assert from "node:assert/strict";
import test from "node:test";
import { compareByScore, countByFolder, isInFolder, parseFolder } from "../src/lib/idea-folders.ts";

const ideas = [
  { id: "a", dimensions: ["E", "S"], score: 40, created_at: "2026-10-01T00:00:00Z" },
  { id: "b", dimensions: ["G"], score: 90, created_at: "2026-10-02T00:00:00Z" },
  { id: "c", dimensions: [], score: null, created_at: "2026-10-03T00:00:00Z" },
  { id: "d", dimensions: ["E"], score: null, created_at: "2026-10-04T00:00:00Z" },
];

test("an idea appears in every related folder, and unclassified ones have their own", () => {
  assert.deepEqual(countByFolder(ideas), { E: 2, S: 1, G: 1, none: 1 });
  assert.equal(isInFolder(ideas[0], "S"), true);
  assert.equal(isInFolder(ideas[0], "none"), false);
  assert.equal(isInFolder(ideas[2], "none"), true);
});

test("sorting puts the highest score first and unscored ideas last, newest first", () => {
  assert.deepEqual([...ideas].sort(compareByScore).map(({ id }) => id), ["b", "a", "d", "c"]);
});

test("only known folders are accepted", () => {
  assert.equal(parseFolder("E"), "E");
  assert.equal(parseFolder("none"), "none");
  assert.equal(parseFolder("X"), null);
  assert.equal(parseFolder(undefined), null);
});
