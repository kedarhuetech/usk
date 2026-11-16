import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Isolated unit tests for the exact partial-update resolution logic in settingsRouter.js
 */
function resolveProfileUpdates(body, existing, persistBase64AssetMock = (v) => v) {
  const hasOwn = (obj, key) => Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key));

  const resolveField = (aliases, existingValue) => {
    const presentAlias = aliases.find((key) => hasOwn(body, key));
    if (presentAlias !== undefined) {
      const definedAlias = aliases.find((key) => hasOwn(body, key) && body[key] !== undefined) ?? presentAlias;
      const raw = body[definedAlias];
      if (raw == null) return null;
      const str = String(raw).trim();
      return str === "" ? null : str;
    }
    return existingValue ?? null;
  };

  const resolveBankField = (fieldName, existingValue) => {
    const bankDetails = body.bankDetails;
    const hasRoot = hasOwn(body, fieldName);
    const hasNested = Boolean(bankDetails && typeof bankDetails === "object" && hasOwn(bankDetails, fieldName));

    if (hasRoot || hasNested) {
      let raw;
      if (hasRoot && body[fieldName] !== undefined) {
        raw = body[fieldName];
      } else if (hasNested && bankDetails[fieldName] !== undefined) {
        raw = bankDetails[fieldName];
      } else if (hasRoot) {
        raw = body[fieldName];
      } else {
        raw = bankDetails[fieldName];
      }
      if (raw == null) return null;
      const str = String(raw).trim();
      return str === "" ? null : str;
    }
    return existingValue ?? null;
  };

  // Business Name / Company Name (NOT NULL)
  let companyName;
  const hasCompanyName = hasOwn(body, "companyName") || hasOwn(body, "businessName");
  if (hasCompanyName) {
    const raw = (hasOwn(body, "companyName") && body.companyName !== undefined)
      ? body.companyName
      : body.businessName;
    const trimmed = raw != null ? String(raw).trim() : "";
    companyName = trimmed || (existing?.company_name || "Sai Kirana Stores");
  } else {
    companyName = existing?.company_name || "Sai Kirana Stores";
  }

  const tradeName = resolveField(["tradeName"], existing?.trade_name);
  const businessType = resolveField(["businessType"], existing?.business_type);
  const businessCategory = resolveField(["businessCategory"], existing?.business_category);

  const phone = resolveField(["phone", "phoneNumber"], existing?.phone);
  const email = resolveField(["email", "emailId"], existing?.email);
  const gstin = resolveField(["gstin"], existing?.gstin);
  const pan = resolveField(["pan"], existing?.pan);

  const streetAddress = resolveField(["streetAddress", "businessAddress", "address"], existing?.street_address);
  const city = resolveField(["city"], existing?.city);
  const state = resolveField(["state"], existing?.state);
  const pincode = resolveField(["pincode"], existing?.pincode);

  let country;
  if (hasOwn(body, "country")) {
    country = body.country != null && String(body.country).trim() !== "" ? String(body.country).trim() : "India";
  } else {
    country = existing?.country || "India";
  }

  const bankName = resolveBankField("bankName", existing?.bank_name);
  const accountNumber = resolveBankField("accountNumber", existing?.account_number);
  const ifscCode = resolveBankField("ifscCode", existing?.ifsc_code);
  const branchName = resolveBankField("branchName", existing?.branch_name);
  const upiId = resolveBankField("upiId", existing?.upi_id);

  let signatureUrl;
  const hasSignature = hasOwn(body, "signatureUrl") || hasOwn(body, "signature");
  if (hasSignature) {
    const rawSig = (hasOwn(body, "signatureUrl") && body.signatureUrl !== undefined)
      ? body.signatureUrl
      : body.signature;
    if (rawSig == null || String(rawSig).trim() === "") {
      signatureUrl = null;
    } else if (typeof rawSig === "string" && rawSig.startsWith("data:image/")) {
      signatureUrl = persistBase64AssetMock(rawSig);
    } else {
      signatureUrl = String(rawSig).trim();
    }
  } else {
    signatureUrl = existing ? existing.signature_url : null;
  }

  let logoUrl;
  const hasLogo = hasOwn(body, "logoUrl") || hasOwn(body, "logo");
  if (hasLogo) {
    const rawLogo = (hasOwn(body, "logoUrl") && body.logoUrl !== undefined)
      ? body.logoUrl
      : body.logo;
    if (rawLogo == null || String(rawLogo).trim() === "") {
      logoUrl = null;
    } else if (typeof rawLogo === "string" && rawLogo.startsWith("data:image/")) {
      logoUrl = persistBase64AssetMock(rawLogo);
    } else {
      logoUrl = String(rawLogo).trim();
    }
  } else {
    logoUrl = existing ? existing.logo_url : null;
  }

  const termsAndConditions = resolveField(["termsAndConditions"], existing?.terms_and_conditions);

  return {
    companyName, tradeName, businessType, businessCategory,
    phone, email, gstin, pan,
    streetAddress, city, state, pincode, country,
    bankName, accountNumber, ifscCode, branchName, upiId,
    signatureUrl, logoUrl, termsAndConditions
  };
}

