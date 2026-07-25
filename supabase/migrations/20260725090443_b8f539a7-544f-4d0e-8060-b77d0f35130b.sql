-- Phase B closure: expand reserved slugs (idempotent)
INSERT INTO public.provider_slug_reservations (slug, reason)
VALUES
  ('about','platform'), ('contact','platform'), ('blog','platform'),
  ('legal','platform'), ('privacy','platform'), ('cookies','platform'),
  ('trust','platform'), ('reviews','platform'), ('help','platform'),
  ('help-center','platform'), ('support-center','platform'),
  ('docs','platform'), ('status','platform'), ('careers','platform'),
  ('press','platform'), ('jobs','platform'), ('ai','platform')
ON CONFLICT (slug) DO NOTHING;

-- Canonical QR attribution token: provider_qr (was provider_qr_code)
UPDATE public.bookings
   SET acquisition_source = 'provider_qr'
 WHERE acquisition_source = 'provider_qr_code';

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_acquisition_source_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_acquisition_source_check
  CHECK (acquisition_source IN (
    'marketplace',
    'provider_direct_link',
    'provider_qr',
    'provider_social_share',
    'provider_embedded_widget',
    'unknown'
  ));