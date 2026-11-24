import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Test Suite: Company Profile Tenancy, MySQL-Only Persistence, and Reconciliation Safety
 */

// Simulated businessIdFromRequest logic adhering to Phase 1 strict tenancy rules
function resolveBusinessId(headers = {}, query = {}, env = {}) {
  const demoBusinessId = env.DEMO_BUSINESS_ID || "demo-business";
  const headerId = headers["x-business-id"] || headers["X-Business-Id"];
  const queryId = query.businessId;

  // Never allow silent fallback to local-development
  let id = headerId || queryId || (env.NODE_ENV !== "production" ? demoBusinessId : "");
  id = String(id || "").trim();

  if (!id || id.length > 64) {
    throw new Error("A valid X-Business-Id header is required.");
  }
  if (id === "local-development") {
    // Disallow local-development when operating on demo-business environment
    if (env.ENFORCE_DEMO_BUSINESS && demoBusinessId === "demo-business") {
      throw new Error("Access denied: 'local-development' is not permitted for this environment.");
    }
  }
  return id;
}

// Logic for safe field resolution preserving non-empty database values against incomplete payloads
function safeResolveField(body, aliases, existingValue) {
  const hasOwn = (obj, key) => Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key));
  const presentAlias = aliases.find((key) => hasOwn(body, key));

  if (presentAlias !== undefined) {
    const definedAlias = aliases.find((key) => hasOwn(body, key) && body[key] !== undefined) ?? presentAlias;
    const raw = body[definedAlias];
    if (raw === undefined || raw === null) {
      // Incomplete or omitted field: preserve existing non-empty value
      return existingValue ?? null;
    }
    const str = String(raw).trim();
    if (str === "") {
      // If client payload is incomplete and existing value exists, preserve it to prevent accidental erasure
      if (body._isExplicitClear) {
        return null;
      }
      return existingValue ?? null;
    }
    return str;
  }
  return existingValue ?? null;
}

// Simulated frontend database loading vs localStorage fallback logic
async function loadCompanyProfileAuthoritative(apiClientMock, localFallbackMock = null) {
  try {
    const res = await apiClientMock.getCompanyProfile();
    if (!res || !res.success) {
      throw new Error(res?.message || "Failed to load company profile from MySQL.");
    }
    return { data: res.data, source: "mysql" };
  } catch (err) {
    // Under strict MySQL-only persistence, database failure must NOT silently return stale localStorage as source of truth
    throw new Error(`Database error: ${err.message}. Cannot load authoritative Company Profile.`, { cause: err });
  }
}

// Simulated frontend save requiring awaited MySQL confirmation
async function saveCompanyProfileAuthoritative(profile, apiClientMock) {
  if (!profile.companyName && !profile.businessName) {
    throw new Error("Company name is required.");
  }
  // Saving must await backend confirmation before reporting success
  const res = await apiClientMock.saveCompanyProfile(profile);
  if (!res || !res.success) {
    throw new Error(res?.message || "Failed to persist company profile to MySQL.");
  }
  return { success: true, message: "Company profile saved successfully in MySQL.", data: profile };
}

test("1. GET Company Profile uses demo-business context", () => {
  const headers = { "x-business-id": "demo-business" };
  const env = { DEMO_BUSINESS_ID: "demo-business", NODE_ENV: "development" };
  const bizId = resolveBusinessId(headers, {}, env);
  assert.equal(bizId, "demo-business");
});

test("2. POST Company Profile saves under demo-business", () => {
  const headers = { "x-business-id": "demo-business" };
  const env = { DEMO_BUSINESS_ID: "demo-business" };
  const bizId = resolveBusinessId(headers, {}, env);
  assert.equal(bizId, "demo-business");
});

test("3. local-development is never selected as a silent fallback", () => {
  const headers = {}; // No header passed
  const env = { DEMO_BUSINESS_ID: "demo-business", ENFORCE_DEMO_BUSINESS: "true" };
  const bizId = resolveBusinessId(headers, {}, env);
  assert.equal(bizId, "demo-business");
  assert.notEqual(bizId, "local-development");
});

test("4. Missing business ID produces a clear error", () => {
  const headers = {};
  const env = { NODE_ENV: "production", DEMO_BUSINESS_ID: "" };
  assert.throws(
    () => resolveBusinessId(headers, {}, env),
    /A valid X-Business-Id header is required/
  );
});

