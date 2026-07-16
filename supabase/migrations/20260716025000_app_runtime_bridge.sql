alter table public.clinics
add column if not exists app_clinic_key text;

create unique index if not exists clinics_app_clinic_key_idx
on public.clinics (app_clinic_key)
where app_clinic_key is not null;

alter table public.consultations
add column if not exists app_row_id bigint;

create unique index if not exists consultations_clinic_app_row_id_idx
on public.consultations (clinic_id, app_row_id)
where app_row_id is not null;

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

  select p.clinic_id
    into v_clinic_id
  from public.profiles p
  where p.id = v_user_id
  limit 1;

  if v_clinic_id is not null then
    update public.clinics
       set app_clinic_key = coalesce(app_clinic_key, v_clinic_key),
           name = coalesce(nullif(name, ''), v_clinic_name)
     where id = v_clinic_id;

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
    set clinic_id = excluded.clinic_id,
        role = case
          when public.profiles.role in ('admin', 'manager') then public.profiles.role
          else 'admin'
        end;

  return v_clinic_id;
end;
$$;

grant execute on function public.ensure_user_clinic(text, text) to authenticated;
