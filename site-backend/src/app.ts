import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { RewardsApiClient, SiteApiError, type FetchImplementation } from "./api-client.js";
import type { SiteBackendConfig } from "./config.js";
import type {
  LoginRequest,
  RegisterRequest,
  SiteErrorEnvelope,
  SiteRegisterRequest,
} from "./contracts.js";
import type { RewardsAccountHttpApplication } from "./rewards/accounts/http-application.js";
import type {
  OnboardingEvidenceHttpRequest,
  RewardsBehaviorHttpApplication,
  SiteActionHttpRequest,
} from "./rewards/behaviors/http-application.js";
import { RewardsError } from "./rewards/shared/errors.js";
import {
  rewardsErrorEnvelope,
  RewardsPageRequestError,
} from "./rewards/shared/http-contracts.js";
import { asCustomerId } from "./rewards/shared/identifiers.js";
import type { ReferralHttpApplication } from "./rewards/referrals/http-application.js";

const MAX_BODY_BYTES = 128 * 1024;

export function createSiteBackendServer(
  config: SiteBackendConfig,
  fetchImplementation?: FetchImplementation,
  rewardsApplication?: RewardsAccountHttpApplication,
  behaviorApplication?: RewardsBehaviorHttpApplication,
  referralApplication?: ReferralHttpApplication,
): Server {
  const client = new RewardsApiClient(config, fetchImplementation);
  return createServer((request, response) => {
    void routeRequest(
      request,
      response,
      client,
      config,
      rewardsApplication,
      behaviorApplication,
      referralApplication,
    );
  });
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  client: RewardsApiClient,
  config: SiteBackendConfig,
  rewardsApplication: RewardsAccountHttpApplication | undefined,
  behaviorApplication: RewardsBehaviorHttpApplication | undefined,
  referralApplication: ReferralHttpApplication | undefined,
): Promise<void> {
  try {
    const method = request.method ?? "GET";
    const path = new URL(request.url ?? "/", "http://site-backend.local").pathname;
    const cookie = request.headers.cookie;

    if (method === "POST" && path === "/api/v1/auth/register") {
      const body = await readJsonBody<SiteRegisterRequest>(request);
      const result = await client.register(toApiRegisterRequest(body));
      if (body.referral_token && referralApplication) {
        await captureReferralSafely(referralApplication, body.referral_token, result.data.customer.id);
      }
      return sendApiResult(
        response,
        result,
        config,
      );
    }
    if (method === "POST" && path === "/api/v1/auth/login") {
      return sendApiResult(
        response,
        await client.login(await readJsonBody<LoginRequest>(request)),
        config,
      );
    }
    if (method === "POST" && path === "/api/v1/auth/logout") {
      return sendApiResult(response, await client.logout(cookie), config);
    }
    if (method === "GET" && path === "/api/v1/me") {
      return sendApiResult(response, await client.getCurrentCustomer(cookie), config);
    }
    if (method === "GET" && path === "/api/v1/me/validation-status") {
      return sendApiResult(response, await client.getValidationStatus(cookie), config);
    }
    if (method === "GET" && path === "/api/v1/rewards/eligibility") {
      const rewards = requireRewardsApplication(rewardsApplication);
      const evidence = await client.getRewardsIdentityEvidence(cookie);
      sendJson(
        response,
        200,
        await rewards.getEligibility(asCustomerId(evidence.data.customer_id)),
      );
      return;
    }
    if (method === "GET" && path === "/api/v1/rewards/account") {
      const rewards = requireRewardsApplication(rewardsApplication);
      const evidence = await client.getRewardsIdentityEvidence(cookie);
      sendJson(
        response,
        200,
        await rewards.getSummary(asCustomerId(evidence.data.customer_id)),
      );
      return;
    }
    if (method === "GET" && path === "/api/v1/rewards/referrals") {
      const referrals = requireReferralApplication(referralApplication);
      const evidence = await client.getRewardsIdentityEvidence(cookie);
      sendJson(
        response,
        200,
        await referrals.getDashboard(asCustomerId(evidence.data.customer_id)),
      );
      return;
    }
    if (method === "POST" && path === "/api/v1/rewards/actions") {
      const behaviors = requireBehaviorApplication(behaviorApplication);
      const evidence = await client.getRewardsIdentityEvidence(cookie);
      sendJson(response, 200, await behaviors.ingestSiteAction(
        asCustomerId(evidence.data.customer_id),
        await readJsonBody<SiteActionHttpRequest>(request),
      ));
      return;
    }
    if (method === "POST" && path === "/api/v1/rewards/onboarding/evidence") {
      const behaviors = requireBehaviorApplication(behaviorApplication);
      const evidence = await client.getRewardsIdentityEvidence(cookie);
      sendJson(response, 200, await behaviors.recordOnboardingEvidence(
        asCustomerId(evidence.data.customer_id),
        await readJsonBody<OnboardingEvidenceHttpRequest>(request),
      ));
      return;
    }

    sendJson(response, 404, { error: { code: "not_found", message: "Route not found" } });
  } catch (error: unknown) {
    if (error instanceof InvalidRequestError) {
      sendJson(response, 400, { error: { code: "invalid_request", message: error.message } });
      return;
    }
    if (error instanceof SiteApiError) {
      const payload: SiteErrorEnvelope = {
        error: { code: error.code, message: error.message },
      };
      sendJson(response, error.status, payload);
      return;
    }
    if (error instanceof RewardsError) {
      sendJson(response, error.status, rewardsErrorEnvelope(error));
      return;
    }
    if (error instanceof RewardsPageRequestError) {
      sendJson(response, error.status, {
        error: { code: error.code, message: error.message },
      });
      return;
    }
    sendJson(response, 503, {
      error: { code: "api_unavailable", message: "The API is unavailable" },
    });
  }
}

