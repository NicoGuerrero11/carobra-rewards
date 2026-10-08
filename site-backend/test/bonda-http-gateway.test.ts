import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { BondaConfig } from "../src/config.js";
import { BondaGatewayError } from "../src/rewards/bonda/gateway.js";
import { BondaHttpGateway } from "../src/rewards/bonda/http-gateway.js";

const config: BondaConfig = {
  baseUrl: "https://bonda-test.example",
  allowedHosts: ["bonda-test.example"],
  allowedImageHosts: ["cuponstar-ar.s3.amazonaws.com"],
  micrositeId: "microsite-test",
  couponApiKey: "coupon-key-test",
  affiliateToken: "affiliate-token-test",
  requestTimeoutMs: 1_000,
  catalogCacheTtlMs: 60_000,
  catalogCacheMaxStaleMs: 300_000,
  catalogEnabled: true,
  affiliateProvisioningEnabled: true,
  couponRequestsEnabled: true,
};

test("paginates and normalizes Bonda catalog responses", async () => {
  const fixture = fixtureText("catalog-page.json");
  const requests: URL[] = [];
  const gateway = new BondaHttpGateway(config, async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    return jsonResponse(fixture);
  });

  const items = await gateway.listCoupons("RWD-TEST");

  assert.equal(items.length, 1);
  assert.equal(items[0]?.name, "Baires IT");
  assert.doesNotMatch(items[0]?.usageInstructions ?? "", /script|alert/);
  assert.equal(requests[0]?.searchParams.get("codigo_afiliado"), "RWD-TEST");
  assert.equal(requests[0]?.searchParams.get("key"), "coupon-key-test");
});

test("creates affiliates with Rewards ID only and disables Bonda email", async () => {
  const captured: { requestBody: string; requestHeaders: Headers | null } = {
    requestBody: "",
    requestHeaders: null,
  };
  const gateway = new BondaHttpGateway(config, async (_input, init) => {
    captured.requestBody = String(init?.body);
    captured.requestHeaders = new Headers(init?.headers);
    return jsonResponse(JSON.stringify({
      success: true,
      data: { member: { id: "3051465", code: "RWD-TEST", company_id: "microsite-test" }, company: { id: "microsite-test" } },
    }));
  });

  const result = await gateway.createAffiliate("RWD-TEST");

  assert.deepEqual(JSON.parse(captured.requestBody), {
    code: "RWD-TEST",
    send_welcome_email: false,
  });
  assert.equal(captured.requestHeaders?.get("token"), "affiliate-token-test");
  assert.deepEqual(result, { state: "ACTIVE", externalMemberId: "3051465" });
});

test("loads and normalizes optional coupon branches", async () => {
  const gateway = new BondaHttpGateway(config, async (input) => {
    assert.match(String(input), /\/api\/cupones\/10792\/sucursales\?/);
    return jsonResponse(JSON.stringify({ results: [{ id: 1, nombre: "Centro", direccion: "Reforma 100", ciudad: "CDMX" }] }));
  });

  assert.deepEqual(await gateway.listCouponBranches("RWD-TEST", "10792"), [{
    id: "1",
    name: "Centro",
    address: "Reforma 100",
    city: "CDMX",
    state: null,
    latitude: null,
    longitude: null,
  }]);
});

test("treats documented HTTP-200 business errors as stable failures", async () => {
  const gateway = new BondaHttpGateway(config, async () => (
    jsonResponse(fixtureText("code-limit.json"))
  ));

  await assert.rejects(
    gateway.requestCouponCode("RWD-TEST", "10792", "request-test"),
    (error: unknown) => error instanceof BondaGatewayError
      && error.code === "COUPON_LIMIT_REACHED"
      && !error.retryable,
  );
});

test("recognizes Bonda HTTP-400 AuthorizationException as rejected credentials", async () => {
  const gateway = new BondaHttpGateway(config, async () => jsonResponse(JSON.stringify({
    error: {
      detail: "Ocurrió un error inesperado.",
      code: "AuthorizationException",
    },
    success: false,
  }), 400));

  await assert.rejects(
    gateway.listCoupons("00698115"),
    (error: unknown) => error instanceof BondaGatewayError
      && error.code === "UNAUTHORIZED"
      && !error.retryable,
  );
});

