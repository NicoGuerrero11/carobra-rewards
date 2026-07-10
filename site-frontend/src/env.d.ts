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
  }
}

interface ImportMetaEnv {
  readonly SITE_BACKEND_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
