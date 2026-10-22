-- Remove unused legacy table scaffolding that is not queried by the backend.
-- The local vyapaar database was checked before this migration; these tables
-- contained zero rows. Run only on databases where these legacy tables are
-- confirmed empty and no longer needed.
USE vyapaar;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS
  business_profiles,
  inventory_item_batches,
  inventory_items,
  marketing_studio_brand_data,
  marketing_studio_designs,
  online_store_items,
  online_store_order_items,
  online_store_orders,
  online_stores,
  smart_ads_analytics,
  smart_ads_audiences,
  smart_ads_budgets,
  smart_ads_campaigns,
  smart_ads_creatives,
  whatsapp_campaign_recipients,
  whatsapp_campaigns,
  whatsapp_connections,
  whatsapp_templates;

SET FOREIGN_KEY_CHECKS = 1;
