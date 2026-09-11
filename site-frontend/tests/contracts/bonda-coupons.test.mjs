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
  const detail = await readFile(new URL("../../src/pages/cliente/beneficios/[id].astro", import.meta.url), "utf8");
  const richText = await readFile(new URL("../../src/components/BenefitRichText.astro", import.meta.url), "utf8");

  assert.match(detail, /no descuenta puntos/i);
  assert.doesNotMatch(page + detail, /innerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(page + detail, /canjear puntos|saldo suficiente/i);
  assert.doesNotMatch(page, /Desde \{levelLabel|benefit-dialog|showModal/);
  assert.match(detail, /Términos y condiciones/);
  assert.match(detail, /navigator\.clipboard\.writeText/);
  assert.match(detail, /Sucursales disponibles/);
  assert.match(detail, /branches-dialog/);
  assert.match(detail, /leaflet/);
  assert.match(detail, /OpenStreetMap/);
  assert.match(detail, /branches-map-empty/);
  assert.match(detail, /\/branches/);
  assert.match(detail, /requestIdleCallback/);
  assert.match(detail, /await import\("leaflet"\)/);
  assert.match(detail, /latitude: number \| null/);
  assert.match(detail, /longitude: number \| null/);
  assert.match(detail, /item\?\.heroImageUrl \?\? item\?\.bannerImageUrl \?\? item\?\.imageUrl/);
  assert.match(detail, /fetchpriority="high"/);
  assert.match(detail, /font-size:clamp\(2rem,4vw,3rem\)/);
  assert.doesNotMatch(detail, /carousel|carrusel|gallery|galería/i);
  assert.match(richText, /benefit-rich-text__highlight/);
  assert.match(richText, /matchAll\(emphasisPattern\)/);
  assert.doesNotMatch(richText, /innerHTML|set:html/);
  assert.match(page, /coupon-card__link/);
  assert.match(page, /coupon-card__logo/);
  assert.match(page, /coupon-card__discount/);
  assert.match(page, /<div class="coupon-card__visual"/);
  assert.doesNotMatch(page, /<h3>\{item\.name\}<\/h3>/);
  assert.match(page, /aria-label=\{`\$\{item\.name\}: \$\{item\.discount/);
  assert.doesNotMatch(page, /Tu nivel abre nuevas experiencias/);
  assert.doesNotMatch(page, /Otras experiencias|other-benefits-title/);
  assert.match(page, /grid-template-columns:repeat\(4/);
});
