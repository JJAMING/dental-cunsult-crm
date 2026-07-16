"use client";

import {
  cloneAdminSettings,
  defaultAdminSettings,
  normalizeAdminSettings,
  type AdminSettings,
} from "@/lib/admin-settings";
import { defaultConsultationClinicId } from "@/lib/consultation-filters";
import { createSupabaseBrowserClientOrNull } from "@/lib/supabase/browser";

type SupabaseErrorLike = { message?: string } | null;
type SupabaseResult<T> = { data: T | null; error: SupabaseErrorLike };
type UnknownRecord = Record<string, unknown>;
type QueryBuilder = PromiseLike<SupabaseResult<UnknownRecord[]>> & {
  eq(column: string, value: unknown): QueryBuilder;
  maybeSingle<T = UnknownRecord>(): Promise<SupabaseResult<T>>;
  select(columns?: string): QueryBuilder;
  single<T = UnknownRecord>(): Promise<SupabaseResult<T>>;
  upsert(value: UnknownRecord | UnknownRecord[], options?: UnknownRecord): QueryBuilder;
};
type DynamicSupabaseClient = {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null }; error: SupabaseErrorLike }>;
  };
  from(table: string): QueryBuilder;
  rpc(functionName: string, args?: UnknownRecord): QueryBuilder;
};

type AdminSettingsSnapshotRow = {
  app_active_clinic_key?: string | null;
  payload?: unknown;
  updated_at?: string | null;
};

function getDynamicSupabaseClient() {
  const supabase = createSupabaseBrowserClientOrNull();

  return supabase ? (supabase as unknown as DynamicSupabaseClient) : null;
}

function assertNoSupabaseError(error: SupabaseErrorLike) {
  if (error) {
    throw new Error(error.message || "supabase_error");
  }
}

async function ensureAuthenticatedUser(client: DynamicSupabaseClient) {
  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

function getActiveClinicForSettings(settings: AdminSettings) {
  return settings.clinics.find((clinic) => clinic.id === settings.activeClinicId) ?? settings.clinics[0];
}

async function ensureClinicId(client: DynamicSupabaseClient, settings: AdminSettings) {
  const activeClinic = getActiveClinicForSettings(settings) ?? defaultAdminSettings.clinics[0];
  const { data, error } = await client
    .rpc("ensure_user_clinic", {
      p_app_clinic_key: activeClinic.id || defaultConsultationClinicId,
      p_clinic_name: activeClinic.name || "Dental Consult Clinic",
    })
    .single<string>();

  assertNoSupabaseError(error);

  if (!data) {
    throw new Error("supabase_clinic_not_available");
  }

  return data;
}

export async function readSupabaseAdminSettings(baseSettings: AdminSettings) {
  const client = getDynamicSupabaseClient();

  if (!client) {
    return null;
  }

  const user = await ensureAuthenticatedUser(client);

  if (!user) {
    return null;
  }

  const normalizedBaseSettings = normalizeAdminSettings(baseSettings);
  const clinicUuid = await ensureClinicId(client, normalizedBaseSettings);
  const { data, error } = await client
    .from("admin_settings_snapshots")
    .select("payload,app_active_clinic_key,updated_at")
    .eq("clinic_id", clinicUuid)
    .maybeSingle<AdminSettingsSnapshotRow>();

  assertNoSupabaseError(error);

  if (!data?.payload) {
    return null;
  }

  return normalizeAdminSettings(data.payload as AdminSettings);
}

export async function saveSupabaseAdminSettings(settings: AdminSettings) {
  const client = getDynamicSupabaseClient();

  if (!client) {
    return false;
  }

  const user = await ensureAuthenticatedUser(client);

  if (!user) {
    return false;
  }

  const normalizedSettings = normalizeAdminSettings(settings);
  const clinicUuid = await ensureClinicId(client, normalizedSettings);
  const { error } = await client
    .from("admin_settings_snapshots")
    .upsert(
      {
        app_active_clinic_key: normalizedSettings.activeClinicId,
        clinic_id: clinicUuid,
        payload: cloneAdminSettings(normalizedSettings) as unknown as UnknownRecord,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clinic_id" },
    )
    .select("clinic_id")
    .single();

  assertNoSupabaseError(error);

  return true;
}
