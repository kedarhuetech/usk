import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import {
  ALLOWED_IMAGE_HOSTS,
  getStockMediaApiKeys,
  getStockMediaProvidersStatus,
  searchStockMedia,
} from "./stockMediaService.js";

test("getStockMediaApiKeys resolves environment variables", () => {
  process.env.PEXELS_API_KEY = "test-pexels-key";
  process.env.PIXABAY_API_KEY = "test-pixabay-key";
  process.env.UNSPLASH_ACCESS_KEY = "test-unsplash-key";

  const keys = getStockMediaApiKeys();
  assert.equal(keys.pexels, "test-pexels-key");
  assert.equal(keys.pixabay, "test-pixabay-key");
  assert.equal(keys.unsplash, "test-unsplash-key");
});

test("getStockMediaProvidersStatus returns status without revealing secrets", () => {
  process.env.PEXELS_API_KEY = "pexels-secret";
  delete process.env.PIXABAY_API_KEY;
  delete process.env.VITE_PIXABAY_API_KEY;
  process.env.UNSPLASH_ACCESS_KEY = "unsplash-secret";

  const statuses = getStockMediaProvidersStatus();
  assert.equal(statuses.length, 3);

  const pexels = statuses.find((p) => p.id === "pexels");
  assert.equal(pexels.configured, true);
  assert.equal(pexels.envName, "PEXELS_API_KEY");
  assert.equal("secret" in pexels, false);

  const pixabay = statuses.find((p) => p.id === "pixabay");
  assert.equal(pixabay.configured, false);
  assert.equal(pixabay.envName, "PIXABAY_API_KEY");

  const unsplash = statuses.find((p) => p.id === "unsplash");
  assert.equal(unsplash.configured, true);
  assert.equal(unsplash.envName, "UNSPLASH_ACCESS_KEY");
});

test("searchStockMedia validates supported providers", async () => {
  await assert.rejects(
    () => searchStockMedia({ provider: "unknown_provider" }),
    (err) => {
      assert.equal(err.code, "UNSUPPORTED_PROVIDER");
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
});

test("searchStockMedia reports unconfigured provider", async () => {
  delete process.env.PIXABAY_API_KEY;
  delete process.env.VITE_PIXABAY_API_KEY;

  await assert.rejects(
    () => searchStockMedia({ provider: "pixabay" }),
    (err) => {
      assert.equal(err.code, "PROVIDER_NOT_CONFIGURED");
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
});

test("ALLOWED_IMAGE_HOSTS includes legitimate CDNs and prevents SSRF", () => {
  assert.ok(ALLOWED_IMAGE_HOSTS.has("images.pexels.com"));
  assert.ok(ALLOWED_IMAGE_HOSTS.has("pixabay.com"));
  assert.ok(ALLOWED_IMAGE_HOSTS.has("cdn.pixabay.com"));
  assert.ok(ALLOWED_IMAGE_HOSTS.has("images.unsplash.com"));

  assert.equal(ALLOWED_IMAGE_HOSTS.has("evil.com"), false);
  assert.equal(ALLOWED_IMAGE_HOSTS.has("localhost"), false);
  assert.equal(ALLOWED_IMAGE_HOSTS.has("127.0.0.1"), false);
});