const mockExistingProfile = {
  company_name: "Original Store Name",
  trade_name: "Original Trade",
  business_type: "Retail",
  business_category: "Kirana / Grocery",
  phone: "9876543210",
  email: "store@example.com",
  gstin: "27AAAAA0000A1Z5",
  pan: "AAAAA0000A",
  street_address: "123 Main St",
  city: "Mumbai",
  state: "Maharashtra",
  pincode: "400001",
  country: "India",
  bank_name: "HDFC Bank",
  account_number: "50200012345678",
  ifsc_code: "HDFC0001234",
  branch_name: "Andheri",
  upi_id: "store@upi",
  signature_url: "/api/assets/sig-123",
  logo_url: "/api/assets/logo-123",
  terms_and_conditions: "All sales final."
};

test("Case 1: Existing value + omitted field = existing value preserved", () => {
  // Only updating phone and email; all other fields omitted
  const body = {
    phoneNumber: "9123456780",
    emailId: "newemail@example.com"
  };

  const resolved = resolveProfileUpdates(body, mockExistingProfile);

  assert.equal(resolved.phone, "9123456780", "Phone should update");
  assert.equal(resolved.email, "newemail@example.com", "Email should update");
  // Omitted fields must be preserved
  assert.equal(resolved.companyName, "Original Store Name");
  assert.equal(resolved.tradeName, "Original Trade");
  assert.equal(resolved.businessType, "Retail");
  assert.equal(resolved.businessCategory, "Kirana / Grocery");
  assert.equal(resolved.gstin, "27AAAAA0000A1Z5");
  assert.equal(resolved.pan, "AAAAA0000A");
  assert.equal(resolved.streetAddress, "123 Main St");
  assert.equal(resolved.city, "Mumbai");
  assert.equal(resolved.state, "Maharashtra");
  assert.equal(resolved.pincode, "400001");
  assert.equal(resolved.bankName, "HDFC Bank");
  assert.equal(resolved.accountNumber, "50200012345678");
  assert.equal(resolved.logoUrl, "/api/assets/logo-123");
  assert.equal(resolved.signatureUrl, "/api/assets/sig-123");
});

test("Case 2: Existing value + explicit empty string = cleared (NULL)", () => {
  const body = {
    gstin: "",
    tradeName: "   ",
    city: ""
  };

  const resolved = resolveProfileUpdates(body, mockExistingProfile);

  assert.equal(resolved.gstin, null, "Explicit empty GSTIN must clear to NULL");
  assert.equal(resolved.tradeName, null, "Whitespace-only trade name must clear to NULL");
  assert.equal(resolved.city, null, "Explicit empty city must clear to NULL");
  // Non-mentioned fields must remain preserved
  assert.equal(resolved.pan, "AAAAA0000A");
  assert.equal(resolved.phone, "9876543210");
});

