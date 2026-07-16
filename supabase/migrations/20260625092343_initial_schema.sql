create extension if not exists pgcrypto;

create type public.profile_role as enum ('admin', 'manager', 'counselor', 'viewer');
create type public.staff_type as enum ('counselor', 'doctor');
create type public.patient_type as enum ('new', 'returning');
create type public.consultation_result as enum ('same_day', 'follow_up', 'declined', 'cancelled');
create type public.recall_round as enum ('1', '2', '3', 'final');
create type public.recall_result as enum ('pending', 'contacted', 'booked', 'no_answer', 'closed');

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  role public.profile_role not null default 'viewer',
  created_at timestamptz not null default now()
);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  staff_type public.staff_type not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, name, staff_type)
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  chart_no text not null,
  patient_type public.patient_type not null default 'new',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, chart_no)
);

create table public.visit_channels (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  unique (clinic_id, name)
);

create table public.treatment_categories (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  unique (clinic_id, name)
);

create table public.disagreement_reasons (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  unique (clinic_id, name)
);

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete restrict,
  consultation_date date not null,
  counselor_id uuid references public.staff(id) on delete set null,
  doctor_id uuid references public.staff(id) on delete set null,
  visit_channel_id uuid references public.visit_channels(id) on delete set null,
  treatment_category_id uuid references public.treatment_categories(id) on delete set null,
  consulted_teeth_count integer not null default 0 check (consulted_teeth_count >= 0),
  agreed_teeth_count integer not null default 0 check (agreed_teeth_count >= 0),
  result public.consultation_result not null,
  is_partial_treatment boolean not null default false,
  is_cancelled_after_agreement boolean not null default false,
  consultation_amount numeric(14, 0) not null default 0 check (consultation_amount >= 0),
  agreed_amount numeric(14, 0) not null default 0 check (agreed_amount >= 0),
  disagreement_reason_id uuid references public.disagreement_reasons(id) on delete set null,
  memo text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (agreed_teeth_count <= consulted_teeth_count),
  check (agreed_amount <= consultation_amount)
);

create table public.recalls (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  consultation_id uuid not null references public.consultations(id) on delete cascade,
  round public.recall_round not null,
  scheduled_date date,
  completed_date date,
  result public.recall_result not null default 'pending',
  no_booking_reason text,
  message_sent boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (consultation_id, round)
);

create index consultations_clinic_date_idx on public.consultations (clinic_id, consultation_date desc);
create index consultations_result_idx on public.consultations (clinic_id, result);
create index consultations_counselor_idx on public.consultations (clinic_id, counselor_id);
create index consultations_doctor_idx on public.consultations (clinic_id, doctor_id);
create index recalls_due_idx on public.recalls (clinic_id, scheduled_date, result);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger patients_set_updated_at
before update on public.patients
for each row execute function public.set_updated_at();

create trigger consultations_set_updated_at
before update on public.consultations
for each row execute function public.set_updated_at();

create trigger recalls_set_updated_at
before update on public.recalls
for each row execute function public.set_updated_at();

alter table public.clinics enable row level security;
alter table public.profiles enable row level security;
alter table public.staff enable row level security;
alter table public.patients enable row level security;
alter table public.visit_channels enable row level security;
alter table public.treatment_categories enable row level security;
alter table public.disagreement_reasons enable row level security;
alter table public.consultations enable row level security;
alter table public.recalls enable row level security;

create policy "profiles can read own row"
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

create policy "clinic members can read clinic"
on public.clinics for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = clinics.id
  )
);

create policy "clinic members can read staff"
on public.staff for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = staff.clinic_id
  )
);

create policy "clinic managers can write staff"
on public.staff for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = staff.clinic_id
      and p.role in ('admin', 'manager')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = staff.clinic_id
      and p.role in ('admin', 'manager')
  )
);

create policy "clinic members can read patients"
on public.patients for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = patients.clinic_id
  )
);

create policy "clinic members can write patients"
on public.patients for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = patients.clinic_id
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = patients.clinic_id
  )
);

create policy "clinic members can read visit channels"
on public.visit_channels for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = visit_channels.clinic_id
  )
);

