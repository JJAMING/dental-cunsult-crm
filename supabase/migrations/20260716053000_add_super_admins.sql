create table if not exists public.super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  created_at timestamptz not null default now()
);

insert into public.super_admins (user_id, email)
select u.id, u.email
from auth.users u
where lower(u.email) = lower('withvalue@naver.com')
on conflict (user_id) do update
  set email = excluded.email;

alter table public.super_admins enable row level security;

drop policy if exists "super admins can read own super admin row"
on public.super_admins;

create policy "super admins can read own super admin row"
on public.super_admins for select
to authenticated
using (user_id = (select auth.uid()));

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.super_admins sa
    where sa.user_id = auth.uid()
  );
$$;

create or replace function public.is_clinic_member(p_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
  or exists (
    select 1
    from public.clinic_memberships cm
    where cm.user_id = auth.uid()
      and cm.clinic_id = p_clinic_id
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.clinic_id = p_clinic_id
  );
$$;

create or replace function public.can_manage_clinic(p_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
  or exists (
    select 1
    from public.clinic_memberships cm
    where cm.user_id = auth.uid()
      and cm.clinic_id = p_clinic_id
      and cm.role in ('admin', 'manager')
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.clinic_id = p_clinic_id
      and p.role in ('admin', 'manager')
  );
$$;

grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_clinic_member(uuid) to authenticated;
grant execute on function public.can_manage_clinic(uuid) to authenticated;

create policy "super admins can read all clinics"
on public.clinics for select
to authenticated
using (public.is_super_admin());

create or replace function public.ensure_user_clinic(
  p_app_clinic_key text,
  p_clinic_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_clinic_id uuid;
  v_clinic_key text := nullif(trim(p_app_clinic_key), '');
  v_clinic_name text := coalesce(nullif(trim(p_clinic_name), ''), 'Dental Consult Clinic');
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if v_clinic_key in ('supabase-clinic-pending', 'acro-dental', 'demo-dental') then
    v_clinic_key := null;
  end if;

  if v_clinic_key is not null then
    select c.id
      into v_clinic_id
    from public.clinics c
    where c.app_clinic_key = v_clinic_key
       or c.id::text = v_clinic_key
    limit 1;

    if v_clinic_id is not null and public.can_manage_clinic(v_clinic_id) then
      return v_clinic_id;
    end if;
  end if;

  if v_clinic_id is null then
    select cm.clinic_id
      into v_clinic_id
    from public.clinic_memberships cm
    where cm.user_id = v_user_id
    order by cm.created_at asc
    limit 1;
  end if;

  if v_clinic_id is null then
    select p.clinic_id
      into v_clinic_id
    from public.profiles p
    where p.id = v_user_id
    limit 1;
  end if;

  if v_clinic_id is not null then
    update public.clinics
       set app_clinic_key = coalesce(app_clinic_key, v_clinic_key),
           name = coalesce(nullif(name, ''), v_clinic_name)
     where id = v_clinic_id;

    insert into public.clinic_memberships (user_id, clinic_id, role)
    values (v_user_id, v_clinic_id, 'admin')
    on conflict (user_id, clinic_id) do nothing;

    return v_clinic_id;
  end if;

  if v_clinic_key is not null then
    select c.id
      into v_clinic_id
    from public.clinics c
    where c.app_clinic_key = v_clinic_key
    limit 1;
  end if;

  if v_clinic_id is null then
    insert into public.clinics (name, app_clinic_key)
    values (v_clinic_name, v_clinic_key)
    returning id into v_clinic_id;
  end if;

  insert into public.profiles (id, clinic_id, name, role)
  values (v_user_id, v_clinic_id, v_clinic_name || ' 관리자', 'admin')
  on conflict (id) do update
    set clinic_id = coalesce(public.profiles.clinic_id, excluded.clinic_id),
        role = case
          when public.profiles.role in ('admin', 'manager') then public.profiles.role
          else 'admin'
        end;

  insert into public.clinic_memberships (user_id, clinic_id, role)
  values (v_user_id, v_clinic_id, 'admin')
  on conflict (user_id, clinic_id) do update
    set role = case
      when public.clinic_memberships.role in ('admin', 'manager') then public.clinic_memberships.role
      else excluded.role
    end;

  return v_clinic_id;
end;
$$;

grant execute on function public.ensure_user_clinic(text, text) to authenticated;
