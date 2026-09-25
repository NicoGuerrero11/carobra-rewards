export type CookieSameSite = "lax" | "strict" | "none";

export interface BondaConfig {
  baseUrl: string;
  allowedHosts: readonly string[];
  allowedImageHosts: readonly string[];
  micrositeId?: string;
  couponApiKey?: string;
  affiliateToken?: string;
  catalogAffiliateCode?: string;
  requestTimeoutMs: number;
  catalogCacheTtlMs: number;
  catalogCacheMaxStaleMs: number;
  catalogEnabled: boolean;
  coursesEnabled?: boolean;
  affiliateProvisioningEnabled: boolean;
  couponRequestsEnabled: boolean;
  localPreviewEnabled?: boolean;
}

export interface SiteBackendConfig {
  apiBaseUrl: string;
  databaseUrl?: string;
  host: string;
  port: number;
  apiRequestTimeoutMs: number;
  bonda?: BondaConfig;
  referralIdentityHmacSecret?: string;
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
    bonda: loadBondaConfig(environment),
    sessionCookie,
  };
  const nodeEnvironment = (environment.NODE_ENV ?? "development").trim().toLowerCase();
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

function loadBondaConfig(environment: NodeJS.ProcessEnv): BondaConfig {
  const allowedHosts = parseHostList(
    "BONDA_ALLOWED_HOSTS",
    environment.BONDA_ALLOWED_HOSTS ?? "apiv1.cuponstar.com",
  );
  const baseUrl = parseBaseUrl(
    environment.BONDA_BASE_URL ?? "https://apiv1.cuponstar.com",
  );
  const parsedBondaBaseUrl = new URL(baseUrl);
  if (parsedBondaBaseUrl.protocol !== "https:") {
    throw new Error("BONDA_BASE_URL must use https");
  }
  const baseHost = parsedBondaBaseUrl.hostname.toLowerCase();
  if (!allowedHosts.includes(baseHost)) {
    throw new Error("BONDA_BASE_URL host must be included in BONDA_ALLOWED_HOSTS");
  }

  const catalogEnabled = parseBoolean(
    "BONDA_CATALOG_ENABLED",
    environment.BONDA_CATALOG_ENABLED ?? "false",
  );
  const affiliateProvisioningEnabled = parseBoolean(
    "BONDA_AFFILIATE_PROVISIONING_ENABLED",
    environment.BONDA_AFFILIATE_PROVISIONING_ENABLED ?? "false",
  );
  const couponRequestsEnabled = parseBoolean(
    "BONDA_COUPON_REQUESTS_ENABLED",
    environment.BONDA_COUPON_REQUESTS_ENABLED ?? "false",
  );
  const localPreviewEnabled = parseBoolean(
    "BONDA_LOCAL_PREVIEW_ENABLED",
    environment.BONDA_LOCAL_PREVIEW_ENABLED ?? "false",
  );
  if (localPreviewEnabled && (environment.NODE_ENV ?? "development").trim().toLowerCase() === "production") {
    throw new Error("BONDA_LOCAL_PREVIEW_ENABLED is forbidden in production");
  }
  const micrositeId = optionalValue(environment.BONDA_MICROSITE_ID);
  const couponApiKey = optionalValue(environment.BONDA_COUPON_API_KEY);
  const affiliateToken = optionalValue(environment.BONDA_AFFILIATE_TOKEN);
  const catalogAffiliateCode = optionalValue(environment.BONDA_CATALOG_AFFILIATE_CODE);
  const coursesEnabled = parseBoolean('BONDA_COURSES_ENABLED', environment.BONDA_COURSES_ENABLED ?? 'false');
  if (coursesEnabled && (!micrositeId || !couponApiKey || !catalogAffiliateCode)) {
    throw new Error('Bonda Courses requires microsite, API key and catalog affiliate configuration');
  }

  if (!localPreviewEnabled && (catalogEnabled || couponRequestsEnabled) && (!micrositeId || !couponApiKey)) {
    throw new Error(
      "Enabled Bonda coupon features require BONDA_MICROSITE_ID and BONDA_COUPON_API_KEY",
    );
  }
  if (!localPreviewEnabled && affiliateProvisioningEnabled && (!micrositeId || !affiliateToken)) {
    throw new Error(
      "Enabled Bonda affiliate provisioning requires BONDA_MICROSITE_ID and BONDA_AFFILIATE_TOKEN",
    );
  }

  const config: BondaConfig = {
    baseUrl,
    allowedHosts,
    allowedImageHosts: parseHostList(
      "BONDA_ALLOWED_IMAGE_HOSTS",
      environment.BONDA_ALLOWED_IMAGE_HOSTS ?? "cuponstar-ar.s3.amazonaws.com",
    ),
    requestTimeoutMs: parseInteger(
      "BONDA_REQUEST_TIMEOUT_MS",
      environment.BONDA_REQUEST_TIMEOUT_MS ?? "5000",
      250,
      30_000,
    ),
    catalogCacheTtlMs: parseInteger(
      "BONDA_CATALOG_CACHE_TTL_MS",
      environment.BONDA_CATALOG_CACHE_TTL_MS ?? "300000",
      1_000,
      300_000,
    ),
    catalogCacheMaxStaleMs: parseInteger(
      "BONDA_CATALOG_CACHE_MAX_STALE_MS",
      environment.BONDA_CATALOG_CACHE_MAX_STALE_MS ?? "1800000",
      1_000,
      3_600_000,
    ),
    catalogEnabled,
    coursesEnabled,
    affiliateProvisioningEnabled,
    couponRequestsEnabled,
    localPreviewEnabled,
  };
  if (config.catalogCacheMaxStaleMs < config.catalogCacheTtlMs) {
    throw new Error("BONDA_CATALOG_CACHE_MAX_STALE_MS must be greater than or equal to BONDA_CATALOG_CACHE_TTL_MS");
  }
  if (micrositeId) config.micrositeId = micrositeId;
  if (couponApiKey) config.couponApiKey = couponApiKey;
  if (affiliateToken) config.affiliateToken = affiliateToken;
  if (catalogAffiliateCode) config.catalogAffiliateCode = catalogAffiliateCode;
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

function optionalValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseHostList(name: string, value: string): readonly string[] {
  const hosts = value
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (hosts.length === 0 || hosts.some((host) => !isHostname(host))) {
    throw new Error(`${name} must contain valid comma-separated hostnames`);
  }
  return [...new Set(hosts)];
}

function isHostname(value: string): boolean {
  if (value.length > 253 || value.includes(":") || value.includes("/")) return false;
  return value.split(".").every(
    (label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
  );
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
