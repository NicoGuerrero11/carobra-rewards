import assert from 'node:assert/strict';
import test from 'node:test';
import type { BondaConfig } from '../src/config.js';
import { approvedCourses } from '../src/rewards/courses/catalog.js';
import { wellnessCatalog } from '../src/rewards/courses/wellness-catalog.js';
import { checkBondaConnection } from '../src/rewards/bonda/connection-check.js';
import { runBondaConnectionCheck } from '../src/rewards/bonda/connection-check-command.js';

const config: BondaConfig = {
  baseUrl: 'https://bonda-test.example', allowedHosts: ['bonda-test.example'], allowedImageHosts: [],
  micrositeId: 'site-test', catalogAffiliateCode: 'technical-test', couponApiKey: 'private-coupon-key',
  requestTimeoutMs: 1000, catalogCacheTtlMs: 60000, catalogCacheMaxStaleMs: 300000,
  catalogEnabled: true, coursesEnabled: true, affiliateProvisioningEnabled: false, couponRequestsEnabled: false,
};
const environment = {
  BONDA_BASE_URL: config.baseUrl, BONDA_ALLOWED_HOSTS: config.allowedHosts.join(','),
  BONDA_MICROSITE_ID: config.micrositeId, BONDA_CATALOG_AFFILIATE_CODE: config.catalogAffiliateCode,
  BONDA_COUPON_API_KEY: config.couponApiKey, BONDA_CATALOG_ENABLED: 'true', BONDA_COURSES_ENABLED: 'true',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status});
function validResponse(input: Parameters<typeof fetch>[0]): Response {
  const path = new URL(String(input)).pathname;
  if (path.includes('/affiliates/')) return json({success: true, data: {member: {code: 'technical-test'}}});
  if (path === '/api/cupones/9510') return json({id: '9510', nombre: 'Cinépolis'});
  const chapter = path.includes('/actividades/2/') ? approvedCourses[0]!.chapters[0]! : wellnessCatalog[0]!.chapters[0]!;
  return json({id: chapter.postId, titulo: chapter.title, tipo: 'video', payload: {
    proveedor: 'vimeo', provider_external_id: '123456', duracion: chapter.durationSeconds,
  }});
}
const isAffiliate = (input: Parameters<typeof fetch>[0]) => new URL(String(input)).pathname.includes('/affiliates/');

test('preflight uses exactly four GETs and never provisions, issues coupons or exposes credentials', async () => {
  const requests: string[] = [];
  const report = await checkBondaConnection(config, async (input, init) => {
    const url = new URL(String(input));
    requests.push(url.pathname);
    assert.equal(init?.method, 'GET');
    assert.equal(init?.body, undefined);
    assert.equal(init?.redirect, 'manual');
    assert.ok(init?.signal instanceof AbortSignal);
    if (isAffiliate(input)) {
      assert.equal(new Headers(init?.headers).get('token'), config.couponApiKey);
      assert.equal(url.search, '');
    } else {
      assert.equal(url.searchParams.get('key'), config.couponApiKey);
      assert.equal(url.searchParams.get('codigo_afiliado'), config.catalogAffiliateCode);
      assert.equal(url.searchParams.get('micrositio_id'), config.micrositeId);
    }
    return validResponse(input);
  });
  assert.equal(report.ready, true);
  assert.deepEqual(report.checks.map(c => c.code), ['OK', 'OK', 'OK', 'OK']);
  assert.deepEqual(requests, ['/api/v2/microsite/site-test/affiliates/technical-test', '/api/cupones/9510', '/api/actividades/2/posts/1256', '/api/actividades/1/posts/13']);
  assert.doesNotMatch(JSON.stringify(report), /private-coupon-key|technical-test|site-test|https:|123456/);
});

test('uses an explicit roster token without enabling provisioning', async () => {
  await checkBondaConnection({...config, affiliateToken: 'private-roster-token'}, async (input, init) => {
    if (isAffiliate(input)) assert.equal(new Headers(init?.headers).get('token'), 'private-roster-token');
    return validResponse(input);
  });
});

