import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import test from "node:test";

import { createSiteBackendServer } from "../src/app.js";
import type { SiteBackendConfig } from "../src/config.js";
import type {
  CaptureReferralRegistrationCommand,
  ReferralDashboardHttpResponse,
  ReferralHttpApplication,
} from "../src/rewards/referrals/http-application.js";
import type { CustomerId } from "../src/rewards/shared/identifiers.js";

const runningServers = new Set<Server>();

test.afterEach(async () => {
  await Promise.all([...runningServers].map((server) => close(server)));
});

const profile = {
  id: "00000000-0000-0000-0000-000000000301",
  rewards_id: "RWD-test",
  curp: "ABCD123456HMNLRS09",
  first_name: "Ada",
  last_name: "Lovelace",
  email: "ada@example.com",
  phone: "5551234567",
  postal_code: "01010",
  state: "CDMX",
  city: "Ciudad de Mexico",
  customer_status: "PENDING_VALIDATION",
  onboarding_status: "COMPLETED",
};

const registrationPayload = {
  curp: profile.curp,
  first_name: profile.first_name,
  last_name: profile.last_name,
  email: profile.email,
  phone: profile.phone,
  password: "correct-horse-7",
  confirm_password: "correct-horse-7",
  postal_code: profile.postal_code,
  state: profile.state,
  city: profile.city,
  terms_accepted: true,
  terms_version: "2026-07",
};

test("proxies successful registration without changing the payload", async (t) => {
  const upstream = await startServer(async (request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/api/v1/auth/register");
    assert.deepEqual(await readJson(request), registrationPayload);
    json(response, 201, {
      customer: profile,
      validation_id: "00000000-0000-0000-0000-000000000302",
      validation_status: "PENDING",
    });
  });
  const bff = await startBff(t, upstream.url);

  const response = await fetch(`${bff.url}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(registrationPayload),
  });

  assert.equal(response.status, 201);
  assert.equal((await response.json() as { validation_status: string }).validation_status, "PENDING");
});

test("captures a referral token after registration without forwarding it to FastAPI", async (t) => {
  const token = "abcdefghijklmnopqrstuvwxyzABCDEFG_123456789";
  const upstream = await startServer(async (request, response) => {
    assert.deepEqual(await readJson(request), registrationPayload);
    json(response, 201, {
      customer: profile,
      validation_id: "00000000-0000-0000-0000-000000000302",
      validation_status: "PENDING",
    });
  });
  const referrals = new CapturingReferralApplication();
  const bff = await startBff(t, upstream.url, undefined, 1_000, referrals);

  const response = await fetch(`${bff.url}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...registrationPayload, referral_token: token }),
  });

  assert.equal(response.status, 201);
  assert.equal(referrals.capture?.token, token);
  assert.equal(referrals.capture?.referredCustomerId, profile.id);
});

test("returns authenticated referral progress without another customer's identity", async (t) => {
  const upstream = await startServer((request, response) => {
    if (request.url === "/api/v1/me") return json(response, 200, profile);
    if (request.url === "/api/v1/me/validation-status") {
      return json(response, 200, {
        validation_id: "00000000-0000-0000-0000-000000000302",
        customer_id: profile.id,
        status: "VALIDATED",
      });
    }
    return json(response, 404, {});
  });
  const referrals = new CapturingReferralApplication();
  const bff = await startBff(t, upstream.url, undefined, 1_000, referrals);

  const response = await fetch(`${bff.url}/api/v1/rewards/referrals`, {
    headers: { cookie: "carobra_session=api-secret" },
  });

  assert.equal(response.status, 200);
  assert.equal(referrals.dashboardCustomerId, profile.id);
  const body = await response.text();
  assert.match(body, /\/registro\?ref=/);
  assert.doesNotMatch(body, /referred@example|CURP|first_name/i);
});

test("proxies successful login and adapts the API session cookie", async (t) => {
  const upstream = await startServer(async (request, response) => {
    assert.equal(request.url, "/api/v1/auth/login");
    assert.deepEqual(await readJson(request), {
      email: profile.email,
      password: "correct-horse-7",
    });
    response.setHeader(
      "set-cookie",
      "carobra_session=api-secret; Max-Age=604800; Path=/; HttpOnly; SameSite=lax",
    );
    json(response, 200, { customer: profile, expires_at: "2026-07-16T00:00:00Z" });
  });
  const bff = await startBff(t, upstream.url, { secure: true, sameSite: "strict" });

  const response = await fetch(`${bff.url}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: profile.email, password: "correct-horse-7" }),
  });

  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /^carobra_session=api-secret/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.doesNotMatch(await response.text(), /api-secret/);
});

for (const [code, status] of [["duplicate_email", 409], ["duplicate_curp", 409]] as const) {
  test(`maps ${code} to a stable form error`, async (t) => {
    const upstream = await startServer((_request, response) => {
      apiError(response, status, code, "Already registered");
    });
    const bff = await startBff(t, upstream.url);

    const response = await fetch(`${bff.url}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(registrationPayload),
    });

    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), {
      error: { code, message: "Already registered" },
    });
  });
}

