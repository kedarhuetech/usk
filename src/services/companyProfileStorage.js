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

  if (profile.businessName) {
    nextProfile.companyName = profile.businessName;
  } else if (profile.companyName && !profile.businessName) {
    nextProfile.businessName = profile.companyName;
  }

  // Keep aliases in sync
  if (nextProfile.phone) nextProfile.phoneNumber = nextProfile.phone;
  if (nextProfile.phoneNumber && !nextProfile.phone) nextProfile.phone = nextProfile.phoneNumber;

  if (nextProfile.email) nextProfile.emailId = nextProfile.email;
  if (nextProfile.emailId && !nextProfile.email) nextProfile.email = nextProfile.emailId;

  if (nextProfile.businessAddress) nextProfile.streetAddress = nextProfile.businessAddress;
  if (nextProfile.streetAddress && !nextProfile.businessAddress) nextProfile.businessAddress = nextProfile.streetAddress;

  if (nextProfile.logo) nextProfile.logoUrl = nextProfile.logo;
  if (nextProfile.logoUrl && !nextProfile.logo) nextProfile.logo = nextProfile.logoUrl;
  if (nextProfile.signature) nextProfile.signatureUrl = nextProfile.signature;
  if (nextProfile.signatureUrl && !nextProfile.signature) nextProfile.signature = nextProfile.signatureUrl;

  // Keep bank details in sync
  const bDetails = nextProfile.bankDetails || {};
  const bankName = nextProfile.bankName || bDetails.bankName || "";
  const accountNumber = nextProfile.accountNumber || bDetails.accountNumber || "";
  const ifscCode = nextProfile.ifscCode || bDetails.ifscCode || "";
  const branchName = nextProfile.branchName || bDetails.branchName || "";
  const upiId = nextProfile.upiId || bDetails.upiId || "";

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
