import type { BondaConfig } from "../../config.js";
import type { ProfileDatabase } from "./affiliate-profile-persistence.js";
import { BondaPointsError, BondaPointsHttpGateway, validBondaEmail, type BondaCredit, type BondaPointsGateway } from "./points-gateway.js";
import { PostgresBondaPointsStore, type CreditRow, type PointReview } from "./points-store.js";
import type { DueJobProcessor } from "../operations/scheduler-runner.js";

export interface BondaPointsView {
  status: "DISABLED" | "FRESH" | "STALE" | "UNAVAILABLE";
  available: string | null; observed_at: string | null;
  pending: string | null; verification_required: string | null;
}
export interface BondaPointsQuery { getBalance(customerId: string): Promise<BondaPointsView>; }
const empty = (status: BondaPointsView['status']): BondaPointsView => ({ status, available:null, observed_at:null, pending:null, verification_required:null });

export class BondaPointsApplication implements DueJobProcessor, BondaPointsQuery {
  private readonly reads = new Map<string, Promise<BondaPointsView>>();
  constructor(private readonly config: BondaConfig, readonly store: PostgresBondaPointsStore, private readonly gateway: BondaPointsGateway) {}
  async processDue(_at: Date, limit: number, _worker: string) {
    if (!this.config.points?.sendEnabled || this.config.localPreviewEnabled) return { processedJobs:0, failedJobs:0 };
    const ids = await this.store.due(limit); let failedJobs = 0;
    for (const id of ids) {
      try { if (!await this.processOne(id)) failedJobs++; } catch { failedJobs++; }
    }
    return { processedJobs:ids.length, failedJobs };
  }
  private eligible(context: Awaited<ReturnType<PostgresBondaPointsStore['context']>>) {
    return context?.customer_status === 'ACTIVE' && context.state === 'ACTIVE'
      && ['GOLD','PLATINUM','TITANIUM'].includes(context.current_level ?? '')
      && context.affiliate_state === 'ACTIVE' && validBondaEmail(context.email) && /^[1-9][0-9]{8}$/.test(context.rewards_id);
  }
  async processOne(id: string): Promise<boolean> {
    if (!this.config.points?.sendEnabled || this.config.localPreviewEnabled) return false;
    const token = await this.store.claim(id); if (!token) return false;
    let dispatched = false;
    let operation: string | undefined;
    try {
      const row = await this.store.read(id); if (!row) return false;
      const context = await this.store.context(row.customer_id, id);
      if (!this.eligible(context)) { await this.store.defer(id, token, 'PREREQUISITES_PENDING'); return false; }
      if (!context!.source_valid) { await this.store.defer(id, token, 'SOURCE_REQUIRES_REVIEW', true); return false; }
      if (BigInt(row.points) > 10_000_000n) { await this.store.defer(id, token, 'AMOUNT_REQUIRES_REVIEW', true); return false; }
      if (row.rewards_id && (row.rewards_id !== context!.rewards_id || row.microsite_id !== this.config.micrositeId
        || row.source_wallet_id !== this.config.points.sourceWalletId)) {
        await this.store.defer(id, token, 'IDENTITY_REQUIRES_REVIEW', true); return false;
      }
      const wallet = await this.gateway.wallet(context!.rewards_id);
      if (!wallet.email || wallet.email.toLowerCase() !== context!.email.toLowerCase()) {
        await this.store.defer(id, token, 'PARTNER_EMAIL_PENDING'); return false;
      }
      // Reads can take time; a downgrade, correction or revoked reward must not start a new transfer.
      const latest = await this.store.context(row.customer_id, id);
      if (!this.eligible(latest) || !latest!.source_valid || latest!.rewards_id !== context!.rewards_id || latest!.email !== context!.email) {
        await this.store.defer(id, token, 'PREREQUISITES_CHANGED'); return false;
      }
      const credit: BondaCredit = { rewardsId:context!.rewards_id, points:row.points, walletId:wallet.id,
        micrositeId:this.config.micrositeId!, sourceWalletId:this.config.points.sourceWalletId! };
      operation = await this.store.intent(id, token, credit);
      dispatched = true;
      const movement = await this.gateway.assign(credit);
      await this.store.confirm(id, token, operation, movement);
      return true;
    } catch (error) {
      if (!dispatched) await this.store.defer(id, token, 'READ_UNAVAILABLE').catch(() => undefined);
      else if (error instanceof BondaPointsError && ['INSUFFICIENT_FUNDS','PROFILE_PENDING','REJECTED'].includes(error.code)) {
        await this.store.defer(id, token, error.code, error.code === 'REJECTED', operation).catch(() => undefined);
      }
      // Any uncertain POST or lost local acknowledgement retains the durable intent. Never resend automatically.
      return false;
    } finally { await this.store.release(id, token).catch(() => undefined); }
  }
  async reconcile(review: PointReview, apply = false) {
    if (!apply) return 'DRY_RUN';
    const token = await this.store.claim(review.entryId, true); if (!token) return 'IN_PROGRESS';
    try {
      const row = await this.store.read(review.entryId);
      if (!row || row.operation_id !== review.operationId) throw Error('stale_points_review');
      if (review.outcome === 'APPLIED') {
        if (!review.movementId || row.microsite_id !== this.config.micrositeId
          || row.source_wallet_id !== this.config.points?.sourceWalletId) throw Error('invalid_points_review');
        await this.gateway.verify(snapshot(row), review.movementId);
      }
      // NOT_APPLIED requires explicit operator evidence; neither a 404 nor a balance difference proves it.
      return await this.store.review(review, token);
    } finally { await this.store.release(review.entryId, token); }
  }
  getBalance(customerId: string): Promise<BondaPointsView> {
    const existing = this.reads.get(customerId); if (existing) return existing;
    const result = this.readBalance(customerId).finally(() => this.reads.delete(customerId));
    this.reads.set(customerId, result); return result;
  }
  private async readBalance(customerId: string): Promise<BondaPointsView> {
    const settings = this.config.points;
    if ((!settings?.sendEnabled && !settings?.balanceEnabled) || this.config.localPreviewEnabled) return empty('DISABLED');
    let result = empty(settings.balanceEnabled ? 'UNAVAILABLE' : 'DISABLED');
    try { const pending = await this.store.pending(customerId); result = { ...result, pending:pending.pending, verification_required:pending.uncertain }; } catch { /* Unknown is not zero. */ }
    if (!settings.balanceEnabled || !this.config.micrositeId) return result;
    try {
      const context = await this.store.context(customerId);
      if (!context || !/^[1-9][0-9]{8}$/.test(context.rewards_id)) return result;
      const cached = await this.store.cached(customerId, this.config.micrositeId, context.rewards_id);
      if (cached) result = { ...result, status:'STALE', available:cached.balance, observed_at:cached.observed_at.toISOString() };
      if (context.customer_status !== 'ACTIVE' || context.affiliate_state !== 'ACTIVE') return result;
      const started = new Date();
      if (cached && started.getTime() - cached.observed_at.getTime() < 60_000) return { ...result, status:'FRESH' };
      const wallet = await this.gateway.wallet(context.rewards_id);
      const observed = new Date();
      await this.store.saveBalance(customerId, this.config.micrositeId, context.rewards_id, wallet, started, observed);
      return { ...result, status:'FRESH', available:wallet.balance, observed_at:observed.toISOString() };
    } catch { return result; }
  }
}
function snapshot(row: CreditRow): BondaCredit {
  if (!row.microsite_id || !row.source_wallet_id || !row.affiliate_wallet_id || !row.rewards_id) throw Error('missing_credit_snapshot');
  return { micrositeId:row.microsite_id,sourceWalletId:row.source_wallet_id,walletId:row.affiliate_wallet_id,rewardsId:row.rewards_id,points:row.points };
}
export function createBondaPointsRuntime(database: ProfileDatabase, config: BondaConfig) {
  const store = new PostgresBondaPointsStore(database);
  return new BondaPointsApplication(config, store, new BondaPointsHttpGateway(config));
}
