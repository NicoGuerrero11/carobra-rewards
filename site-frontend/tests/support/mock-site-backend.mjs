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
  validated_at: null,
  product_evidence: null,
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
  validated_at: "2026-07-14T12:00:00Z",
  product_evidence: {
    provider: "SISCA",
    product_type: "AFORE",
    status: "ACTIVE",
    source_id: "sisca-validation:00000000-0000-0000-0000-000000000402",
    validated_at: "2026-07-14T12:00:00Z",
  },
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
      registered_at: validation.registered_at,
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

  if (method === "GET" && path === "/api/v1/rewards/journey") {
    const authenticated = authenticatedProfile(request);
    return authenticated
      ? json(response, 200, journeyFor(authenticated))
      : siteError(response, 401, "unauthenticated", "Authentication is required");
  }

  if (method === "GET" && path === "/api/v1/rewards/portal") {
    const authenticated = authenticatedProfile(request);
    return authenticated
      ? json(response, 200, portalFor(authenticated))
      : siteError(response, 401, "unauthenticated", "Authentication is required");
  }

  if (authenticatedProfile(request) && (
    (method === "PATCH" && path === "/api/v1/rewards/portal/preferences")
    || (method === "POST" && path.startsWith("/api/v1/rewards/portal/"))
  )) {
    const payload = await readJson(request);
    return json(response, 200, path.endsWith("preferences") ? { ...payload, updated_at: "2026-08-24T12:00:00.000Z" } : { updated: true });
  }

  if (method === "GET" && path === "/api/v1/rewards/activities") {
    const authenticated = authenticatedProfile(request);
    if (!authenticated) {
      return siteError(response, 401, "unauthenticated", "Authentication is required");
    }
    return json(response, 200, {
      activities: authenticated === eligibleProfile
        ? [{
            activity_type: "PROFILE_UPDATED",
            qualifies: true,
            occurred_at: "2026-07-15T12:00:00.000Z",
          }]
        : [],
    });
  }

  if (method === "GET" && path === "/api/v1/rewards/movements") {
    const authenticated = authenticatedProfile(request);
    if (!authenticated) {
      return siteError(response, 401, "unauthenticated", "Authentication is required");
    }
    const summary = journeyFor(authenticated);
    return json(response, 200, {
      movements: summary.recent_movements.map((movement) => ({
        ...movement,
        entry_type: "ISSUANCE",
      })),
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

function journeyFor(candidate) {
  const active = candidate === eligibleProfile;
  const blocked = candidate === attentionProfile;
  const inactive = candidate === inactiveProfile;
  return {
    customer_id: candidate.id,
    journey: {
      state: inactive ? "INACTIVE" : blocked ? "BLOCKED" : active ? "ACTIVE" : "INVITED",
      current_level: active ? "BRONZE" : null,
      validation_status: validationFor(candidate).status,
      registered_at: validationFor(candidate).registered_at,
    },
    redemption: {
      eligible: false,
      reason: active ? "REDEMPTION_DISABLED" : "NO_ACTIVE_PRODUCT",
    },
    points: {
      available: active ? "150" : "45",
      reserved: "0",
      next_expiration_at: "2028-01-09T23:30:00.000Z",
    },
    progress: {
      target_level: active ? "SILVER" : "BRONZE",
      rule_available: false,
      remaining_active_products: null,
      remaining_registration_months: null,
      remaining_qualifying_activities: null,
    },
    products: active ? [{
      product_type: "AFORE",
      status: "ACTIVE",
      activated_at: "2026-07-14T12:00:00.000Z",
    }] : [],
    recent_movements: active ? [{
      code: "V2_INITIAL_PRODUCT_ACTIVE",
      points_delta: "105",
      occurred_at: "2026-07-14T12:00:00.000Z",
    }, {
      code: "V2_INVITED_REGISTRATION",
      points_delta: "45",
      occurred_at: "2026-07-09T23:30:00.000Z",
    }] : [{
      code: "V2_INVITED_REGISTRATION",
      points_delta: "45",
      occurred_at: "2026-07-09T23:30:00.000Z",
    }],
    modules: {
      benefits_enabled: false,
      expiry_policy_approved: false,
      ave_enabled: false,
      referrals_enabled: false,
      renewals_enabled: false,
    },
  };
}

function portalFor(candidate) {
  const active = candidate === eligibleProfile;
  const timeline = [{ id: `registration:${candidate.id}`, type: "REGISTRATION", title: "Registro completado", description: "Tu cuenta Carobra Rewards quedó creada.", occurred_at: "2026-07-09T23:30:00.000Z" }];
  if (active) timeline.unshift({ id: `product:${candidate.id}`, type: "PRODUCT", title: "Producto confirmado", description: "Tu producto está activo en Carobra Rewards.", occurred_at: "2026-07-14T12:00:00.000Z" });
  const actions = active ? [{ id: "00000000-0000-4000-8000-000000000701", type: "QUESTIONNAIRE", title: "Completa tu perfil financiero", description: "Responde un cuestionario breve para conocerte mejor.", status: "PENDING", href: "#actividad", approved_points: "20" }] : [];
  return {
    customer_id: candidate.id,
    primary_action: actions[0] ?? { id: "journey:validation", type: "STATUS", title: "Estamos validando tu producto", description: "No necesitas hacer nada adicional. Te avisaremos cuando Carobra termine la revisión.", status: "INFORMATIONAL", href: null, approved_points: null },
    actions,
    timeline,
    notifications: { unread_count: timeline.length, items: timeline.map((item) => ({ id: `notice:${item.id}`, title: item.title, message: item.description, occurred_at: item.occurred_at, read: false, href: null })) },
    products: active ? [{ id: "00000000-0000-4000-8000-000000000702", product_type: "AFORE", label: "Cuenta de retiro", status: "ACTIVE", status_label: "Activo", activated_at: "2026-07-14T12:00:00.000Z", ended_at: null, level_impact: "Se considera en tu nivel Bronce.", guidance: "Tu producto está confirmado y forma parte de tu relación con Carobra." }] : [],
    preferences: { activity_updates: true, learning_updates: true, product_updates: true, updated_at: null },
    learning: { items: active ? [{ id: "00000000-0000-4000-8000-000000000703", course_code: "RETIRO_101", title: "Fundamentos para tu retiro", description: "Aprende los conceptos esenciales para tomar decisiones informadas.", category: "Retiro", status: "IN_PROGRESS", progress: 40, qualifies: false, assigned_at: "2026-08-01T12:00:00.000Z", last_activity_at: "2026-08-20T12:00:00.000Z" }] : [] },
    documents: { requests: [] },
    help: [{ id: "levels", title: "¿Cómo se calcula mi nivel?", body: "Tu nivel considera productos activos, permanencia y actividades aprobadas; gastar puntos no lo reduce." }],
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