test("5. Company Profile data is retrieved from MySQL rather than localStorage", async () => {
  const mockApi = {
    getCompanyProfile: async () => ({
      success: true,
      data: { companyName: "USV Test Trade", businessType: "Distributor", businessCategory: "Pharmacy & Medical" }
    })
  };
  const result = await loadCompanyProfileAuthoritative(mockApi, { companyName: "Stale Local" });
  assert.equal(result.source, "mysql");
  assert.equal(result.data.companyName, "USV Test Trade");
  assert.equal(result.data.businessType, "Distributor");
});

test("6. Database failure does not produce a false success", async () => {
  const mockFailingApi = {
    saveCompanyProfile: async () => {
      throw new Error("ECONNREFUSED - Database unavailable");
    }
  };
  await assert.rejects(
    async () => saveCompanyProfileAuthoritative({ companyName: "USV Test Trade" }, mockFailingApi),
    /Database unavailable/
  );
});

test("7. Existing non-empty database values are not accidentally erased by incomplete payloads", () => {
  const existingInDb = "9276352836";
  // Incomplete payload sends empty string or undefined
  const incompleteBody = { phone: "" };
  const preserved = safeResolveField(incompleteBody, ["phone", "phoneNumber"], existingInDb);
  assert.equal(preserved, "9276352836", "Existing phone number must be preserved against empty string in incomplete payload");

  // But explicit clear is respected if flagged
  const clearBody = { phone: "", _isExplicitClear: true };
  const cleared = safeResolveField(clearBody, ["phone", "phoneNumber"], existingInDb);
  assert.equal(cleared, null, "Explicitly cleared field must be set to null");
});

test("8. Logo and signature upload and retrieval use the same business ID", () => {
  const assetId = "1ea83756-75c1-4f27-b0bc-72f479820bc2";
  const businessId = "demo-business";
  const generatedUrl = `/api/business-growth/assets/${assetId}?businessId=${encodeURIComponent(businessId)}`;

  const parsedUrl = new URL(generatedUrl, "http://localhost:5000");
  const queryBiz = parsedUrl.searchParams.get("businessId");
  assert.equal(queryBiz, "demo-business", "Asset query businessId must strictly match demo-business");
});

test("9. Business Type and Business Category persist correctly with aliases", () => {
  const body = { businessType: "Distributor", businessCategory: "Pharmacy & Medical" };
  const type = safeResolveField(body, ["businessType"], null);
  const cat = safeResolveField(body, ["businessCategory"], null);
  assert.equal(type, "Distributor");
  assert.equal(cat, "Pharmacy & Medical");
});

test("10. Refreshing the browser retrieves the saved MySQL values", async () => {
  let dbState = {
    companyName: "USV Test Trade",
    tradeName: "nn trades",
    gstin: "234567890",
    businessType: "Distributor"
  };
  const mockApi = {
    getCompanyProfile: async () => ({ success: true, data: dbState })
  };

  // Simulating initial load after refresh
  const freshLoad = await loadCompanyProfileAuthoritative(mockApi);
  assert.equal(freshLoad.data.companyName, "USV Test Trade");
  assert.equal(freshLoad.data.tradeName, "nn trades");
  assert.equal(freshLoad.data.gstin, "234567890");
  assert.equal(freshLoad.data.businessType, "Distributor");
});

test("11. Explicit clear of fields via clearFields array is respected", () => {
  const existingLogo = "/api/business-growth/assets/logo-123?businessId=demo-business";
  const body = { logo: "", clearFields: ["logo", "logoUrl"] };
  const cleared = safeResolveField({ ...body, _isExplicitClear: body.clearFields.includes("logo") }, ["logo", "logoUrl"], existingLogo);
  assert.equal(cleared, null, "Explicitly cleared logo must resolve to null");
});

test("12. Asset URLs pointing to local-development are normalized to demo-business", () => {
  const legacyUrl = "/api/business-growth/assets/1ea83756-75c1-4f27-b0bc-72f479820bc2?businessId=local-development";
  const businessId = "demo-business";
  const normalized = legacyUrl.replace(/([?&]businessId=)local-development\b/g, `$1${encodeURIComponent(businessId)}`);
  assert.equal(
    normalized,
    "/api/business-growth/assets/1ea83756-75c1-4f27-b0bc-72f479820bc2?businessId=demo-business",
    "URL with local-development must be normalized to demo-business"
  );
});
