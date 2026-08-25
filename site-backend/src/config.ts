export type CookieSameSite = "lax" | "strict" | "none";

export interface SiteBackendConfig {
  apiBaseUrl: string;
  databaseUrl?: string;
  host: string;
  port: number;
  apiRequestTimeoutMs: number;
  referralIdentityHmacSecret?: string;
  rewardsV2LiveFlowEnabled: boolean;
  rewardsV2TestMode?: {
    accessKey: string;
    environment: "development" | "test";
  };
  sessionCookie: {
    name: string;
    secure: boolean;
    sameSite: CookieSameSite;
    path: string;
    domain?: string;
  };
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): SiteBackendConfig {
  const sameSite = parseSameSite(environment.SESSION_COOKIE_SAME_SITE ?? "lax");
  const secure = parseBoolean(
    "SESSION_COOKIE_SECURE",
    environment.SESSION_COOKIE_SECURE ?? "false",
  );
  if (sameSite === "none" && !secure) {
    throw new Error("SESSION_COOKIE_SAME_SITE=none requires SESSION_COOKIE_SECURE=true");
  }

  const domain = environment.SESSION_COOKIE_DOMAIN?.trim();
  const sessionCookie: SiteBackendConfig["sessionCookie"] = {
    name: requiredValue(
      "SESSION_COOKIE_NAME",
      environment.SESSION_COOKIE_NAME ?? "carobra_session",
    ),
    secure,
    sameSite,
    path: requiredValue(
      "SESSION_COOKIE_PATH",
      environment.SESSION_COOKIE_PATH ?? "/",
    ),
  };
  if (domain) {
    sessionCookie.domain = domain;
  }

  const config: SiteBackendConfig = {
    apiBaseUrl: parseBaseUrl(environment.API_BASE_URL ?? "http://127.0.0.1:8000"),
    host: requiredValue(
      "SITE_BACKEND_HOST",
      environment.SITE_BACKEND_HOST ?? "127.0.0.1",
    ),
    port: parseInteger("SITE_BACKEND_PORT", environment.SITE_BACKEND_PORT ?? "3001", 0, 65_535),
    apiRequestTimeoutMs: parseInteger(
      "API_REQUEST_TIMEOUT_MS",
      environment.API_REQUEST_TIMEOUT_MS ?? "5000",
      1,
      120_000,
    ),
    rewardsV2LiveFlowEnabled: parseBoolean(
      "REWARDS_V2_LIVE_FLOW_ENABLED",
      environment.REWARDS_V2_LIVE_FLOW_ENABLED ?? "false",
    ),
    sessionCookie,
  };
  const nodeEnvironment = (environment.NODE_ENV ?? "development").trim().toLowerCase();
  if (config.rewardsV2LiveFlowEnabled && nodeEnvironment === "production") {
    throw new Error(
      "REWARDS_V2_LIVE_FLOW_ENABLED cannot be enabled in production before business approval",
    );
  }
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (databaseUrl) config.databaseUrl = databaseUrl;
  const referralIdentityHmacSecret = environment.REFERRAL_IDENTITY_HMAC_SECRET?.trim();
  if (referralIdentityHmacSecret) {
    if (Buffer.byteLength(referralIdentityHmacSecret, "utf8") < 32) {
      throw new Error("REFERRAL_IDENTITY_HMAC_SECRET must contain at least 32 bytes");
    }
    config.referralIdentityHmacSecret = referralIdentityHmacSecret;
  }
  const testModeEnabled = parseBoolean(
    "REWARDS_V2_TEST_MODE_ENABLED",
    environment.REWARDS_V2_TEST_MODE_ENABLED ?? "false",
  );
  if (testModeEnabled) {
    if (nodeEnvironment !== "development" && nodeEnvironment !== "test") {
      throw new Error("Rewards V2 test mode is forbidden outside development or test");
    }
    const accessKey = requiredValue(
      "REWARDS_V2_TEST_ACCESS_KEY",
      environment.REWARDS_V2_TEST_ACCESS_KEY ?? "",
    );
    if (Buffer.byteLength(accessKey, "utf8") < 32) {
      throw new Error("REWARDS_V2_TEST_ACCESS_KEY must contain at least 32 bytes");
    }
    config.rewardsV2TestMode = {
      accessKey,
      environment: nodeEnvironment,
    };
  }
  return config;
}

function parseBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API_BASE_URL must use http or https");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString().replace(/\/$/, "");
}

function requiredValue(name: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${name} cannot be empty`);
  }
  return normalized;
}

function parseBoolean(name: string, value: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function parseSameSite(value: string): CookieSameSite {
  const normalized = value.toLowerCase();
  if (normalized === "lax" || normalized === "strict" || normalized === "none") {
    return normalized;
  }
  throw new Error("SESSION_COOKIE_SAME_SITE must be lax, strict, or none");
}

function parseInteger(
  name: string,
  value: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}
