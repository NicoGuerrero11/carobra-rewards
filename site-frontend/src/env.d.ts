/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user?: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      rewardsId: string;
      customerStatus: string;
      onboardingStatus: string;
    };
    rewardsEligibility?: {
      customer_id: string;
      eligible: boolean;
      reason: string | null;
      customer_status: string | null;
      sisca_validation_status: string | null;
      afore_relation_status: string | null;
    };
    rewardsPortal?: import("./lib/rewards-customer-portal-contract").RewardsCustomerPortal | null;
  }
}

interface ImportMetaEnv {
  readonly SITE_BACKEND_BASE_URL?: string;
  readonly REWARDS_V2_PREVIEW_ENABLED?: string;
  readonly REWARDS_V2_PREVIEW_USERNAME?: string;
  readonly REWARDS_V2_PREVIEW_PASSWORD?: string;
  readonly REWARDS_V2_TEST_ACCESS_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
