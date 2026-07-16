"use client";

import { defaultConsultationClinicId } from "@/lib/consultation-filters";
import { createSupabaseBrowserClientOrNull } from "@/lib/supabase/browser";
import type { Consultation } from "@/types/domain";

type ConsultationInput = Omit<Consultation, "id">;
type SupabaseErrorLike = { message?: string } | null;
type SupabaseResult<T> = { data: T | null; error: SupabaseErrorLike };
type UnknownRecord = Record<string, unknown>;
type QueryBuilder = PromiseLike<SupabaseResult<UnknownRecord[]>> & {
  delete(): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  insert(value: UnknownRecord | UnknownRecord[]): QueryBuilder;
  limit(count: number): QueryBuilder;
  maybeSingle<T = UnknownRecord>(): Promise<SupabaseResult<T>>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder;
  select(columns?: string): QueryBuilder;
  single<T = UnknownRecord>(): Promise<SupabaseResult<T>>;
  update(value: UnknownRecord): QueryBuilder;
  upsert(value: UnknownRecord | UnknownRecord[], options?: UnknownRecord): QueryBuilder;
};
type DynamicSupabaseClient = {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null }; error: SupabaseErrorLike }>;
  };
  from(table: string): QueryBuilder;
  rpc(functionName: string, args?: UnknownRecord): QueryBuilder;
};

type SupabaseConsultationRow = {
  agreed_amount?: number | string | null;
  agreed_teeth_count?: number | null;
  app_row_id?: number | null;
  consultation_amount?: number | string | null;
  consultation_date?: string | null;
  consulted_teeth_count?: number | null;
  disagreement_reason?: { name?: string | null } | null;
  doctor?: { name?: string | null } | null;
  memo?: string | null;
  patient?: { chart_no?: string | null; name?: string | null; patient_type?: "new" | "returning" | null } | null;
  result?: Consultation["result"] | null;
  counselor?: { name?: string | null } | null;
  treatment_category?: { name?: string | null } | null;
  visit_channel?: { name?: string | null } | null;
};

function getDynamicSupabaseClient() {
  const supabase = createSupabaseBrowserClientOrNull();

  return supabase ? (supabase as unknown as DynamicSupabaseClient) : null;
}

function toText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = Number(value);

    return Number.isFinite(parsedValue) ? parsedValue : fallback;
  }

  return fallback;
}

function assertNoSupabaseError(error: SupabaseErrorLike) {
  if (error) {
    throw new Error(error.message || "supabase_error");
  }
}

async function ensureAuthenticatedUser(client: DynamicSupabaseClient) {
  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    return false;
  }

  return true;
}

async function ensureClinicId(client: DynamicSupabaseClient, clinicId?: string, clinicName?: string) {
  const { data, error } = await client
    .rpc("ensure_user_clinic", {
      p_app_clinic_key: clinicId || defaultConsultationClinicId,
      p_clinic_name: clinicName || clinicId || "Dental Consult Clinic",
    })
    .single<string>();

  assertNoSupabaseError(error);

  if (!data) {
    throw new Error("supabase_clinic_not_available");
  }

  return data;
}

async function upsertLookup(
  client: DynamicSupabaseClient,
  table: string,
  clinicId: string,
  name: string | undefined,
  extra: UnknownRecord = {},
) {
  const trimmedName = name?.trim();

  if (!trimmedName) {
    return null;
  }

  const { data, error } = await client
    .from(table)
    .upsert(
      {
        clinic_id: clinicId,
        name: trimmedName,
        ...extra,
      },
      { onConflict: Object.keys(extra).includes("staff_type") ? "clinic_id,name,staff_type" : "clinic_id,name" },
    )
    .select("id")
    .single<{ id: string }>();

  assertNoSupabaseError(error);

  return data?.id ?? null;
}

async function upsertPatient(client: DynamicSupabaseClient, clinicId: string, input: ConsultationInput) {
  const chartNo = input.chartNo?.trim() || `${input.patientName || "unknown"}-${input.date}`;
  const { data, error } = await client
    .from("patients")
    .upsert(
      {
        chart_no: chartNo,
        clinic_id: clinicId,
        name: input.patientName || "이름 없음",
        patient_type: input.patientType,
      },
      { onConflict: "clinic_id,chart_no" },
    )
    .select("id")
    .single<{ id: string }>();

  assertNoSupabaseError(error);

  return data?.id ?? null;
}

function mapSupabaseConsultation(row: SupabaseConsultationRow, clinicId: string, clinicName?: string): Consultation | null {
  const appRowId = toNumber(row.app_row_id);

  if (!appRowId) {
    return null;
  }

  return {
    agreedAmount: toNumber(row.agreed_amount),
    agreedTeeth: toNumber(row.agreed_teeth_count),
    chartNo: toText(row.patient?.chart_no),
    clinicId,
    clinicName,
    consultationAmount: toNumber(row.consultation_amount),
    consultedTeeth: toNumber(row.consulted_teeth_count),
    counselor: toText(row.counselor?.name),
    date: toText(row.consultation_date),
    disagreementReason: toText(row.disagreement_reason?.name) || undefined,
    doctor: toText(row.doctor?.name),
    id: appRowId,
    memo: toText(row.memo) || undefined,
    patientName: toText(row.patient?.name),
    patientType: row.patient?.patient_type === "returning" ? "returning" : "new",
    result: row.result ?? "declined",
    treatmentCategory: toText(row.treatment_category?.name),
    visitChannel: toText(row.visit_channel?.name),
  };
}

