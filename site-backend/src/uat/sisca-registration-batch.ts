import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const CURP_PATTERN = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
const DEFAULT_BASE_URL = "https://site-backend-uat-uat.up.railway.app";
const DEFAULT_RATE_PER_MINUTE = 20;
const MAX_RATE_PER_MINUTE = 20;
const MAX_CONSECUTIVE_UPSTREAM_FAILURES = 3;

export interface RegistrationPayload {
  curp: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  password: string;
  confirm_password: string;
  postal_code: string;
  state: string;
  city: string;
  terms_accepted: boolean;
  terms_version: string;
}

export interface BatchResult {
  index: number;
  subject: string;
  outcome: "registered" | "duplicate" | "failed";
  http_status: number | null;
  validation_status: string | null;
  validation_id: string | null;
  error_code: string | null;
}

export interface BatchRunnerOptions {
  curps: readonly string[];
  password: string;
  baseUrl: string;
  ratePerMinute: number;
  startIndex?: number;
  limit?: number;
  fetchImplementation?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  onResult?: (result: BatchResult) => Promise<void> | void;
}

export class BatchCircuitOpenError extends Error {
  constructor(readonly results: readonly BatchResult[]) {
    super(`El lote se detuvo después de ${MAX_CONSECUTIVE_UPSTREAM_FAILURES} fallas consecutivas.`);
    this.name = "BatchCircuitOpenError";
  }
}

export function validateCurpBatch(curps: readonly string[], expectedCount?: number): string[] {
  const normalized = curps.map((curp) => curp.trim().toUpperCase());
  if (expectedCount !== undefined && normalized.length !== expectedCount) {
    throw new Error(`Se esperaban ${expectedCount} CURP; se recibieron ${normalized.length}.`);
  }
  const invalidCount = normalized.filter((curp) => !CURP_PATTERN.test(curp)).length;
  if (invalidCount !== 0) {
    throw new Error(`El lote contiene ${invalidCount} CURP con formato inválido.`);
  }
  const unique = new Set(normalized);
  if (unique.size !== normalized.length) {
    throw new Error(`El lote contiene ${normalized.length - unique.size} CURP duplicadas.`);
  }
  return normalized;
}

export function validateUatBaseUrl(value: string): string {
  const url = new URL(value);
  const allowed = url.protocol === "https:"
    && url.hostname === "site-backend-uat-uat.up.railway.app"
    && (url.pathname === "/" || url.pathname === "");
  if (!allowed || url.search || url.hash || url.username || url.password) {
    throw new Error("El destino debe ser exactamente el site-backend del ambiente UAT de Railway.");
  }
  return url.origin;
}

export function subjectId(curp: string): string {
  return createHash("sha256").update(curp).digest("hex").slice(0, 12);
}

export function buildRegistrationPayload(
  curp: string,
  oneBasedIndex: number,
  password: string,
): RegistrationPayload {
  const subject = subjectId(curp);
  const numericHash = BigInt(`0x${subject}`).toString().padStart(15, "0");
  return {
    curp,
    first_name: "Cliente",
    last_name: `Prueba UAT ${String(oneBasedIndex).padStart(3, "0")}`,
    email: `sisca-uat-${String(oneBasedIndex).padStart(3, "0")}-${subject}@example.test`,
    phone: `55${numericHash.slice(0, 8)}`,
    password,
    confirm_password: password,
    postal_code: "01010",
    state: "Ciudad de México",
    city: "Ciudad de México",
    terms_accepted: true,
    terms_version: "2026-08-uat",
  };
}

export async function runRegistrationBatch(options: BatchRunnerOptions): Promise<BatchResult[]> {
  const curps = validateCurpBatch(options.curps);
  const baseUrl = validateUatBaseUrl(options.baseUrl);
  const rate = requireRate(options.ratePerMinute);
  const startIndex = requireNonNegativeInteger("startIndex", options.startIndex ?? 0);
  const remaining = Math.max(0, curps.length - startIndex);
  const limit = options.limit === undefined
    ? remaining
    : Math.min(remaining, requireNonNegativeInteger("limit", options.limit));
  const selected = curps.slice(startIndex, startIndex + limit);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolveSleep) => {
    setTimeout(resolveSleep, milliseconds);
  }));
  const now = options.now ?? Date.now;
  const intervalMilliseconds = Math.ceil(60_000 / rate);
  const results: BatchResult[] = [];
  let previousStartedAt: number | undefined;
  let consecutiveUpstreamFailures = 0;

  for (const [offset, curp] of selected.entries()) {
    if (previousStartedAt !== undefined) {
      const remainingWait = previousStartedAt + intervalMilliseconds - now();
      if (remainingWait > 0) await sleep(remainingWait);
    }
    previousStartedAt = now();
    const absoluteIndex = startIndex + offset;
    const result = await registerOne(
      fetchImplementation,
      baseUrl,
      buildRegistrationPayload(curp, absoluteIndex + 1, options.password),
      absoluteIndex,
    );
    results.push(result);
    await options.onResult?.(result);

    consecutiveUpstreamFailures = isUpstreamFailure(result)
      ? consecutiveUpstreamFailures + 1
      : 0;
    if (consecutiveUpstreamFailures >= MAX_CONSECUTIVE_UPSTREAM_FAILURES) {
      throw new BatchCircuitOpenError(results);
    }
  }
  return results;
}

