import assert from "node:assert/strict";
import test from "node:test";

import { RewardsApiClient } from "../src/api-client.js";
import type { SiteBackendConfig } from "../src/config.js";

test("Rewards evidence keeps only safe customer and SISCA identity facts", async () => {
  const paths: string[] = [];
  const client = new RewardsApiClient(config(), async (input, init) => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    assert.equal(new Headers(init?.headers).get("cookie"), "carobra_session=secret");
    if (path.endsWith("/validation-status")) {
      return Response.json({
        validation_id: "validation-1",
        customer_id: "customer-1",
        status: "VALIDATED",
        registered_at: "2026-07-13T10:00:00.000Z",
        next_checkpoint: null,
        next_checkpoint_at: null,
        last_checked_at: "2026-07-14T10:00:00.000Z",
        last_check_outcome: "MATCH_VALIDATED",
        validated_at: "2026-07-14T10:00:00.000Z",
        product_evidence: {
          provider: "SISCA",
          product_type: "AFORE",
          status: "ACTIVE",
          source_id: "sisca-validation:validation-1",
          validated_at: "2026-07-14T10:00:00.000Z",
        },
        raw_sisca_payload: "must-not-be-forwarded",
      });
    }
    return Response.json({
      id: "customer-1",
      rewards_id: "RWD-test",
      curp: "ABCD123456HMNLRS09",
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
      phone: "5551234567",
      postal_code: "01010",
      state: "CDMX",
      city: "CDMX",
      customer_status: "ACTIVE",
      onboarding_status: "COMPLETED",
    });
  });

  const result = await client.getRewardsIdentityEvidence(
    "analytics=ignored; carobra_session=secret; theme=dark",
  );

  assert.deepEqual(paths.sort(), ["/api/v1/me", "/api/v1/me/validation-status"]);
  assert.deepEqual(result.data, {
    customer_id: "customer-1",
    customer_status: "ACTIVE",
    validation_id: "validation-1",
    validation_status: "VALIDATED",
    registered_at: "2026-07-13T10:00:00.000Z",
    validated_at: "2026-07-14T10:00:00.000Z",
    product_evidence: {
      provider: "SISCA",
      product_type: "AFORE",
      status: "ACTIVE",
      source_id: "sisca-validation:validation-1",
      validated_at: "2026-07-14T10:00:00.000Z",
    },
  });
  assert.doesNotMatch(JSON.stringify(result.data), /curp|email|phone|raw_sisca|credential/i);
});

test("Rewards evidence rejects inconsistent API customer identity", async () => {
  const client = new RewardsApiClient(config(), async (input) => {
    const path = new URL(String(input)).pathname;
    return path.endsWith("/validation-status")
      ? Response.json({ customer_id: "customer-2", status: "VALIDATED" })
      : Response.json({ id: "customer-1", customer_status: "ACTIVE" });
  });

  await assert.rejects(
    client.getRewardsIdentityEvidence("carobra_session=secret"),
    { status: 503, code: "api_unavailable" },
  );
});

function config(): SiteBackendConfig {
  return {
    apiBaseUrl: "http://api.test",
    host: "127.0.0.1",
    port: 0,
    apiRequestTimeoutMs: 1000,
    rewardsV2LiveFlowEnabled: false,
    sessionCookie: {
      name: "carobra_session",
      secure: false,
      sameSite: "lax",
      path: "/",
    },
  };
}
