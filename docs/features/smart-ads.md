# Smart Ads

## Purpose

- Smart Ads lets a business prepare Meta/Facebook ad campaigns from uploaded creatives, uploaded videos, Marketing Studio designs, or existing inventory item images.
- The current frontend/demo version supports dashboard, 5-step ad creation, real Meta OAuth, real asset discovery, and real paused Meta image/video object publishing.
- Live account Insights reads are implemented; durable database persistence and final production delivery verification remain future work.

## Current User Flow

Smart Ads Dashboard -> Connect Meta -> Meta OAuth -> Fetch Business/Page/Instagram/Ad Account assets -> Select assets -> Create Ad -> Ad Details -> Creative -> Audience -> Budget & Schedule -> Review -> Save Draft / Create Campaign -> Campaign Dashboard.

## Persistence and Campaign Management

- Smart Ads UI calls the repository functions in `src/services/smartAdsStorage.js`; components do not read or write browser storage directly.
- The current repository uses a business-scoped `usk.smartAds.v1` LocalStorage record for drafts, local campaign references, selected non-sensitive Meta asset IDs, and Meta Insights snapshots. Meta access tokens and app secrets remain server-side.
- Existing backend campaign rows are imported once when the local campaign collection is empty. This preserves the previous data path during the move to browser drafts.
- Draft updates keep a stable ID, wizard step, creation time, selected asset references, and all serializable campaign form fields. Browser video `File` objects cannot be restored; users must reselect the video after reopening a draft.
- To migrate to MySQL later, keep the repository method contract (`getSmartAdsCampaigns`, `getSmartAdsCampaignById`, `saveDraft`, `updateDraft`, `deleteSmartAdsCampaign`, settings, and metrics snapshot methods) and replace its LocalStorage implementation with API calls. No schema or database changes are included here.
- Meta's actual account campaign list is fetched separately from USV drafts. Status changes are sent to Meta and confirmed before the interface changes. Insights are sourced from Meta and cached locally only as snapshots.
- Billing eligibility shows Meta's account status and reports a funding-source signal only when Meta returns it. The API response cannot establish from an empty field that no payment method exists.
- Publishing from this flow first creates the Campaign, Ad Set, Creative, and Ad in `PAUSED` state. The explicit Publish action activates dependent Ads, then Ad Sets, then the Campaign. Meta review, billing, account restrictions, and delivery eligibility can still prevent delivery.
- Click-to-WhatsApp creation remains unavailable until the connected Page's WhatsApp Business destination and the required account permissions can be discovered and the current Marketing API payload is verified for this app/account.

## Frontend Status

- Dashboard, campaign metrics, status filters, campaign cards, draft reopen/edit, and local campaign records are implemented.
- The 5-step builder supports Ad Details, Creative, Audience, Budget & Schedule, and Review.
- Creative supports Image and Video types inside the existing Step 02 flow.
- Image supports Upload Creative, Marketing Studio templates/session designs, and existing Item Image selection.
- Video currently supports Upload Video only, with MP4/MOV selection, file-size validation, metadata display, and HTML video preview.
- Video preview uses a centered contain frame with a neutral black background so portrait/landscape videos are not cropped or stretched.
- Video drafts store file metadata only; users must re-select the raw video file before publishing after refresh/reopen.
- Selected item image/name/category/price/unit stay synchronized from the shared inventory item source.
- Audience prototype supports location, Pan India, gender, age, interests, and validation.
- Budget/duration calculation, schedule fields, review summary, publish validation, and detailed publish errors are implemented.
- Dashboard metrics read Meta Insights; campaign count is explicitly browser-local, and unsynced per-campaign placeholder metrics are hidden.

## Account Insights

