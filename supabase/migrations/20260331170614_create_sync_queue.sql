-- Create sync queue table
CREATE TABLE IF NOT EXISTS public.sync_jobs_queue (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    store_id UUID REFERENCES public.marketplace_stores(id) ON DELETE CASCADE,
    sync_type TEXT NOT NULL CHECK (sync_type IN ('orders', 'stock', 'listings', 'prices', 'full')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
    priority INTEGER DEFAULT 10,
    store_name TEXT, 
    platform TEXT,
    params JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for queue fetching
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON public.sync_jobs_queue(status, priority DESC, created_at ASC);

-- Row Level Security
ALTER TABLE public.sync_jobs_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read for sync queue" 
ON public.sync_jobs_queue FOR SELECT 
TO public
USING (true);

CREATE POLICY "Allow anon update for sync queue" 
ON public.sync_jobs_queue FOR ALL 
TO public
USING (true);

-- Adding manual sync_status to marketplace_orders if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'marketplace_orders' 
        AND column_name = 'sync_status'
    ) THEN
        ALTER TABLE public.marketplace_orders ADD COLUMN sync_status TEXT DEFAULT 'synced';
    END IF;
END $$;
