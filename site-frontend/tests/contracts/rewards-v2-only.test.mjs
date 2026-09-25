import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("concise customer rewards home and BFF expose only V2 rewards contracts", async () => {
  const page = await readFile(new URL("../../src/pages/cliente/recompensas.astro", import.meta.url), "utf8");
  const bff = await readFile(new URL("../../src/pages/api/v1/[...path].ts", import.meta.url), "utf8");

  assert.doesNotMatch(page, /\/api\/v1\/rewards\/(?:account|eligibility)/);
  assert.doesNotMatch(page, /legacyAccount|LegacyAccountSummary/);
  assert.match(page, /Astro\.locals\.rewardsPortal/);
  assert.doesNotMatch(page, /\/api\/v1\/rewards\/(?:journey|activities|movements)/);
  assert.match(page, /Promise\.all/);
  assert.match(page, /\/api\/v1\/rewards\/coupons\?page_size=4&preview=true/);
  assert.match(page, /\/api\/v1\/rewards\/courses/);
  assert.match(page, /portal\?\.journey/);
  assert.match(page, /portal\?\.timeline\.slice\(0, 3\)/);
  assert.doesNotMatch(page, /portal\?\.activity_details/);
  assert.doesNotMatch(page, /portal\?\.movement_details/);
  assert.match(page, /No pudimos actualizar tu cuenta/);
  assert.match(page, /private, no-store/);
  assert.doesNotMatch(page, /portal\?\.learning|fallbackProgress|progressPercent|catalogBrands/);
  const loader = await readFile(new URL('../../src/lib/customer-home.ts',import.meta.url),'utf8');
  assert.match(loader, /AbortSignal\.timeout\(5000\)/);

  assert.doesNotMatch(bff, /"rewards\/(?:account|eligibility)"/);
  assert.match(bff, /"rewards\/journey"/);
  assert.match(bff, /"rewards\/portal"/);
});

test("protected middleware loads one authenticated customer context and exposes safe timing", async () => {
  const middleware = await readFile(new URL("../../src/middleware.ts", import.meta.url), "utf8");

  assert.match(middleware, /fetchCustomerContext\(cookieHeader\)/);
  assert.match(middleware, /\/api\/v1\/rewards\/customer-context/);
  assert.match(middleware, /context\.locals\.rewardsPortal = customerContext\.portal/);
  assert.match(middleware, /auth-context;dur=/);
  assert.match(middleware, /page-render;dur=/);
  assert.match(middleware, /total;dur=/);
  assert.doesNotMatch(middleware, /server-timing[^\n]*(?:customer|session|SISCA|sql)/i);
});

test("customer navigation exposes courses and labeled utility actions", async () => {
  const shell = await readFile(new URL("../../src/layouts/ClientShellLayout.astro", import.meta.url), "utf8");
  const courses = await readFile(new URL("../../src/pages/cliente/cursos.astro", import.meta.url), "utf8");
  const benefits = await readFile(new URL("../../src/pages/cliente/beneficios.astro", import.meta.url), "utf8");

  assert.match(shell, /label: "Cursos", href: "\/cliente\/cursos"/);
  assert.doesNotMatch(shell, /label: "Ganar puntos"/);
  assert.match(shell, /data-tooltip="Ayuda"/);
  assert.match(shell, /data-tooltip="Notificaciones"/);
  assert.match(courses, /\/api\/v1\/rewards\/courses/);
  assert.match(courses, /Cursos para seguir creciendo/);
  assert.match(courses, /catalog.status === 'DISABLED'/);
  assert.doesNotMatch(benefits, /Otras experiencias|other-benefits-title/);
});