- Flow: dashboard -> `getMetaAdsInsights` -> `GET /api/meta/ads/insights?datePreset=last_7d|last_30d` -> `fetchMetaAdsInsights` -> `/{configured-version}/act_{selected-account-id}/insights`.
- Reuses the server-held token and saved/discovered Ad Account; requires `ads_read` or `ads_management`, without requiring a Page for reporting.
- Requests reach, impressions, clicks, spend, actions, account currency/name/ID and reporting dates at account level for the entire range. Includes all account ads, not only local campaigns; reach is never summed across days.
- Leads uses only `actions[action_type=lead].value`; missing aggregate is unavailable (`null`). Subtypes and unrelated actions are not added together. Spend uses the Meta account currency.
- Auto-fetches on connection/saved selection changes and dashboard return; supports date selection and refresh. Loading, no-account, disconnected, no-activity, authorization, permission and retry states are distinct; errors never become zero metrics.
- Valid Meta empty data produces no activity; malformed responses fail clearly. Old account/date results are hidden during changes and pending frontend requests are cancelled/timed out.
- Changed: `SmartAds.jsx` (cards/states), `smartAdsMetaService.js` (API client), `server/src/routes/metaAds.js` (read endpoint). Created: `server/src/services/metaAdsInsightsService.js` (normalization) and its `.test.js` (isolated route/Meta-response tests).
- Validation uses controlled responses; live non-zero metrics still require the company's account with delivered activity. No live billing-account verification is claimed. PostgreSQL historical snapshots, tenant isolation and scheduled Insights sync remain future work.
- API reference: [Meta-maintained Insights fields](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adsinsights.py) and [Meta Marketing API examples](https://www.postman.com/meta/facebook-marketing-api/documentation/0zr4mes/facebook-marketing-api-mapi).

## Backend / Meta Integration Status

- Express Meta OAuth is implemented with backend-only App Secret use, OAuth state validation, code exchange, long-lived token exchange, `/me`, and permissions fetch.
- Asset discovery fetches Business Portfolios, Facebook Pages, Ad Accounts, and optional linked Instagram professional accounts.
- Selected Business/Page/Instagram/Ad Account are stored in temporary server memory for this phase.
- Smart Ads readiness is normalized on the backend: Facebook Page and Ad Account are required, Instagram is optional, and missing OAuth/asset access blocks publishing.
- The Integrations card shows Connected vs Setup required, requirement rows, no-Page/no-Ad-Account states, missing permissions, and Refresh/Reconnect actions.
- Meta tokens are stored backend-only in memory; the frontend receives only public-safe connection and asset data.
- Production Vercel frontend and Render backend are supported through environment-driven URLs and CORS configuration.

## Real Publishing Flow

- `POST /api/meta/ads/publish` uses the selected real Facebook Page and real Ad Account.
- Publishing is guarded by readiness checks before any real Meta object is created.
- Campaign is created in `PAUSED` state with `special_ad_categories: []` and `is_adset_budget_sharing_enabled: false`.
- Daily budget remains on the Ad Set, which is also created in `PAUSED` state.
- Image upload uses the real Meta Ad Images endpoint and returns a real image hash.
- Video upload uses the real Meta Ad Videos endpoint and returns a real Meta video ID.
- Video processing is checked before creative creation; if Meta is still processing, the partial publish record keeps the real video ID and fails clearly.
- Meta video creative requires a thumbnail reference, so the backend fetches the uploaded video's real `picture`/thumbnail URL, downloads that image, uploads it to the Ad Account `/adimages` endpoint, and sends the returned `video_data.image_hash`.
- Image creatives use `link_data.image_hash`; video creatives use `video_data.video_id` plus a real thumbnail `video_data.image_hash`.
- Retry after a partial video publish can reuse the stored real Meta video ID instead of uploading the same video again.
- Creative is created with Page identity, optional Instagram actor, destination URL, text, and CTA.
- Final Ad is created in `PAUSED` state; no fake IDs or demo success fallback are used.
- Failed Meta steps return safe error details including step, code, subcode, user message, and fbtrace ID where provided.
- Permission/access failures are shown as advertising-access issues; Meta payment error `100 / 1359188` stays separate as “Payment method required.”
- Video creative diagnostics log only safe details such as video ID, thumbnail source, thumbnail host, and outgoing payload keys; tokens and signed URL query strings are not logged.

## Live Test Status

- Production frontend, production backend, published Meta app, OAuth login, real connection, and real asset fetch are verified.
- Real Campaign creation has been verified and returned a real Meta Campaign ID.
- Previous blockers fixed: campaign budget-sharing requirement and stale/today 1-day schedule handling.
- Current external blocker: the selected Meta test Ad Account requires a valid Meta payment method.
- Final live image/video Ad delivery is not verified yet; all Meta objects intentionally remain `PAUSED`.

## Current Architecture

- Frontend page: `src/pages/BusinessGrowth/SmartAds/SmartAds.jsx`.
- Frontend Meta API client: `src/services/smartAdsMetaService.js`.
- Frontend draft/campaign storage: `src/services/smartAdsStorage.js` using `localStorage`.
- Backend routes: `server/src/routes/metaAuth.js`, `server/src/routes/metaBusiness.js`, `server/src/routes/metaAds.js`.
- Backend services: `server/src/services/metaOAuthService.js`, `metaAssetsService.js`, `metaAdsService.js`, `metaConnectionStore.js`.
- Config: `server/src/config/metaOAuth.js`, `server/.env.example`, production environment variables.

## PostgreSQL Plan

- `users`: app users/operators; relates to businesses and campaign ownership.
- `businesses`: tenant/business profile; owns Meta connections, assets, and campaigns.
- `meta_connections`: encrypted Meta token, Meta user ID, permissions, status, expiry, reconnect/error state.
- `meta_business_assets`: discovered businesses, Pages, Instagram accounts, and Ad Accounts with selected flags.
- `smart_ad_campaigns`: local campaign record, Meta Campaign ID, objective, status, publish state, failure details.
- `smart_ad_adsets`: Meta Ad Set ID, budget, currency, schedule, targeting snapshot, Meta status.
- `smart_ad_creatives`: image source/hash, text, CTA, URL, Page/Instagram identity, Meta Creative ID.
- `smart_ads`: final Meta Ad ID, linked campaign/adset/creative, status, publish error state.
- `smart_ad_targeting`: normalized locations, age, gender, interest IDs/raw labels.
- `smart_ad_insights`: synced spend, reach, impressions, clicks, CTR, CPC, CPM, results by date.

## Production Pending

- Add PostgreSQL persistence, encrypted token storage, tenant isolation, and durable campaign/asset records.
- Add durable scheduled Insights sync/history, campaign-level reporting/status refresh, retry/cleanup for partial publishes, and audit logs.
- Add production-grade location/interest targeting search using Meta targeting IDs.
- Complete final live image and video publish verification with a payment-enabled production Ad Account; confirm Meta accepts generated video thumbnail image hashes end-to-end.
- Confirm required Meta permissions/access tiers and business asset roles for external client use after App Review.
- Add deletion/revocation tooling backed by the future database.

## Security Status

- Done: App Secret stays backend-only, tokens are not exposed to frontend, OAuth state is validated, public status omits tokens, and errors are token-safe.
- Done: frontend uses backend API routes for Meta work; no Meta secret is stored in Vite/client code.
- Partial: CORS is environment-driven but still supports local development origins.
- Pending: encrypted PostgreSQL token storage, auth/tenant boundaries, audit logging, token lifecycle jobs, and production deletion workflow.

## Manager Explanation

Smart Ads can connect to Meta, fetch business assets, create paused ads and request real account Insights. Accounts without activity show an empty state. The company account is still needed to verify non-zero metrics and final delivery. PostgreSQL, encrypted token storage, tenant isolation and status/history sync remain pending.
