import type { SiteBackendConfig } from "./config.js";
import type {
  CustomerProfile,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegistrationResponse,
  RewardsIdentityEvidence,
  SiteErrorCode,
  ValidationStatusResponse,
} from "./contracts.js";

export type FetchImplementation = typeof fetch;

export interface ApiResult<T> {
  status: number;
  data: T;
  setCookies: string[];
}

export class SiteApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: SiteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SiteApiError";
  }
}

export class RewardsApiClient {
  constructor(
    private readonly config: SiteBackendConfig,
    private readonly fetchImplementation: FetchImplementation = fetch,
  ) {}

  register(payload: RegisterRequest): Promise<ApiResult<RegistrationResponse>> {
    return this.request("POST", "/api/v1/auth/register", payload);
  }

  login(payload: LoginRequest): Promise<ApiResult<LoginResponse>> {
    return this.request("POST", "/api/v1/auth/login", payload);
  }

  logout(cookieHeader: string | undefined): Promise<ApiResult<undefined>> {
    return this.request("POST", "/api/v1/auth/logout", undefined, cookieHeader);
  }

  getCurrentCustomer(
    cookieHeader: string | undefined,
  ): Promise<ApiResult<CustomerProfile>> {
    return this.request("GET", "/api/v1/me", undefined, cookieHeader);
  }

  getValidationStatus(
    cookieHeader: string | undefined,
  ): Promise<ApiResult<ValidationStatusResponse>> {
    return this.request(
      "GET",
      "/api/v1/me/validation-status",
      undefined,
      cookieHeader,
    );
  }

  async getRewardsIdentityEvidence(
    cookieHeader: string | undefined,
  ): Promise<ApiResult<RewardsIdentityEvidence>> {
    const [profile, validation] = await Promise.all([
      this.getCurrentCustomer(cookieHeader),
      this.getValidationStatus(cookieHeader),
    ]);
    if (validation.data.customer_id !== profile.data.id) {
      throw new SiteApiError(503, "api_unavailable", "The API returned inconsistent evidence");
    }
    return {
      status: 200,
      data: {
        customer_id: profile.data.id,
        customer_status: profile.data.customer_status,
        validation_id: validation.data.validation_id,
        validation_status: validation.data.status,
        registered_at: validation.data.registered_at,
        validated_at: validation.data.validated_at,
        product_evidence: validation.data.product_evidence,
      },
      setCookies: [...profile.setCookies, ...validation.setCookies],
    };
  }

  private async request<TResponse>(
    method: "GET" | "POST",
    path: string,
    body?: object,
    cookieHeader?: string,
  ): Promise<ApiResult<TResponse>> {
    const headers = new Headers({ accept: "application/json" });
    if (body !== undefined) {
      headers.set("content-type", "application/json");
    }

    const sessionCookie = selectCookie(cookieHeader, this.config.sessionCookie.name);
    if (sessionCookie) {
      headers.set("cookie", sessionCookie);
    }

    let response: Response;
    try {
      const requestInit: RequestInit = {
        method,
        headers,
        signal: AbortSignal.timeout(this.config.apiRequestTimeoutMs),
      };
      if (body !== undefined) {
        requestInit.body = JSON.stringify(body);
      }
      response = await this.fetchImplementation(
        `${this.config.apiBaseUrl}${path}`,
        requestInit,
      );
    } catch {
      throw new SiteApiError(503, "api_unavailable", "The API is unavailable");
    }

    const setCookies = getSetCookies(response.headers);
    if (response.ok) {
      const data = response.status === 204
        ? undefined
        : await parseSuccessBody<TResponse>(response);
      return { status: response.status, data: data as TResponse, setCookies };
    }

    throw await mapApiError(response);
  }
}

function selectCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const cookie = part.trim();
    if (cookie.startsWith(`${name}=`)) {
      return cookie;
    }
  }
  return undefined;
}

function getSetCookies(headers: Headers): string[] {
  const headersWithCookies = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const cookies = headersWithCookies.getSetCookie?.();
  if (cookies && cookies.length > 0) return cookies;
  const cookie = headers.get("set-cookie");
  return cookie ? [cookie] : [];
}

async function parseSuccessBody<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new SiteApiError(503, "api_unavailable", "The API returned an invalid response");
  }
}

const stableApiCodes = new Set<SiteErrorCode>([
  "duplicate_email",
  "duplicate_curp",
  "rewards_id_collision_exhausted",
  "password_mismatch",
  "terms_not_accepted",
  "invalid_credentials",
  "unauthenticated",
]);

async function mapApiError(response: Response): Promise<SiteApiError> {
  let code: unknown;
  let message: unknown;
  try {
    const payload = (await response.json()) as {
      detail?: { code?: unknown; message?: unknown };
    };
    code = payload.detail?.code;
    message = payload.detail?.message;
  } catch {
    // A malformed upstream error is treated as an unavailable API contract.
  }

  if (typeof code === "string" && stableApiCodes.has(code as SiteErrorCode)) {
    return new SiteApiError(
      response.status,
      code as SiteErrorCode,
      typeof message === "string" ? message : "The request was rejected",
    );
  }

  return new SiteApiError(503, "api_unavailable", "The API is unavailable");
}
