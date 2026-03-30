CREATE TABLE IF NOT EXISTS public.scanned_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name text,
  file_size bigint,
  file_url text,
  document_number text,
  document_type text,
  partner text,
  doc_date text,
  total_items numeric DEFAULT 0,
  total_value numeric DEFAULT 0,
  status text DEFAULT 'pending', /* 'pending' or 'applied' */
  raw_result jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scanned_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scanned_documents_select" ON public.scanned_documents FOR SELECT USING (true);
CREATE POLICY "scanned_documents_insert" ON public.scanned_documents FOR INSERT WITH CHECK (true);
CREATE POLICY "scanned_documents_update" ON public.scanned_documents FOR UPDATE USING (true);
CREATE POLICY "scanned_documents_delete" ON public.scanned_documents FOR DELETE USING (true);

-- Create bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('return-documents', 'return-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Bucket RLS
CREATE POLICY "Public Access for Return Documents"
ON storage.objects FOR SELECT USING (bucket_id = 'return-documents');

CREATE POLICY "Upload Return Documents"
ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'return-documents');

CREATE POLICY "Update Return Documents"
ON storage.objects FOR UPDATE USING (bucket_id = 'return-documents');

CREATE POLICY "Delete Return Documents"
ON storage.objects FOR DELETE USING (bucket_id = 'return-documents');
