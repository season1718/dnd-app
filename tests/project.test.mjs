import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("contains the D&D Companion product shell", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /D&D Companion/);
  assert.match(page, /ManagementPanel/);
  assert.match(page, /Spellbook/);
});

test("ships the validated 2024 spell catalog", async () => {
  const catalog = JSON.parse(await readFile(new URL("../data/spells-2024-ru.json", import.meta.url), "utf8"));
  assert.equal(catalog.spell_count, 387);
  assert.equal(catalog.spells.length, 387);
  assert.equal(new Set(catalog.spells.map((spell) => spell.id)).size, 387);
});
