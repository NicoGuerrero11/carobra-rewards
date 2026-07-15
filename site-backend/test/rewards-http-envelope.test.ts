import assert from "node:assert/strict";
import test from "node:test";

import { rewardsErrors } from "../src/rewards/shared/errors.js";
import {
  parseRewardsPageRequest,
  rewardsErrorEnvelope,
  rewardsPage,
  RewardsPageRequestError,
} from "../src/rewards/shared/http-contracts.js";

test("Rewards errors use one stable envelope without exposing domain details", () => {
  const error = rewardsErrors.ruleDisabled("Sensitive internal policy detail");
  assert.deepEqual(rewardsErrorEnvelope(error), {
    error: {
      code: "rule_disabled",
      message: "Reward rule is disabled",
    },
  });
  assert.doesNotMatch(JSON.stringify(rewardsErrorEnvelope(error)), /Sensitive internal/);
});

test("Rewards pagination defaults and opaque cursors are stable", () => {
  assert.deepEqual(parseRewardsPageRequest(new URLSearchParams()), {
    limit: 25,
    cursor: null,
  });
  const request = parseRewardsPageRequest(new URLSearchParams({
    limit: "2",
    cursor: "next_page-2",
  }));
  assert.deepEqual(rewardsPage([{ id: "a" }, { id: "b" }], request, "next_page-3"), {
    items: [{ id: "a" }, { id: "b" }],
    pagination: {
      limit: 2,
      next_cursor: "next_page-3",
      has_more: true,
    },
  });
});

test("Rewards pagination rejects unsafe or unbounded requests", () => {
  for (const query of [
    { limit: "0" },
    { limit: "101" },
    { limit: "1.5" },
    { cursor: "customer@example.com" },
  ]) {
    assert.throws(
      () => parseRewardsPageRequest(new URLSearchParams(query)),
      (error: unknown) => error instanceof RewardsPageRequestError
        && error.code === "invalid_request"
        && error.status === 400,
    );
  }
});
