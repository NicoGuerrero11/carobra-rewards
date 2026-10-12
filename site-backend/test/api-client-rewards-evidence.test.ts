import assert from "node:assert/strict";
import test from "node:test";

import { RewardsApiClient } from "../src/api-client.js";
import type { SiteBackendConfig } from "../src/config.js";

test("Rewards evidence keeps only safe customer and SISCA identity facts", async () => {
  const paths: string[] = [];
  const client = new RewardsApiClient(config(), async (input, init) => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    assert.equal(new Headers(init?.headers).get("cookie"), "carobra_session=secret");
    if (path.endsWith("/validation-status")) {
      return Response.json({
        validation_id: "validation-1",
        customer_id: "customer-1",
        status: "VALIDATED",
        registered_at: "2026-07-13T10:00:00.000Z",
        next_checkpoint: null,
        next_checkpoint_at: null,
        last_checked_at: "2026-07-14T10:00:00.000Z",
        last_check_outcome: "MATCH_VALIDATED",
        validated_at: "2026-07-14T10:00:00.000Z",
        product_evidence: {
          provider: "SISCA",
          product_type: "AFORE",
          status: "ACTIVE",
          source_id: "sisca-validation:validation-1",
          validated_at: "2026-07-14T10:00:00.000Z",
        },
        raw_sisca_payload: "must-not-be-forwarded",
      });
    }
    return Response.json({
      id: "customer-1",
      rewards_id: "RWD-test",
      curp: "ABCD123456HMNLRS09",
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
      phone: "5551234567",
      postal_code: "01010",
      state: "CDMX",
      city: "CDMX",
      customer_status: "ACTIVE",
      onboarding_status: "COMPLETED",
    });
  });

  const result = await client.getRewardsIdentityEvidence(
    "analytics=ignored; carobra_session=secret; theme=dark",
  );

  assert.deepEqual(paths.sort(), ["/api/v1/me", "/api/v1/me/validation-status"]);
  assert.deepEqual(result.data, {
    customer_id: "customer-1",
    rewards_id: "RWD-test",
    customer_status: "ACTIVE",
    validation_id: "validation-1",
    validation_status: "VALIDATED",
    registered_at: "2026-07-13T10:00:00.000Z",
    validated_at: "2026-07-14T10:00:00.000Z",
    product_evidence: {
      provider: "SISCA",
      product_type: "AFORE",
      status: "ACTIVE",
      source_id: "sisca-validation:validation-1",
      validated_at: "2026-07-14T10:00:00.000Z",
    },
  });
  assert.doesNotMatch(JSON.stringify(result.data), /curp|email|phone|raw_sisca|credential/i);
});

test("Rewards evidence rejects inconsistent API customer identity", async () => {
  const client = new RewardsApiClient(config(), async (input) => {
    const path = new URL(String(input)).pathname;
    return path.endsWith("/validation-status")
      ? Response.json({ customer_id: "customer-2", status: "VALIDATED" })
      : Response.json({ id: "customer-1", customer_status: "ACTIVE" });
  });

  await assert.rejects(
    client.getRewardsIdentityEvidence("carobra_session=secret"),
    { status: 503, code: "api_unavailable" },
  );
});

function config(): SiteBackendConfig {
  return {
    apiBaseUrl: "http://api.test",
    host: "127.0.0.1",
    port: 0,
    apiRequestTimeoutMs: 1000,
    sessionCookie: {
      name: "carobra_session",
      secure: false,
      sameSite: "lax",
      path: "/",
    },
  };
}

