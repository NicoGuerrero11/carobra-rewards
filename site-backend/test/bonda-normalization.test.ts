import assert from "node:assert/strict";
import test from "node:test";

import {
  approvedHttpsUrl,
  htmlToSafeText,
  normalizeCoupon,
  normalizeReceivedCoupon,
} from "../src/rewards/bonda/normalization.js";

test("normalizes documented Bonda coupon content to safe customer text", () => {
  const coupon = normalizeCoupon({
    id: 10792,
    nombre: "<b>Baires IT</b>",
    descuento: "20%",
    descripcion_breve: "<p>Descuento &amp; beneficio</p>",
    descripcion_micrositio: "<p>Compra <strong>tecnologia</strong>.</p>",
    usage_instructions: "<script>alert('x')</script><p>Paso 1</p><p>Paso 2</p>",
    legales: "<iframe src='evil'></iframe><p>Sujeto a disponibilidad.</p>",
    fecha_vencimiento: "2027-06-30 23:59:59",
    foto_principal: { "280x190": "https://assets.example/coupon.png" },
    usar_en: { online: true, onsite: true, email: false },
    categorias: [{ nombre: "Tecnologia" }],
  }, ["assets.example"]);

  assert.equal(coupon.id, "10792");
  assert.equal(coupon.name, "Baires IT");
  assert.equal(coupon.shortDescription, "Descuento & beneficio");
  assert.doesNotMatch(coupon.usageInstructions, /script|alert/);
  assert.doesNotMatch(coupon.legalTerms, /iframe|evil/);
  assert.equal(coupon.expirationAt, "2027-06-30T23:59:59.000Z");
  assert.equal(coupon.imageUrl, "https://assets.example/coupon.png");
  assert.deepEqual(coupon.channels, ["ONLINE", "ONSITE"]);
});

test("rejects non-HTTPS, credential-bearing, malformed, and unapproved image URLs", () => {
  assert.equal(approvedHttpsUrl("http://assets.example/a.png", ["assets.example"]), null);
  assert.equal(approvedHttpsUrl("https://user:pass@assets.example/a.png", ["assets.example"]), null);
  assert.equal(approvedHttpsUrl("https://other.example/a.png", ["assets.example"]), null);
  assert.equal(approvedHttpsUrl("not-a-url", ["assets.example"]), null);
});

test("bounds normalized partner text", () => {
  assert.equal(htmlToSafeText("<p>abcdef</p>", 4), "abcd");
});

test("normalizes documented received-coupon history with nested delivery data", () => {
  assert.deepEqual(normalizeReceivedCoupon({
    id: "2048",
    nombre: "Cinemark",
    envio: {
      codigo_id: "delivery-1",
      codigo: "2X1-TEST",
      fecha: "2026-09-10 12:00:00",
    },
  }), {
    receiptId: "delivery-1",
    couponId: "2048",
    name: "Cinemark",
    code: "2X1-TEST",
    requestedAt: "2026-09-10T12:00:00.000Z",
  });
});
