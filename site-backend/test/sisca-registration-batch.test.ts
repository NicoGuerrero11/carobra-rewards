import assert from "node:assert/strict";
import test from "node:test";

import {
  BatchCircuitOpenError,
  buildRegistrationPayload,
  runRegistrationBatch,
  subjectId,
  validateCurpBatch,
  validateUatBaseUrl,
} from "../src/uat/sisca-registration-batch.js";

const baseUrl = "https://site-backend-uat-uat.up.railway.app";
const curps = [
  "TOVH721121HSPRRC09",
  "MOGA760306HPLRVL05",
  "GAML710223HNLRRS03",
  "AAHA740916HDFLRR07",
];

test("validates canonical and unique CURP batches", () => {
  assert.deepEqual(validateCurpBatch(curps, 4), curps);
  assert.throws(() => validateCurpBatch([curps[0]!, curps[0]!]), /duplicadas/);
  assert.throws(() => validateCurpBatch(["INVALIDA"]), /formato inválido/);
});

test("allows only the exact Railway UAT site backend", () => {
  assert.equal(validateUatBaseUrl(`${baseUrl}/`), baseUrl);
  assert.throws(() => validateUatBaseUrl("https://site-backend.carobra.com"), /exactamente/);
  assert.throws(() => validateUatBaseUrl("https://site-backend-uat-uat.up.railway.app/path"), /exactamente/);
});

test("builds deterministic accounts without exposing a CURP in the generated email", () => {
  const payload = buildRegistrationPayload(curps[0]!, 6, "safe-password");
  assert.equal(payload.first_name, "Cliente");
  assert.match(payload.email, /^sisca-uat-006-[a-f0-9]{12}@example\.test$/);
  assert.equal(payload.email.includes(curps[0]!), false);
  assert.equal(payload.phone.length, 10);
  assert.equal(subjectId(curps[0]!).length, 12);
});

test("paces registration starts at no more than twenty per minute", async () => {
  let instant = 0;
  const sleeps: number[] = [];
  let calls = 0;
  const results = await runRegistrationBatch({
    curps: curps.slice(0, 2),
    password: "safe-password",
    baseUrl,
    ratePerMinute: 20,
    now: () => instant,
    sleep: (milliseconds) => {
      sleeps.push(milliseconds);
      instant += milliseconds;
      return Promise.resolve();
    },
    fetchImplementation: async () => {
      calls += 1;
      return Response.json({ validation_status: "PENDING", validation_id: `id-${calls}` }, { status: 201 });
    },
  });
  assert.deepEqual(sleeps, [3_000]);
  assert.equal(results.length, 2);
  assert.equal(results.every((result) => result.outcome === "registered"), true);
});

test("opens the circuit after three consecutive upstream failures", async () => {
  let calls = 0;
  await assert.rejects(
    runRegistrationBatch({
      curps,
      password: "safe-password",
      baseUrl,
      ratePerMinute: 20,
      now: () => 0,
      sleep: () => Promise.resolve(),
      fetchImplementation: async () => {
        calls += 1;
        return Response.json({}, { status: 503 });
      },
    }),
    (error: unknown) => error instanceof BatchCircuitOpenError && error.results.length === 3,
  );
  assert.equal(calls, 3);
});

test("treats an existing CURP as resumable instead of an upstream outage", async () => {
  const results = await runRegistrationBatch({
    curps: curps.slice(0, 1),
    password: "safe-password",
    baseUrl,
    ratePerMinute: 20,
    fetchImplementation: async () => Response.json({
      error: { code: "duplicate_curp", message: "Already registered" },
    }, { status: 409 }),
  });
  assert.equal(results[0]?.outcome, "duplicate");
  assert.equal(results[0]?.error_code, "duplicate_curp");
});
