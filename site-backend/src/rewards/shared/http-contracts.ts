import type { RewardsError, RewardsErrorCode } from "./errors.js";

export type RewardsHttpErrorCode = RewardsErrorCode
  | "invalid_request"
  | "not_found"
  | "api_unavailable";

export interface RewardsHttpErrorEnvelope {
  error: {
    code: RewardsHttpErrorCode;
    message: string;
  };
}

export interface RewardsPageRequest {
  limit: number;
  cursor: string | null;
}

export interface RewardsPagination {
  limit: number;
  next_cursor: string | null;
  has_more: boolean;
}

export interface RewardsPage<T> {
  items: readonly T[];
  pagination: RewardsPagination;
}

export const rewardsPaginationLimits = {
  default: 25,
  maximum: 100,
} as const;

export class RewardsPageRequestError extends Error {
  readonly code = "invalid_request";
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "RewardsPageRequestError";
  }
}

export function rewardsErrorEnvelope(
  error: Pick<RewardsError, "code" | "message">,
): RewardsHttpErrorEnvelope {
  return { error: { code: error.code, message: error.message } };
}

export function parseRewardsPageRequest(searchParams: URLSearchParams): RewardsPageRequest {
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit === null ? rewardsPaginationLimits.default : Number(rawLimit);
  if (rawLimit !== null && !/^[1-9][0-9]*$/.test(rawLimit)) {
    throw new RewardsPageRequestError("Pagination limit must be a positive integer");
  }
  if (!Number.isSafeInteger(limit) || limit > rewardsPaginationLimits.maximum) {
    throw new RewardsPageRequestError(
      `Pagination limit must be between 1 and ${rewardsPaginationLimits.maximum}`,
    );
  }

  const cursor = searchParams.get("cursor");
  if (cursor !== null && !/^[A-Za-z0-9_-]{1,256}$/.test(cursor)) {
    throw new RewardsPageRequestError("Pagination cursor is invalid");
  }
  return { limit, cursor };
}

export function rewardsPage<T>(
  items: readonly T[],
  request: RewardsPageRequest,
  nextCursor: string | null,
): RewardsPage<T> {
  if (items.length > request.limit) {
    throw new Error("Rewards page contains more items than the requested limit");
  }
  if (nextCursor !== null && !/^[A-Za-z0-9_-]{1,256}$/.test(nextCursor)) {
    throw new Error("Rewards next cursor is invalid");
  }
  return {
    items,
    pagination: {
      limit: request.limit,
      next_cursor: nextCursor,
      has_more: nextCursor !== null,
    },
  };
}
