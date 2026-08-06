-- A platform super administrator manages clinics globally and does not belong to one clinic.
alter table public.profiles
  alter column clinic_id drop not null;
