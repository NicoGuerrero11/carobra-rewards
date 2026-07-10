export interface ClientIdentity {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

const AUTH_HINT_STORAGE_KEY = "carobra:auth-user-hint";

export function requireElement<T extends Element>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }

  return element;
}

export function attachLogoutHandler(button: HTMLButtonElement, apiBaseUrl: string, redirectPath = "/login") {
  button.addEventListener("click", async () => {
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(AUTH_HINT_STORAGE_KEY);
      }

      await fetch(`${apiBaseUrl}/api/v1/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      window.location.href = redirectPath;
    }
  });
}

function decodeBase64UrlUtf8(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function repairMojibake(value: string) {
  if (!value || !/[ÃÂ]/.test(value)) {
    return value;
  }

  try {
    const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return value;
  }
}

function normalizeClientIdentity(user?: Partial<ClientIdentity> | null): ClientIdentity {
  return {
    id: user?.id ?? "",
    firstName: repairMojibake(user?.firstName ?? ""),
    lastName: repairMojibake(user?.lastName ?? ""),
    email: repairMojibake(user?.email ?? ""),
  };
}

function mergeClientIdentity(
  primary?: Partial<ClientIdentity> | null,
  secondary?: Partial<ClientIdentity> | null,
): ClientIdentity {
  const normalizedPrimary = normalizeClientIdentity(primary);
  const normalizedSecondary = normalizeClientIdentity(secondary);

  return {
    id: normalizedPrimary.id || normalizedSecondary.id,
    firstName: normalizedPrimary.firstName || normalizedSecondary.firstName,
    lastName: normalizedPrimary.lastName || normalizedSecondary.lastName,
    email: normalizedPrimary.email || normalizedSecondary.email,
  };
}

export function readCachedClientIdentity() {
  if (typeof sessionStorage === "undefined") {
    return null;
  }

  const raw = sessionStorage.getItem(AUTH_HINT_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return normalizeClientIdentity(JSON.parse(raw) as Partial<ClientIdentity>);
  } catch {
    sessionStorage.removeItem(AUTH_HINT_STORAGE_KEY);
    return null;
  }
}

export function readUrlClientIdentityHint() {
  if (typeof window === "undefined") {
    return null;
  }

  const queryHint = new URLSearchParams(window.location.search).get("auth_hint");
  const hashHint = window.location.hash.startsWith("#auth=")
    ? window.location.hash.slice("#auth=".length)
    : null;
  const encoded = queryHint ?? hashHint;

  if (!encoded) {
    return null;
  }

  try {
    const decoded = decodeBase64UrlUtf8(encoded);
    return normalizeClientIdentity(JSON.parse(decoded) as Partial<ClientIdentity>);
  } catch {
    return null;
  }
}

export function cacheClientIdentity(user: Partial<ClientIdentity>) {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  sessionStorage.setItem(
    AUTH_HINT_STORAGE_KEY,
    JSON.stringify(normalizeClientIdentity(user)),
  );
}

export async function resolveAuthenticatedClientIdentity(
  apiBaseUrl: string,
  fallbackUser: Partial<ClientIdentity>,
) {
  const normalizedFallback = normalizeClientIdentity(fallbackUser);
  const urlHintUser = readUrlClientIdentityHint();
  const cachedUser = readCachedClientIdentity();
  const fallbackCandidate = mergeClientIdentity(
    normalizedFallback,
    mergeClientIdentity(urlHintUser, cachedUser),
  );

  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/me`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      return fallbackCandidate;
    }

    const data = (await response.json()) as {
      id?: string;
      first_name?: string;
      last_name?: string;
      email?: string;
    };
    const resolvedUser = mergeClientIdentity(
      {
        id: data.id,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
      },
      fallbackCandidate,
    );

    cacheClientIdentity(resolvedUser);
    return resolvedUser;
  } catch {
    return fallbackCandidate;
  }
}
