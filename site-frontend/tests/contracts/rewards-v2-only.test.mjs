import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("customer rewards page and BFF expose only V2 rewards contracts", async () => {
  const page = await readFile(new URL("../../src/pages/cliente/recompensas.astro", import.meta.url), "utf8");
  const bff = await readFile(new URL("../../src/pages/api/v1/[...path].ts", import.meta.url), "utf8");

  assert.doesNotMatch(page, /\/api\/v1\/rewards\/(?:account|eligibility)/);
  assert.doesNotMatch(page, /legacyAccount|LegacyAccountSummary/);
  assert.match(page, /\/api\/v1\/rewards\/journey/);
  assert.match(page, /unavailable && !journey/);

  assert.doesNotMatch(bff, /"rewards\/(?:account|eligibility)"/);
  assert.match(bff, /"rewards\/journey"/);
  assert.match(bff, /"rewards\/portal"/);
});
