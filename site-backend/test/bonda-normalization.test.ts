import assert from "node:assert/strict";
import test from "node:test";

import {
  approvedHttpsUrl,
  htmlToSafeText,
  normalizeCoupon,
  normalizeCouponBranch,
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
    foto_principal: {
      original: "https://assets.example/coupon-original.png",
      "280x190": "https://assets.example/coupon.png",
    },
    foto_thumbnail: {
      original: "https://assets.example/logo-original.png",
      "90x90": "https://assets.example/logo.png",
    },
    foto_apaisada: {
      original: "https://assets.example/banner-original.png",
      "240x80": "https://assets.example/banner.png",
    },
    usar_en: { online: true, onsite: true, email: false },
    categorias: [{ nombre: "Tecnologia" }],
    empresa: { descripcion: "<p>Marca &amp; tecnologia.</p>" },
  }, ["assets.example"]);

  assert.equal(coupon.id, "10792");
  assert.equal(coupon.name, "Baires IT");
  assert.equal(coupon.shortDescription, "Descuento & beneficio");
  assert.doesNotMatch(coupon.usageInstructions, /script|alert/);
  assert.doesNotMatch(coupon.legalTerms, /iframe|evil/);
  assert.equal(coupon.expirationAt, "2027-06-30T23:59:59.000Z");
  assert.equal(coupon.imageUrl, "https://assets.example/coupon-original.png");
  assert.equal(coupon.heroImageUrl, "https://assets.example/coupon-original.png");
  assert.equal(coupon.logoImageUrl, "https://assets.example/logo-original.png");
  assert.equal(coupon.bannerImageUrl, "https://assets.example/banner-original.png");
  assert.deepEqual(coupon.channels, ["ONLINE", "ONSITE"]);
  assert.equal(coupon.brandDescription, "Marca & tecnologia.");
  assert.deepEqual(coupon.branches, []);
});

test("normalizes optional Bonda branch information without markup", () => {
  assert.deepEqual(normalizeCouponBranch({
    id: 17,
    nombre: "<b>Sucursal Centro</b>",
    direccion: "Av. Reforma 100",
    localidad: { nombre: "Ciudad de México" },
    provincia: { nombre: "CDMX" },
    latitud: "19.4270",
    longitud: "-99.1677",
  }), {
    id: "17",
    name: "Sucursal Centro",
    address: "Av. Reforma 100",
    city: "Ciudad de México",
    state: "CDMX",
    latitude: 19.427,
    longitude: -99.1677,
  });
});

test("normalizes nested and GeoJSON-style branch coordinates and drops incomplete pairs", () => {
  assert.deepEqual(normalizeCouponBranch({
    id: 18,
    nombre: "Sucursal Norte",
    coordenadas: [-99.13, 19.51],
  }), {
    id: "18",
    name: "Sucursal Norte",
    address: "",
    city: null,
    state: null,
    latitude: 19.51,
    longitude: -99.13,
  });

  assert.equal(normalizeCouponBranch({ id: 19, nombre: "Sin par", latitud: 19.4 }).latitude, null);
});

test("rejects non-HTTPS, credential-bearing, malformed, and unapproved image URLs", () => {
  assert.equal(approvedHttpsUrl("http://assets.example/a.png", ["assets.example"]), null);
  assert.equal(approvedHttpsUrl("https://user:pass@assets.example/a.png", ["assets.example"]), null);
  assert.equal(approvedHttpsUrl("https://other.example/a.png", ["assets.example"]), null);
  assert.equal(approvedHttpsUrl("not-a-url", ["assets.example"]), null);
});

test("falls back to an approved reduced image when Bonda's original is missing or invalid", () => {
  const coupon = normalizeCoupon({
    id: 1,
    nombre: "Beneficio",
    foto_principal: {
      original: "http://assets.example/unapproved.png",
      "280x190": "https://assets.example/approved.png",
    },
  }, ["assets.example"]);

  assert.equal(coupon.heroImageUrl, "https://assets.example/approved.png");
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