test('overlapping identity reads coalesce per session, then revalidate changes and revocations', async () => {
  let calls = 0, revoked = false, inactive = false;
  const client = new RewardsApiClient(config(), async (input, init) => {
    calls++;
    const cookie = new Headers(init?.headers).get('cookie');
    const id = cookie === 'carobra_session=alice' ? 'alice' : 'bob';
    await new Promise(resolve => setTimeout(resolve, 10));
    if (revoked) return Response.json({detail:{code:'unauthenticated',message:'expired'}},{status:401});
    return String(input).endsWith('validation-status')
      ? Response.json({customer_id:id,status:inactive?'PENDING':'VALIDATED'})
      : Response.json({id,customer_status:inactive?'INACTIVE':'ACTIVE'});
  });
  const [alice, sameAlice, bob] = await Promise.all([
    client.getAuthenticatedCustomerContext('carobra_session=alice; theme=one'),
    client.getAuthenticatedCustomerContext('theme=two; carobra_session=alice'),
    client.getAuthenticatedCustomerContext('carobra_session=bob'),
  ]);
  assert.equal(calls,4); assert.equal(alice.data.customer.id,'alice');
  assert.equal(sameAlice.data.customer.id,'alice'); assert.equal(bob.data.customer.id,'bob');
  inactive = true;
  assert.equal((await client.getAuthenticatedCustomerContext('carobra_session=alice')).data.customer.customer_status,'INACTIVE');
  assert.equal(calls,6);
  revoked = true;
  await assert.rejects(client.getAuthenticatedCustomerContext('carobra_session=alice'),{status:401});
  await new Promise(resolve => setTimeout(resolve, 15));
  revoked = false;
  assert.equal((await client.getAuthenticatedCustomerContext('carobra_session=alice')).data.customer.id,'alice');
  assert.equal(calls,10);
});

test('command evidence does not reuse an overlapping navigation authorization', async () => {
  let calls=0;
  const client=new RewardsApiClient(config(),async input=>{
    calls++; await new Promise(resolve=>setTimeout(resolve,10));
    return Response.json(String(input).endsWith('validation-status')?{customer_id:'alice',status:'VALIDATED'}:{id:'alice',customer_status:'ACTIVE'});
  });
  await Promise.all([client.getAuthenticatedCustomerContext('carobra_session=alice'),client.getRewardsIdentityEvidence('carobra_session=alice')]);
  assert.equal(calls,4);
});

test('logout invalidates an unresolved navigation so a later request cannot reuse pre-logout identity', async () => {
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>release=resolve);
  let revoked=false,reads=0;
  const client=new RewardsApiClient(config(),async input=>{
    if(String(input).endsWith('/auth/logout')) {revoked=true;return new Response(null,{status:204});}
    reads++;
    if(revoked) return Response.json({detail:{code:'unauthenticated'}},{status:401});
    await gate;
    return Response.json(String(input).endsWith('validation-status')?{customer_id:'alice',status:'VALIDATED'}:{id:'alice',customer_status:'ACTIVE'});
  });
  const earlier=client.getAuthenticatedCustomerContext('carobra_session=alice');
  assert.equal(reads,2);
  await client.logout('carobra_session=alice');
  await assert.rejects(client.getAuthenticatedCustomerContext('carobra_session=alice'),{status:401});
  assert.equal(reads,4);
  release();await earlier;
  await assert.rejects(client.getAuthenticatedCustomerContext('carobra_session=alice'),{status:401});
  assert.equal(reads,6);
});

test('parallel read-only modules share pending authority by exact session, then revalidate', async () => {
  let calls=0;
  const client=new RewardsApiClient(config(),async(input,init)=>{
    calls++;
    const id=new Headers(init?.headers).get('cookie')==='carobra_session=alice'?'alice':'bob';
    await new Promise(resolve=>setTimeout(resolve,10));
    return Response.json(String(input).endsWith('validation-status')?{customer_id:id,status:'VALIDATED'}:{id,customer_status:'ACTIVE'});
  });
  const values=await Promise.all([
    client.getReadOnlyRewardsIdentityEvidence('carobra_session=alice'),
    client.getReadOnlyRewardsIdentityEvidence('carobra_session=alice; theme=ignored'),
    client.getReadOnlyRewardsIdentityEvidence('carobra_session=bob'),
  ]);
  assert.deepEqual(values.map(value=>value.data.customer_id),['alice','alice','bob']);
  assert.equal(calls,4);
  await client.getReadOnlyRewardsIdentityEvidence('carobra_session=alice');
  assert.equal(calls,6);
});
