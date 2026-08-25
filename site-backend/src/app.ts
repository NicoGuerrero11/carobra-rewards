import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { RewardsApiClient, SiteApiError, type FetchImplementation } from "./api-client.js";
import type { SiteBackendConfig } from "./config.js";
import type {
  LoginRequest,
  RegisterRequest,
  SiteErrorEnvelope,
  SiteRegisterRequest,
} from "./contracts.js";
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
import {
  authorizeRewardsV2TestRequest,
  RewardsV2TestScenarioApplication,
  rewardsV2TestAccessHeader,
} from "./rewards/v2/test-scenarios.js";
import type { RewardsV2JourneyHttpApplication } from "./rewards/v2/journey-http-application.js";
import type {
  RewardsCustomerPortalApplication,
  UpdateLearningProgressInput,
  UpdatePreferencesInput,
} from "./rewards/v2/customer-portal.js";

const MAX_BODY_BYTES = 128 * 1024;

export function createSiteBackendServer(
  config: SiteBackendConfig,
  fetchImplementation?: FetchImplementation,
  behaviorApplication?: RewardsBehaviorHttpApplication,
  referralApplication?: ReferralHttpApplication,
  rewardsV2JourneyApplication?: RewardsV2JourneyHttpApplication,
  rewardsCustomerPortalApplication?: RewardsCustomerPortalApplication,
): Server {
  const client = new RewardsApiClient(config, fetchImplementation);
  const rewardsV2TestScenarios = new RewardsV2TestScenarioApplication();
  return createServer((request, response) => {
    void routeRequest(
      request,
      response,
      client,
      config,
      behaviorApplication,
      referralApplication,
      rewardsV2JourneyApplication,
      rewardsCustomerPortalApplication,
      rewardsV2TestScenarios,
    );
  });
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  client: RewardsApiClient,
  config: SiteBackendConfig,
  behaviorApplication: RewardsBehaviorHttpApplication | undefined,
  referralApplication: ReferralHttpApplication | undefined,
  rewardsV2JourneyApplication: RewardsV2JourneyHttpApplication | undefined,
  rewardsCustomerPortalApplication: RewardsCustomerPortalApplication | undefined,
  rewardsV2TestScenarios: RewardsV2TestScenarioApplication,
): Promise<void> {
  try {
    const method = request.method ?? "GET";
    const path = new URL(request.url ?? "/", "http://site-backend.local").pathname;
    const cookie = request.headers.cookie;

    if (method === "POST" && path === "/api/v1/auth/register") {
      const body = await readJsonBody<SiteRegisterRequest>(request);
      const result = await client.register(toApiRegisterRequest(body));
      if (rewardsV2JourneyApplication) {
        await captureInvitedJourneySafely(
          rewardsV2JourneyApplication,
          result.data.customer.id,
          result.data.registered_at,
        );
      }
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
    if (method === "GET" && path === "/api/v1/rewards/customer-context") {
      const context = await client.getAuthenticatedCustomerContext(cookie);
      const customerPortal = await loadCustomerPortalSafely(
        rewardsCustomerPortalApplication,
        rewardsV2JourneyApplication,
        context.data.evidence,
      );
      return sendApiResult(response, {
        status: 200,
        data: {
          customer: context.data.customer,
          validation: { status: context.data.validation.status },
          portal: customerPortal,
        },
        setCookies: context.setCookies,
      }, config);
    }
    if (method === "GET" && path === "/api/v1/rewards/journey") {
      if (!rewardsV2JourneyApplication) {
        throw new SiteApiError(503, "api_unavailable", "Rewards is unavailable");
      }
      const evidence = await client.getRewardsIdentityEvidence(cookie);
      await synchronizeJourneyEvidence(rewardsV2JourneyApplication, evidence.data);
      const summary = await rewardsV2JourneyApplication.getSummary(
        asCustomerId(evidence.data.customer_id),
        evidence.data.validation_status,
      );
      if (!summary) {
        sendJson(response, 404, {
          error: {
            code: "rewards_journey_not_found",
            message: "Rewards journey is not available yet",
          },
        });
        return;
      }
      sendJson(response, 200, summary);
      return;
    }
    if (method === "GET" && path === "/api/v1/rewards/activities") {
      if (!rewardsV2JourneyApplication) {
        throw new SiteApiError(503, "api_unavailable", "Rewards is unavailable");
      }
      const evidence = await client.getRewardsIdentityEvidence(cookie);
      sendJson(
        response,
        200,
        await rewardsV2JourneyApplication.getActivities(
          asCustomerId(evidence.data.customer_id),
        ),
      );
      return;
    }
    if (method === "GET" && path === "/api/v1/rewards/movements") {
      if (!rewardsV2JourneyApplication) {
        throw new SiteApiError(503, "api_unavailable", "Rewards is unavailable");
      }
      const evidence = await client.getRewardsIdentityEvidence(cookie);
      sendJson(
        response,
        200,
        await rewardsV2JourneyApplication.getMovements(
          asCustomerId(evidence.data.customer_id),
        ),
      );
      return;
    }
    if (method === "GET" && path === "/api/v1/rewards/portal") {
      const portal = requireCustomerPortalApplication(rewardsCustomerPortalApplication);
      const evidence = await client.getRewardsIdentityEvidence(cookie);
      if (rewardsV2JourneyApplication) {
        await synchronizeJourneyEvidence(rewardsV2JourneyApplication, evidence.data);
      }
      const customerPortal = await portal.getPortal(
        asCustomerId(evidence.data.customer_id),
        evidence.data.validation_status,
      );
      if (!customerPortal) {
        sendJson(response, 404, { error: { code: "rewards_journey_not_found", message: "Rewards journey is not available yet" } });
        return;
      }
      sendJson(response, 200, customerPortal);
      return;
    }
    if (method === "PATCH" && path === "/api/v1/rewards/portal/preferences") {
      const portal = requireCustomerPortalApplication(rewardsCustomerPortalApplication);
      const evidence = await client.getRewardsIdentityEvidence(cookie);
      sendJson(response, 200, await portal.updatePreferences(
        asCustomerId(evidence.data.customer_id),
        await readJsonBody<UpdatePreferencesInput>(request),
      ));
      return;
    }
    if (method === "POST" && path === "/api/v1/rewards/portal/notifications/read") {
      const portal = requireCustomerPortalApplication(rewardsCustomerPortalApplication);
      const evidence = await client.getRewardsIdentityEvidence(cookie);
      const body = await readJsonBody<{ notification_id: string }>(request);
      await portal.markNotificationRead(asCustomerId(evidence.data.customer_id), body.notification_id);
      sendJson(response, 200, { status: "recorded" });
      return;
    }
    if (method === "POST" && path === "/api/v1/rewards/portal/actions/complete") {
      const portal = requireCustomerPortalApplication(rewardsCustomerPortalApplication);
      const evidence = await client.getRewardsIdentityEvidence(cookie);
      const body = await readJsonBody<{ action_id: string }>(request);
      sendJson(response, 200, { completed: await portal.completeAction(
        asCustomerId(evidence.data.customer_id), body.action_id,
      ) });
      return;
    }
    if (method === "POST" && path === "/api/v1/rewards/portal/learning-progress") {
      const portal = requireCustomerPortalApplication(rewardsCustomerPortalApplication);
      const evidence = await client.getRewardsIdentityEvidence(cookie);
      sendJson(response, 200, { updated: await portal.updateLearningProgress(
        asCustomerId(evidence.data.customer_id),
        await readJsonBody<UpdateLearningProgressInput>(request),
      ) });
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
    if (method === "GET" && path === "/api/v1/rewards/test/scenarios") {
      authorizeRewardsV2TestRequest(
        config,
        singleHeader(request.headers[rewardsV2TestAccessHeader]),
      );
      sendJson(response, 200, { scenarios: rewardsV2TestScenarios.list() });
      return;
    }
    if (method === "GET" && path.startsWith("/api/v1/rewards/test/scenarios/")) {
      authorizeRewardsV2TestRequest(
        config,
        singleHeader(request.headers[rewardsV2TestAccessHeader]),
      );
      const code = decodeURIComponent(path.slice("/api/v1/rewards/test/scenarios/".length));
      const scenario = rewardsV2TestScenarios.get(code);
      if (!scenario) {
        sendJson(response, 404, { error: { code: "not_found", message: "Scenario not found" } });
        return;
      }
      sendJson(response, 200, scenario);
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

async function loadCustomerPortalSafely(
  portal: RewardsCustomerPortalApplication | undefined,
  journey: RewardsV2JourneyHttpApplication | undefined,
  evidence: {
    customer_id: string;
    registered_at: string;
    validation_status: string;
    product_evidence: null | { source_id: string; validated_at: string };
  },
) {
  if (!portal) return null;
  try {
    if (journey) await synchronizeJourneyEvidence(journey, evidence);
    return await portal.getPortal(
      asCustomerId(evidence.customer_id),
      evidence.validation_status,
    );
  } catch (error: unknown) {
    console.error(JSON.stringify({
      event: "rewards_customer_context_unavailable",
      error_name: error instanceof Error ? error.name : "UnknownError",
    }));
    return null;
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

async function captureInvitedJourneySafely(
  application: RewardsV2JourneyHttpApplication,
  customerId: string,
  registeredAt: string,
): Promise<void> {
  try {
    await application.ensureInvited({
      customerId: asCustomerId(customerId),
      registeredAt: parseApiInstant(registeredAt),
    });
  } catch {
    // Customer registration remains authoritative in the API. The authenticated
    // journey read retries this idempotent projection if Rewards was unavailable.
  }
}

function parseApiInstant(value: string): Date {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new SiteApiError(503, "api_unavailable", "The API returned invalid evidence");
  }
  return instant;
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

function requireCustomerPortalApplication(
  application: RewardsCustomerPortalApplication | undefined,
): RewardsCustomerPortalApplication {
  if (!application) throw new SiteApiError(503, "api_unavailable", "Rewards is unavailable");
  return application;
}

async function synchronizeJourneyEvidence(
  application: RewardsV2JourneyHttpApplication,
  evidence: {
    customer_id: string;
    registered_at: string;
    validation_status: string;
    product_evidence: null | { source_id: string; validated_at: string };
  },
): Promise<void> {
  await application.synchronize({
    customerId: asCustomerId(evidence.customer_id),
    registeredAt: parseApiInstant(evidence.registered_at),
    validationStatus: evidence.validation_status,
    validatedAfore: evidence.product_evidence ? {
      provider: "SISCA",
      productType: "AFORE",
      sourceId: evidence.product_evidence.source_id,
      validatedAt: parseApiInstant(evidence.product_evidence.validated_at),
    } : null,
  });
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

function singleHeader(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}
