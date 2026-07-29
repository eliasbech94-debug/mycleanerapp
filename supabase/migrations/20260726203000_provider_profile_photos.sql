-- Public provider profile photos.
-- Only the authenticated owner may create, replace, or delete objects inside
-- their own <user_id>/ folder. Identity and insurance documents remain in the
-- separate private provider-documents bucket.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'provider-photos',
  'provider-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "provider photos: owner read" ON storage.objects;
DROP POLICY IF EXISTS "provider photos: owner insert" ON storage.objects;
DROP POLICY IF EXISTS "provider photos: owner update" ON storage.objects;
DROP POLICY IF EXISTS "provider photos: owner delete" ON storage.objects;

CREATE POLICY "provider photos: owner read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'provider-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "provider photos: owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'provider-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "provider photos: owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'provider-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'provider-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "provider photos: owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'provider-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
