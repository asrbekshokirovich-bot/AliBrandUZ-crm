-- Safe migration: ensure box_track_codes table exists (idempotent)
-- This migration is safe to run even if the table already exists.

CREATE TABLE IF NOT EXISTS public.box_track_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id UUID NOT NULL REFERENCES public.boxes(id) ON DELETE CASCADE,
  track_code TEXT NOT NULL,
  source TEXT DEFAULT 'manual',
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

-- Indexes (safe to re-create)
CREATE INDEX IF NOT EXISTS idx_box_track_codes_box_id ON public.box_track_codes(box_id);
CREATE INDEX IF NOT EXISTS idx_box_track_codes_track_code ON public.box_track_codes(track_code);
CREATE INDEX IF NOT EXISTS idx_box_track_codes_track_code_lower ON public.box_track_codes(LOWER(track_code));

-- RLS
ALTER TABLE public.box_track_codes ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist before recreating (idempotent)
DROP POLICY IF EXISTS "Track codes viewable by authenticated" ON public.box_track_codes;
DROP POLICY IF EXISTS "China staff can manage track codes" ON public.box_track_codes;

CREATE POLICY "Track codes viewable by authenticated"
  ON public.box_track_codes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "China staff can manage track codes"
  ON public.box_track_codes FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'rahbar'::app_role) OR
    has_role(auth.uid(), 'bosh_admin'::app_role) OR
    has_role(auth.uid(), 'xitoy_manager'::app_role) OR
    has_role(auth.uid(), 'xitoy_packer'::app_role)
  );

-- Migrate existing store_number values (safe: only inserts if not already migrated)
INSERT INTO public.box_track_codes (box_id, track_code, source, is_primary)
SELECT id, store_number, 'migration', true
FROM public.boxes
WHERE store_number IS NOT NULL 
  AND store_number != ''
  AND NOT EXISTS (
    SELECT 1 FROM public.box_track_codes btc 
    WHERE btc.box_id = boxes.id AND btc.track_code = boxes.store_number
  );
