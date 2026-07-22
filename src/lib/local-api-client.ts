"use client";

import {
  adminSettingsStorageKey,
  cloneAdminSettings,
  normalizeAdminSettings,
  type AdminSettings,
  type ClinicSettings,
} from "@/lib/admin-settings";

type LocalApiClientConfig = {
  activeClinic: ClinicSettings;
  baseUrl: string;
};

type DesktopLocalApiRequest = {
  body?: string;
  headers?: Record<string, string>;
  method: "DELETE" | "GET" | "POST" | "PUT";
  url: string;
};

type DesktopLocalApiResponse = {
  body: string;
  ok: boolean;
  status: number;
};

declare global {
  interface Window {
    dentalConsultDesktop?: {
      requestLocalApi(request: DesktopLocalApiRequest): Promise<DesktopLocalApiResponse>;
    };
  }
}
export type LocalApiRuntimeStatus = {
  baseUrl: string;
  checkedAt: string;
  clinicName: string;
  message: string;
  mode: "server" | "client";
  state: "unknown" | "connected" | "fallback" | "unauthorized";
};

export type DentwebSnapshotAppointment = {
  appointmentDate?: string;
  appointmentTime?: string;
  chartNo?: string;
  doctor?: string;
  id?: number | string;
  memo?: string;
  patientName?: string;
  status?: string;
  syncedAt?: string;
};

export type DentwebSnapshotPatient = {
  appointments?: DentwebSnapshotAppointment[];
  birthDate?: string;
  chartNo?: string;
  hasPhoneHash?: boolean;
  id?: number | string;
  latestAppointment?: DentwebSnapshotAppointment | null;
  memo?: string;
  patientName?: string;
  rawKeys?: string[];
  syncedAt?: string;
};

export type DentwebPatientSearchResponse = {
  checkedAt?: string;
  clinicId?: string;
  count?: number;
  error?: string;
  limit?: number;
  message?: string;
  ok: boolean;
  patients?: DentwebSnapshotPatient[];
  query?: string;
  readOnly?: boolean;
};

export type DentwebPatientAppointmentsResponse = {
  appointments?: DentwebSnapshotAppointment[];
  chartNo?: string;
  checkedAt?: string;
  clinicId?: string;
  count?: number;
  error?: string;
  message?: string;
  ok: boolean;
  patientId?: number | string | null;
  patientName?: string;
  readOnly?: boolean;
};

type LocalApiClientCredentials = {
  clinicName?: string;
  deviceId: string;
  serverUrl?: string;
  status?: string;
  token?: string;
};

const requestTimeoutMs = 2500;
const localApiDeviceIdStorageKey = "dental-consult-dentweb-device-id";
const localApiClientTokenStorageKey = "dental-consult-dentweb-client-token-v1";
const localApiRegistrationStorageKey = "dental-consult-dentweb-registration-v1";
const localApiRuntimeStatusStorageKey = "dental-consult-local-api-status-v1";
export const localApiRuntimeStatusChangedEvent = "dental-consult-local-api-status-changed";

function normalizeHost(host: string) {
  const trimmedHost = host.trim();

  if (!trimmedHost || trimmedHost === "0.0.0.0" || trimmedHost === "::") {
    return "127.0.0.1";
  }

  return trimmedHost.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function getLocalApiClientConfig(): LocalApiClientConfig | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(adminSettingsStorageKey);
    const settings = storedValue
      ? normalizeAdminSettings(JSON.parse(storedValue) as AdminSettings)
      : cloneAdminSettings();
    const activeClinic =
      settings.clinics.find((clinic) => clinic.id === settings.activeClinicId) ?? settings.clinics[0];
    const integration = activeClinic.dentwebIntegration;
    const host = normalizeHost(integration.serverHost);
    const port = Number.isFinite(integration.serverPort) ? integration.serverPort : 34254;

    return {
      activeClinic,
      baseUrl: `http://${host}:${port}`,
    };
  } catch {
    return null;
  }
}

export function getLocalApiDeviceId() {
  if (typeof window === "undefined") {
    return `device-${Date.now()}`;
  }

  try {
    const storedDeviceId = window.localStorage.getItem(localApiDeviceIdStorageKey);

    if (storedDeviceId) {
      return storedDeviceId;
    }

    const nextDeviceId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `device-${Date.now()}-${Math.round(Math.random() * 100000)}`;

    window.localStorage.setItem(localApiDeviceIdStorageKey, nextDeviceId);
    return nextDeviceId;
  } catch {
    return `device-${Date.now()}-${Math.round(Math.random() * 100000)}`;
  }
}

function readLocalApiToken() {
  try {
    return window.localStorage.getItem(localApiClientTokenStorageKey) ?? "";
  } catch {
    return "";
  }
}

