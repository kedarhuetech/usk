// Provides the company profile storage application service.
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
      signature: saved.signature || "",
    };
    return profile;
  } catch {
    return { ...defaultCompanyProfile };
  }
}

// Saves company profile.
export function saveCompanyProfile(profile) {
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

  if (canUseStorage()) {
    window.localStorage.setItem(COMPANY_PROFILE_KEY, JSON.stringify(nextProfile));
    window.dispatchEvent(new CustomEvent(companyProfileUpdatedEvent, { detail: nextProfile }));
  }
  return nextProfile;
}

export const companyProfileStorageKey = COMPANY_PROFILE_KEY;
