import assert from "node:assert/strict";
import test from "node:test";

import {
  referralPermanenceKey,
  referralPermanenceRuleCode,
  ScheduleReferralPermanence,
  type ReferralPermanenceSchedulePort,
  type ReferralPermanenceScheduleResult,
  type ScheduleReferralPermanenceCommand,
} from "../src/rewards/referrals/permanence.js";
import { FixedClock } from "../src/rewards/shared/clock.js";
import type { ReferralId } from "../src/rewards/shared/identifiers.js";

const referralId = "00000000-0000-4000-8000-000000006301" as ReferralId;
const observedAt = new Date("2026-07-14T19:00:00.000Z");

test("referral permanence maps the approved milestones and stable business keys", () => {
  assert.equal(referralPermanenceRuleCode(6), "REFERRAL_PERMANENCE_6_MONTHS");
  assert.equal(referralPermanenceRuleCode(12), "REFERRAL_PERMANENCE_12_MONTHS");
  assert.equal(referralPermanenceKey(referralId, 6),
    `referral-permanence:${referralId}:6m`);
});

test("referral permanence scheduling receives one authoritative observation time", async () => {
  const port = new CapturingSchedulePort();
  const useCase = new ScheduleReferralPermanence(port, new FixedClock(observedAt));
  const command: ScheduleReferralPermanenceCommand = {
    referralId,
    activeServiceStartedAt: new Date("2026-07-01T12:00:00.000Z"),
  };
  assert.deepEqual(await useCase.schedule(command), { scheduledJobs: 2, existingJobs: 0 });
  assert.deepEqual(port.command, { ...command, observedAt });
});

test("future active-service evidence is rejected before persistence", () => {
  const port = new CapturingSchedulePort();
  const useCase = new ScheduleReferralPermanence(port, new FixedClock(observedAt));
  assert.throws(() => useCase.schedule({
    referralId,
    activeServiceStartedAt: new Date("2026-07-15T00:00:00.000Z"),
  }), /already observed/);
  assert.equal(port.command, null);
});

class CapturingSchedulePort implements ReferralPermanenceSchedulePort {
  command: (ScheduleReferralPermanenceCommand & { observedAt: Date }) | null = null;

  async schedule(
    command: ScheduleReferralPermanenceCommand & { observedAt: Date },
  ): Promise<ReferralPermanenceScheduleResult> {
    this.command = command;
    return { scheduledJobs: 2, existingJobs: 0 };
  }
}
