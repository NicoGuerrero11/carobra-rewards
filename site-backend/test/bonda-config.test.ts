import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../src/config.js";

test("Bonda configuration is disabled and credential-optional by default", () => {
  const bonda = loadConfig({}).bonda;
  assert.ok(bonda);
  assert.equal(bonda.catalogEnabled, false);
  assert.equal(bonda.affiliateProvisioningEnabled, false);
  assert.equal(bonda.couponRequestsEnabled, false);
  assert.equal(bonda.catalogCacheTtlMs, 60_000);
  assert.equal(bonda.catalogCacheMaxStaleMs, 300_000);
  assert.equal(bonda.micrositeId, undefined);
  assert.equal(bonda.couponApiKey, undefined);
  assert.equal(bonda.affiliateToken, undefined);
});

test("Bonda catalog cache requires a bounded stale window", () => {
  assert.throws(
    () => loadConfig({
      BONDA_CATALOG_CACHE_TTL_MS: "60000",
      BONDA_CATALOG_CACHE_MAX_STALE_MS: "30000",
    }),
    /MAX_STALE_MS must be greater than or equal to BONDA_CATALOG_CACHE_TTL_MS/,
  );
});

test("Bonda configuration fails closed for missing credentials and unapproved hosts", () => {
  assert.throws(
    () => loadConfig({ BONDA_CATALOG_ENABLED: "true" }),
    /MICROSITE_ID.*COUPON_API_KEY/,
  );
  assert.throws(
    () => loadConfig({
      BONDA_AFFILIATE_PROVISIONING_ENABLED: "true",
      BONDA_MICROSITE_ID: "test-microsite",
    }),
    /AFFILIATE_TOKEN/,
  );
  assert.throws(
    () => loadConfig({
      BONDA_BASE_URL: "https://unapproved.example",
      BONDA_ALLOWED_HOSTS: "apiv1.cuponstar.com",
    }),
    /host must be included/,
  );
  assert.throws(
    () => loadConfig({
      BONDA_BASE_URL: "http://apiv1.cuponstar.com",
      BONDA_ALLOWED_HOSTS: "apiv1.cuponstar.com",
    }),
    /must use https/,
  );
});

test("Bonda capabilities can be enabled independently", () => {
  const bonda = loadConfig({
    BONDA_BASE_URL: "https://bonda-test.example",
    BONDA_ALLOWED_HOSTS: "bonda-test.example",
    BONDA_ALLOWED_IMAGE_HOSTS: "assets-test.example",
    BONDA_MICROSITE_ID: "microsite-test",
    BONDA_COUPON_API_KEY: "coupon-key-test",
    BONDA_CATALOG_ENABLED: "true",
  }).bonda;
  assert.ok(bonda);
  assert.equal(bonda.catalogEnabled, true);
  assert.equal(bonda.couponRequestsEnabled, false);
  assert.equal(bonda.affiliateProvisioningEnabled, false);
  assert.deepEqual(bonda.allowedHosts, ["bonda-test.example"]);
});
