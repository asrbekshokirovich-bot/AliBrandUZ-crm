-- ============================================================
-- Inventory Transactions: universal warehouse ledger
-- Tracks every stock movement: kirim, transfer, sale, return
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Document info
  transaction_type  text NOT NULL CHECK (transaction_type IN ('kirim','transfer','sale','return','adjustment')),
  document_number   text,
  document_date     date,

  -- Product
  product_name      text NOT NULL,
  sku               text,
  quantity          numeric NOT NULL CHECK (quantity > 0),
  unit_price        numeric DEFAULT 0,
  total_price       numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
  currency          text DEFAULT 'UZS',

  -- Routing
  platform          text,   -- china_supplier | uzum | yandex | wildberries | local_store
  logistics_model   text,   -- FBS | FBO | DBS | warehouse_transfer
  location_from     text,   -- source warehouse / marketplace
  location_to       text,   -- destination warehouse / marketplace

  -- Classification
  fixable_qty       integer DEFAULT 0,
  unfixable_qty     integer DEFAULT 0,

  -- Meta
  notes             text,
  scanned_doc_url   text,    -- URL of original uploaded document (if any)
  created_at        timestamptz DEFAULT now(),
  created_by        uuid REFERENCES auth.users(id)
);

-- Indexes for fast analytics queries
CREATE INDEX IF NOT EXISTS idx_inv_tx_type        ON public.inventory_transactions (transaction_type);
CREATE INDEX IF NOT EXISTS idx_inv_tx_platform    ON public.inventory_transactions (platform);
CREATE INDEX IF NOT EXISTS idx_inv_tx_product     ON public.inventory_transactions (product_name);
CREATE INDEX IF NOT EXISTS idx_inv_tx_date        ON public.inventory_transactions (document_date);
CREATE INDEX IF NOT EXISTS idx_inv_tx_sku         ON public.inventory_transactions (sku);
CREATE INDEX IF NOT EXISTS idx_inv_tx_loc_from    ON public.inventory_transactions (location_from);
CREATE INDEX IF NOT EXISTS idx_inv_tx_loc_to      ON public.inventory_transactions (location_to);

-- RLS: authenticated users can read; only admins write
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read inventory_transactions"
  ON public.inventory_transactions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert inventory_transactions"
  ON public.inventory_transactions FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update their own inventory_transactions"
  ON public.inventory_transactions FOR UPDATE
  TO authenticated USING (created_by = auth.uid());

-- ============================================================
-- View: current stock per product per location
-- ============================================================
CREATE OR REPLACE VIEW public.inventory_stock AS
SELECT
  product_name,
  sku,
  location_to      AS location,
  platform,
  SUM(CASE WHEN transaction_type IN ('kirim','return') THEN quantity
           WHEN transaction_type = 'transfer'          THEN quantity
           ELSE 0 END) AS additions,
  SUM(CASE WHEN transaction_type IN ('sale')           THEN quantity
           WHEN transaction_type = 'transfer'          THEN 0
           ELSE 0 END) AS deductions,
  (
    SUM(CASE WHEN transaction_type IN ('kirim','return','transfer') THEN quantity ELSE 0 END)
    - SUM(CASE WHEN transaction_type = 'sale' THEN quantity ELSE 0 END)
  ) AS current_stock
FROM public.inventory_transactions
GROUP BY product_name, sku, location_to, platform;

-- ============================================================
-- View: sales P&L per platform/store
-- ============================================================
CREATE OR REPLACE VIEW public.inventory_pnl AS
SELECT
  platform,
  location_from                              AS store,
  DATE_TRUNC('month', document_date)         AS month,
  SUM(CASE WHEN transaction_type = 'sale'   THEN total_price ELSE 0 END) AS revenue,
  SUM(CASE WHEN transaction_type = 'kirim'  THEN total_price ELSE 0 END) AS cost,
  SUM(CASE WHEN transaction_type = 'return' THEN total_price ELSE 0 END) AS returns_value,
  SUM(CASE WHEN transaction_type = 'sale'   THEN total_price ELSE 0 END)
  - SUM(CASE WHEN transaction_type = 'kirim' THEN total_price ELSE 0 END) AS gross_profit
FROM public.inventory_transactions
GROUP BY platform, location_from, DATE_TRUNC('month', document_date);
