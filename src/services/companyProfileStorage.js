// Provides the company profile storage application service.
import { settingsDb } from "./databaseRepository.js";
import { isDatabaseMode } from "./dataStorageConfig.js";
import { getScopedStorageKey } from "../config/businessConfig.js";

const COMPANY_PROFILE_KEY = "ledgerly:companyProfile.v1";
export const companyProfileUpdatedEvent = "ledgerly:company-profile-updated";

const defaultCompanyProfile = {
  companyName: "",
  businessName: "",
  tradeName: "",
  phoneNumber: "",
  phone: "",
  gstin: "",
  pan: "",
  emailId: "",
  email: "",
  businessType: "",
  businessCategory: "",
  state: "",
  city: "",
  pincode: "",
  country: "India",
  businessAddress: "",
  streetAddress: "",
  bankName: "",
  accountNumber: "",
  ifscCode: "",
  branchName: "",
  upiId: "",
  termsAndConditions: "",
  signature: "",
  signatureUrl: "",
  logo: "",
  logoUrl: "",
};

// Checks whether use storage.
function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

// Sanitizes name so 'My Company' or default placeholder is never returned.
function cleanName(val) {
  if (!val || typeof val !== "string") return "";
  const trimmed = val.trim();
  const lower = trimmed.toLowerCase();
  return lower === "my company" || lower === "sai kirana stores" ? "" : trimmed;
}

// Sanitizes phone so placeholder is never returned.
function cleanPhone(val) {
  if (!val || typeof val !== "string") return "";
  const trimmed = val.trim();
  return trimmed === "8369501991" ? "" : trimmed;
}

// Normalizes raw company profile record with aliases and safe fallbacks
export function normalizeCompanyProfile(saved) {
  if (!saved || typeof saved !== "object") return { ...defaultCompanyProfile };
  const rawName = cleanName(saved.businessName) || cleanName(saved.companyName) || "";
  const rawPhone = cleanPhone(saved.phoneNumber) || cleanPhone(saved.phone) || "";
  const bDetails = (saved && typeof saved.bankDetails === "object") ? saved.bankDetails : {};

  return {
    ...defaultCompanyProfile,
    ...saved,
    companyName: rawName,
    businessName: rawName,
    tradeName: saved.tradeName || "",
    phoneNumber: rawPhone,
    phone: rawPhone,
    emailId: saved.emailId || saved.email || "",
    email: saved.email || saved.emailId || "",
    gstin: saved.gstin || "",
    pan: saved.pan || "",
    businessAddress: saved.businessAddress || saved.streetAddress || saved.address || "",
    streetAddress: saved.streetAddress || saved.businessAddress || saved.address || "",
    city: saved.city || "",
    state: saved.state || "",
    pincode: saved.pincode || "",
    country: saved.country || "India",
    businessType: saved.businessType || "",
    businessCategory: saved.businessCategory || "",
    bankName: saved.bankName || bDetails.bankName || "",
    accountNumber: saved.accountNumber || bDetails.accountNumber || "",
    ifscCode: saved.ifscCode || bDetails.ifscCode || "",
    branchName: saved.branchName || bDetails.branchName || "",
    upiId: saved.upiId || bDetails.upiId || "",
    termsAndConditions: saved.termsAndConditions || "",
    signature: saved.signature || saved.signatureUrl || "",
    signatureUrl: saved.signatureUrl || saved.signature || "",
    logo: saved.logo || saved.logoUrl || "",
    logoUrl: saved.logoUrl || saved.logo || "",
    bankDetails: {
      bankName: saved.bankName || bDetails.bankName || "",
      accountNumber: saved.accountNumber || bDetails.accountNumber || "",
      ifscCode: saved.ifscCode || bDetails.ifscCode || "",
      branchName: saved.branchName || bDetails.branchName || "",
      upiId: saved.upiId || bDetails.upiId || "",
    },
  };
}

// Authoritatively loads company profile from MySQL database, updating scoped cache on success.
export async function loadAuthoritativeCompanyProfile() {
  const profile = await settingsDb.getCompanyProfile();
  if (!profile || typeof profile !== "object") {
    throw new Error("Invalid response received from database.");
  }
  const normalized = normalizeCompanyProfile(profile);
  if (canUseStorage()) {
    try {
      const key = getScopedStorageKey(COMPANY_PROFILE_KEY);
      window.localStorage.setItem(key, JSON.stringify(normalized));
    } catch {}
  }
  return normalized;
}

