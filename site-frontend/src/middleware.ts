import { defineMiddleware } from "astro:middleware";

import { getSiteBackendBaseUrl } from "./lib/api";

const authPages = new Set(["/login", "/registro"]);
const e2eBypassAuth =
  process.env.E2E_BYPASS_AUTH === "true" ||
  import.meta.env.PUBLIC_E2E_BYPASS_AUTH === "true";
const e2eUserRoleHeader = "x-e2e-user-role";
const customerEntryPaths = new Set([
  "/cliente",
  "/cliente/validacion",
  "/cliente/beneficios",
  "/cliente/cursos",
  "/cliente/gift-cards",
  "/cliente/recompensas",
  "/cliente/recompensas/referidos",
]);

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

interface RewardsEligibilityResponse {
  customer_id: string;
  eligible: boolean;
  reason: string | null;
  customer_status: string | null;
  sisca_validation_status: string | null;
  afore_relation_status: string | null;
}

interface ValidationStatusResponse {
  status: string;
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

async function fetchValidationStatus(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  try {
    const response = await fetch(`${getSiteBackendBaseUrl()}/api/v1/me/validation-status`, {
      method: "GET",
      headers: { cookie: cookieHeader },
    });
    if (!response.ok) return null;
    return (await response.json()) as ValidationStatusResponse;
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
  if (pathname.startsWith("/cliente/") && !customerEntryPaths.has(pathname)) {
    return context.redirect("/cliente");
  }

  const isProtected = customerEntryPaths.has(pathname);
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
  const cookieHeader = context.request.headers.get("cookie");
  const bypassRole = context.request.headers.get(e2eUserRoleHeader)?.toLowerCase();
  const validation = bypassRequested ? null : await fetchValidationStatus(cookieHeader);
  const validated = validation?.status === "VALIDATED";
  const rewardsEligibility: RewardsEligibilityResponse | null = bypassRequested
    ? {
        customer_id: user.id,
        eligible: bypassRole === "eligible",
        reason: bypassRole === "eligible" ? null : "sisca_not_validated",
        customer_status: bypassRole === "eligible" ? "ACTIVE" : "PENDING_VALIDATION",
        sisca_validation_status: bypassRole === "eligible" ? "VALIDATED" : "PENDING",
        afore_relation_status: bypassRole === "eligible" ? "ACTIVE" : "PENDING",
      }
    : validation
      ? {
          customer_id: user.id,
          eligible: validated && user.customerStatus === "ACTIVE",
          reason: user.customerStatus === "INACTIVE"
            ? "customer_inactive"
            : validated
              ? null
              : "sisca_not_validated",
          customer_status: user.customerStatus,
          sisca_validation_status: validation.status,
          afore_relation_status: validated ? "ACTIVE" : "PENDING",
        }
      : null;
  context.locals.rewardsEligibility = rewardsEligibility ?? undefined;

  const customerInactive = rewardsEligibility?.reason === "customer_inactive"
    || user.customerStatus === "INACTIVE";

  if (pathname === "/cliente") {
    return context.redirect(customerInactive ? "/cliente/validacion" : "/cliente/recompensas");
  }
  if (
    (pathname.startsWith("/cliente/recompensas")
      || pathname === "/cliente/beneficios"
      || pathname === "/cliente/cursos"
      || pathname === "/cliente/gift-cards")
    && customerInactive
  ) {
    return context.redirect("/cliente/validacion");
  }
  if (pathname === "/cliente/validacion" && !customerInactive) {
    return context.redirect("/cliente/recompensas");
  }
  return next();
});
