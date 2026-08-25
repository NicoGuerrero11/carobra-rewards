import assert from "node:assert/strict";
import test from "node:test";

import {
  AttributeReferral,
  type AttributeReferralCommand,
  type ReferralAttributionPort,
  type ReferralAttributionResult,
} from "../src/rewards/referrals/attribution.js";
import {
  DefaultReferralHttpApplication,
  identityHash,
  type ReferralCustomerExperiencePort,
  type ReferralDashboardHttpResponse,
  type ResolvedReferralLink,
} from "../src/rewards/referrals/http-application.js";
import {
  ConfirmReferralRegistration,
  type ConfirmReferralRegistrationCommand,
  type ReferralRegistrationAwardPort,
  type ReferralRegistrationAwardResult,
} from "../src/rewards/referrals/registration-award.js";
import { FixedClock } from "../src/rewards/shared/clock.js";
import type {
  CustomerId,
  ReferralId,
  RewardsAccountId,
} from "../src/rewards/shared/identifiers.js";

const now = new Date("2026-07-14T19:00:00.000Z");
const token = "abcdefghijklmnopqrstuvwxyzABCDEFG_123456789";
const secret = "0123456789abcdef0123456789abcdef";
const referringCustomerId = "00000000-0000-4000-8000-000000006401" as CustomerId;
const referredCustomerId = "00000000-0000-4000-8000-000000006402" as CustomerId;
const referringAccountId = "00000000-0000-4000-8000-000000006403" as RewardsAccountId;
const referralId = "00000000-0000-4000-8000-000000006404" as ReferralId;

test("valid personal link captures registration with HMAC identities and no customer data", async () => {
  const experience = new FakeExperience();
  const attributions = new CapturingAttributionPort();
  const registrations = new CapturingRegistrationPort();
  const application = new DefaultReferralHttpApplication(
    experience,
    new AttributeReferral(attributions, new FixedClock(now)),
    new ConfirmReferralRegistration(registrations, new FixedClock(now)),
    new FixedClock(now),
    secret,
    () => "00000000-0000-4000-8000-000000006405",
  );

  assert.deepEqual(await application.captureRegistration({ token, referredCustomerId, registeredAt: now }), {
    status: "REGISTERED",
  });
  assert.equal(attributions.command?.referringIdentityHash,
    identityHash(secret, referringCustomerId));
  assert.equal(attributions.command?.referredIdentityHash, identityHash(secret, referredCustomerId));
  assert.doesNotMatch(attributions.command?.referringIdentityHash ?? "", /6401/);
  assert.equal(attributions.command?.source, "REFERRAL_LINK");
  assert.equal(registrations.command?.referralId, referralId);
  assert.equal(registrations.command?.registrationEvidenceId,
    `site-registration:${referredCustomerId}`);
});

test("malformed referral token is ignored without resolving customer ownership", async () => {
  const experience = new FakeExperience();
  const application = new DefaultReferralHttpApplication(
    experience,
    new AttributeReferral(new CapturingAttributionPort(), new FixedClock(now)),
    new ConfirmReferralRegistration(new CapturingRegistrationPort(), new FixedClock(now)),
    new FixedClock(now),
    secret,
  );

  assert.deepEqual(await application.captureRegistration({
    token: "customer@example.com",
    referredCustomerId,
    registeredAt: now,
  }), { status: "IGNORED" });
  assert.equal(experience.resolveCalls, 0);
});

class FakeExperience implements ReferralCustomerExperiencePort {
  resolveCalls = 0;

  async resolveActiveLink(value: string): Promise<ResolvedReferralLink | null> {
    this.resolveCalls += 1;
    return value === token ? { referringAccountId, referringCustomerId } : null;
  }

  async getOrCreateDashboard(): Promise<ReferralDashboardHttpResponse> {
    return {
      invite_path: `/registro?ref=${token}`,
      accepting_referrals: true,
      unavailable_reason: null,
      totals: { invited: 0, registered: 0, active: 0, earned_points: "0" },
      referrals: [],
    };
  }
}

class CapturingAttributionPort implements ReferralAttributionPort {
  command: (AttributeReferralCommand & { attributedAt: Date }) | null = null;

  async attribute(
    command: AttributeReferralCommand & { attributedAt: Date },
  ): Promise<ReferralAttributionResult> {
    this.command = command;
    return { referralId, status: "ATTRIBUTED", replayed: false, reviewReason: null };
  }
}

class CapturingRegistrationPort implements ReferralRegistrationAwardPort {
  command: (ConfirmReferralRegistrationCommand & { receivedAt: Date }) | null = null;

  async confirm(
    command: ConfirmReferralRegistrationCommand & { receivedAt: Date },
  ): Promise<ReferralRegistrationAwardResult> {
    this.command = command;
    return {
      referralId,
      status: "REGISTERED",
      award: {
        eventId: "event" as never,
        ledgerEntryId: "entry" as never,
        lotId: "lot" as never,
        points: 3000n,
        availablePoints: 3000n,
        replayed: false,
      },
    };
  }
}