for (const status of [200, 400, 404]) {
  test(`diagnoses an explicit USER_NOT_FOUND (${status}) rather than blaming the key`, async () => {
    const report = await checkBondaConnection(config, async input => isAffiliate(input)
      ? json({success: false, error: {code: 'USER_NOT_FOUND', detail: config.couponApiKey}}, status)
      : json({success: false, error: {code: 'AuthorizationException'}}, 400));
    assert.equal(report.ready, false);
    assert.equal(report.checks[0]?.code, 'TECHNICAL_AFFILIATE_MISSING');
    assert.ok(report.checks.slice(1).every(c => c.code === 'AUTHORIZATION_REJECTED'));
    assert.match(report.next_step, /únicamente el afiliado técnico/);
    assert.doesNotMatch(JSON.stringify(report), /private-coupon-key/);
  });
}

for (const status of [200, 400, 401, 403]) {
  test(`diagnoses authorization rejection (${status}) without concluding a missing affiliate`, async () => {
    const report = await checkBondaConnection(config, async () => json({error: {code: 'AuthorizationException'}}, status));
    assert.equal(report.ready, false);
    assert.ok(report.checks.every(c => c.code === 'AUTHORIZATION_REJECTED'));
    assert.doesNotMatch(JSON.stringify(report), /TECHNICAL_AFFILIATE_MISSING/);
  });
}

test('a generic roster 404 is not evidence of a missing affiliate', async () => {
  const report = await checkBondaConnection(config, async input => isAffiliate(input) ? json({}, 404) : validResponse(input));
  assert.equal(report.checks[0]?.code, 'RESOURCE_UNAVAILABLE');
  assert.equal(report.ready, false);
});

test('reports roster permissions separately when content reads succeed', async () => {
  const report = await checkBondaConnection(config, async input => isAffiliate(input) ? json({}, 403) : validResponse(input));
  assert.equal(report.ready, false);
  assert.equal(report.checks[0]?.code, 'AUTHORIZATION_REJECTED');
  assert.ok(report.checks.slice(1).every(c => c.code === 'OK'));
});

test('rejects missing configuration, disabled flags, preview mode and unsafe URLs without requests', async () => {
  const invalid = [undefined, {...config, couponApiKey: ''}, {...config, micrositeId: ''},
    {...config, catalogAffiliateCode: ''}, {...config, coursesEnabled: false}, {...config, catalogEnabled: false},
    {...config, localPreviewEnabled: true}, {...config, baseUrl: 'http://bonda-test.example'},
    {...config, baseUrl: 'https://untrusted.example'}, {...config, baseUrl: 'https://private-coupon-key@bonda-test.example'},
    {...config, baseUrl: 'https://bonda-test.example:8443'}, {...config, baseUrl: 'https://bonda-test.example?secret=value'},
    {...config, couponApiKey: 'bad\r\nkey'}, {...config, micrositeId: '../other'}, {...config, requestTimeoutMs: NaN}];
  for (const value of invalid) {
    const report = await checkBondaConnection(value, async () => {assert.fail('Must not request Bonda');});
    assert.equal(report.ready, false);
    assert.equal(report.checks[0]?.code, 'CONFIGURATION_REQUIRED');
  }
});

test('even write-enabled environments can only perform GET checks', async () => {
  const report = await checkBondaConnection({...config, affiliateProvisioningEnabled: true, couponRequestsEnabled: true}, async (input, init) => {
    assert.equal(init?.method, 'GET');
    return validResponse(input);
  });
  assert.equal(report.ready, true);
});

test('network failures and upstream payloads cannot leak authenticated URLs or keys', async () => {
  const report = await checkBondaConnection(config, async input => {throw new Error(`Failed ${String(input)} private-coupon-key`);});
  assert.ok(report.checks.every(c => c.code === 'PARTNER_UNAVAILABLE'));
  assert.doesNotMatch(JSON.stringify(report), /private-coupon-key|https:|technical-test/);
});

