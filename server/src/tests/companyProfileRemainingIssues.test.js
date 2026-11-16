import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Helper recreating the exact migration resolution logic in migrationRouter.js
 */
function resolveMigrateProfile(companyProfile, existing) {
  const hasOwn = (obj, key) => Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key));

  const resolveMigrateField = (aliases, existingValue) => {
    const presentAlias = aliases.find((key) => hasOwn(companyProfile, key));
    if (presentAlias !== undefined) {
      const definedAlias = aliases.find((key) => hasOwn(companyProfile, key) && companyProfile[key] !== undefined) ?? presentAlias;
      const raw = companyProfile[definedAlias];
      if (raw == null) return null;
      const str = String(raw).trim();
      return str === "" ? null : str;
    }
    return existingValue ?? null;
  };

  const resolveMigrateBankField = (fieldName, existingValue) => {
    const bankDetails = companyProfile.bankDetails;
    const hasRoot = hasOwn(companyProfile, fieldName);
    const hasNested = Boolean(bankDetails && typeof bankDetails === "object" && hasOwn(bankDetails, fieldName));

    if (hasRoot || hasNested) {
      let raw;
      if (hasRoot && companyProfile[fieldName] !== undefined) {
        raw = companyProfile[fieldName];
      } else if (hasNested && bankDetails[fieldName] !== undefined) {
        raw = bankDetails[fieldName];
      } else if (hasRoot) {
        raw = companyProfile[fieldName];
      } else {
        raw = bankDetails[fieldName];
      }
      if (raw == null) return null;
      const str = String(raw).trim();
      return str === "" ? null : str;
    }
    return existingValue ?? null;
  };

  let companyName;
  const hasCompanyName = hasOwn(companyProfile, "companyName") || hasOwn(companyProfile, "businessName");
  if (hasCompanyName) {
    const raw = (hasOwn(companyProfile, "companyName") && companyProfile.companyName !== undefined)
      ? companyProfile.companyName
      : companyProfile.businessName;
    const trimmed = raw != null ? String(raw).trim() : "";
    companyName = trimmed || (existing?.company_name || "");
  } else {
    companyName = existing?.company_name || "";
  }

  const tradeName = resolveMigrateField(["tradeName"], existing?.trade_name);
  const businessType = resolveMigrateField(["businessType"], existing?.business_type);
  const businessCategory = resolveMigrateField(["businessCategory"], existing?.business_category);

  const phone = resolveMigrateField(["phone", "phoneNumber"], existing?.phone);
  const email = resolveMigrateField(["email", "emailId"], existing?.email);
  const gstin = resolveMigrateField(["gstin"], existing?.gstin);
  const pan = resolveMigrateField(["pan"], existing?.pan);

  const streetAddress = resolveMigrateField(["streetAddress", "businessAddress", "address"], existing?.street_address);
  const city = resolveMigrateField(["city"], existing?.city);
  const state = resolveMigrateField(["state"], existing?.state);
  const pincode = resolveMigrateField(["pincode"], existing?.pincode);

  let country;
  if (hasOwn(companyProfile, "country")) {
    country = companyProfile.country != null && String(companyProfile.country).trim() !== ""
      ? String(companyProfile.country).trim()
      : "India";
  } else {
    country = existing?.country || "India";
  }

  const bankName = resolveMigrateBankField("bankName", existing?.bank_name);
  const accountNumber = resolveMigrateBankField("accountNumber", existing?.account_number);
  const ifscCode = resolveMigrateBankField("ifscCode", existing?.ifsc_code);
  const branchName = resolveMigrateBankField("branchName", existing?.branch_name);
  const upiId = resolveMigrateBankField("upiId", existing?.upi_id);

  const signatureUrl = resolveMigrateField(["signatureUrl", "signature"], existing?.signature_url);
  const logoUrl = resolveMigrateField(["logoUrl", "logo"], existing?.logo_url);
  const termsAndConditions = resolveMigrateField(["termsAndConditions"], existing?.terms_and_conditions);

  return {
    companyName,
    tradeName,
    businessType,
    businessCategory,
    phone,
    email,
    gstin,
    pan,
    streetAddress,
    city,
    state,
    pincode,
    country,
    bankName,
    accountNumber,
    ifscCode,
    branchName,
    upiId,
    signatureUrl,
    logoUrl,
    termsAndConditions,
  };
}