for (const code of ["password_mismatch", "terms_not_accepted"] as const) {
  test(`maps ${code} from registration`, async (t) => {
    const upstream = await startServer((_request, response) => {
      apiError(response, 422, code, "Registration rejected");
    });
    const bff = await startBff(t, upstream.url);
    const response = await fetch(`${bff.url}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(registrationPayload),
    });
    assert.equal(response.status, 422);
    assert.equal((await response.json() as { error: { code: string } }).error.code, code);
  });
}

test("preserves Rewards ID collision exhaustion as a stable registration error", async (t) => {
  const upstream = await startServer((_request, response) => {
    apiError(
      response,
      503,
      "rewards_id_collision_exhausted",
      "Could not allocate a Rewards ID",
    );
  });
  const bff = await startBff(t, upstream.url);

  const response = await fetch(`${bff.url}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(registrationPayload),
  });

  assert.equal(response.status, 503);
  assert.equal(
    (await response.json() as { error: { code: string } }).error.code,
    "rewards_id_collision_exhausted",
  );
});

test("maps invalid login without exposing credential details", async (t) => {
  const upstream = await startServer((_request, response) => {
    apiError(response, 401, "invalid_credentials", "Invalid credentials");
  });
  const bff = await startBff(t, upstream.url);

  const response = await fetch(`${bff.url}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: profile.email, password: "wrong" }),
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: { code: "invalid_credentials", message: "Invalid credentials" },
  });
});

test("maps a missing session for profile and validation status", async (t) => {
  const upstream = await startServer((request, response) => {
    assert.equal(request.headers.cookie, undefined);
    apiError(response, 401, "unauthenticated", "Authentication is required");
  });
  const bff = await startBff(t, upstream.url);

  for (const path of ["/api/v1/me", "/api/v1/me/validation-status"]) {
    const response = await fetch(`${bff.url}${path}`);
    assert.equal(response.status, 401);
    assert.equal(
      (await response.json() as { error: { code: string } }).error.code,
      "unauthenticated",
    );
  }
});

test("forwards only the configured session cookie for authenticated reads", async (t) => {
  const upstream = await startServer((request, response) => {
    assert.equal(request.headers.cookie, "carobra_session=api-secret");
    json(response, 200, profile);
  });
  const bff = await startBff(t, upstream.url);

  const response = await fetch(`${bff.url}/api/v1/me`, {
    headers: { cookie: "analytics=ignored; carobra_session=api-secret; theme=dark" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), profile);
});

test("proxies logout and relays session deletion", async (t) => {
  const upstream = await startServer((request, response) => {
    assert.equal(request.headers.cookie, "carobra_session=api-secret");
    response.setHeader(
      "set-cookie",
      "carobra_session=\"\"; expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/; HttpOnly; SameSite=lax",
    );
    response.writeHead(204);
    response.end();
  });
  const bff = await startBff(t, upstream.url);

  const response = await fetch(`${bff.url}/api/v1/auth/logout`, {
    method: "POST",
    headers: { cookie: "carobra_session=api-secret" },
  });

  assert.equal(response.status, 204);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
});

test("returns api_unavailable when FastAPI cannot be reached", async (t) => {
  const unavailableUrl = await reserveClosedUrl();
  const bff = await startBff(t, unavailableUrl, undefined, 100);

  const response = await fetch(`${bff.url}/api/v1/me`);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: { code: "api_unavailable", message: "The API is unavailable" },
  });
});

interface RunningServer {
  server: Server;
  url: string;
}

async function startBff(
  t: { after(callback: () => void | Promise<void>): void },
  apiBaseUrl: string,
  cookieOverrides?: Partial<SiteBackendConfig["sessionCookie"]>,
  timeout = 1_000,
  referralApplication?: ReferralHttpApplication,
): Promise<RunningServer> {
  const config: SiteBackendConfig = {
    apiBaseUrl,
    host: "127.0.0.1",
    port: 0,
    apiRequestTimeoutMs: timeout,
    sessionCookie: {
      name: "carobra_session",
      secure: false,
      sameSite: "lax",
      path: "/",
      ...cookieOverrides,
    },
  };
  const running = await listen(
    createSiteBackendServer(config, undefined, undefined, referralApplication),
  );
  t.after(() => close(running.server));
  return running;
}

class CapturingReferralApplication implements ReferralHttpApplication {
  capture: CaptureReferralRegistrationCommand | null = null;
  dashboardCustomerId: CustomerId | null = null;

  async captureRegistration(
    command: CaptureReferralRegistrationCommand,
  ): Promise<{ status: "REGISTERED" }> {
    this.capture = command;
    return { status: "REGISTERED" };
  }

  async getDashboard(customerId: CustomerId): Promise<ReferralDashboardHttpResponse> {
    this.dashboardCustomerId = customerId;
    return {
      invite_path: "/registro?ref=abcdefghijklmnopqrstuvwxyzABCDEFG_123456789",
      accepting_referrals: true,
      unavailable_reason: null,
      totals: { invited: 1, registered: 1, active: 0, earned_points: "3000" },
      referrals: [{
        position: 1,
        status: "REGISTERED",
        registration_completed: true,
        six_month_completed: false,
        twelve_month_completed: false,
      }],
    };
  }
}

async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
): Promise<RunningServer> {
  return listen(createServer((request, response) => void handler(request, response)));
}

async function listen(server: Server): Promise<RunningServer> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  runningServers.add(server);
  const address = server.address();
  assert(address && typeof address !== "string");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function close(server: Server): Promise<void> {
  if (!server.listening) {
    runningServers.delete(server);
    return;
  }
  server.close();
  await once(server, "close");
  runningServers.delete(server);
}

async function reserveClosedUrl(): Promise<string> {
  const running = await listen(createServer());
  const { url } = running;
  await close(running.server);
  return url;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function apiError(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
): void {
  json(response, status, { detail: { code, message } });
}
