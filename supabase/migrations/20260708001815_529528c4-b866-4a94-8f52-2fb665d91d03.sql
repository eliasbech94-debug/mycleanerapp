-- Table
CREATE TABLE public.provider_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('booking','general')),
  vendor text,
  receipt_date date,
  amount_cents integer,
  vat_cents integer,
  currency text DEFAULT 'DKK',
  quarter smallint,
  year smallint,
  file_path text NOT NULL,
  mime text,
  raw_ocr jsonb,
  scan_status text NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending','scanning','scanned','failed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provider_receipts_user_year_q_idx ON public.provider_receipts(user_id, year DESC, quarter DESC);
CREATE INDEX provider_receipts_booking_idx ON public.provider_receipts(booking_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_receipts TO authenticated;
GRANT ALL ON public.provider_receipts TO service_role;

ALTER TABLE public.provider_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers manage own receipts"
ON public.provider_receipts FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER provider_receipts_updated_at
BEFORE UPDATE ON public.provider_receipts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies: files stored under `<user_id>/<filename>`
CREATE POLICY "Providers upload own receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Providers read own receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Providers delete own receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);
