begin;

create table if not exists public.customer_platform_fee_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  customer_user_id uuid not null references auth.users(id) on delete restrict,
  currency text not null,
  subtotal_amount integer not null check (subtotal_amount >= 0),
  vat_rate numeric(7,4) not null default 0,
  vat_amount integer not null default 0 check (vat_amount >= 0),
  total_amount integer not null check (total_amount >= 0),
  customer_snapshot jsonb not null default '{}'::jsonb,
  platform_tax_snapshot jsonb not null default '{}'::jsonb,
  pdf_storage_path text not null,
  country_code text not null,
  country_config_version integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (booking_id)
);

create table if not exists public.provider_service_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  customer_user_id uuid not null references auth.users(id) on delete restrict,
  provider_user_id uuid not null references auth.users(id) on delete restrict,
  currency text not null,
  service_subtotal_amount integer not null check (service_subtotal_amount >= 0),
  vat_rate numeric(7,4) not null default 0,
  vat_amount integer not null default 0 check (vat_amount >= 0),
  total_amount integer not null check (total_amount >= 0),
  provider_tax_snapshot jsonb not null default '{}'::jsonb,
  customer_snapshot jsonb not null default '{}'::jsonb,
  pdf_storage_path text not null,
  country_code text not null,
  metadata jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (booking_id)
);

alter table public.customer_platform_fee_invoices enable row level security;
alter table public.provider_service_invoices enable row level security;

create policy customer_reads_own_platform_fee_invoice
  on public.customer_platform_fee_invoices for select
  using (customer_user_id = auth.uid());

create policy customer_reads_own_provider_service_invoice
  on public.provider_service_invoices for select
  using (customer_user_id = auth.uid());

create policy provider_reads_own_service_invoice
  on public.provider_service_invoices for select
  using (provider_user_id = auth.uid());

create index if not exists customer_platform_fee_invoices_customer_idx
  on public.customer_platform_fee_invoices(customer_user_id, issued_at desc);
create index if not exists provider_service_invoices_customer_idx
  on public.provider_service_invoices(customer_user_id, issued_at desc);
create index if not exists provider_service_invoices_provider_idx
  on public.provider_service_invoices(provider_user_id, issued_at desc);

comment on table public.customer_platform_fee_invoices is
  'MyCleaner sales invoice to the customer for the customer-side marketplace fee.';
comment on table public.provider_service_invoices is
  'Invoice issued in the provider name to the customer for the underlying cleaning service.';

commit;
