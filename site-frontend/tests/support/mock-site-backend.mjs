import { createServer } from "node:http";

const host = "127.0.0.1";
const port = 3002;
const pendingSessionCookie = "carobra_session=e2e-pending";
const eligibleSessionCookie = "carobra_session=e2e-eligible";
const inactiveSessionCookie = "carobra_session=e2e-inactive";
const attentionSessionCookie = "carobra_session=e2e-attention";

const profile = {
  id: "00000000-0000-0000-0000-000000000301",
  rewards_id: "RWD-e2e",
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

const eligibleProfile = {
  ...profile,
  id: "00000000-0000-0000-0000-000000000401",
  rewards_id: "RWD-eligible",
  email: "eligible@example.com",
  customer_status: "ACTIVE",
};

const inactiveProfile = {
  ...profile,
  id: "00000000-0000-0000-0000-000000000501",
  rewards_id: "RWD-inactive",
  email: "inactive@example.com",
  customer_status: "INACTIVE",
};

const attentionProfile = {
  ...profile,
  id: "00000000-0000-0000-0000-000000000601",
  rewards_id: "RWD-attention",
  email: "attention@example.com",
};

const validation = {
  validation_id: "00000000-0000-0000-0000-000000000302",
  customer_id: profile.id,
  status: "PENDING",
  registered_at: "2026-07-09T23:30:00Z",
  next_checkpoint: "H24",
  next_checkpoint_at: "2026-07-10T23:30:00Z",
  last_checked_at: null,
  last_check_outcome: null,
};

const eligibleValidation = {
  ...validation,
  validation_id: "00000000-0000-0000-0000-000000000402",
  customer_id: eligibleProfile.id,
  status: "VALIDATED",
  next_checkpoint: null,
  next_checkpoint_at: null,
  last_checked_at: "2026-07-14T12:00:00Z",
  last_check_outcome: "MATCH_VALIDATED",
};

const inactiveValidation = {
  ...eligibleValidation,
  validation_id: "00000000-0000-0000-0000-000000000502",
  customer_id: inactiveProfile.id,
};

const attentionValidation = {
  ...validation,
  validation_id: "00000000-0000-0000-0000-000000000602",
  customer_id: attentionProfile.id,
  status: "REQUIRES_ATTENTION",
  next_checkpoint: null,
  next_checkpoint_at: null,
  last_checked_at: "2026-07-14T12:00:00Z",
  last_check_outcome: "TECHNICAL_FAILURE",
};

const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? "/", `http://${host}:${port}`).pathname;
  const method = request.method ?? "GET";

  if (method === "GET" && path === "/__health") {
    return json(response, 200, { status: "ok" });
  }

  if (method === "POST" && path === "/api/v1/auth/register") {
    const payload = await readJson(request);
    if (payload.email === "duplicate@example.com") {
      return siteError(response, 409, "duplicate_email", "Email already registered");
    }
    return json(response, 201, {
      customer: profile,
      validation_id: validation.validation_id,
      validation_status: validation.status,
    });
  }

  if (method === "POST" && path === "/api/v1/auth/login") {
    const payload = await readJson(request);
    const loginProfile = [profile, eligibleProfile, inactiveProfile, attentionProfile]
      .find((candidate) => candidate.email === payload.email);
    if (!loginProfile || payload.password !== "correct-horse-7") {
      return siteError(response, 401, "invalid_credentials", "Invalid credentials");
    }
    const sessionCookie = sessionCookieFor(loginProfile);
    response.setHeader(
      "set-cookie",
      `${sessionCookie}; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`,
    );
    return json(response, 200, {
      customer: loginProfile,
      expires_at: "2026-07-16T23:30:00Z",
    });
  }

  if (method === "POST" && path === "/api/v1/auth/logout") {
    response.setHeader(
      "set-cookie",
      "carobra_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
    );
    response.writeHead(204);
    return response.end();
  }

  if (method === "GET" && path === "/api/v1/me") {
    const authenticated = authenticatedProfile(request);
    return authenticated
      ? json(response, 200, authenticated)
      : siteError(response, 401, "unauthenticated", "Authentication is required");
  }

  if (method === "GET" && path === "/api/v1/me/validation-status") {
    const authenticated = authenticatedProfile(request);
    return authenticated
      ? json(response, 200, validationFor(authenticated))
      : siteError(response, 401, "unauthenticated", "Authentication is required");
  }

  if (method === "GET" && path === "/api/v1/rewards/eligibility") {
    const authenticated = authenticatedProfile(request);
    return authenticated
      ? json(response, 200, eligibilityFor(authenticated))
      : siteError(response, 401, "unauthenticated", "Authentication is required");
  }

  if (method === "GET" && path === "/api/v1/rewards/account") {
    const authenticated = authenticatedProfile(request);
    if (!authenticated) {
      return siteError(response, 401, "unauthenticated", "Authentication is required");
    }
    if (authenticated !== eligibleProfile) {
      return siteError(response, 403, "rewards_not_eligible", "Rewards account is not eligible");
    }
    return json(response, 200, {
      account_id: "00000000-0000-0000-0000-000000000403",
      available_points: "2000",
      reserved_points: "0",
      next_expiring_points: "2000",
      next_expiration_at: "2028-01-14T12:00:00.000Z",
      afore_relation_status: "ACTIVE",
      recent_movements: [{
        id: "00000000-0000-0000-0000-000000000404",
        entry_type: "ISSUANCE",
        points_delta: "2000",
        rule_code: "REGISTRATION_ACTIVATION",
        occurred_at: "2026-07-14T12:00:00.000Z",
      }],
      earning_opportunities: [],
      benefits: {
        available_items: 0,
        redemption_enabled: false,
        unavailable_reason: "Catalog pending approval",
      },
    });
  }

  if (method === "GET" && path === "/api/v1/rewards/referrals") {
    const authenticated = authenticatedProfile(request);
    if (!authenticated) {
      return siteError(response, 401, "unauthenticated", "Authentication is required");
    }
    if (authenticated !== eligibleProfile) {
      return siteError(response, 403, "rewards_not_eligible", "Rewards account is not eligible");
    }
    return json(response, 200, {
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
    });
  }

  return siteError(response, 404, "not_found", "Route not found");
});

