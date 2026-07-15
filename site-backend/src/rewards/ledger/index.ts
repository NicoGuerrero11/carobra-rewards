/** Immutable points ledger, lots, allocation, and reconciliation boundary. */
export const pointsLedgerBoundary = "points-ledger" as const;

export {
  normalizeRewardEvent,
  rewardEventSourceIdentity,
  type NormalizedRewardEvent,
  type NormalizeRewardEventInput,
} from "./reward-event.js";
export {
  IssuePoints,
  PostgresPointIssuance,
  type IssuePointsCommand,
  type PointIssuancePort,
  type PointIssuanceResult,
} from "./issuance.js";
export {
  PostgresPointBalanceStore,
  QueryPointBalance,
  ReconcilePointBalance,
  type PointBalance,
  type PointBalanceReconciliation,
  type PointBalanceStore,
} from "./balance.js";
export {
  PostgresPointAllocation,
  allocateFifoLots,
  type FifoLot,
  type LotAllocation,
  type PointAllocationPort,
  type PointAllocationResult,
  type ReservePointsCommand,
  type TransitionReservationCommand,
} from "./allocation.js";
export {
  PostgresPointExpiration,
  ProcessPointExpirations,
  pointExpirationIdempotencyKey,
  type PointExpirationBatchResult,
  type PointExpirationPort,
} from "./expiration.js";
export {
  CompensatePointLedger,
  PostgresLedgerCompensation,
  type AdjustmentCommand,
  type LedgerCompensationPort,
  type LedgerCompensationResult,
  type RefundCommand,
  type RewardsOperator,
} from "./compensation.js";
