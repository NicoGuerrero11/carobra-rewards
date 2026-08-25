import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import test from "node:test";

import { createSiteBackendServer } from "../src/app.js";
import type { SiteBackendConfig } from "../src/config.js";
import { rewardsErrors } from "../src/rewards/shared/errors.js";
import type { CustomerId } from "../src/rewards/shared/identifiers.js";
import type {
  OnboardingEvidenceHttpRequest,
  RewardsBehaviorHttpApplication,
  SiteActionHttpRequest,
} from "../src/rewards/behaviors/http-application.js";
import type { RewardsV2JourneyHttpApplication } from "../src/rewards/v2/journey-http-application.js";
import type { RewardsCustomerPortalHttpResponse } from "../src/rewards/v2/customer-portal-contract.js";
import type {
  RewardsCustomerPortalApplication,
  UpdateLearningProgressInput,
  UpdatePreferencesInput,
} from "../src/rewards/v2/customer-portal.js";
import {
  assertRewardsJourneySummaryContract,
  type RewardsJourneySummaryHttpResponse,
} from "../src/rewards/v2/journey-summary-contract.js";
import { RewardsV2TestScenarioApplication } from "../src/rewards/v2/test-scenarios.js";

const customerId = "00000000-0000-4000-8000-000000000301";

test("retired V1 rewards account and eligibility routes are not exposed", async (t) => {
  const upstream = await profileServer(t);
  const bff = await start(t, createSiteBackendServer(config(upstream)));

  for (const path of ["eligibility", "account"]) {
    const response = await fetch(`${bff}/api/v1/rewards/${path}`, {
      headers: { cookie: "carobra_session=secret" },
    });
    assert.equal(response.status, 404);
    assert.equal((await response.json() as ErrorEnvelope).error.code, "not_found");
  }
});

test("registration always establishes the canonical V2 invited journey", async (t) => {
  const registeredAt = "2026-08-25T12:00:00.000Z";
  const upstream = await start(t, createServer((_request, response) => {
    response.writeHead(201, { "content-type": "application/json" });
    response.end(JSON.stringify({
      customer: { id: customerId },
      validation_id: "00000000-0000-4000-8000-000000000302",
      validation_status: "PENDING",
      registered_at: registeredAt,
    }));
  }));
  const journey = new StubJourneyApplication();
  const bff = await start(t, createSiteBackendServer(
    config(upstream), undefined, undefined, undefined, journey,
  ));

  const response = await fetch(`${bff}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      curp: "ABCD123456HMNLRS09",
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
      phone: "5551234567",
      password: "correct-horse-7",
      confirm_password: "correct-horse-7",
      postal_code: "01010",
      state: "CDMX",
      city: "CDMX",
      terms_accepted: true,
      terms_version: "2026-08",
    }),
  });

  assert.equal(response.status, 201);
  assert.deepEqual(journey.invitedCommand, {
    customerId,
    registeredAt: new Date(registeredAt),
  });
});

test("authenticated V2 journey returns the real customer contract without test controls", async (t) => {
  const upstream = await profileServer(t);
  const journey = new StubJourneyApplication();
  const bff = await start(t, createSiteBackendServer(
    config(upstream), undefined, undefined, undefined, journey,
  ));

  const response = await fetch(`${bff}/api/v1/rewards/journey`, {
    headers: { cookie: "carobra_session=secret" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), journey.summary);
  assert.equal(journey.customerId, customerId);
  assert.equal(journey.validationStatus, "VALIDATED");
  assert.deepEqual(journey.synchronizedEvidence, {
    customerId,
    registeredAt: new Date("2026-07-13T10:00:00.000Z"),
    validationStatus: "VALIDATED",
    validatedAfore: {
      provider: "SISCA",
      productType: "AFORE",
      sourceId: "sisca-validation:00000000-0000-4000-8000-000000000302",
      validatedAt: new Date("2026-07-14T10:00:00.000Z"),
    },
  });
  assert.equal(assertRewardsJourneySummaryContract(journey.summary), journey.summary);
  const testSummary = new RewardsV2TestScenarioApplication().get("bronze");
  assert.ok(testSummary);
  assert.deepEqual(contractKeys(testSummary), contractKeys(journey.summary));
  assert.doesNotMatch(JSON.stringify(journey.summary), /scenario|test[_-]?key|credential/i);
});

test("authenticated customer portal routes bind reads and commands to API session identity", async (t) => {
  const upstream = await profileServer(t);
  const portal = new StubCustomerPortalApplication();
  const bff = await start(t, createSiteBackendServer(
    config(upstream), undefined, undefined, undefined, undefined, portal,
  ));
  const headers = { cookie: "carobra_session=secret", "content-type": "application/json" };

  const read = await fetch(`${bff}/api/v1/rewards/portal`, { headers });
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), portal.response);
  assert.equal(portal.customerId, customerId);

  const preferences = await fetch(`${bff}/api/v1/rewards/portal/preferences`, {
    method: "PATCH", headers, body: JSON.stringify({ activity_updates: false, learning_updates: true, product_updates: true }),
  });
  assert.equal(preferences.status, 200);
  assert.equal(portal.preferencesCustomerId, customerId);

  for (const [path, body] of [
    ["notifications/read", { notification_id: "notice:registration:1" }],
    ["actions/complete", { action_id: "00000000-0000-4000-8000-000000000801" }],
    ["learning-progress", { assignment_id: "00000000-0000-4000-8000-000000000802", progress: 70 }],
  ] as const) {
    const response = await fetch(`${bff}/api/v1/rewards/portal/${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    assert.equal(response.status, 200);
  }
  assert.deepEqual(portal.commandCustomerIds, [customerId, customerId, customerId]);
});

test("authenticated V2 detail routes expose bounded safe activity and ledger data", async (t) => {
  const upstream = await profileServer(t);
  const journey = new StubJourneyApplication();
  const bff = await start(t, createSiteBackendServer(
    config(upstream), undefined, undefined, undefined, journey,
  ));

  const [activities, movements] = await Promise.all([
    fetch(`${bff}/api/v1/rewards/activities`, {
      headers: { cookie: "carobra_session=secret" },
    }),
    fetch(`${bff}/api/v1/rewards/movements`, {
      headers: { cookie: "carobra_session=secret" },
    }),
  ]);

  assert.equal(activities.status, 200);
  assert.deepEqual(await activities.json(), { activities: [] });
  assert.equal(movements.status, 200);
  assert.deepEqual(await movements.json(), { movements: [] });
});

test("V2 journey requires API session authority before querying Rewards", async (t) => {
  const upstream = await start(t, createServer((_request, response) => {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({
      detail: { code: "unauthenticated", message: "Authentication is required" },
    }));
  }));
  const journey = new StubJourneyApplication();
  const bff = await start(t, createSiteBackendServer(
    config(upstream), undefined, undefined, undefined, journey,
  ));

  const response = await fetch(`${bff}/api/v1/rewards/journey`);

  assert.equal(response.status, 401);
  assert.equal(journey.customerId, undefined);
});

