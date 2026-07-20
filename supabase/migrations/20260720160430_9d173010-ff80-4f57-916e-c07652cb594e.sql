
ALTER TABLE public.place_validations
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'google',
  ADD COLUMN IF NOT EXISTS normalized_address text,
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS house_number text,
  ADD COLUMN IF NOT EXISTS letter text,
  ADD COLUMN IF NOT EXISTS floor text,
  ADD COLUMN IF NOT EXISTS side text,
  ADD COLUMN IF NOT EXISTS door text,
  ADD COLUMN IF NOT EXISTS entrance text,
  ADD COLUMN IF NOT EXISTS apartment text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS municipality text;

ALTER TABLE public.place_validations
  ADD CONSTRAINT place_validations_source_chk
  CHECK (source IN ('google','dawa'));

CREATE INDEX IF NOT EXISTS place_validations_norm_user_idx
  ON public.place_validations (user_id, normalized_address);
