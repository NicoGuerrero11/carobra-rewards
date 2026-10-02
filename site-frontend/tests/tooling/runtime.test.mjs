import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyBuildNode, verifyFunctions } from "../../scripts/verify-runtime.mjs";

function fixture(t, runtimes) {
  const root = mkdtempSync(join(tmpdir(), "carobra-runtime-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  runtimes.forEach((runtime, i) => {
    const directory = join(root, "nested", `${i}.func`);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, ".vc-config.json"), JSON.stringify({ runtime }));
  });
  return root;
}

test("requires the actual build process to run Node 24", () => {
  verifyBuildNode("24.21.0");
  for (const version of ["18.20.8", "20.19.0", "22.0.0", "26.0.0"]) {
    assert.throws(() => verifyBuildNode(version), /Build requires Node 24/);
  }
});

test("checks every nested Node function and reports Edge separately", (t) => {
  const results = verifyFunctions(fixture(t, ["nodejs24.x", "edge", "nodejs24.x"]));
  assert.equal(results.length, 3);
});

test("rejects a retired runtime even after a valid function", (t) => {
  for (const runtime of ["nodejs18.x", "nodejs20.x", "nodejs22.x"]) {
    assert.throws(() => verifyFunctions(fixture(t, ["nodejs24.x", runtime])), /expected nodejs24.x/);
  }
});

test("rejects missing, empty and Edge-only SSR output", (t) => {
  const empty = fixture(t, []);
  assert.throws(() => verifyFunctions(join(empty, "missing")), /ENOENT/);
  assert.throws(() => verifyFunctions(empty), /No nodejs24.x functions/);
  assert.throws(() => verifyFunctions(fixture(t, ["edge"])), /No nodejs24.x functions/);
});

test("rejects invalid or missing runtime metadata", (t) => {
  const root = fixture(t, [undefined]);
  assert.throws(() => verifyFunctions(root), /received undefined/);
  writeFileSync(join(root, "nested/0.func/.vc-config.json"), "invalid json");
  assert.throws(() => verifyFunctions(root), SyntaxError);
});
