import type {
  AdminCustomer,
  AdminCustomerStatus,
  AdminDashboardDemoState,
} from "./admin-demo-state";

export interface AdminRealCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastSessionAt: string | null;
}

export interface HybridCustomerMergeResult {
  customers: AdminCustomer[];
  replacedCustomerIdMap: Record<string, string>;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function resolveTier(createdAt: Date) {
  const ageInDays = Math.floor((Date.now() - createdAt.getTime()) / MS_PER_DAY);

  if (ageInDays >= 120) {
    return "Platinum";
  }

  if (ageInDays >= 45) {
    return "Gold";
  }

  return "Silver";
}

function resolveStatus(lastInteractionAt: Date, emailVerifiedAt: Date | null): AdminCustomerStatus {
  if (!emailVerifiedAt) {
    return "nueva";
  }

  const inactivityDays = Math.floor((Date.now() - lastInteractionAt.getTime()) / MS_PER_DAY);
  if (inactivityDays > 14) {
    return "en_riesgo";
  }

  return "activa";
}

function resolveParticipationNote(status: AdminCustomerStatus, isActive: boolean, emailVerifiedAt: Date | null) {
  if (!isActive) {
    return "Cuenta inactiva; revisar estatus operativo con soporte.";
  }

  if (!emailVerifiedAt) {
    return "Cuenta creada recientemente; pendiente de completar verificación y onboarding.";
  }

  if (status === "en_riesgo") {
    return "Sin actividad reciente detectada; requiere seguimiento de recuperación.";
  }

  return "Cliente real con actividad operativa estable en la plataforma.";
}

export async function fetchAdminRealCustomers(apiBaseUrl: string) {
  try {
    const response = await fetch(`${apiBaseUrl}/admin/customers`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      console.warn("[admin-customers] unable to load real customers", {
        status: response.status,
        statusText: response.statusText,
        endpoint: `${apiBaseUrl}/admin/customers`,
      });
      return [] as AdminRealCustomer[];
    }

    const data = (await response.json()) as {
      customers?: AdminRealCustomer[];
    };

    if (!Array.isArray(data.customers)) {
      console.warn("[admin-customers] invalid customers payload shape", {
        endpoint: `${apiBaseUrl}/admin/customers`,
      });
      return [] as AdminRealCustomer[];
    }

    return data.customers;
  } catch (error) {
    console.warn("[admin-customers] request failed", {
      endpoint: `${apiBaseUrl}/admin/customers`,
      error,
    });
    return [] as AdminRealCustomer[];
  }
}

export async function fetchAdminRealCustomerById(apiBaseUrl: string, customerId: string) {
  try {
    const response = await fetch(`${apiBaseUrl}/admin/customers/${customerId}`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      console.warn("[admin-customers] unable to load real customer detail", {
        customerId,
        status: response.status,
        statusText: response.statusText,
        endpoint: `${apiBaseUrl}/admin/customers/${customerId}`,
      });
      return null;
    }

    const data = (await response.json()) as {
      customer?: AdminRealCustomer;
    };

    return data.customer ?? null;
  } catch (error) {
    console.warn("[admin-customers] detail request failed", {
      customerId,
      endpoint: `${apiBaseUrl}/admin/customers/${customerId}`,
      error,
    });
    return null;
  }
}

export function isLikelyUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function adaptRealCustomerToAdminCustomer(realCustomer: AdminRealCustomer): AdminCustomer {
  const now = new Date();
  const createdAt = parseDate(realCustomer.createdAt) ?? now;
  const updatedAt = parseDate(realCustomer.updatedAt) ?? createdAt;
  const emailVerifiedAt = parseDate(realCustomer.emailVerifiedAt);
  const lastSessionAt = parseDate(realCustomer.lastSessionAt);
  const lastInteractionAt = lastSessionAt ?? updatedAt ?? createdAt;
  const status = resolveStatus(lastInteractionAt, emailVerifiedAt);

  return {
    id: realCustomer.id,
    firstName: realCustomer.firstName.trim() || "Cliente",
    lastName: realCustomer.lastName.trim() || "Real",
    email: normalizeEmail(realCustomer.email) || `${realCustomer.id}@carobra.real`,
    status,
    tier: resolveTier(createdAt),
    enrolledAt: createdAt.toISOString(),
    lastInteractionAt: lastInteractionAt.toISOString(),
    participationNote: resolveParticipationNote(status, realCustomer.isActive, emailVerifiedAt),
  };
}

function sortCustomersByInteraction(customers: AdminCustomer[]) {
  return [...customers].sort(
    (left, right) =>
      new Date(right.lastInteractionAt).getTime() - new Date(left.lastInteractionAt).getTime(),
  );
}

function toDedupKey(customer: AdminCustomer) {
  const normalizedEmail = normalizeEmail(customer.email);
  return normalizedEmail || `id:${customer.id}`;
}

export function mergeMockAndRealCustomers(
  mockCustomers: AdminCustomer[],
  realCustomers: AdminRealCustomer[],
): HybridCustomerMergeResult {
  const mergedByKey = new Map<string, AdminCustomer>();
  const replacedCustomerIdMap: Record<string, string> = {};

  for (const mockCustomer of sortCustomersByInteraction(mockCustomers)) {
    const key = toDedupKey(mockCustomer);
    if (!mergedByKey.has(key)) {
      mergedByKey.set(key, mockCustomer);
    }
  }

  for (const realCustomer of realCustomers) {
    const adapted = adaptRealCustomerToAdminCustomer(realCustomer);
    const key = toDedupKey(adapted);
    const previous = mergedByKey.get(key);

    if (previous && previous.id !== adapted.id) {
      replacedCustomerIdMap[previous.id] = adapted.id;
    }

    mergedByKey.set(key, adapted);
  }

  return {
    customers: sortCustomersByInteraction(Array.from(mergedByKey.values())),
    replacedCustomerIdMap,
  };
}

export function mergeAdminDashboardStateWithRealCustomers(
  state: AdminDashboardDemoState,
  realCustomers: AdminRealCustomer[],
) {
  const mergedCustomers = mergeMockAndRealCustomers(state.customers, realCustomers);

  return {
    state: {
      ...state,
      customers: mergedCustomers.customers,
    },
    replacedCustomerIdMap: mergedCustomers.replacedCustomerIdMap,
  };
}

export function resolveMergedCustomerId(
  selectedCustomerId: string,
  state: AdminDashboardDemoState,
  replacedCustomerIdMap: Record<string, string>,
) {
  if (state.customers.some((customer) => customer.id === selectedCustomerId)) {
    return selectedCustomerId;
  }

  return replacedCustomerIdMap[selectedCustomerId] ?? selectedCustomerId;
}
