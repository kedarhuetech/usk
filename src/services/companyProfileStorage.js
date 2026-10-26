const COMPANY_PROFILE_KEY = "ledgerly:companyProfile.v1";
const defaultCompanyProfile = {
  companyName: "My Company",
};

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function getCompanyProfile() {
  if (!canUseStorage()) return { ...defaultCompanyProfile };

  try {
    const raw = window.localStorage.getItem(COMPANY_PROFILE_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    const profile = {
      ...defaultCompanyProfile,
      ...(saved && typeof saved === "object" ? saved : {}),
    };
    if (!raw) {
      window.localStorage.setItem(COMPANY_PROFILE_KEY, JSON.stringify(profile));
    }
    return profile;
  } catch {
    return { ...defaultCompanyProfile };
  }
}

export function saveCompanyProfile(profile) {
  const nextProfile = {
    ...getCompanyProfile(),
    ...profile,
  };
  if (canUseStorage()) {
    window.localStorage.setItem(COMPANY_PROFILE_KEY, JSON.stringify(nextProfile));
  }
  return nextProfile;
}

export const companyProfileStorageKey = COMPANY_PROFILE_KEY;