test("normalizes a successful coupon-code response and passes external_id", async () => {
  const captured: { sentBody: FormData | null } = { sentBody: null };
  const gateway = new BondaHttpGateway(config, async (_input, init) => {
    captured.sentBody = init?.body as FormData;
    return jsonResponse(fixtureText("code-success.json"));
  });

  const result = await gateway.requestCouponCode("RWD-TEST", "10792", "request-test");

  assert.equal(captured.sentBody?.get("external_id"), "request-test");
  assert.deepEqual(result, {
    code: "BONDA-TEST-2X1",
    instructions: "Presenta el codigo antes de pagar.",
    receiptId: "3167333",
  });
});

test("does not resend an ambiguous dispatched code request", async () => {
  const gateway = new BondaHttpGateway(config, async () => {
    throw new TypeError("network timeout");
  });

  await assert.rejects(
    gateway.requestCouponCode("RWD-TEST", "10792", "request-test"),
    (error: unknown) => error instanceof BondaGatewayError
      && error.code === "AMBIGUOUS_CODE_REQUEST"
      && !error.retryable,
  );
});

test("recognizes the documented duplicate-affiliate response as success", async () => {
  const gateway = new BondaHttpGateway(config, async () => jsonResponse(JSON.stringify({
    error: {
      detail: { code: ["El elemento code ya esta en uso."] },
      code: "HttpPublicResponseException",
    },
    success: false,
  })));

  assert.deepEqual(await gateway.createAffiliate("RWD-TEST"), {
    state: "ALREADY_EXISTS",
    externalMemberId: null,
  });
});

function fixtureText(name: string): string {
  return readFileSync(`test/fixtures/bonda/${name}`, "utf8");
}

test("the generic inactive detail message does not prove removal during a catalog failure", async () => {
  const gateway = new BondaHttpGateway(config, async () => jsonResponse('{"error":"Cupon no existente o desactivado"}'));
  await assert.rejects(gateway.getCoupon("RWD-TEST", "9510"), (error: unknown) =>
    error instanceof BondaGatewayError && error.code === "INVALID_RESPONSE");
  await assert.rejects(gateway.listCoupons("RWD-TEST"), BondaGatewayError);
});

for (const status of [200, 400, 404]) {
  test(`unknown partner error HTTP ${status} cannot erase an approved coupon`, async () => {
    const gateway = new BondaHttpGateway(config, async () => jsonResponse(JSON.stringify({ error: "Unexpected upstream failure" }), status));
    await assert.rejects(gateway.getCoupon("RWD-TEST", "9510"), (error: unknown) =>
      error instanceof BondaGatewayError && error.code === "INVALID_RESPONSE");
  });
}

test("generic HTML 404 and false success are failures, not missing coupons", async () => {
  for (const response of [new Response("not found", { status: 404 }), jsonResponse('{"success":false}')]) {
    const gateway = new BondaHttpGateway(config, async () => response);
    await assert.rejects(gateway.getCoupon("RWD-TEST", "9510"), BondaGatewayError);
  }
});

test("only explicit affiliate USER_NOT_FOUND proves affiliate absence", async () => {
  const missing = new BondaHttpGateway(config, async () => jsonResponse('{"success":false,"error":{"code":"USER_NOT_FOUND"}}', 404));
  assert.equal(await missing.affiliateExists("RWD-TEST"), false);
  await assert.rejects(missing.getCoupon("RWD-TEST", "9510"), BondaGatewayError);
  const ambiguous = new BondaHttpGateway(config, async () => jsonResponse('{}', 404));
  await assert.rejects(ambiguous.affiliateExists("RWD-TEST"), BondaGatewayError);
});

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

for (const member of [{id:'1',code:'OTHER',company_id:'microsite-test'}, {id:'1',code:'RWD-TEST',company_id:'OTHER'}]) {
  test(`affiliate success cannot confirm unrelated identity ${member.code}/${member.company_id}`, async()=>{
    const gateway=new BondaHttpGateway(config,async()=>jsonResponse(JSON.stringify({success:true,data:{member,company:{id:'microsite-test'}}})));
    await assert.rejects(gateway.affiliateExists('RWD-TEST'), BondaGatewayError);
    await assert.rejects(gateway.createAffiliate('RWD-TEST'), BondaGatewayError);
  });
}
