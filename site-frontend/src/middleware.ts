import { defineMiddleware } from "astro:middleware";

import { getSiteBackendBaseUrl } from "./lib/api";
import type { RewardsCustomerPortal } from "./lib/rewards-customer-portal-contract";

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
  "/cliente/ganar-puntos",
  "/cliente/productos",
  "/cliente/activities",
  "/cliente/notificaciones",
  "/cliente/perfil",
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

interface CustomerContextResponse {
  customer: CustomerProfileResponse;
  validation: ValidationStatusResponse;
  portal: RewardsCustomerPortal | null;
}

function mapCustomer(customer: CustomerProfileResponse) {
  return {
    id: customer.id,
    firstName: customer.first_name,
    lastName: customer.last_name,
    email: customer.email,
    rewardsId: customer.rewards_id,
    customerStatus: customer.customer_status,
    onboardingStatus: customer.onboarding_status,
  };
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

    return mapCustomer((await response.json()) as CustomerProfileResponse);
  } catch {
    return null;
  }
}

async function fetchCustomerContext(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  try {
    const response = await fetch(`${getSiteBackendBaseUrl()}/api/v1/rewards/customer-context`, {
      method: "GET",
      headers: { cookie: cookieHeader },
    });
    if (!response.ok) return null;
    const context = (await response.json()) as CustomerContextResponse;
    return {
      user: mapCustomer(context.customer),
      validation: context.validation,
      portal: context.portal,
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
  const requestStartedAt = performance.now();
  const pathname = context.url.pathname;

  // The admin workspace remains outside the authenticated customer MVP.
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
  const cookieHeader = context.request.headers.get("cookie");
  const authContextStartedAt = performance.now();
  const customerContext = !bypassRequested && isProtected
    ? await fetchCustomerContext(cookieHeader)
    : null;
  const [user, validation] = bypassRequested
    ? [e2eClientUser, null] as const
    : customerContext
      ? [customerContext.user, customerContext.validation] as const
      : await Promise.all([
          fetchSession(cookieHeader),
          isProtected ? fetchValidationStatus(cookieHeader) : Promise.resolve(null),
        ]);
  const authContextDuration = performance.now() - authContextStartedAt;

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
  if (customerContext) context.locals.rewardsPortal = customerContext.portal;
  const bypassRole = context.request.headers.get(e2eUserRoleHeader)?.toLowerCase();
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

  if (pathname === "/cliente") {
    return context.redirect("/cliente/recompensas");
  }
  const pageStartedAt = performance.now();
  const response = await next();
  const pageDuration = performance.now() - pageStartedAt;
  const totalDuration = performance.now() - requestStartedAt;
  response.headers.append(
    "server-timing",
    [
      `auth-context;dur=${formatDuration(authContextDuration)}`,
      `page-render;dur=${formatDuration(pageDuration)}`,
      `total;dur=${formatDuration(totalDuration)}`,
    ].join(", "),
  );
  return response;
});

function formatDuration(duration: number): string {
  return Math.max(0, duration).toFixed(1);
}
