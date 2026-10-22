import { graphGet, normalizeMetaError } from "./metaOAuthService.js";

const PAGE_BASE_FIELDS = "id,name,category,tasks,access_token";
const BUSINESS_PAGE_FIELDS = "id,name,category";
const PAGE_INSTAGRAM_FIELDS = "instagram_business_account{id,username,name,profile_picture_url},connected_instagram_account{id,username,name,profile_picture_url}";
const AD_ACCOUNT_FIELDS = "id,account_id,name,currency,timezone_name,account_status,business{id,name}";
const BUSINESS_FIELDS = "id,name,verification_status";
const INSTAGRAM_FIELDS = "id,username,name,profile_picture_url";

function addUniqueById(map, item) {
  if (!item?.id) return;
  const existing = map.get(item.id) || {};
  map.set(item.id, {
    ...existing,
    ...item,
    category: item.category || existing.category || "",
    businessId: item.businessId || existing.businessId || "",
    businessName: item.businessName || existing.businessName || "",
    source: existing.source && item.source && existing.source !== item.source ? "user-business" : item.source || existing.source || "",
    tasks: item.tasks?.length ? item.tasks : existing.tasks || [],
    hasPageAccessToken: Boolean(existing.hasPageAccessToken || item.hasPageAccessToken),
    instagramAccountId: item.instagramAccountId || existing.instagramAccountId || "",
    instagramUsername: item.instagramUsername || existing.instagramUsername || "",
  });
}

async function fetchAllEdge(path, accessToken, params = {}) {
  const records = [];
  let payload = await graphGet(path, accessToken, params);
  records.push(...(payload.data || []));

  while (payload.paging?.next) {
    payload = await graphGet(payload.paging.next, accessToken);
    records.push(...(payload.data || []));
  }

  return records;
}

async function safeFetchEdge(path, accessToken, params, warnings, label, options = {}) {
  try {
    return await fetchAllEdge(path, accessToken, params);
  } catch (error) {
    const normalized = normalizeMetaError(error, `${label} fetch failed`);
    if (!options.optional) {
      warnings.push({
        area: label,
        message: normalized.message,
        code: normalized.code,
      });
    }
    return [];
  }
}

async function safeFetchNode(path, accessToken, params, warnings, label, options = {}) {
  try {
    return await graphGet(path, accessToken, params);
  } catch (error) {
    const normalized = normalizeMetaError(error, `${label} fetch failed`);
    if (!options.optional) {
      warnings.push({
        area: label,
        message: normalized.message,
        code: normalized.code,
      });
    }
    return null;
  }
}

function normalizeBusiness(business = {}) {
  return {
    id: business.id,
    name: business.name || "Business Portfolio",
    verificationStatus: business.verification_status || business.verificationStatus || "",
  };
}

function normalizeInstagramAccount(account = {}, page = null) {
  return {
    id: account.id,
    username: account.username || account.name || "Instagram account",
    name: account.name || account.username || "Instagram account",
    profilePictureUrl: account.profile_picture_url || "",
    linkedPageId: page?.id || account.linkedPageId || "",
    linkedPageName: page?.name || account.linkedPageName || "",
    businessId: account.businessId || page?.businessId || "",
  };
}

function normalizePage(page = {}, business = null, source = "") {
  const instagram = page.instagram_business_account || page.connected_instagram_account || null;
  return {
    id: page.id,
    name: page.name || "Facebook Page",
    category: page.category || "",
    tasks: page.tasks || [],
    source,
    businessId: page.businessId || business?.id || "",
    businessName: page.businessName || business?.name || "",
    hasPageAccessToken: Boolean(page.access_token),
    instagramAccountId: instagram?.id || "",
    instagramUsername: instagram?.username || "",
  };
}

function normalizeAdAccount(account = {}) {
  return {
    id: account.id || (account.account_id ? `act_${account.account_id}` : ""),
    accountId: account.account_id || String(account.id || "").replace(/^act_/, ""),
    name: account.name || "Ad Account",
    currency: account.currency || "",
    timezoneName: account.timezone_name || "",
    accountStatus: account.account_status || "",
    businessId: account.business?.id || "",
    businessName: account.business?.name || "",
  };
}

