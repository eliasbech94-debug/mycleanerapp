-- Frozen recurring-booking lineage on authoritative pricing quotes.
-- Nullable columns preserve all existing one-time booking behavior.

alter table public.pricing_calculations
  add column if not exists recurrence public.booking_recurrence null,
  add column if not exists recurring_discount_bps integer null
    check (recurring_discount_bps between 0 and 5000),
  add column if not exists recurring_discount_config_version integer null
    check (recurring_discount_config_version > 0),
  add column if not exists pre_discount_rate_minor integer null
    check (pre_discount_rate_minor > 0),
  add column if not exists recurring_discount_minor integer null
    check (recurring_discount_minor >= 0);

alter table public.pricing_calculations
  add constraint pricing_calculations_recurring_fields_complete
  check (
    (recurrence is null
      and recurring_discount_bps is null
      and recurring_discount_config_version is null
      and pre_discount_rate_minor is null
      and recurring_discount_minor is null)
    or
    (recurrence is not null
      and recurring_discount_bps is not null
      and recurring_discount_config_version is not null
      and pre_discount_rate_minor is not null
      and recurring_discount_minor is not null)
  ) not valid;

comment on column public.pricing_calculations.recurrence is
  'Frozen recurrence selected for this quote; null means one-time booking.';
comment on column public.pricing_calculations.recurring_discount_bps is
  'Platform-owned recurring discount frozen when the quote is issued.';
comment on column public.pricing_calculations.pre_discount_rate_minor is
  'Provider rate before the recurring discount is applied.';
