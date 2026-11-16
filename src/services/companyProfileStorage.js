// Provides the company profile storage application service.
import { settingsDb } from "./databaseRepository.js";
import { isDatabaseMode } from "./dataStorageConfig.js";

const COMPANY_PROFILE_KEY = "ledgerly:companyProfile.v1";
export const companyProfileUpdatedEvent = "ledgerly:company-profile-updated";

const defaultCompanyProfile = {
  companyName: "Sai Kirana Stores",
  businessName: "Sai Kirana Stores",
  phoneNumber: "8369501991",
  gstin: "",
  emailId: "",
  businessType: "",
  businessCategory: "",
  state: "",
  pincode: "",
  businessAddress: "",
  signature: "",
  logo: "",
};

// Checks whether use storage.
function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

// Sanitizes name so 'My Company' placeholder is never returned.
function cleanName(val) {
  if (!val || typeof val !== "string") return "";
  const trimmed = val.trim();
  return trimmed.toLowerCase() === "my company" ? "" : trimmed;
}

// Gets company profile.
export function getCompanyProfile() {
  if (!canUseStorage()) return { ...defaultCompanyProfile };

  try {
    const raw = window.localStorage.getItem(COMPANY_PROFILE_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (!saved || typeof saved !== "object") {
      window.localStorage.setItem(COMPANY_PROFILE_KEY, JSON.stringify(defaultCompanyProfile));
      return { ...defaultCompanyProfile };
    }

    const rawName = cleanName(saved.businessName) || cleanName(saved.companyName) || defaultCompanyProfile.companyName;

    const profile = {
      ...defaultCompanyProfile,
      ...saved,
      companyName: rawName,
      businessName: rawName,
      phoneNumber: saved.phoneNumber || saved.phone || defaultCompanyProfile.phoneNumber,
      phone: saved.phone || saved.phoneNumber || defaultCompanyProfile.phoneNumber,
      emailId: saved.emailId || saved.email || "",
      email: saved.email || saved.emailId || "",
      businessAddress: saved.businessAddress || saved.streetAddress || saved.address || "",
      streetAddress: saved.streetAddress || saved.businessAddress || saved.address || "",
      businessType: saved.businessType || "",
      businessCategory: saved.businessCategory || "",
      signature: saved.signature || saved.signatureUrl || "",
      signatureUrl: saved.signatureUrl || saved.signature || "",
      logo: saved.logo || saved.logoUrl || "",
      logoUrl: saved.logoUrl || saved.logo || "",
    };
    return profile;
  } catch {
    return { ...defaultCompanyProfile };
  }
}

// Saves company profile.
export async function saveCompanyProfile(profile) {
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
  if (nextProfile.logo) nextProfile.logoUrl = nextProfile.logo;
  if (nextProfile.logoUrl && !nextProfile.logo) nextProfile.logo = nextProfile.logoUrl;
  if (nextProfile.signature) nextProfile.signatureUrl = nextProfile.signature;
  if (nextProfile.signatureUrl && !nextProfile.signature) nextProfile.signature = nextProfile.signatureUrl;

  if (canUseStorage()) {
    try {
      window.localStorage.setItem(COMPANY_PROFILE_KEY, JSON.stringify(nextProfile));
    } catch (err) {
      console.warn("Could not save company profile to localStorage:", err);
    }
    window.dispatchEvent(new CustomEvent(companyProfileUpdatedEvent, { detail: nextProfile }));
  }
  if (isDatabaseMode()) {
    try {
      await settingsDb.saveCompanyProfile(nextProfile);
    } catch (err) {
      console.warn("[MySQL] Background company profile sync notice:", err.message);
      throw err;
    }
  }
  return nextProfile;
}

export const companyProfileStorageKey = COMPANY_PROFILE_KEY;