test("authenticated behavior commands use the API customer identity", async (t) => {
  const upstream = await profileServer(t);
  const behaviors = new StubBehaviorApplication();
  const bff = await start(t, createSiteBackendServer(
    config(upstream), undefined, behaviors,
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
    config(upstream), undefined, behaviors,
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

function contractKeys(summary: RewardsJourneySummaryHttpResponse) {
  return {
    top: Object.keys(summary).sort(),
    journey: Object.keys(summary.journey).sort(),
    redemption: Object.keys(summary.redemption).sort(),
    points: Object.keys(summary.points).sort(),
    progress: Object.keys(summary.progress).sort(),
    product: Object.keys(summary.products[0] ?? {}).sort(),
    movement: Object.keys(summary.recent_movements[0] ?? {}).sort(),
    modules: Object.keys(summary.modules).sort(),
  };
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

class StubJourneyApplication implements RewardsV2JourneyHttpApplication {
  customerId: string | undefined;
  validationStatus: string | undefined;
  synchronizedEvidence: unknown;
  invitedCommand: unknown;
  readonly summary: RewardsJourneySummaryHttpResponse = {
    customer_id: customerId,
    journey: {
      state: "ACTIVE",
      current_level: "BRONZE",
      validation_status: "VALIDATED",
      registered_at: "2026-07-13T10:00:00.000Z",
    },
    redemption: { eligible: false, reason: "REDEMPTION_DISABLED" },
    points: { available: "150", reserved: "0", next_expiration_at: null },
    progress: {
      target_level: "SILVER",
      rule_available: false,
      remaining_active_products: null,
      remaining_registration_months: null,
      remaining_qualifying_activities: null,
    },
    products: [{
      product_type: "AFORE",
      status: "ACTIVE",
      activated_at: "2026-07-14T10:00:00.000Z",
    }],
    recent_movements: [{
      code: "V2_INITIAL_PRODUCT_ACTIVE",
      points_delta: "105",
      occurred_at: "2026-07-14T10:00:00.000Z",
    }],
    modules: {
      benefits_enabled: false,
      expiry_policy_approved: false,
      ave_enabled: false,
      referrals_enabled: false,
      renewals_enabled: false,
    },
  };

  async ensureInvited(command: unknown): Promise<void> {
    this.invitedCommand = command;
  }

  async synchronize(command: unknown): Promise<void> {
    this.synchronizedEvidence = command;
  }

  async getActivities() {
    return { activities: [] };
  }

  async getMovements() {
    return { movements: [] };
  }

  async getSummary(
    id: CustomerId,
    validationStatus: string,
  ): Promise<RewardsJourneySummaryHttpResponse> {
    this.customerId = id;
    this.validationStatus = validationStatus;
    return this.summary;
  }
}

class StubCustomerPortalApplication implements RewardsCustomerPortalApplication {
  customerId: string | undefined;
  preferencesCustomerId: string | undefined;
  commandCustomerIds: string[] = [];
  readonly response: RewardsCustomerPortalHttpResponse = {
    customer_id: customerId,
    primary_action: { id: "journey:profile", type: "CONTENT", title: "Sigue construyendo tu perfil", description: "Aquí aparecerán actividades aprobadas para ti.", status: "INFORMATIONAL", href: null, approved_points: null },
    actions: [], timeline: [], notifications: { unread_count: 0, items: [] }, products: [],
    preferences: { activity_updates: true, learning_updates: true, product_updates: true, updated_at: null },
    learning: { items: [] }, documents: { requests: [] }, help: [],
  };
  async getPortal(id: CustomerId) { this.customerId = id; return this.response; }
  async updatePreferences(id: CustomerId, input: UpdatePreferencesInput) { this.preferencesCustomerId = id; return { ...input, updated_at: null }; }
  async markNotificationRead(id: CustomerId) { this.commandCustomerIds.push(id); }
  async completeAction(id: CustomerId) { this.commandCustomerIds.push(id); return true; }
  async updateLearningProgress(id: CustomerId, _input: UpdateLearningProgressInput) { this.commandCustomerIds.push(id); return true; }
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
        validated_at: "2026-07-14T10:00:00.000Z",
        product_evidence: {
          provider: "SISCA",
          product_type: "AFORE",
          status: "ACTIVE",
          source_id: "sisca-validation:00000000-0000-4000-8000-000000000302",
          validated_at: "2026-07-14T10:00:00.000Z",
        },
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