server.listen(port, host);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

function authenticatedProfile(request) {
  const cookies = request.headers.cookie?.split(";").map((value) => value.trim()) ?? [];
  if (cookies.includes(eligibleSessionCookie)) return eligibleProfile;
  if (cookies.includes(pendingSessionCookie)) return profile;
  if (cookies.includes(inactiveSessionCookie)) return inactiveProfile;
  if (cookies.includes(attentionSessionCookie)) return attentionProfile;
  return null;
}

function sessionCookieFor(candidate) {
  if (candidate === eligibleProfile) return eligibleSessionCookie;
  if (candidate === inactiveProfile) return inactiveSessionCookie;
  if (candidate === attentionProfile) return attentionSessionCookie;
  return pendingSessionCookie;
}

function validationFor(candidate) {
  if (candidate === eligibleProfile) return eligibleValidation;
  if (candidate === inactiveProfile) return inactiveValidation;
  if (candidate === attentionProfile) return attentionValidation;
  return validation;
}

function eligibilityFor(candidate) {
  if (candidate === eligibleProfile) {
    return {
      customer_id: candidate.id,
      eligible: true,
      reason: null,
      customer_status: "ACTIVE",
      sisca_validation_status: "VALIDATED",
      afore_relation_status: "ACTIVE",
    };
  }
  if (candidate === inactiveProfile) {
    return {
      customer_id: candidate.id,
      eligible: false,
      reason: "customer_inactive",
      customer_status: "INACTIVE",
      sisca_validation_status: "VALIDATED",
      afore_relation_status: "INACTIVE",
    };
  }
  return {
    customer_id: candidate.id,
    eligible: false,
    reason: "sisca_not_validated",
    customer_status: candidate.customer_status,
    sisca_validation_status: candidate === attentionProfile ? "REQUIRES_ATTENTION" : "PENDING",
    afore_relation_status: "PENDING",
  };
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function siteError(response, status, code, message) {
  return json(response, status, { error: { code, message } });
}

function json(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}
