-- 20260402112252_v2_marketplace_analytics_schema.sql

-- 1. ENUMS (Strict isolation for v2)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v2_marketplace_type') THEN
        CREATE TYPE v2_marketplace_type AS ENUM ('uzum', 'yandex');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v2_order_status') THEN
        CREATE TYPE v2_order_status AS ENUM ('pending', 'shipped', 'delivered', 'cancelled', 'returned');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v2_health_status') THEN
        CREATE TYPE v2_health_status AS ENUM ('healthy', 'offline', 'auth_failed');
    END IF;
END $$;

-- 2. TABLES (v2 Prefixed)
CREATE TABLE IF NOT EXISTS v2_marketplaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform v2_marketplace_type NOT NULL,
    shop_name VARCHAR(255) NOT NULL,
    external_shop_id VARCHAR(255),
    campaign_id VARCHAR(255),
    health_status v2_health_status DEFAULT 'healthy',
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS v2_unified_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(255) NOT NULL UNIQUE,
    barcode VARCHAR(255),
    title TEXT NOT NULL,
    product_cost NUMERIC(15, 2) DEFAULT 0.00,
    total_stock INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS v2_store_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marketplace_id UUID REFERENCES v2_marketplaces(id) ON DELETE CASCADE,
    unified_product_id UUID REFERENCES v2_unified_products(id) ON DELETE SET NULL,
    external_item_id VARCHAR(255) NOT NULL,
    store_price NUMERIC(15, 2) NOT NULL,
    store_stock INT DEFAULT 0,
    UNIQUE (marketplace_id, external_item_id)
);

CREATE TABLE IF NOT EXISTS v2_unified_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marketplace_id UUID REFERENCES v2_marketplaces(id) ON DELETE CASCADE,
    external_order_id VARCHAR(255) NOT NULL,
    normalized_status v2_order_status NOT NULL DEFAULT 'pending',
    gross_amount NUMERIC(15, 2) DEFAULT 0.00,
    marketplace_commission NUMERIC(15, 2) DEFAULT 0.00,
    logistics_fee NUMERIC(15, 2) DEFAULT 0.00,
    storage_fee NUMERIC(15, 2) DEFAULT 0.00,
    product_cost NUMERIC(15, 2) DEFAULT 0.00,
    net_profit NUMERIC(15, 2) GENERATED ALWAYS AS (
        gross_amount - marketplace_commission - logistics_fee - storage_fee - product_cost
    ) STORED,
    ordered_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(marketplace_id, external_order_id)
);

CREATE TABLE IF NOT EXISTS v2_daily_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marketplace_id UUID REFERENCES v2_marketplaces(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    total_sales_volume NUMERIC(15, 2) DEFAULT 0,
    total_net_profit NUMERIC(15, 2) DEFAULT 0,
    total_returns_loss NUMERIC(15, 2) DEFAULT 0,
    orders_placed INT DEFAULT 0,
    orders_delivered INT DEFAULT 0,
    orders_returned INT DEFAULT 0,
    orders_cancelled INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(marketplace_id, report_date)
);

-- 3. INDEXES (Optimized for High-Scale Analytics)
CREATE INDEX IF NOT EXISTS idx_v2_orders_lookup ON v2_unified_orders (marketplace_id, ordered_at, normalized_status);
CREATE INDEX IF NOT EXISTS idx_v2_daily_agg ON v2_daily_analytics (report_date, marketplace_id);
CREATE INDEX IF NOT EXISTS idx_v2_listings_product ON v2_store_listings (unified_product_id);

-- 4. RLS (Row Level Security)
ALTER TABLE v2_marketplaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_unified_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_store_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_unified_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_daily_analytics ENABLE ROW LEVEL SECURITY;

-- Initial Policies (Permit access for authenticated users, isolated by current user ID if profiles available)
CREATE POLICY "Full access to v2_marketplaces" ON v2_marketplaces FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to v2_unified_products" ON v2_unified_products FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to v2_store_listings" ON v2_store_listings FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to v2_unified_orders" ON v2_unified_orders FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to v2_daily_analytics" ON v2_daily_analytics FOR ALL TO authenticated USING (true);