async function enrichPagesWithInstagram(pages, accessToken, warnings, instagramById) {
  await Promise.all(
    pages.map(async (page) => {
      const enriched = await safeFetchNode(
        `/${page.id}`,
        accessToken,
        { fields: PAGE_INSTAGRAM_FIELDS },
        warnings,
        `${page.name || page.id} Instagram link`,
        { optional: true },
      );
      const instagram = enriched?.instagram_business_account || enriched?.connected_instagram_account;
      if (!instagram?.id) return;
      page.instagramAccountId = instagram.id;
      page.instagramUsername = instagram.username || "";
      addUniqueById(instagramById, normalizeInstagramAccount({ ...instagram, businessId: page.businessId }, page));
    }),
  );
}

async function fetchBusinessAssets(business, accessToken, warnings, pagesById, adAccountsById, instagramById) {
  const [ownedPages, clientPages, ownedAdAccounts, clientAdAccounts, instagramAccounts] = await Promise.all([
    safeFetchEdge(`/${business.id}/owned_pages`, accessToken, { fields: BUSINESS_PAGE_FIELDS }, warnings, `${business.name || business.id} owned pages`),
    safeFetchEdge(`/${business.id}/client_pages`, accessToken, { fields: BUSINESS_PAGE_FIELDS }, warnings, `${business.name || business.id} client pages`),
    safeFetchEdge(`/${business.id}/owned_ad_accounts`, accessToken, { fields: AD_ACCOUNT_FIELDS }, warnings, `${business.name || business.id} owned ad accounts`),
    safeFetchEdge(`/${business.id}/client_ad_accounts`, accessToken, { fields: AD_ACCOUNT_FIELDS }, warnings, `${business.name || business.id} client ad accounts`),
    safeFetchEdge(`/${business.id}/instagram_accounts`, accessToken, { fields: INSTAGRAM_FIELDS }, warnings, `${business.name || business.id} Instagram accounts`, { optional: true }),
  ]);

  [...ownedPages, ...clientPages].forEach((page) => {
    addUniqueById(pagesById, normalizePage(page, business, "business"));
  });

  [...ownedAdAccounts, ...clientAdAccounts]
    .map((account) => normalizeAdAccount({ ...account, business: account.business || { id: business.id, name: business.name } }))
    .forEach((account) => addUniqueById(adAccountsById, account));

  instagramAccounts
    .map((account) => normalizeInstagramAccount({ ...account, businessId: business.id }))
    .forEach((account) => addUniqueById(instagramById, account));
}

async function fetchUserAssets(accessToken, warnings, pagesById, adAccountsById) {
  const [pages, userAdAccounts] = await Promise.all([
    safeFetchEdge("/me/accounts", accessToken, { fields: PAGE_BASE_FIELDS }, warnings, "pages"),
    safeFetchEdge("/me/adaccounts", accessToken, { fields: AD_ACCOUNT_FIELDS }, warnings, "ad accounts"),
  ]);

  pages.forEach((page) => addUniqueById(pagesById, normalizePage(page, null, "user")));
  userAdAccounts.map(normalizeAdAccount).forEach((account) => addUniqueById(adAccountsById, account));
}

export async function fetchMetaAssets(accessToken, options = {}) {
  const warnings = [];
  const businessesById = new Map();
  const pagesById = new Map();
  const instagramById = new Map();
  const adAccountsById = new Map();
  const selectedBusinessId = options.businessId || "";

  const businesses = await safeFetchEdge(
    "/me/businesses",
    accessToken,
    { fields: BUSINESS_FIELDS },
    warnings,
    "businesses",
  );

  businesses.map(normalizeBusiness).forEach((business) => addUniqueById(businessesById, business));
  const normalizedBusinesses = Array.from(businessesById.values());
  const selectedBusiness = normalizedBusinesses.find((business) => business.id === selectedBusinessId);

  if (selectedBusiness) {
    await Promise.all([
      fetchUserAssets(accessToken, warnings, pagesById, adAccountsById),
      fetchBusinessAssets(selectedBusiness, accessToken, warnings, pagesById, adAccountsById, instagramById),
    ]);
  } else {
    await Promise.all([
      fetchUserAssets(accessToken, warnings, pagesById, adAccountsById),
      ...normalizedBusinesses.map((business) => fetchBusinessAssets(business, accessToken, warnings, pagesById, adAccountsById, instagramById)),
    ]);
  }

  const normalizedPages = Array.from(pagesById.values());
  await enrichPagesWithInstagram(normalizedPages, accessToken, warnings, instagramById);

  return {
    businesses: normalizedBusinesses,
    pages: normalizedPages,
    instagramAccounts: Array.from(instagramById.values()),
    adAccounts: Array.from(adAccountsById.values()),
    warnings,
    selectedBusinessId: selectedBusiness?.id || "",
    fetchedAt: new Date().toISOString(),
  };
}
