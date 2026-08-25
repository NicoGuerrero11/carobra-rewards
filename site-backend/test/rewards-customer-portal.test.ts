import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import { FixedClock } from "../src/rewards/shared/clock.js";
import { asCustomerId } from "../src/rewards/shared/identifiers.js";
import type { RewardsJourneySummaryHttpResponse } from "../src/rewards/v2/journey-summary-contract.js";
import {
  DefaultRewardsCustomerPortalApplication,
  PostgresRewardsCustomerPortalStore,
  type RewardsCustomerPortalStore,
  type UpdateLearningProgressInput,
  type UpdatePreferencesInput,
} from "../src/rewards/v2/customer-portal.js";

const customerId = asCustomerId("00000000-0000-4000-8000-000000000401");
const now = new Date("2026-08-24T12:00:00.000Z");
const actionId = "00000000-0000-4000-8000-000000000501";
const learningId = "00000000-0000-4000-8000-000000000601";

const summary: RewardsJourneySummaryHttpResponse = {
  customer_id: customerId,
  journey: { state: "ACTIVE", current_level: "BRONZE", validation_status: "VALIDATED", registered_at: "2026-01-24T12:00:00.000Z" },
  redemption: { eligible: false, reason: "REDEMPTION_DISABLED" },
  points: { available: "150", reserved: "0", next_expiration_at: null },
  progress: { target_level: "SILVER", rule_available: false, remaining_active_products: null, remaining_registration_months: null, remaining_qualifying_activities: null },
  products: [{ product_type: "AFORE", status: "ACTIVE", activated_at: "2026-02-01T12:00:00.000Z" }],
  recent_movements: [],
  modules: { benefits_enabled: false, expiry_policy_approved: false, ave_enabled: false, referrals_enabled: false, renewals_enabled: false },
};

function store(): RewardsCustomerPortalStore {
  return {
    async load() {
      return {
        actions: [{ id: actionId, action_type: "QUESTIONNAIRE", title: "Completa tu perfil", description: "Responde un cuestionario breve.", status: "PENDING", href: "#actividad", approved_points: "20", assigned_at: now }],
        products: [{ id: "00000000-0000-4000-8000-000000000701", product_type: "AFORE", status: "ACTIVE", activated_at: now, ended_at: null, updated_at: now }],
        preferences: { activity_updates: true, learning_updates: true, product_updates: true, updated_at: null },
        learning: [{ id: learningId, course_code: "RETIRO_101", title: "Fundamentos para tu retiro", description: "Aprende los conceptos esenciales.", category: "Retiro", status: "ASSIGNED", progress: 0, qualifies: false, assigned_at: now.toISOString(), last_activity_at: null }],
        documents: [],
        levels: [{ id: "level-1", resulting_level: "BRONZE", reason: "FIRST_PRODUCT", decided_at: now }],
        readNotificationIds: new Set<string>(),
      };
    },
    async updatePreferences(_customerId, input: UpdatePreferencesInput, at: Date) { return { ...input, updated_at: at.toISOString() }; },
    async markNotificationRead() {},
    async completeAction(_customerId, id) { return id === actionId; },
    async updateLearningProgress(_customerId, input: UpdateLearningProgressInput) { return input.assignment_id === learningId; },
  };
}

function application() {
  return new DefaultRewardsCustomerPortalApplication(
    { async getForCustomer() { return summary; } },
    {
      async getActivities() { return { activities: [{ activity_type: "CONTENT_VIEWED", qualifies: true, occurred_at: "2026-08-20T12:00:00.000Z" }] }; },
      async getMovements() { return { movements: [{ code: "V2_INITIAL_PRODUCT_ACTIVE", entry_type: "CREDIT", points_delta: "105", occurred_at: "2026-08-21T12:00:00.000Z" }] }; },
    },
    store(),
    new FixedClock(now),
  );
}

test("portal projection selects the next action and exposes only customer-safe data", async () => {
  const portal = await application().getPortal(customerId, "VALIDATED");
  assert.ok(portal);
  assert.equal(portal.primary_action.id, actionId);
  assert.equal(portal.journey, summary);
  assert.equal(portal.activity_details.activities[0]?.activity_type, "CONTENT_VIEWED");
  assert.equal(portal.movement_details.movements[0]?.code, "V2_INITIAL_PRODUCT_ACTIVE");
  assert.equal(portal.products[0]?.label, "Cuenta de retiro");
  assert.equal(portal.notifications.unread_count, portal.notifications.items.length);
  assert.ok(portal.timeline.some((entry) => entry.type === "POINTS"));
  assert.doesNotMatch(JSON.stringify(portal), /SISCA|provider|source_id|checkpoint|H24|H72|D3|D5/i);
});

test("portal commands validate inputs and keep resources customer-scoped", async () => {
  const portal = application();
  assert.deepEqual(await portal.updatePreferences(customerId, { activity_updates: false, learning_updates: true, product_updates: false }), {
    activity_updates: false,
    learning_updates: true,
    product_updates: false,
    updated_at: now.toISOString(),
  });
  assert.equal(await portal.completeAction(customerId, actionId), true);
  assert.equal(await portal.completeAction(customerId, "00000000-0000-4000-8000-000000000999"), false);
  assert.equal(await portal.updateLearningProgress(customerId, { assignment_id: learningId, progress: 60 }), true);
  assert.throws(() => portal.updateLearningProgress(customerId, { assignment_id: learningId, progress: 101 }), /integer from 0 to 100/);
  assert.throws(() => portal.completeAction(customerId, "not-an-id"), /identity is invalid/);
});

test("portal persistence commands are replay-safe and always constrain customer ownership", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const database = {
    async query<TRow extends QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<TRow>> {
      calls.push({ text, values });
      return { command: "UPDATE", rowCount: 1, oid: 0, fields: [], rows: [] };
    },
  };
  const persistence = new PostgresRewardsCustomerPortalStore(database);
  await persistence.markNotificationRead(customerId, "notice:product:1", now);
  await persistence.markNotificationRead(customerId, "notice:product:1", now);
  await persistence.completeAction(customerId, actionId, now);
  await persistence.updateLearningProgress(customerId, { assignment_id: learningId, progress: 50 }, now);

  assert.match(calls[0]!.text, /ON CONFLICT \(customer_id, notification_id\) DO NOTHING/);
  assert.deepEqual(calls[0]!.values.slice(0, 2), [customerId, "notice:product:1"]);
  assert.deepEqual(calls[1]!.values, calls[0]!.values);
  assert.match(calls[2]!.text, /WHERE customer_id = \$1 AND id = \$2 AND status = 'PENDING'/);
  assert.match(calls[3]!.text, /WHERE customer_id = \$1 AND id = \$2/);
  assert.match(calls[3]!.text, /GREATEST\(progress, \$3\) = 100/);
});

test("portal level history reads the canonical reason_code column", async () => {
  const queries: string[] = [];
  const database = {
    async query<TRow extends QueryResultRow>(text: string): Promise<QueryResult<TRow>> {
      queries.push(text);
      return { command: "SELECT", rowCount: 0, oid: 0, fields: [], rows: [] };
    },
  };

  await new PostgresRewardsCustomerPortalStore(database).load(customerId);

  const levelQuery = queries.find((query) => query.includes("FROM rewards_level_decisions"));
  assert.ok(levelQuery);
  assert.match(levelQuery, /decision\.reason_code AS reason/);
  assert.doesNotMatch(levelQuery, /decision\.reason(?:\s|,)/);
});
