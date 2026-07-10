import { createServer } from "node:http";

const host = "127.0.0.1";
const port = 3002;
const sessionCookie = "carobra_session=e2e-session";

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
    if (payload.email !== profile.email || payload.password !== "correct-horse-7") {
      return siteError(response, 401, "invalid_credentials", "Invalid credentials");
    }
    response.setHeader(
      "set-cookie",
      `${sessionCookie}; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`,
    );
    return json(response, 200, {
      customer: profile,
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
    return isAuthenticated(request)
      ? json(response, 200, profile)
      : siteError(response, 401, "unauthenticated", "Authentication is required");
  }

  if (method === "GET" && path === "/api/v1/me/validation-status") {
    return isAuthenticated(request)
      ? json(response, 200, validation)
      : siteError(response, 401, "unauthenticated", "Authentication is required");
  }

  return siteError(response, 404, "not_found", "Route not found");
});

server.listen(port, host);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

function isAuthenticated(request) {
  return request.headers.cookie?.split(";").some((value) => value.trim() === sessionCookie) ?? false;
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
