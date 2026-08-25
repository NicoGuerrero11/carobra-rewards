import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import test from "node:test";

import { createSiteBackendServer } from "../src/app.js";
import type { SiteBackendConfig } from "../src/config.js";
import type {
  RewardsAccountHttpApplication,
  RewardsAccountSummaryHttpResponse,
  RewardsEligibilityHttpResponse,
} from "../src/rewards/accounts/http-application.js";
import { rewardsErrors } from "../src/rewards/shared/errors.js";
import type { CustomerId } from "../src/rewards/shared/identifiers.js";
import type {
  OnboardingEvidenceHttpRequest,
  RewardsBehaviorHttpApplication,
  SiteActionHttpRequest,
} from "../src/rewards/behaviors/http-application.js";

const customerId = "00000000-0000-4000-8000-000000000301";

test("authenticated pending customer receives eligibility without account data", async (t) => {
  const upstream = await profileServer(t);
  const rewards = new StubRewardsApplication();
  const bff = await start(t, createSiteBackendServer(config(upstream), undefined, rewards));

  const response = await fetch(`${bff}/api/v1/rewards/eligibility`, {
    headers: { cookie: "carobra_session=secret" },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, rewards.eligibility);
  assert.equal(rewards.customerId, customerId);
  assert.doesNotMatch(JSON.stringify(payload), /available_points|account_id/);
});

test("eligibility contract preserves eligible, pending, inactive, and attention states", async (t) => {
  const upstream = await profileServer(t);
  const rewards = new StubRewardsApplication();
  const bff = await start(t, createSiteBackendServer(config(upstream), undefined, rewards));
  const states: RewardsEligibilityHttpResponse[] = [
    {
      customer_id: customerId,
      eligible: true,
      reason: null,
      customer_status: "ACTIVE",
      sisca_validation_status: "VALIDATED",
      afore_relation_status: "ACTIVE",
    },
    rewards.eligibility,
    {
      customer_id: customerId,
      eligible: false,
      reason: "customer_inactive",
      customer_status: "INACTIVE",
      sisca_validation_status: "VALIDATED",
      afore_relation_status: "INACTIVE",
    },
    {
      customer_id: customerId,
      eligible: false,
      reason: "sisca_not_validated",
      customer_status: "PENDING_VALIDATION",
      sisca_validation_status: "REQUIRES_ATTENTION",
      afore_relation_status: "PENDING",
    },
  ];

  for (const state of states) {
    rewards.eligibility = state;
    const response = await fetch(`${bff}/api/v1/rewards/eligibility`, {
      headers: { cookie: "carobra_session=secret" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), state);
  }
});

test("account summary exposes persisted point and expiration values as exact strings", async (t) => {
  const upstream = await profileServer(t);
  const rewards = new StubRewardsApplication();
  const bff = await start(t, createSiteBackendServer(config(upstream), undefined, rewards));

  const response = await fetch(`${bff}/api/v1/rewards/account`, {
    headers: { cookie: "carobra_session=secret" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), rewards.summary);
});

test("account summary maps ineligible and unauthenticated outcomes stably", async (t) => {
  const unauthenticatedUpstream = await start(t, createServer((_request, response) => {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({
      detail: { code: "unauthenticated", message: "Authentication is required" },
    }));
  }));
  const rewards = new StubRewardsApplication();
  const unauthenticatedBff = await start(
    t,
    createSiteBackendServer(config(unauthenticatedUpstream), undefined, rewards),
  );
  const unauthenticated = await fetch(`${unauthenticatedBff}/api/v1/rewards/account`);
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json() as ErrorEnvelope).error.code, "unauthenticated");

  const profileUpstream = await profileServer(t);
  rewards.rejectSummary = true;
  const ineligibleBff = await start(
    t,
    createSiteBackendServer(config(profileUpstream), undefined, rewards),
  );
  const ineligible = await fetch(`${ineligibleBff}/api/v1/rewards/account`, {
    headers: { cookie: "carobra_session=secret" },
  });
  assert.equal(ineligible.status, 403);
  assert.equal((await ineligible.json() as ErrorEnvelope).error.code, "rewards_not_eligible");
});

test("authenticated behavior commands use the API customer identity", async (t) => {
  const upstream = await profileServer(t);
  const rewards = new StubRewardsApplication();
  const behaviors = new StubBehaviorApplication();
  const bff = await start(t, createSiteBackendServer(
    config(upstream), undefined, rewards, behaviors,
  ));
  const actionBody: SiteActionHttpRequest = {
    action_code: "BENEFIT_VIEW",
    idempotency_key: "browser-action-1",
    occurred_at: "2026-07-14T12:00:00.000Z",
  };
  const action = await fetch(`${bff}/api/v1/rewards/actions`, {
    method: "POST",
    headers: { cookie: "carobra_session=secret", "content-type": "application/json" },
    body: JSON.stringify(actionBody),
  });
  assert.equal(action.status, 200);
  assert.deepEqual(await action.json(), behaviors.actionResponse);
  assert.deepEqual(behaviors.actionCommand, { customerId, body: actionBody });

  const onboardingBody: OnboardingEvidenceHttpRequest = {
    onboarding_instance_id: "intro-1",
    evidence_type: "VIDEO",
    evidence_version: "v1",
    idempotency_key: "onboarding-video-1",
    occurred_at: "2026-07-14T12:01:00.000Z",
  };
  const onboarding = await fetch(`${bff}/api/v1/rewards/onboarding/evidence`, {
    method: "POST",
    headers: { cookie: "carobra_session=secret", "content-type": "application/json" },
    body: JSON.stringify(onboardingBody),
  });
  assert.equal(onboarding.status, 200);
  assert.deepEqual(await onboarding.json(), behaviors.onboardingResponse);
  assert.deepEqual(behaviors.onboardingCommand, { customerId, body: onboardingBody });
});