test("Case 3: Existing value + explicit null = cleared (NULL)", () => {
  const body = {
    pan: null,
    bankName: null,
    logoUrl: null
  };

  const resolved = resolveProfileUpdates(body, mockExistingProfile);

  assert.equal(resolved.pan, null, "Explicit null PAN must clear to NULL");
  assert.equal(resolved.bankName, null, "Explicit null bank name must clear to NULL");
  assert.equal(resolved.logoUrl, null, "Explicit null logo must clear to NULL");
  // Untouched fields must remain preserved
  assert.equal(resolved.signatureUrl, "/api/assets/sig-123");
  assert.equal(resolved.gstin, "27AAAAA0000A1Z5");
});

test("Case 4: Existing value + new value = updated", () => {
  const body = {
    businessName: "Updated Business Name",
    gstin: "27BBBBB1111B2Z6",
    state: "Gujarat",
    pincode: "380001",
    bankDetails: {
      bankName: "State Bank of India",
      accountNumber: "112233445566"
    }
  };

  const resolved = resolveProfileUpdates(body, mockExistingProfile);

  assert.equal(resolved.companyName, "Updated Business Name");
  assert.equal(resolved.gstin, "27BBBBB1111B2Z6");
  assert.equal(resolved.state, "Gujarat");
  assert.equal(resolved.pincode, "380001");
  assert.equal(resolved.bankName, "State Bank of India");
  assert.equal(resolved.accountNumber, "112233445566");
  // Untouched fields preserved
  assert.equal(resolved.phone, "9876543210");
  assert.equal(resolved.ifscCode, "HDFC0001234");
});

test("Case 5: New profile + omitted optional field = NULL", () => {
  const body = {
    companyName: "Brand New Company",
    phone: "9000000001"
  };

  const resolved = resolveProfileUpdates(body, null);

  assert.equal(resolved.companyName, "Brand New Company");
  assert.equal(resolved.phone, "9000000001");
  assert.equal(resolved.country, "India", "Country defaults to India");
  // All omitted optional fields must be NULL for a brand new profile
  assert.equal(resolved.tradeName, null);
  assert.equal(resolved.businessType, null);
  assert.equal(resolved.businessCategory, null);
  assert.equal(resolved.email, null);
  assert.equal(resolved.gstin, null);
  assert.equal(resolved.pan, null);
  assert.equal(resolved.streetAddress, null);
  assert.equal(resolved.city, null);
  assert.equal(resolved.state, null);
  assert.equal(resolved.pincode, null);
  assert.equal(resolved.bankName, null);
  assert.equal(resolved.logoUrl, null);
  assert.equal(resolved.signatureUrl, null);
  assert.equal(resolved.termsAndConditions, null);
});

test("Case 6: Frontend aliases are handled correctly without overriding supplied aliases", () => {
  // Test alias precedence: phone vs phoneNumber
  const body1 = { phoneNumber: "9811111111" };
  const res1 = resolveProfileUpdates(body1, mockExistingProfile);
  assert.equal(res1.phone, "9811111111");

  // Test address aliases: streetAddress vs businessAddress
  const body2 = { businessAddress: "New Plaza, Sector 5" };
  const res2 = resolveProfileUpdates(body2, mockExistingProfile);
  assert.equal(res2.streetAddress, "New Plaza, Sector 5");

  // Test logo aliases: logo vs logoUrl
  const body3 = { logo: "/api/assets/new-logo.png" };
  const res3 = resolveProfileUpdates(body3, mockExistingProfile);
  assert.equal(res3.logoUrl, "/api/assets/new-logo.png");

  // Test signature aliases: signature vs signatureUrl
  const body4 = { signature: "/api/assets/new-sig.png" };
  const res4 = resolveProfileUpdates(body4, mockExistingProfile);
  assert.equal(res4.signatureUrl, "/api/assets/new-sig.png");
});