for (const status of [429, 500, 503]) {
  test(`distinguishes provider HTTP ${status} from authorization`, async () => {
    const report = await checkBondaConnection(config, async () => new Response('private-coupon-key', {status}));
    assert.ok(report.checks.every(c => c.code === 'PARTNER_UNAVAILABLE'));
  });
}

test('rejects redirects without following or printing their location', async () => {
  const report = await checkBondaConnection(config, async (_input, init) => {
    assert.equal(init?.redirect, 'manual');
    return new Response(null, {status: 302, headers: {location: 'https://untrusted.example/?key=private-coupon-key'}});
  });
  assert.ok(report.checks.every(c => c.code === 'REDIRECT_REJECTED'));
  assert.doesNotMatch(JSON.stringify(report), /private-coupon-key|untrusted.example/);
});

test('bounds the entire request even when the transport ignores abort', async () => {
  const report = await checkBondaConnection({...config, requestTimeoutMs: 10}, () => new Promise<Response>(() => {}));
  assert.ok(report.checks.every(c => c.code === 'TIMEOUT'));
});

test('bounds stalled response bodies and cancels their readers', async () => {
  let canceled = 0;
  const report = await checkBondaConnection({...config, requestTimeoutMs: 10}, async () => new Response(new ReadableStream({
    start(controller) {controller.enqueue(new TextEncoder().encode('{'));},
    cancel() {canceled++;},
  })));
  assert.ok(report.checks.every(c => c.code === 'TIMEOUT'));
  assert.equal(canceled, 4);
});

for (const withHeader of [false, true]) {
  test(`bounds oversized bodies (content-length header ${withHeader})`, async () => {
    const report = await checkBondaConnection(config, async () => new Response('x'.repeat(1_000_001), withHeader ? {headers: {'content-length': '1000001'}} : {}));
    assert.ok(report.checks.every(c => c.code === 'RESPONSE_TOO_LARGE'));
  });
}

for (const body of ['private-coupon-key', 'null', '[]', '{}', '{"success":false,"error":"private-coupon-key"}']) {
  test(`rejects malformed or unsuccessful responses (${body.length} bytes)`, async () => {
    const report = await checkBondaConnection(config, async () => new Response(body));
    assert.ok(report.checks.every(c => c.code === 'INVALID_RESPONSE'));
    assert.doesNotMatch(JSON.stringify(report), /private-coupon-key/);
  });
}

test('rejects a changed course title or invalid playback payload', async () => {
  for (const patch of [{titulo: 'Unapproved course'}, {payload: {proveedor: 'vimeo', provider_external_id: 'bad', duracion: 20}}]) {
    const report = await checkBondaConnection(config, async input => {
      const response = validResponse(input);
      if (!String(input).includes('/actividades/2/')) return response;
      return json({...await response.json(), ...patch});
    });
    assert.equal(report.checks.find(c => c.check === 'courses')?.code, 'INVALID_RESPONSE');
    assert.equal(report.ready, false);
  }
});

test('CLI returns 0 only for ready and sanitizes configuration and upstream failures', async () => {
  let output = '';
  const write = (text: string) => {output = text;};
  assert.equal(await runBondaConnectionCheck(environment, write, async input => validResponse(input)), 0);
  assert.equal(JSON.parse(output).ready, true);
  assert.equal(await runBondaConnectionCheck({...environment, API_BASE_URL: 'private-coupon-key'}, write), 1);
  assert.equal(JSON.parse(output).checks[0].code, 'CONFIGURATION_REQUIRED');
  assert.doesNotMatch(output, /private-coupon-key/);
  assert.equal(await runBondaConnectionCheck(environment, write, async () => json({error: {code: 'USER_NOT_FOUND'}}, 404)), 1);
  assert.equal(JSON.parse(output).checks[0].code, 'TECHNICAL_AFFILIATE_MISSING');
});
