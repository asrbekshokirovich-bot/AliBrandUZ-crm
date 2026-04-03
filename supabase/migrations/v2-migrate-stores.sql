-- Update v2_marketplaces to include configuration fields
ALTER TABLE v2_marketplaces 
ADD COLUMN IF NOT EXISTS api_key_secret_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS fulfillment_type VARCHAR(50);

-- Update the migration script as well
-- v2-migrate-stores.sql
INSERT INTO v2_marketplaces (
    id, platform, shop_name, external_shop_id, campaign_id, 
    api_key_secret_name, fulfillment_type, health_status, created_at
)
SELECT 
    id, platform::v2_marketplace_type, name, external_shop_id, 
    COALESCE(campaign_id, fbs_campaign_id, fby_campaign_id, dbs_campaign_id),
    api_key_secret_name, fulfillment_type, 'healthy'::v2_health_status, NOW()
FROM marketplace_stores
WHERE is_active = true
ON CONFLICT (id) DO UPDATE SET
    api_key_secret_name = EXCLUDED.api_key_secret_name,
    fulfillment_type = EXCLUDED.fulfillment_type;
