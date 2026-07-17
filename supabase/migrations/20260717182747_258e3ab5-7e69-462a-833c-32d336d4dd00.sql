
-- Only admins/employees can browse the bucket directly. Providers get signed
-- URLs from the invoice-download edge function (service role bypasses RLS).
CREATE POLICY "Admins and employees read invoices bucket"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  );