create policy "clinic managers can write visit channels"
on public.visit_channels for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = visit_channels.clinic_id
      and p.role in ('admin', 'manager')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = visit_channels.clinic_id
      and p.role in ('admin', 'manager')
  )
);

create policy "clinic members can read treatment categories"
on public.treatment_categories for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = treatment_categories.clinic_id
  )
);

create policy "clinic managers can write treatment categories"
on public.treatment_categories for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = treatment_categories.clinic_id
      and p.role in ('admin', 'manager')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = treatment_categories.clinic_id
      and p.role in ('admin', 'manager')
  )
);

create policy "clinic members can read disagreement reasons"
on public.disagreement_reasons for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = disagreement_reasons.clinic_id
  )
);

create policy "clinic managers can write disagreement reasons"
on public.disagreement_reasons for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = disagreement_reasons.clinic_id
      and p.role in ('admin', 'manager')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = disagreement_reasons.clinic_id
      and p.role in ('admin', 'manager')
  )
);

create policy "clinic members can read consultations"
on public.consultations for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = consultations.clinic_id
  )
);

create policy "clinic members can write consultations"
on public.consultations for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = consultations.clinic_id
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = consultations.clinic_id
  )
);

create policy "clinic members can read recalls"
on public.recalls for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = recalls.clinic_id
  )
);

create policy "clinic members can write recalls"
on public.recalls for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = recalls.clinic_id
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = recalls.clinic_id
  )
);

create or replace view public.monthly_consultation_stats
with (security_invoker = true)
as
select
  c.clinic_id,
  date_trunc('month', c.consultation_date)::date as month,
  count(*)::integer as consultations,
  count(*) filter (where c.result in ('same_day', 'follow_up'))::integer as agreements,
  coalesce(
    count(*) filter (where c.result in ('same_day', 'follow_up'))::numeric / nullif(count(*), 0),
    0
  ) as consent_rate,
  coalesce(sum(c.consultation_amount), 0) as consultation_amount,
  coalesce(sum(c.agreed_amount), 0) as agreed_amount
from public.consultations c
group by c.clinic_id, date_trunc('month', c.consultation_date)::date;

create or replace view public.treatment_category_stats
with (security_invoker = true)
as
select
  c.clinic_id,
  tc.name as treatment_category,
  count(*)::integer as consultations,
  count(*) filter (where c.result in ('same_day', 'follow_up'))::integer as agreements,
  coalesce(sum(c.consultation_amount), 0) as consultation_amount,
  coalesce(sum(c.agreed_amount), 0) as agreed_amount
from public.consultations c
left join public.treatment_categories tc on tc.id = c.treatment_category_id
group by c.clinic_id, tc.name;

create or replace view public.visit_channel_stats
with (security_invoker = true)
as
select
  c.clinic_id,
  vc.name as visit_channel,
  count(*)::integer as consultations,
  count(*) filter (where c.result in ('same_day', 'follow_up'))::integer as agreements,
  coalesce(sum(c.consultation_amount), 0) as consultation_amount,
  coalesce(sum(c.agreed_amount), 0) as agreed_amount
from public.consultations c
left join public.visit_channels vc on vc.id = c.visit_channel_id
group by c.clinic_id, vc.name;

create or replace view public.disagreement_reason_stats
with (security_invoker = true)
as
select
  c.clinic_id,
  dr.name as disagreement_reason,
  count(*)::integer as declined_count
from public.consultations c
left join public.disagreement_reasons dr on dr.id = c.disagreement_reason_id
where c.result = 'declined'
group by c.clinic_id, dr.name;

create or replace view public.recall_progress_stats
with (security_invoker = true)
as
select
  r.clinic_id,
  r.round,
  count(*)::integer as targets,
  count(*) filter (where r.result <> 'pending')::integer as completed,
  count(*) filter (where r.result = 'booked')::integer as booked
from public.recalls r
group by r.clinic_id, r.round;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.monthly_consultation_stats to authenticated;
grant select on public.treatment_category_stats to authenticated;
grant select on public.visit_channel_stats to authenticated;
grant select on public.disagreement_reason_stats to authenticated;
grant select on public.recall_progress_stats to authenticated;