async function captureReferralSafely(
  application: ReferralHttpApplication,
  token: string,
  customerId: string,
): Promise<void> {
  try {
    await application.captureRegistration({
      token,
      referredCustomerId: asCustomerId(customerId),
      registeredAt: new Date(),
    });
  } catch {
    // Registration remains successful even when the independent Rewards capture is unavailable.
  }
}

function toApiRegisterRequest(body: SiteRegisterRequest): RegisterRequest {
  return {
    curp: body.curp,
    first_name: body.first_name,
    last_name: body.last_name,
    email: body.email,
    phone: body.phone,
    password: body.password,
    confirm_password: body.confirm_password,
    postal_code: body.postal_code,
    state: body.state,
    city: body.city,
    terms_accepted: body.terms_accepted,
    terms_version: body.terms_version,
  };
}

function requireReferralApplication(
  application: ReferralHttpApplication | undefined,
): ReferralHttpApplication {
  if (!application) throw new SiteApiError(503, "api_unavailable", "Rewards is unavailable");
  return application;
}

function requireBehaviorApplication(
  application: RewardsBehaviorHttpApplication | undefined,
): RewardsBehaviorHttpApplication {
  if (!application) throw new SiteApiError(503, "api_unavailable", "Rewards is unavailable");
  return application;
}

function requireRewardsApplication(
  application: RewardsAccountHttpApplication | undefined,
): RewardsAccountHttpApplication {
  if (!application) {
    throw new SiteApiError(503, "api_unavailable", "Rewards is unavailable");
  }
  return application;
}

function sendApiResult<T>(
  response: ServerResponse,
  result: { status: number; data: T; setCookies: string[] },
  config: SiteBackendConfig,
): void {
  const browserCookies = result.setCookies
    .map((cookie) => adaptSessionCookie(cookie, config))
    .filter((cookie): cookie is string => cookie !== undefined);
  if (browserCookies.length > 0) {
    response.setHeader("set-cookie", browserCookies);
  }
  if (result.status === 204) {
    response.writeHead(204);
    response.end();
    return;
  }
  sendJson(response, result.status, result.data);
}

function adaptSessionCookie(
  upstreamCookie: string,
  config: SiteBackendConfig,
): string | undefined {
  const parts = upstreamCookie.split(";").map((part) => part.trim());
  const nameValue = parts[0];
  if (!nameValue?.startsWith(`${config.sessionCookie.name}=`)) {
    return undefined;
  }

  const browserCookie = [
    nameValue,
    `Path=${config.sessionCookie.path}`,
    "HttpOnly",
    `SameSite=${formatSameSite(config.sessionCookie.sameSite)}`,
  ];
  const maxAge = parts.find((part) => part.toLowerCase().startsWith("max-age="));
  const expires = parts.find((part) => part.toLowerCase().startsWith("expires="));
  if (maxAge) browserCookie.push(maxAge);
  if (expires) browserCookie.push(expires);
  if (config.sessionCookie.domain) {
    browserCookie.push(`Domain=${config.sessionCookie.domain}`);
  }
  if (config.sessionCookie.secure) {
    browserCookie.push("Secure");
  }
  return browserCookie.join("; ");
}

function formatSameSite(value: "lax" | "strict" | "none"): string {
  return value[0]!.toUpperCase() + value.slice(1);
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) {
      throw new InvalidRequestError("Request body is too large");
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch {
    throw new InvalidRequestError("Request body must be valid JSON");
  }
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

class InvalidRequestError extends Error {}
