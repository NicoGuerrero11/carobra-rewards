import assert from "node:assert/strict";
import test from "node:test";
import { authRequestTimeout, loadConfig } from "../src/config.js";

test("auth has a bounded dedicated timeout beyond the API budget", () => {
  const config = loadConfig({});
  assert.equal(config.apiRequestTimeoutMs, 5000);
  assert.equal(config.authApiResponseBudgetMs, 7000);
  assert.equal(authRequestTimeout(config), 9000);
  assert.equal(authRequestTimeout(loadConfig({ API_REQUEST_TIMEOUT_MS: "50" })), 9000);
});

for (const timeout of ["7000", "7999", "16000"]) {
  test(`rejects unsafe auth timeout ${timeout}`, () => {
    assert.throws(() => loadConfig({ AUTH_REQUEST_TIMEOUT_MS: timeout }));
  });
}

test("accepts coordinated bounded API/BFF budgets", () => {
  assert.equal(authRequestTimeout(loadConfig({
    AUTH_API_RESPONSE_BUDGET_MS: "5000", AUTH_REQUEST_TIMEOUT_MS: "7000",
  })), 7000);
});
