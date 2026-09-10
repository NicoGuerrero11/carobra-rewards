import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Bonda coupons stay behind authenticated same-origin Carobra routes", async () => {
  const page = await readFile(new URL("../../src/pages/cliente/beneficios.astro", import.meta.url), "utf8");
  const proxy = await readFile(new URL("../../src/pages/api/v1/[...path].ts", import.meta.url), "utf8");
  const contract = await readFile(new URL("../../src/lib/bonda-coupon-contract.ts", import.meta.url), "utf8");

  assert.match(page, /\/api\/v1\/rewards\/coupons/);
  assert.match(proxy, /rewards\\\/coupons/);
  assert.match(contract, /AFFILIATE_PENDING/);
  assert.match(contract, /VERIFICATION_REQUIRED/);
  assert.doesNotMatch(page + proxy + contract, /BONDA_(?:API_KEY|AFFILIATE_TOKEN|MICROSITE_ID)/);
  assert.doesNotMatch(page, /apiv1\.cuponstar|micrositio_id|codigo_afiliado/);
});

test("coupon rendering is safe and stays separate from point redemption", async () => {
  const page = await readFile(new URL("../../src/pages/cliente/beneficios.astro", import.meta.url), "utf8");

  assert.match(page, /no consumen puntos/i);
  assert.match(page, /conservas los anteriores/i);
  assert.match(page, /Esta acción no consume puntos/);
  assert.doesNotMatch(page, /innerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(page, /canjear puntos|saldo suficiente/i);
  assert.match(page, /dialog/);
  assert.match(page, /Términos y condiciones/);
  assert.match(page, /navigator\.clipboard\.writeText/);
});
