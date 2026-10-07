import type { BondaConfig } from "../../config.js";

export interface BondaWallet { id: string; balance: string; email: string | null; }
export interface BondaCredit { micrositeId: string; sourceWalletId: string; walletId: string; rewardsId: string; points: string; }
export interface BondaPointsGateway {
  wallet(code: string): Promise<BondaWallet>;
  assign(credit: BondaCredit): Promise<string>;
  verify(credit: BondaCredit, movementId: string): Promise<string>;
}
export class BondaPointsError extends Error {
  constructor(readonly code: "UNAVAILABLE" | "UNCERTAIN" | "INSUFFICIENT_FUNDS" | "PROFILE_PENDING" | "REJECTED") { super(code); }
}
export function numericId(value: unknown): string {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== "string" || !/^[1-9][0-9]{0,19}$/.test(text)) throw new BondaPointsError("UNAVAILABLE");
  return text;
}
export function exactPoints(value: unknown): string {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== "string" || !/^(0|[1-9][0-9]*)$/.test(text)) throw new BondaPointsError("UNAVAILABLE");
  return text;
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const validBondaEmail = (value: unknown): value is string => typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export class BondaPointsHttpGateway implements BondaPointsGateway {
  constructor(private readonly config: BondaConfig, private readonly transport: typeof fetch = fetch) {}
  async wallet(code: string): Promise<BondaWallet> {
    if (!/^[1-9][0-9]{8}$/.test(code)) throw new BondaPointsError("UNAVAILABLE");
    const root = await this.request("GET", `/affiliate-wallets/search?query=${encodeURIComponent(code)}`);
    const data = object(root.data); const wallet = object(data.wallet);
    if (root.success !== true || data.code !== code) throw new BondaPointsError("UNAVAILABLE");
    return { id: numericId(wallet.id), balance: exactPoints(wallet.balance), email: validBondaEmail(data.email) ? data.email : null };
  }
  async assign(credit: BondaCredit): Promise<string> {
    this.validateCredit(credit);
    const root = await this.request("POST", `/wallets/${credit.sourceWalletId}/movements`, {
      affiliate_wallet_ids: [Number(credit.walletId)], each_amount: Number(credit.points),
      type: "ASSIGNATION", description: "Puntos ganados en Carobra Rewards",
    });
    return this.acknowledge(root, credit);
  }
  async verify(credit: BondaCredit, movementId: string): Promise<string> {
    this.validateCredit(credit);
    const root = await this.request("GET", `/wallets/${credit.sourceWalletId}/movements/${numericId(movementId)}`);
    const id = this.acknowledge(root, credit);
    if (id !== movementId) throw new BondaPointsError("UNCERTAIN");
    return id;
  }
  private validateCredit(credit: BondaCredit) {
    if (credit.micrositeId !== this.config.micrositeId || credit.sourceWalletId !== this.config.points?.sourceWalletId
      || !Number.isSafeInteger(Number(numericId(credit.walletId))) || !/^[1-9][0-9]{8}$/.test(credit.rewardsId)
      || BigInt(exactPoints(credit.points)) < 1n || BigInt(credit.points) > 10_000_000n) throw new BondaPointsError("REJECTED");
    numericId(credit.sourceWalletId);
  }
  private acknowledge(root: Record<string, unknown>, credit: BondaCredit) {
    const data = object(root.data); const wallet = object(data.affiliate_wallet);
    try {
      if (root.success !== true || data.status !== "COMPLETED" || data.type !== "ASSIGNATION"
        || data.is_group === true || data.group != null || exactPoints(data.amount) !== credit.points
        || numericId(wallet.wallet_id) !== credit.walletId
        || (wallet.affiliate_code != null && wallet.affiliate_code !== credit.rewardsId)) throw Error();
      return numericId(data.id);
    } catch { throw new BondaPointsError("UNCERTAIN"); }
  }
  private async request(method: "GET" | "POST", path: string, body?: unknown) {
    const settings = this.config.points;
    if (!settings || (method === "POST" ? !settings.sendEnabled : !settings.balanceEnabled && !settings.sendEnabled)
      || !settings.token || !this.config.micrositeId || this.config.localPreviewEnabled) throw new BondaPointsError("REJECTED");
    const base = new URL(this.config.baseUrl);
    if (base.protocol !== "https:" || base.username || base.password || base.port
      || !this.config.allowedHosts.includes(base.hostname)) throw new BondaPointsError("REJECTED");
    const url = new URL(`/api/v2/microsite/${encodeURIComponent(this.config.micrositeId)}${path}`, base);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new BondaPointsError(method === "POST" ? "UNCERTAIN" : "UNAVAILABLE")); }, Math.min(this.config.requestTimeoutMs, 10_000));
    });
    try {
      return await Promise.race([deadline, (async () => {
      const response = await this.transport(url, { method, redirect: "error", signal: controller.signal,
        headers: { token: settings.token!, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!response.body) throw Error();
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
      try {
        for (;;) { const chunk = await reader.read(); if (chunk.done) break;
          length += chunk.value.length; if (length > 1_000_000) throw Error(); chunks.push(chunk.value); }
      } finally { await reader.cancel().catch(() => undefined); }
      const root = object(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      if (response.status === 401 || response.status === 403) throw new BondaPointsError("REJECTED");
      // Only documented explicit rejection proves no credit was applied. Unknown HTTP/business outcomes remain uncertain.
      if (method === "POST" && response.status === 400 && root.success === false) {
        const code = object(root.error).code;
        if (code === "NOT_ENOUGH_POINTS") throw new BondaPointsError("INSUFFICIENT_FUNDS");
        if (code === "AFFILIATE_CANNOT_CREATE_MOVEMENT") throw new BondaPointsError("PROFILE_PENDING");
      }
      if (!response.ok || root.success !== true) throw Error();
      return root;
      })()]);
    } catch (error) {
      if (error instanceof BondaPointsError) throw error;
      throw new BondaPointsError(method === "POST" ? "UNCERTAIN" : "UNAVAILABLE");
    } finally { clearTimeout(timer); }
  }
}
