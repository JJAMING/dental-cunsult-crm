create table if not exists public.admin_settings_snapshots (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  app_active_clinic_key text,
  payload jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists admin_settings_snapshots_updated_at_idx
on public.admin_settings_snapshots (updated_at desc);

alter table public.admin_settings_snapshots enable row level security;

drop policy if exists "clinic members can read admin settings snapshots"
on public.admin_settings_snapshots;

create policy "clinic members can read admin settings snapshots"
on public.admin_settings_snapshots for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = admin_settings_snapshots.clinic_id
  )
);

drop policy if exists "clinic managers can write admin settings snapshots"
on public.admin_settings_snapshots;

create policy "clinic managers can write admin settings snapshots"
on public.admin_settings_snapshots for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = admin_settings_snapshots.clinic_id
      and p.role in ('admin', 'manager')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = admin_settings_snapshots.clinic_id
      and p.role in ('admin', 'manager')
  )
);

grant select, insert, update, delete on public.admin_settings_snapshots to authenticated;