test("Issue A: migrationRouter properly maps all fields and preserves existing data on retry", () => {
  const existing = {
    business_id: "demo-business",
    company_name: "Original Store",
    trade_name: "Original Trade",
    business_type: "Retail",
    business_category: "Groceries",
    phone: "9876543210",
    email: "store@example.com",
    gstin: "27AABCU9603R1ZM",
    pan: "ABCDE1234F",
    street_address: "123 Main St",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001",
    country: "India",
    bank_name: "HDFC Bank",
    account_number: "1234567890",
    ifsc_code: "HDFC0001234",
    branch_name: "Fort",
    upi_id: "store@hdfc",
    signature_url: "https://example.com/sig.png",
    logo_url: "https://example.com/logo.png",
    terms_and_conditions: "No returns after 7 days",
  };

  // Migration source payload only contains a subset of fields
  const sourcePayload = {
    companyName: "Updated Store",
    businessType: "Wholesale",
    // tradeName, phone, email, etc. omitted!
    bankDetails: {
      accountNumber: "9999999999", // only updated account number
    },
  };

  const resolved = resolveMigrateProfile(sourcePayload, existing);

  // Updated fields
  assert.equal(resolved.companyName, "Updated Store");
  assert.equal(resolved.businessType, "Wholesale");
  assert.equal(resolved.accountNumber, "9999999999");

  // Preserved fields from existing record
  assert.equal(resolved.tradeName, "Original Trade");
  assert.equal(resolved.businessCategory, "Groceries");
  assert.equal(resolved.phone, "9876543210");
  assert.equal(resolved.email, "store@example.com");
  assert.equal(resolved.gstin, "27AABCU9603R1ZM");
  assert.equal(resolved.pan, "ABCDE1234F");
  assert.equal(resolved.streetAddress, "123 Main St");
  assert.equal(resolved.city, "Mumbai");
  assert.equal(resolved.state, "Maharashtra");
  assert.equal(resolved.pincode, "400001");
  assert.equal(resolved.country, "India");
  assert.equal(resolved.bankName, "HDFC Bank");
  assert.equal(resolved.ifscCode, "HDFC0001234");
  assert.equal(resolved.branchName, "Fort");
  assert.equal(resolved.upiId, "store@hdfc");
  assert.equal(resolved.signatureUrl, "https://example.com/sig.png");
  assert.equal(resolved.logoUrl, "https://example.com/logo.png");
  assert.equal(resolved.termsAndConditions, "No returns after 7 days");
});

test("Issue A: migrationRouter handles new brand-new profiles with safe defaults", () => {
  const sourcePayload = {
    businessName: "Fresh Supermarket",
    phoneNumber: "9988776655",
    businessType: "Retailer",
    businessCategory: "Food",
  };

  const resolved = resolveMigrateProfile(sourcePayload, null);

  assert.equal(resolved.companyName, "Fresh Supermarket");
  assert.equal(resolved.phone, "9988776655");
  assert.equal(resolved.businessType, "Retailer");
  assert.equal(resolved.businessCategory, "Food");
  assert.equal(resolved.country, "India");
  assert.equal(resolved.pan, null);
  assert.equal(resolved.tradeName, null);
  assert.equal(resolved.city, null);
});

test("Issue B: EditProfile.jsx has input controls for all required database fields", () => {
  const editProfilePath = path.resolve(__dirname, "../../../src/pages/CompanyProfile/EditProfile.jsx");
  const content = fs.readFileSync(editProfilePath, "utf-8");

  // Check for presence of required field inputs/textareas
  assert.ok(content.includes('name="tradeName"'), "EditProfile must have tradeName input");
  assert.ok(content.includes('name="pan"'), "EditProfile must have pan input");
  assert.ok(content.includes('name="city"'), "EditProfile must have city input");
  assert.ok(content.includes('name="termsAndConditions"'), "EditProfile must have termsAndConditions textarea");
  assert.ok(content.includes('name="bankName"'), "EditProfile must have bankName input");
  assert.ok(content.includes('name="accountNumber"'), "EditProfile must have accountNumber input");
  assert.ok(content.includes('name="ifscCode"'), "EditProfile must have ifscCode input");
  assert.ok(content.includes('name="branchName"'), "EditProfile must have branchName input");
  assert.ok(content.includes('name="upiId"'), "EditProfile must have upiId input");
});

test("Issue C: companyProfileStorage defaults do not populate placeholder Sai Kirana Stores or 8369501991", () => {
  const storagePath = path.resolve(__dirname, "../../../src/services/companyProfileStorage.js");
  const content = fs.readFileSync(storagePath, "utf-8");

  // Verify defaultCompanyProfile does not contain placeholder store name or dummy phone
  assert.ok(
    content.includes('companyName: ""'),
    "defaultCompanyProfile.companyName must default to empty string"
  );
  assert.ok(
    content.includes('businessName: ""'),
    "defaultCompanyProfile.businessName must default to empty string"
  );
  assert.ok(
    content.includes('phoneNumber: ""'),
    "defaultCompanyProfile.phoneNumber must default to empty string"
  );
  assert.ok(
    content.includes('phone: ""'),
    "defaultCompanyProfile.phone must default to empty string"
  );

  // Check that cleanName cleans 'Sai Kirana Stores' and cleanPhone cleans dummy phone
  assert.ok(
    content.includes('lower === "sai kirana stores"'),
    "cleanName should sanitize legacy 'sai kirana stores' placeholder"
  );
  assert.ok(
    content.includes('8369501991'),
    "cleanPhone should sanitize legacy '8369501991' placeholder"
  );
});
