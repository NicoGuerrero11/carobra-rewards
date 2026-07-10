import { defineMiddleware } from "astro:middleware";

import { getSiteBackendBaseUrl } from "./lib/api";

const authPages = new Set(["/login", "/registro"]);
const e2eBypassAuth =
  process.env.E2E_BYPASS_AUTH === "true" ||
  import.meta.env.PUBLIC_E2E_BYPASS_AUTH === "true";
const e2eUserRoleHeader = "x-e2e-user-role";

const e2eClientUser = {
  id: "e2e-client-user",
  firstName: "Cliente",
  lastName: "Demo",
  email: "cliente.demo@carobra.test",
  rewardsId: "RWD-e2e",
  customerStatus: "PENDING_VALIDATION",
  onboardingStatus: "COMPLETED",
};

interface CustomerProfileResponse {
  id: string;
  rewards_id: string;
  first_name: string;
  last_name: string;
  email: string;
  customer_status: string;
  onboarding_status: string;
}

async function fetchSession(cookieHeader: string | null) {
  if (!cookieHeader) {
    return null;
  }

  try {
    const response = await fetch(`${getSiteBackendBaseUrl()}/api/v1/me`, {
      method: "GET",
      headers: { cookie: cookieHeader },
    });

    if (!response.ok) {
      return null;
    }

    const customer = (await response.json()) as CustomerProfileResponse;
    return {
      id: customer.id,
      firstName: customer.first_name,
      lastName: customer.last_name,
      email: customer.email,
      rewardsId: customer.rewards_id,
      customerStatus: customer.customer_status,
      onboardingStatus: customer.onboarding_status,
    };
  } catch {
    return null;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = context.url.pathname;

  // Admin, benefits, activities and editable profile remain demo-only and are
  // deliberately not exposed as MVP functionality.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return context.redirect("/");
  }
  if (pathname === "/verificar-email") {
    return context.redirect("/login");
  }
  if (pathname.startsWith("/cliente/")) {
    return context.redirect("/cliente");
  }

  const isProtected = pathname === "/cliente";
  const isAuthPage = authPages.has(pathname);
  if (!isProtected && !isAuthPage) {
    return next();
  }

  const bypassRequested =
    e2eBypassAuth &&
    isProtected &&
    context.request.headers.get(e2eUserRoleHeader)?.toLowerCase() !== "none";
  const user = bypassRequested
    ? e2eClientUser
    : await fetchSession(context.request.headers.get("cookie"));

  if (isAuthPage && user) {
    return context.redirect("/cliente");
  }
  if (!isProtected) {
    return next();
  }
  if (!user) {
    return context.redirect("/login");
  }

  context.locals.user = user;
  return next();
});