async function registerOne(
  fetchImplementation: typeof fetch,
  baseUrl: string,
  payload: RegistrationPayload,
  index: number,
): Promise<BatchResult> {
  const base = {
    index,
    subject: subjectId(payload.curp),
  };
  let response: Response;
  try {
    response = await fetchImplementation(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return {
      ...base,
      outcome: "failed",
      http_status: null,
      validation_status: null,
      validation_id: null,
      error_code: "network_error",
    };
  }

  const body = await parseJsonObject(response);
  if (response.status === 201) {
    return {
      ...base,
      outcome: "registered",
      http_status: response.status,
      validation_status: stringField(body, "validation_status"),
      validation_id: stringField(body, "validation_id"),
      error_code: null,
    };
  }
  const error = objectField(body, "error");
  const errorCode = stringField(error, "code") ?? `http_${response.status}`;
  const duplicate = response.status === 409
    && (errorCode === "duplicate_curp" || errorCode === "duplicate_email");
  return {
    ...base,
    outcome: duplicate ? "duplicate" : "failed",
    http_status: response.status,
    validation_status: null,
    validation_id: null,
    error_code: errorCode,
  };
}

function isUpstreamFailure(result: BatchResult): boolean {
  return result.outcome === "failed"
    && (result.http_status === null || result.http_status === 429 || (result.http_status ?? 0) >= 500);
}

function requireRate(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_RATE_PER_MINUTE) {
    throw new Error(`La tasa debe ser un entero entre 1 y ${MAX_RATE_PER_MINUTE} registros por minuto.`);
  }
  return value;
}

function requireNonNegativeInteger(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} debe ser un entero mayor o igual a cero.`);
  }
  return value;
}

async function parseJsonObject(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return objectValue(value);
  } catch {
    return {};
  }
}

function objectField(value: Record<string, unknown>, key: string): Record<string, unknown> {
  return objectValue(value[key]);
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" ? value[key] : null;
}

interface CliOptions {
  file: string;
  baseUrl: string;
  rate: number;
  startIndex: number;
  limit?: number;
  expectedCount: number;
  execute: boolean;
  resultFile: string;
}

function parseCliArguments(args: readonly string[]): CliOptions {
  const values = new Map<string, string>();
  let execute = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--execute") {
      execute = true;
      continue;
    }
    if (!argument?.startsWith("--")) throw new Error(`Argumento desconocido: ${argument ?? ""}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Falta el valor de ${argument}.`);
    values.set(argument, value);
    index += 1;
  }
  const file = values.get("--file");
  if (!file) throw new Error("Se requiere --file con un arreglo JSON de CURP.");
  const rawLimit = values.get("--limit");
  return {
    file: resolve(file),
    baseUrl: values.get("--base-url") ?? DEFAULT_BASE_URL,
    rate: Number(values.get("--rate") ?? DEFAULT_RATE_PER_MINUTE),
    startIndex: Number(values.get("--start-index") ?? 0),
    ...(rawLimit === undefined ? {} : { limit: Number(rawLimit) }),
    expectedCount: Number(values.get("--expected-count") ?? 95),
    execute,
    resultFile: resolve(values.get("--result-file") ?? ".tmp/uat-batch/results.jsonl"),
  };
}

async function main(): Promise<void> {
  const options = parseCliArguments(process.argv.slice(2));
  const raw: unknown = JSON.parse(await readFile(options.file, "utf8"));
  if (!Array.isArray(raw) || !raw.every((value) => typeof value === "string")) {
    throw new Error("El archivo debe contener un arreglo JSON de CURP.");
  }
  const curps = validateCurpBatch(raw, options.expectedCount);
  const baseUrl = validateUatBaseUrl(options.baseUrl);
  const batchHash = createHash("sha256").update(curps.join("\n")).digest("hex");
  console.log(JSON.stringify({
    mode: options.execute ? "execute" : "dry-run",
    target: baseUrl,
    total: curps.length,
    start_index: options.startIndex,
    limit: options.limit ?? null,
    registrations_per_minute: options.rate,
    worst_case_sisca_requests_per_minute: options.rate * 3,
    batch_sha256: batchHash,
  }));
  if (!options.execute) return;

  const password = process.env.UAT_BATCH_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error("UAT_BATCH_PASSWORD debe estar definido y contener al menos 8 caracteres.");
  }
  const results = await runRegistrationBatch({
    curps,
    password,
    baseUrl,
    ratePerMinute: options.rate,
    startIndex: options.startIndex,
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    onResult: async (result) => {
      await appendFile(options.resultFile, `${JSON.stringify(result)}\n`, { encoding: "utf8", mode: 0o600 });
      console.log(JSON.stringify(result));
    },
  });
  console.log(JSON.stringify({
    completed: results.length,
    registered: results.filter((result) => result.outcome === "registered").length,
    duplicates: results.filter((result) => result.outcome === "duplicate").length,
    failed: results.filter((result) => result.outcome === "failed").length,
    next_start_index: options.startIndex + results.length,
  }));
}

const isEntryPoint = process.argv[1] !== undefined
  && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href;
if (isEntryPoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error(JSON.stringify({ error: message }));
    process.exitCode = 1;
  });
}
