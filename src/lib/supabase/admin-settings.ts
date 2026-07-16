"use client";

import {
  cloneAdminSettings,
  defaultAdminSettings,
  normalizeAdminSettings,
  type AdminSettings,
  type ClinicSettings,
} from "@/lib/admin-settings";
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
type SupabaseClinicJoinRow = {
  app_clinic_key?: string | null;
  id?: string | null;
  name?: string | null;
};
type SupabaseProfileClinicRow = {
  clinic?: SupabaseClinicJoinRow | SupabaseClinicJoinRow[] | null;
  clinic_id?: string | null;
  name?: string | null;
  role?: string | null;
};
type SupabaseClinicMembershipRow = {
  clinic?: SupabaseClinicJoinRow | SupabaseClinicJoinRow[] | null;
  clinic_id?: string | null;
  role?: string | null;
};
type LinkedSupabaseClinic = {
  appClinicKey: string;
  clinicId: string;
  name: string;
  role?: string;
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

function getJoinedClinic(clinic: SupabaseProfileClinicRow["clinic"]) {
  if (Array.isArray(clinic)) {
    return clinic[0] ?? null;
  }

  return clinic ?? null;
}

async function readLinkedSupabaseClinic(client: DynamicSupabaseClient, userId: string) {
  const { data, error } = await client
    .from("profiles")
    .select("clinic_id,name,role,clinic:clinics(id,name,app_clinic_key)")
    .eq("id", userId)
    .maybeSingle<SupabaseProfileClinicRow>();

  assertNoSupabaseError(error);

  const clinic = getJoinedClinic(data?.clinic);
  const clinicId = clinic?.id || data?.clinic_id || "";

  if (!clinicId) {
    return null;
  }

  return {
    appClinicKey: clinic?.app_clinic_key || clinicId,
    clinicId,
    name: clinic?.name || data?.name || "연결된 치과",
    role: data?.role ?? undefined,
  } satisfies LinkedSupabaseClinic;
}

async function readIsSuperAdmin(client: DynamicSupabaseClient) {
  const { data, error } = await client.rpc("is_super_admin").single<boolean>();

  assertNoSupabaseError(error);

  return Boolean(data);
}

async function readAllSupabaseClinics(client: DynamicSupabaseClient) {
  const { data, error } = await client
    .from("clinics")
    .select("id,name,app_clinic_key");

  assertNoSupabaseError(error);

  return ((data ?? []) as SupabaseClinicJoinRow[])
    .flatMap((clinic) => {
      const clinicId = clinic.id || "";

      if (!clinicId) {
        return [];
      }

      const linkedClinic: LinkedSupabaseClinic = {
        appClinicKey: clinic.app_clinic_key || clinicId,
        clinicId,
        name: clinic.name || "연결된 치과",
        role: "admin",
      };

      return [linkedClinic];
    });
}

async function readLinkedSupabaseClinics(client: DynamicSupabaseClient, userId: string) {
  if (await readIsSuperAdmin(client)) {
    const clinics = await readAllSupabaseClinics(client);

    if (clinics.length) {
      return clinics;
    }
  }

  const { data, error } = await client
    .from("clinic_memberships")
    .select("clinic_id,role,clinic:clinics(id,name,app_clinic_key)")
    .eq("user_id", userId);

  assertNoSupabaseError(error);

  const linkedClinics: LinkedSupabaseClinic[] = ((data ?? []) as SupabaseClinicMembershipRow[])
    .flatMap((membership) => {
      const clinic = getJoinedClinic(membership.clinic);
      const clinicId = clinic?.id || membership.clinic_id || "";

      if (!clinicId) {
        return [];
      }

      const linkedClinic: LinkedSupabaseClinic = {
        appClinicKey: clinic?.app_clinic_key || clinicId,
        clinicId,
        name: clinic?.name || "연결된 치과",
        role: membership.role ?? undefined,
      };

      return [linkedClinic];
    });

  if (linkedClinics.length) {
    return linkedClinics;
  }

  const fallbackClinic = await readLinkedSupabaseClinic(client, userId);

  return fallbackClinic ? [fallbackClinic] : [];
}

function getClinicTemplate(settings: AdminSettings, linkedClinic: LinkedSupabaseClinic) {
  const normalizedSettings = normalizeAdminSettings(settings);

  return (
    normalizedSettings.clinics.find(
      (clinic) => clinic.id === linkedClinic.appClinicKey || clinic.id === linkedClinic.clinicId,
    ) ??
    normalizedSettings.clinics[0] ??
    defaultAdminSettings.clinics[0]
  );
}

function buildSettingsForLinkedClinic(settings: AdminSettings, linkedClinic: LinkedSupabaseClinic) {
  const template = getClinicTemplate(settings, linkedClinic);
  const nextClinic: ClinicSettings = {
    ...template,
    id: linkedClinic.appClinicKey,
    name: linkedClinic.name,
  };

  return normalizeAdminSettings({
    activeClinicId: nextClinic.id,
    clinics: [nextClinic],
  });
}

async function readAdminSettingsSnapshot(client: DynamicSupabaseClient, clinicId: string) {
  const { data, error } = await client
    .from("admin_settings_snapshots")
    .select("payload,app_active_clinic_key,updated_at")
    .eq("clinic_id", clinicId)
    .maybeSingle<AdminSettingsSnapshotRow>();

  assertNoSupabaseError(error);

  return data?.payload ? (data.payload as AdminSettings) : null;
}

function buildSettingsForLinkedClinics(
  baseSettings: AdminSettings,
  linkedClinics: LinkedSupabaseClinic[],
  snapshots: Map<string, AdminSettings>,
) {
  const normalizedBaseSettings = normalizeAdminSettings(baseSettings);
  const clinics = linkedClinics.map((linkedClinic) => {
    const snapshot = snapshots.get(linkedClinic.clinicId);
    const template = getClinicTemplate(snapshot ?? normalizedBaseSettings, linkedClinic);

    return {
      ...template,
      id: linkedClinic.appClinicKey,
      name: linkedClinic.name,
    } satisfies ClinicSettings;
  });
  const activeClinicId = clinics.some((clinic) => clinic.id === normalizedBaseSettings.activeClinicId)
    ? normalizedBaseSettings.activeClinicId
    : clinics[0]?.id ?? defaultAdminSettings.activeClinicId;

  return normalizeAdminSettings({
    activeClinicId,
    clinics: clinics.length ? clinics : normalizedBaseSettings.clinics,
  });
}

function findLinkedClinicForSettings(settings: AdminSettings, linkedClinics: LinkedSupabaseClinic[]) {
  const normalizedSettings = normalizeAdminSettings(settings);

  return (
    linkedClinics.find(
      (clinic) =>
        clinic.appClinicKey === normalizedSettings.activeClinicId ||
        clinic.clinicId === normalizedSettings.activeClinicId,
    ) ??
    linkedClinics[0] ??
    null
  );
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

  const linkedClinics = await readLinkedSupabaseClinics(client, user.id);

  if (!linkedClinics.length) {
    return null;
  }

  const snapshots = new Map<string, AdminSettings>();
  await Promise.all(
    linkedClinics.map(async (linkedClinic) => {
      const snapshot = await readAdminSettingsSnapshot(client, linkedClinic.clinicId);

      if (snapshot) {
        snapshots.set(linkedClinic.clinicId, snapshot);
      }
    }),
  );

  return buildSettingsForLinkedClinics(baseSettings, linkedClinics, snapshots);
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

  const linkedClinics = await readLinkedSupabaseClinics(client, user.id);
  const linkedClinic = findLinkedClinicForSettings(settings, linkedClinics);

  if (!linkedClinic) {
    return false;
  }

  const normalizedSettings = buildSettingsForLinkedClinic(settings, linkedClinic);
  const { error } = await client
    .from("admin_settings_snapshots")
    .upsert(
      {
        app_active_clinic_key: normalizedSettings.activeClinicId,
        clinic_id: linkedClinic.clinicId,
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