async function buildSupabaseConsultationPayload(
  client: DynamicSupabaseClient,
  clinicUuid: string,
  input: ConsultationInput,
  appRowId: number,
) {
  const patientId = await upsertPatient(client, clinicUuid, input);
  const counselorId = await upsertLookup(client, "staff", clinicUuid, input.counselor, { staff_type: "counselor" });
  const doctorId = await upsertLookup(client, "staff", clinicUuid, input.doctor, { staff_type: "doctor" });
  const visitChannelId = await upsertLookup(client, "visit_channels", clinicUuid, input.visitChannel);
  const treatmentCategoryId = await upsertLookup(client, "treatment_categories", clinicUuid, input.treatmentCategory);
  const disagreementReasonId = await upsertLookup(
    client,
    "disagreement_reasons",
    clinicUuid,
    input.disagreementReason,
  );

  if (!patientId) {
    throw new Error("supabase_patient_upsert_failed");
  }

  return {
    agreed_amount: input.agreedAmount,
    agreed_teeth_count: input.agreedTeeth,
    app_row_id: appRowId,
    clinic_id: clinicUuid,
    consultation_amount: input.consultationAmount,
    consultation_date: input.date,
    consulted_teeth_count: input.consultedTeeth,
    counselor_id: counselorId,
    disagreement_reason_id: disagreementReasonId,
    doctor_id: doctorId,
    is_cancelled_after_agreement: input.result === "cancelled",
    is_partial_treatment:
      (input.result === "same_day" || input.result === "follow_up") && input.consultedTeeth !== input.agreedTeeth,
    memo: input.memo ?? null,
    patient_id: patientId,
    result: input.result,
    treatment_category_id: treatmentCategoryId,
    visit_channel_id: visitChannelId,
  };
}

export async function readSupabaseConsultations({
  clinicId,
  clinicName,
}: {
  clinicId?: string;
  clinicName?: string;
}) {
  const client = getDynamicSupabaseClient();

  if (!client || !(await ensureAuthenticatedUser(client))) {
    return null;
  }

  const clinicUuid = await ensureClinicId(client, clinicId, clinicName);
  const { data, error } = await client
    .from("consultations")
    .select(
      "app_row_id,consultation_date,consulted_teeth_count,agreed_teeth_count,result,consultation_amount,agreed_amount,memo,patient:patients(name,chart_no,patient_type),counselor:staff!consultations_counselor_id_fkey(name),doctor:staff!consultations_doctor_id_fkey(name),visit_channel:visit_channels(name),treatment_category:treatment_categories(name),disagreement_reason:disagreement_reasons(name)",
    )
    .eq("clinic_id", clinicUuid)
    .order("consultation_date", { ascending: false });

  assertNoSupabaseError(error);

  return ((data ?? []) as SupabaseConsultationRow[])
    .map((row) => mapSupabaseConsultation(row, clinicId || defaultConsultationClinicId, clinicName))
    .filter((consultation): consultation is Consultation => Boolean(consultation));
}

export async function createSupabaseConsultation(input: ConsultationInput, appRowId: number) {
  const client = getDynamicSupabaseClient();

  if (!client || !(await ensureAuthenticatedUser(client))) {
    return null;
  }

  const clinicUuid = await ensureClinicId(client, input.clinicId, input.clinicName);
  const payload = await buildSupabaseConsultationPayload(client, clinicUuid, input, appRowId);
  const { data, error } = await client
    .from("consultations")
    .upsert(payload, { onConflict: "clinic_id,app_row_id" })
    .select(
      "app_row_id,consultation_date,consulted_teeth_count,agreed_teeth_count,result,consultation_amount,agreed_amount,memo,patient:patients(name,chart_no,patient_type),counselor:staff!consultations_counselor_id_fkey(name),doctor:staff!consultations_doctor_id_fkey(name),visit_channel:visit_channels(name),treatment_category:treatment_categories(name),disagreement_reason:disagreement_reasons(name)",
    )
    .single<SupabaseConsultationRow>();

  assertNoSupabaseError(error);

  return data ? mapSupabaseConsultation(data, input.clinicId || defaultConsultationClinicId, input.clinicName) : null;
}

export async function updateSupabaseConsultation(consultationId: number, input: ConsultationInput) {
  return createSupabaseConsultation(input, consultationId);
}

export async function deleteSupabaseConsultation({
  clinicId,
  clinicName,
  consultationId,
}: {
  clinicId?: string;
  clinicName?: string;
  consultationId: number;
}) {
  const client = getDynamicSupabaseClient();

  if (!client || !(await ensureAuthenticatedUser(client))) {
    return false;
  }

  const clinicUuid = await ensureClinicId(client, clinicId, clinicName);
  const { error } = await client
    .from("consultations")
    .delete()
    .eq("clinic_id", clinicUuid)
    .eq("app_row_id", consultationId);

  assertNoSupabaseError(error);

  return true;
}