export function saveLocalApiClientCredentials(credentials: LocalApiClientCredentials) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(localApiDeviceIdStorageKey, credentials.deviceId);

    if (credentials.token) {
      window.localStorage.setItem(localApiClientTokenStorageKey, credentials.token);
    } else if (credentials.status !== "approved") {
      window.localStorage.removeItem(localApiClientTokenStorageKey);
    }

    window.localStorage.setItem(
      localApiRegistrationStorageKey,
      JSON.stringify({
        ...credentials,
        savedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Token persistence is best-effort. The user can re-run pairing if storage is blocked.
  }
}

function writeLocalApiRuntimeStatus(status: LocalApiRuntimeStatus) {
  try {
    window.localStorage.setItem(localApiRuntimeStatusStorageKey, JSON.stringify(status));
    window.dispatchEvent(new Event(localApiRuntimeStatusChangedEvent));
  } catch {
    // Status display should never block data access.
  }
}

export function readLocalApiRuntimeStatus(): LocalApiRuntimeStatus {
  const config = getLocalApiClientConfig();
  const fallbackStatus: LocalApiRuntimeStatus = {
    baseUrl: config?.baseUrl ?? "",
    checkedAt: "",
    clinicName: config?.activeClinic.name ?? "",
    message:
      config?.activeClinic.dentwebIntegration.mode === "client"
        ? "서버 PC 연결 확인 전입니다."
        : "서버 PC 로컬 저장 상태 확인 전입니다.",
    mode: config?.activeClinic.dentwebIntegration.mode ?? "server",
    state: "unknown",
  };

  if (typeof window === "undefined") {
    return fallbackStatus;
  }

  try {
    const storedValue = window.localStorage.getItem(localApiRuntimeStatusStorageKey);

    if (!storedValue) {
      return fallbackStatus;
    }

    return {
      ...fallbackStatus,
      ...(JSON.parse(storedValue) as Partial<LocalApiRuntimeStatus>),
    };
  } catch {
    return fallbackStatus;
  }
}

export function subscribeToLocalApiRuntimeStatus(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(localApiRuntimeStatusChangedEvent, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(localApiRuntimeStatusChangedEvent, callback);
  };
}

function buildLocalApiStatus(
  config: LocalApiClientConfig,
  state: LocalApiRuntimeStatus["state"],
  message: string,
): LocalApiRuntimeStatus {
  return {
    baseUrl: config.baseUrl,
    checkedAt: new Date().toISOString(),
    clinicName: config.activeClinic.name,
    message,
    mode: config.activeClinic.dentwebIntegration.mode,
    state,
  };
}

function getLocalApiAuthHeaders(config: LocalApiClientConfig) {
  if (config.activeClinic.dentwebIntegration.mode !== "client") {
    return {};
  }

  const token = readLocalApiToken();

  return {
    "X-Device-Id": getLocalApiDeviceId(),
    ...(token ? { "X-Client-Token": token } : {}),
  };
}

export async function fetchLocalApiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = getLocalApiClientConfig();

  if (!config) {
    throw new Error("local_api_not_configured");
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const requestHeaders = {
      "Content-Type": "application/json",
      ...getLocalApiAuthHeaders(config),
      ...(init.headers ?? {}),
    };
    const url = `${config.baseUrl}${path}`;
    const desktopBridge = window.dentalConsultDesktop;
    const response = desktopBridge
      ? await desktopBridge.requestLocalApi({
          body: typeof init.body === "string" ? init.body : undefined,
          headers: Object.fromEntries(new Headers(requestHeaders).entries()),
          method: (init.method ?? "GET").toUpperCase() as DesktopLocalApiRequest["method"],
          url,
        })
      : await fetch(url, {
          ...init,
          headers: requestHeaders,
          signal: controller.signal,
        });

    if (!response.ok) {
      const state = response.status === 401 || response.status === 403 ? "unauthorized" : "fallback";

      writeLocalApiRuntimeStatus(
        buildLocalApiStatus(
          config,
          state,
          state === "unauthorized"
            ? "서버 PC 승인이 필요합니다. 관리자모드에서 연동을 승인해주세요."
            : "서버 PC 응답 오류로 브라우저 백업 저장을 사용합니다.",
        ),
      );
      throw new Error(`local_api_${response.status}`);
    }

    const payload = desktopBridge
      ? (JSON.parse((response as DesktopLocalApiResponse).body) as T)
      : ((await (response as Response).json()) as T);

    writeLocalApiRuntimeStatus(
      buildLocalApiStatus(config, "connected", "서버 PC 중앙 DB에 연결되어 있습니다."),
    );

    return payload;
  } catch (error) {
    if (error instanceof Error && !error.message.startsWith("local_api_")) {
      writeLocalApiRuntimeStatus(
        buildLocalApiStatus(config, "fallback", "서버 PC에 연결하지 못해 브라우저 백업 저장을 사용합니다."),
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function getActiveLocalApiClinic() {
  return getLocalApiClientConfig()?.activeClinic ?? null;
}

export async function searchDentwebPatients({
  clinicId,
  limit = 6,
  query,
}: {
  clinicId: string;
  limit?: number;
  query: string;
}) {
  const params = new URLSearchParams({
    clinicId,
    limit: String(limit),
    q: query,
  });

  return fetchLocalApiJson<DentwebPatientSearchResponse>(`/dentweb/patients/search?${params.toString()}`);
}

export async function loadDentwebPatientAppointments({
  chartNo,
  clinicId,
  limit = 10,
  patientId,
  patientName,
}: {
  chartNo?: string;
  clinicId: string;
  limit?: number;
  patientId?: number | string;
  patientName?: string;
}) {
  const params = new URLSearchParams({
    clinicId,
    limit: String(limit),
  });

  if (patientId !== undefined && patientId !== null) {
    params.set("patientId", String(patientId));
  }

  if (chartNo) {
    params.set("chartNo", chartNo);
  }

  if (patientName) {
    params.set("patientName", patientName);
  }

  return fetchLocalApiJson<DentwebPatientAppointmentsResponse>(
    `/dentweb/patients/appointments?${params.toString()}`,
  );
}

export async function syncAdminSettingsToLocalApi(settings: AdminSettings) {
  const normalizedSettings = normalizeAdminSettings(settings);
  const activeClinic =
    normalizedSettings.clinics.find((clinic) => clinic.id === normalizedSettings.activeClinicId) ??
    normalizedSettings.clinics[0];

  await fetchLocalApiJson(`/app-data/admin-settings/${encodeURIComponent(activeClinic.id)}`, {
    body: JSON.stringify({
      activeClinicId: normalizedSettings.activeClinicId,
      clinic: activeClinic,
      syncedAt: new Date().toISOString(),
    }),
    method: "PUT",
  });
}
