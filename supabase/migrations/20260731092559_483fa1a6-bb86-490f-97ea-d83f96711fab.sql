insert into public.country_configs (iso, active, launch_status, default_language, supported_languages, currency, timezone, lifecycle_state, status)
values ('DE', false, 'development', 'de', array['de','en'], 'EUR', 'Europe/Berlin', 'development', 'draft')
on conflict (iso) do nothing;

update public.country_configs
set active = false,
    status = 'draft',
    lifecycle_state = case when lifecycle_state = 'active' then 'development'::country_lifecycle_state else lifecycle_state end,
    launch_status = case when launch_status = 'active' then 'development' else launch_status end
where iso in ('SE','GB','DE','ES');

create or replace view public.market_launch_status as
select
  iso,
  lifecycle_state,
  currency,
  (active and status = 'published' and lifecycle_state = 'active') as is_bookable
from public.country_configs
where iso in ('DK','SE','GB','DE','ES');

grant select on public.market_launch_status to anon, authenticated;
grant select on public.market_launch_status to service_role;