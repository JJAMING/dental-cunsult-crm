-- Preserve the read-only Dentweb patient key on each consultation.
-- It is scoped by clinic_id and never grants access across clinics.
alter table public.consultations
add column if not exists dentweb_patient_id text;

create index if not exists consultations_clinic_dentweb_patient_idx
on public.consultations (clinic_id, dentweb_patient_id)
where dentweb_patient_id is not null;
