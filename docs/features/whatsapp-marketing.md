# WhatsApp Marketing

## Feature Goal

Businesses customize posters and prepare WhatsApp promotions for their own customers.
Production goal: poster -> selected customers -> approved template/message -> backend Cloud API delivery -> status tracking.

## Final Customer Flow

WhatsApp Marketing -> poster gallery -> click poster -> existing customization modal -> Download / Share / Send on WhatsApp.
Send on WhatsApp first checks `GET /api/whatsapp-business/connection`; disconnected users see Continue with Meta.
If READY, the compact drawer proceeds: Select Customers -> Choose Message -> Review -> Send.
If setup is missing or incomplete, Manage Connection opens the shared connection panel instead of a hidden drawer state.
Manage Connection treats NOT_CONNECTED as a normal customer state with an active Meta CTA when Embedded Signup is configured.
CONFIGURATION_ERROR appears only when backend production WhatsApp config is truly missing.
The old customer-facing 5-step campaign wizard is removed.

## Frontend Files

- `src/pages/BusinessGrowth/WhatsAppMarketing.jsx`: poster gallery, customization modal, connection status, shared Manage Connection panel, send drawer, developer tools.
- `src/services/whatsappBusinessService.js`: frontend API client for connection, templates, customers, validation, prepare, test send.

## Backend Files

- `server/src/routes/whatsappAuth.js`: WhatsApp status, Embedded Signup, test connect, disconnect.
- `server/src/routes/whatsappBusiness.js`: assets, templates, selection, single test send, campaign contract routes.
- `server/src/services/whatsappBusinessService.js`: Meta WABA/phone/template fetch and one-message Cloud API send.
- `server/src/services/whatsappCampaignService.js`: production validation/prepare contracts; no DB or queue yet.
- `server/src/routes/whatsappWebhook.js`: webhook verification and future event intake.

## APIs Implemented

- `POST /api/auth/whatsapp/test-connect`: rebuilds test WABA/phone/template connection from backend env.
- `POST /api/whatsapp-business/send-test`: sends one real approved-template test message through Meta `/{phone_number_id}/messages`.
- `GET /api/whatsapp-business/connection`: returns current safe connection state.
- `GET /api/whatsapp-business/templates`: returns approved templates for the current connection.

## APIs Prepared / Not Production-Active

- `GET /api/whatsapp-business/customers`: returns persistence-not-configured until customer DB exists.
- `POST /api/whatsapp-business/campaigns/validate`: validates connection, recipients, template variables, consent, and media compatibility.
- `POST /api/whatsapp-business/campaigns/prepare`: creates a preview payload only; no persistence.
- `POST /api/whatsapp-business/campaigns/send`: returns `BULK_DELIVERY_NOT_CONFIGURED`.
- `POST /api/whatsapp-business/campaigns/schedule`: returns `SCHEDULING_NOT_CONFIGURED`.

## Meta Cloud API Flow

Test mode: backend env token -> test WABA -> test phone -> approved template -> one authorized recipient.
Production: business-specific connection -> WABA -> `phone_number_id` -> approved template -> Cloud API.
React never receives tokens and never calls Meta directly, except the official Embedded Signup JS SDK launch.
Developer/Test Tools stay hidden for normal production users and are explicit dev-only verification.

## Customer Number Sources

Meta does not provide customer lists.
Future customer numbers come from Ledgerly billing/customer records, manual Add Customer/Contact, and CSV/Excel import.
Current drawer reuses existing browser Party/customer phone data only when available.

## Production Database Plan

Use PostgreSQL later.
Conceptual tables: `businesses`, `customers`, `whatsapp_connections`, `whatsapp_campaigns`, `whatsapp_campaign_recipients`, `whatsapp_message_jobs`.
No migrations or SQL persistence exist yet.

## Production Bulk Flow

User clicks Send once -> backend validates campaign -> persists campaign/recipients -> creates jobs -> queue worker sends one recipient at a time -> stores Meta message IDs.
No frontend loops, no fake bulk success, no direct browser-to-Meta calls.

## Webhook Status Flow

Meta webhook -> message status event -> lookup `meta_message_id` -> update recipient status.
Future statuses: pending, sent, delivered, read, failed.
Webhook persistence is not implemented yet.

## Current Status

Implemented: poster customization/share/download, simplified Send on WhatsApp drawer, approved template fetch, real single test send, production API contracts/validation layer.
Manage Connection now handles config missing, not connected, reconnect, incomplete setup, and ready states from one shared panel.
Continue with Meta uses the existing Embedded Signup flow when `META_APP_ID`, `META_APP_SECRET`, and `WHATSAPP_LOGIN_CONFIG_ID` are configured.
Pending: PostgreSQL, customer persistence, imports, campaign persistence, recipients, queue worker, retries/idempotency, media upload/image-header sending, webhook persistence, analytics, production Embedded Signup completion.

## Pending Production Work

Complete Meta production onboarding, store per-business WhatsApp tokens/assets securely, add customer/contact database, implement queued bulk delivery, persist webhook statuses, and add campaign analytics.

## Manager Explanation

Customer ko ab simple poster gallery dikhegi: poster select karo, customize karo, download/share/send prepare karo.
WhatsApp send drawer customer selection, message template, aur review ko compact rakhta hai.
Abhi real Cloud API se one test message verified path preserved hai.
Bulk production send ke liye PostgreSQL aur queue worker next phase me add honge.