test("disabled behavior contracts return stable rule_disabled without persistence promises", async (t) => {
  const upstream = await profileServer(t);
  const behaviors = new StubBehaviorApplication();
  behaviors.rejectAction = true;
  const bff = await start(t, createSiteBackendServer(
    config(upstream), undefined, new StubRewardsApplication(), behaviors,
  ));
  const response = await fetch(`${bff}/api/v1/rewards/actions`, {
    method: "POST",
    headers: { cookie: "carobra_session=secret", "content-type": "application/json" },
    body: JSON.stringify({
      action_code: "LOGIN",
      idempotency_key: "disabled-action",
      occurred_at: "2026-07-14T12:00:00.000Z",
    }),
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json() as ErrorEnvelope).error.code, "rule_disabled");
});

interface ErrorEnvelope { error: { code: string } }

class StubRewardsApplication implements RewardsAccountHttpApplication {
  customerId: string | undefined;
  rejectSummary = false;
  eligibility: RewardsEligibilityHttpResponse = {
    customer_id: customerId,
    eligible: false,
    reason: "sisca_not_validated",
    customer_status: "PENDING_VALIDATION",
    sisca_validation_status: "PENDING",
    afore_relation_status: "PENDING",
  };
  readonly summary: RewardsAccountSummaryHttpResponse = {
    account_id: "00000000-0000-4000-8000-000000000401",
    available_points: "2000",
    reserved_points: "0",
    next_expiring_points: "2000",
    next_expiration_at: "2028-01-14T12:00:00.000Z",
    afore_relation_status: "ACTIVE",
    recent_movements: [{
      id: "movement-1",
      entry_type: "ISSUANCE",
      points_delta: "2000",
      rule_code: "REGISTRATION_ACTIVATION",
      occurred_at: "2026-07-14T12:00:00.000Z",
    }],
    earning_opportunities: [],
    benefits: {
      available_items: 0,
      redemption_enabled: false,
      unavailable_reason: "Catalog pending approval",
    },
  };

  async getEligibility(id: CustomerId): Promise<RewardsEligibilityHttpResponse> {
    this.customerId = id;
    return this.eligibility;
  }

  async getSummary(): Promise<RewardsAccountSummaryHttpResponse> {
    if (this.rejectSummary) throw rewardsErrors.notEligible();
    return this.summary;
  }
}

class StubBehaviorApplication implements RewardsBehaviorHttpApplication {
  actionCommand: unknown;
  onboardingCommand: unknown;
  rejectAction = false;
  readonly actionResponse = { status: "AWARDED", business_month: "2026-07" };
  readonly onboardingResponse = { complete: false, award_status: "PENDING_EVIDENCE" };

  async ingestSiteAction(id: CustomerId, body: SiteActionHttpRequest): Promise<unknown> {
    this.actionCommand = { customerId: id, body };
    if (this.rejectAction) throw rewardsErrors.ruleDisabled("Configuration pending");
    return this.actionResponse;
  }

  async recordOnboardingEvidence(
    id: CustomerId,
    body: OnboardingEvidenceHttpRequest,
  ): Promise<unknown> {
    this.onboardingCommand = { customerId: id, body };
    return this.onboardingResponse;
  }
}

async function profileServer(t: TestContext): Promise<string> {
  return start(t, createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/api/v1/me/validation-status") {
      response.end(JSON.stringify({
        validation_id: "00000000-0000-4000-8000-000000000302",
        customer_id: customerId,
        status: "VALIDATED",
        registered_at: "2026-07-13T10:00:00.000Z",
        next_checkpoint: null,
        next_checkpoint_at: null,
        last_checked_at: "2026-07-14T10:00:00.000Z",
        last_check_outcome: "MATCH_VALIDATED",
      }));
      return;
    }
    response.end(JSON.stringify({
      id: customerId,
      rewards_id: "RWD-test",
      curp: "redacted-upstream-field",
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
      phone: "5551234567",
      postal_code: "01010",
      state: "CDMX",
      city: "CDMX",
      customer_status: "ACTIVE",
      onboarding_status: "COMPLETED",
    }));
  }));
}

interface TestContext { after(callback: () => void | Promise<void>): void }

async function start(t: TestContext, server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    if (server.listening) {
      server.close();
      await once(server, "close");
    }
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

function config(apiBaseUrl: string): SiteBackendConfig {
  return {
    apiBaseUrl,
    host: "127.0.0.1",
    port: 0,
    apiRequestTimeoutMs: 1000,
    sessionCookie: {
      name: "carobra_session",
      secure: false,
      sameSite: "lax",
      path: "/",
    },
  };
}
