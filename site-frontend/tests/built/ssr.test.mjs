import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";

// Exercise the actual generated Vercel entrypoint against an ephemeral local BFF.
// No .env, production endpoints or database are used.
test("generated Vercel SSR preserves authentication and proxy contracts", async (t) => {
  let fixtureSource = readFileSync(new URL('../support/mock-site-backend.mjs', import.meta.url), 'utf8');
  fixtureSource = fixtureSource.replace('server.listen(port, host);', '') + '\nexport {homePortal, eligibleProfile};';
  const fixture = await import(`data:text/javascript;base64,${Buffer.from(fixtureSource).toString('base64')}`);
  const requests = [];
  const backend = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ method: req.method, url: req.url, cookie: req.headers.cookie, body: Buffer.concat(chunks).toString() });
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", "no-store");
    if (req.url === "/api/v1/rewards/customer-context" && req.headers.cookie?.includes("carobra_session=portal-failure")) {
      return res.end(JSON.stringify({customer:{id:"fixture", rewards_id:"1", first_name:"Cliente", last_name:"Prueba", email:"fixture@example.test", customer_status:"ACTIVE", onboarding_status:"COMPLETED"},validation:{status:"VALIDATED"},portal:null}));
    }
    if (req.url === "/api/v1/rewards/customer-context" && req.headers.cookie?.includes("carobra_session=portal-balance")) {
      return res.end(JSON.stringify({customer:fixture.eligibleProfile,validation:{status:'VALIDATED'},portal:fixture.homePortal({headers:{cookie:'bonda-balance=unavailable'}},fixture.eligibleProfile)}));
    }
    if (req.url?.startsWith("/api/v1/rewards/customer-context?include=") && req.headers.cookie?.includes("carobra_session=bundle")) {
      return res.end(JSON.stringify({customer:fixture.eligibleProfile,validation:{status:'VALIDATED'},portal:fixture.homePortal({headers:{cookie:''}},fixture.eligibleProfile),navigation_modules:{coupons:{status:503,data:null},courses:{status:503,data:null}}}));
    }
    if (req.url === "/api/v1/auth/login") {
      res.setHeader("set-cookie", ["carobra_session=test; Path=/; HttpOnly; SameSite=Lax", "preference=test; Path=/; SameSite=Lax"]);
      return res.end(JSON.stringify({ customer: { id: "fixture" } }));
    }
    if (req.url === "/api/v1/auth/logout") {
      res.setHeader("set-cookie", "carobra_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
      res.writeHead(204);
      return res.end();
    }
    if (req.url === "/api/v1/me" && req.headers.cookie?.includes("carobra_session=test")) {
      return res.end(JSON.stringify({ id: "fixture", rewards_id: "1", first_name: "Cliente", last_name: "Prueba", email: "fixture@example.test", customer_status: "PENDING_VALIDATION", onboarding_status: "COMPLETED" }));
    }
    if (req.url === "/api/v1/me/validation-status") return res.end(JSON.stringify({ status: "PENDING" }));
    if (req.url === "/api/v1/rewards/activities?cursor=next") return res.end(JSON.stringify({ items: [] }));
    res.writeHead(401);
    res.end(JSON.stringify({ error: { code: "unauthenticated" } }));
  });
  backend.listen(0, "127.0.0.1");
  await once(backend, "listening");
  const previous = process.env.SITE_BACKEND_BASE_URL;
  process.env.SITE_BACKEND_BASE_URL = `http://127.0.0.1:${backend.address().port}`;
  t.after(async () => {
    if (previous === undefined) delete process.env.SITE_BACKEND_BASE_URL;
    else process.env.SITE_BACKEND_BASE_URL = previous;
    backend.closeAllConnections();
    await new Promise((resolve) => backend.close(resolve));
  });
  const configUrl = new URL("../../.vercel/output/functions/_render.func/.vc-config.json", import.meta.url);
  const { handler } = JSON.parse(readFileSync(configUrl, "utf8"));
  const { default: app } = await import(new URL(handler, configUrl).href);
  const request = (path, options) => app.fetch(new Request(`http://localhost:4323${path}`, options));
  const cookie = "carobra_session=test";

  await t.test("renders SSR login and redirects unauthenticated routes", async () => {
    const login = await request("/login");
    assert.equal(login.status, 200);
    assert.match(await login.text(), /id="email"/);
    const protectedPage = await request("/cliente");
    assert.equal(protectedPage.status, 302);
    assert.equal(protectedPage.headers.get("location"), "/login");
    await protectedPage.text();
  });
  await t.test("forwards JSON bodies and preserves multiple Set-Cookie headers", async () => {
    const body = JSON.stringify({ email: "fixture@example.test", password: "test-only" });
    const response = await request("/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:4323" }, body });
    assert.equal(response.status, 200);
    assert.equal(response.headers.getSetCookie().length, 2);
    assert.match(response.headers.getSetCookie()[0], /HttpOnly/);
    assert.equal(requests.at(-1).body, body);
    await response.json();
  });
  await t.test("uses the session for authenticated redirects and forwards query strings", async () => {
    const response = await request("/login", { headers: { cookie } });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/cliente");
    await response.text();
    const activities = await request("/api/v1/rewards/activities?cursor=next", { headers: { cookie } });
    assert.equal(activities.status, 200);
    assert.equal(requests.at(-1).url, "/api/v1/rewards/activities?cursor=next");
    assert.equal(requests.at(-1).cookie, cookie);
    assert.equal(activities.headers.get("cache-control"), "no-store");
    await activities.json();
  });
  await t.test("preserves upstream errors and rejects paths outside the allowlist", async () => {
    const unauthenticated = await request("/api/v1/me");
    assert.equal(unauthenticated.status, 401);
    assert.equal((await unauthenticated.json()).error.code, "unauthenticated");
    const count = requests.length;
    const blocked = await request("/api/v1/not-allowed");
    assert.equal(blocked.status, 404);
    await blocked.text();
    assert.equal(requests.length, count);
  });
  await t.test("activity and products reuse an unavailable request-local portal without retry or fabricated balance", async () => {
    for (const path of ['/cliente/activities', '/cliente/productos']) {
      const before = requests.length;
      const response = await request(path, {headers:{cookie:'carobra_session=portal-failure'}});
      assert.equal(response.status,200);
      assert.equal(response.headers.get('cache-control'),'private, no-store');
      assert.match(response.headers.get('server-timing'),/auth-context;dur=/);
      const html = await response.text();
      assert.match(html,/No pudimos/);
      assert.equal(requests.slice(before).filter(row=>row.url==='/api/v1/rewards/portal').length,0);
      assert.equal(requests.slice(before).filter(row=>row.url==='/api/v1/rewards/customer-context').length,1);
      if (path.endsWith('activities')) assert.doesNotMatch(html,/class="bonda-balance__amount"/);
    }
  });
  await t.test("unknown balance SSR includes empty hidden slots for a later successful refresh", async () => {
    const response = await request('/cliente/activities', {headers:{cookie:'carobra_session=portal-balance'}});
    assert.equal(response.status,200);
    const html = await response.text();
    assert.match(html,/data-bonda-status="UNAVAILABLE"/);
    assert.match(html,/<p class="bonda-balance__amount"[^>]*hidden/);
    assert.match(html,/<p class="bonda-balance__time"[^>]*hidden[^>]*>Última consulta: <time[^>]*><\/time>/);
    assert.match(html,/data-balance-pending/);
    assert.match(html,/data-balance-review/);
    assert.doesNotMatch(html,/data-balance-amount[^>]*>0</);
  });
  await t.test("bundled module failures render explicit fallbacks without repeating focused requests", async () => {
    for (const path of ['/cliente/recompensas','/cliente/beneficios','/cliente/cursos']) {
      const before=requests.length;
      const response=await request(path,{headers:{cookie:'carobra_session=bundle'}});
      assert.equal(response.status,200);
      const html=await response.text();assert.match(html,/No pudimos/);
      assert.equal(requests.length-before,1);
      assert.match(requests.at(-1).url,/customer-context\?include=/);
    }
  });
  await t.test("preserves logout status and cookie expiry", async () => {
    const response = await request("/api/v1/auth/logout", { method: "POST", headers: { cookie, origin: "http://localhost:4323" } });
    assert.equal(response.status, 204);
    assert.match(response.headers.getSetCookie()[0], /Max-Age=0/);
    await response.text();
  });
});
