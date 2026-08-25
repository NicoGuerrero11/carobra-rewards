import type { APIRoute } from "astro";

import { getSiteBackendBaseUrl } from "../../../lib/api";

const allowedPaths = new Set([
  "auth/register",
  "auth/login",
  "auth/logout",
  "me",
  "me/validation-status",
  "rewards/journey",
  "rewards/activities",
  "rewards/movements",
  "rewards/customer-context",
  "rewards/portal",
  "rewards/portal/preferences",
  "rewards/portal/notifications/read",
  "rewards/portal/actions/complete",
  "rewards/portal/learning-progress",
  "rewards/referrals",
]);

const proxy: APIRoute = async ({ params, request }) => {
  const path = params.path ?? "";
  if (!allowedPaths.has(path)) {
    return siteError(404, "not_found", "Route not found");
  }

  const headers = new Headers({ accept: "application/json" });
  for (const name of ["content-type", "cookie"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    const body = await request.arrayBuffer();
    if (body.byteLength > 0) init.body = body;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${getSiteBackendBaseUrl()}/api/v1/${path}`, init);
  } catch {
    return siteError(503, "api_unavailable", "The site backend is unavailable");
  }

  const responseHeaders = new Headers();
  for (const name of ["content-type", "cache-control"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  for (const cookie of getSetCookies(upstream.headers)) {
    responseHeaders.append("set-cookie", cookie);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
};

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;

function getSetCookies(headers: Headers): string[] {
  const headersWithCookies = headers as Headers & { getSetCookie?: () => string[] };
  const cookies = headersWithCookies.getSetCookie?.();
  if (cookies && cookies.length > 0) return cookies;
  const cookie = headers.get("set-cookie");
  return cookie ? [cookie] : [];
}

function siteError(status: number, code: string, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}