// Synchronously gets cached company profile.
export function getCompanyProfile() {
  if (!canUseStorage()) return { ...defaultCompanyProfile };

  try {
    const scopedKey = getScopedStorageKey(COMPANY_PROFILE_KEY);
    const raw = window.localStorage.getItem(scopedKey) || window.localStorage.getItem(COMPANY_PROFILE_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (!saved || typeof saved !== "object") {
      return { ...defaultCompanyProfile };
    }
    return normalizeCompanyProfile(saved);
  } catch {
    return { ...defaultCompanyProfile };
  }
}

// Saves company profile directly to MySQL database and updates cache upon success.
export async function saveCompanyProfile(profile, options = {}) {
  const current = getCompanyProfile();
  const nextProfile = {
    ...current,
    ...profile,
  };

  if (profile.businessName !== undefined) {
    nextProfile.companyName = profile.businessName;
  } else if (profile.companyName !== undefined && profile.businessName === undefined) {
    nextProfile.businessName = profile.companyName;
  }

  // Keep aliases in sync without resurrecting empty values
  if (profile.phoneNumber !== undefined) {
    nextProfile.phone = profile.phoneNumber;
    nextProfile.phoneNumber = profile.phoneNumber;
  } else if (profile.phone !== undefined) {
    nextProfile.phoneNumber = profile.phone;
    nextProfile.phone = profile.phone;
  }

  if (profile.emailId !== undefined) {
    nextProfile.email = profile.emailId;
    nextProfile.emailId = profile.emailId;
  } else if (profile.email !== undefined) {
    nextProfile.emailId = profile.email;
    nextProfile.email = profile.email;
  }

  if (profile.businessAddress !== undefined) {
    nextProfile.streetAddress = profile.businessAddress;
    nextProfile.businessAddress = profile.businessAddress;
    nextProfile.address = profile.businessAddress;
  } else if (profile.streetAddress !== undefined) {
    nextProfile.businessAddress = profile.streetAddress;
    nextProfile.streetAddress = profile.streetAddress;
    nextProfile.address = profile.streetAddress;
  }

  if (profile.logo !== undefined) {
    nextProfile.logoUrl = profile.logo;
    nextProfile.logo = profile.logo;
  } else if (profile.logoUrl !== undefined) {
    nextProfile.logo = profile.logoUrl;
    nextProfile.logoUrl = profile.logoUrl;
  }

  if (profile.signature !== undefined) {
    nextProfile.signatureUrl = profile.signature;
    nextProfile.signature = profile.signature;
  } else if (profile.signatureUrl !== undefined) {
    nextProfile.signature = profile.signatureUrl;
    nextProfile.signatureUrl = profile.signatureUrl;
  }

  // Keep bank details in sync without resurrecting empty values via || fallback
  const bDetails = (profile.bankDetails && typeof profile.bankDetails === "object") ? profile.bankDetails : {};

  const bankName = profile.bankName !== undefined
    ? profile.bankName
    : (bDetails.bankName !== undefined ? bDetails.bankName : (nextProfile.bankName ?? ""));
  const accountNumber = profile.accountNumber !== undefined
    ? profile.accountNumber
    : (bDetails.accountNumber !== undefined ? bDetails.accountNumber : (nextProfile.accountNumber ?? ""));
  const ifscCode = profile.ifscCode !== undefined
    ? profile.ifscCode
    : (bDetails.ifscCode !== undefined ? bDetails.ifscCode : (nextProfile.ifscCode ?? ""));
  const branchName = profile.branchName !== undefined
    ? profile.branchName
    : (bDetails.branchName !== undefined ? bDetails.branchName : (nextProfile.branchName ?? ""));
  const upiId = profile.upiId !== undefined
    ? profile.upiId
    : (bDetails.upiId !== undefined ? bDetails.upiId : (nextProfile.upiId ?? ""));

  nextProfile.bankName = bankName;
  nextProfile.accountNumber = accountNumber;
  nextProfile.ifscCode = ifscCode;
  nextProfile.branchName = branchName;
  nextProfile.upiId = upiId;
  nextProfile.bankDetails = { bankName, accountNumber, ifscCode, branchName, upiId };

  if (options.clearFields) {
    nextProfile.clearFields = options.clearFields;
  }
  if (options._isExplicitClear) {
    nextProfile._isExplicitClear = true;
  }

  // Authoritative Persistence: MySQL must confirm first before updating cache
  await settingsDb.saveCompanyProfile(nextProfile);

  if (canUseStorage()) {
    try {
      const key = getScopedStorageKey(COMPANY_PROFILE_KEY);
      window.localStorage.setItem(key, JSON.stringify(nextProfile));
    } catch (err) {
      console.warn("Could not cache company profile to localStorage:", err);
    }
    window.dispatchEvent(new CustomEvent(companyProfileUpdatedEvent, { detail: nextProfile }));
  }

  return nextProfile;
}

export const companyProfileStorageKey = COMPANY_PROFILE_KEY;
