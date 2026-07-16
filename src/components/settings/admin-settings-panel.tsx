"use client";

import {
  ArrowDown,
  ArrowUp,
  ClipboardList,
  LayoutDashboard,
  MessageSquareText,
  Plus,
  RotateCcw,
  Save,
  Server,
  Trash2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useAdminSettings } from "@/hooks/use-admin-settings";
import {
  adminSettingsChangedEvent,
  adminSettingsStorageKey,
  cloneAdminSettings,
  defaultAdminSettings,
  defaultRecommendationPhrases,
  getDefaultDisagreementReasonRecommendationPhrase,
  getDashboardGoalForMonth,
  optionGroupConfigs,
  recommendationPhraseConfigs,
  upsertDashboardMonthlyGoal,
  type DashboardGoals,
  type DentwebIntegrationSettings,
  type DisagreementReasonRecommendationPhrases,
  type OptionGroupKey,
  type OptionItem,
  type RecommendationPhrases,
} from "@/lib/admin-settings";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  getLocalApiDeviceId,
  saveLocalApiClientCredentials,
} from "@/lib/local-api-client";

const inputClass =
  "h-10 w-full rounded-md border border-pebble bg-white px-3 text-sm text-ink outline-none transition placeholder:text-iron focus:border-monday-violet";

type DeleteTarget = {
  groupKey: OptionGroupKey;
  optionId: string;
  label: string;
} | null;

type DentwebConnectionCheck = {
  status: "idle" | "checking" | "success" | "error";
  message: string;
  clinicName?: string;
  registrationStatus?: string;
  serverUrl?: string;
};

type DentwebClientStatus = "pending_approval" | "approved" | "rejected";

type DentwebClientDevice = {
  approvedAt?: string;
  hasToken?: boolean;
  id: string;
  name: string;
  rejectedAt?: string;
  remoteAddress?: string;
  requestedAt?: string;
  status: DentwebClientStatus;
  token?: string;
  updatedAt?: string;
};

type DentwebClientApprovalState = {
  status: "idle" | "loading" | "success" | "error";
  message: string;
  clients: DentwebClientDevice[];
  serverUrl?: string;
};

type DentwebHealthResponse = {
  clinicId?: string;
  clinicName?: string;
  ok?: boolean;
};

type DentwebClinicResponse = {
  clinic?: {
    id?: string;
    name?: string;
  };
  dentweb?: {
    connected?: boolean;
    message?: string;
    status?: string;
  };
};

type DentwebRegisterResponse = {
  device?: Partial<DentwebClientDevice>;
  message?: string;
  ok?: boolean;
  status?: string;
};

type DentwebClientsResponse = {
  clients?: DentwebClientDevice[];
  ok?: boolean;
};

type DentwebDiscoveryCandidate = {
  exists: boolean;
  message?: string;
  modifiedAt?: string;
  path: string;
  readable: boolean;
  size?: number;
  source: string;
  type: string;
};

type DentwebProcessInfo = {
  name: string;
  pid: string;
};

type DentwebDiscoveryResponse = {
  candidates?: DentwebDiscoveryCandidate[];
  checkedAt?: string;
  message?: string;
  ok?: boolean;
  processes?: DentwebProcessInfo[];
  readOnly?: boolean;
  selectedCandidate?: DentwebDiscoveryCandidate | null;
  status?: string;
};

type DentwebConnectionTestResponse = {
  candidate?: DentwebDiscoveryCandidate | null;
  checkedAt?: string;
  message?: string;
  ok?: boolean;
  readOnly?: boolean;
  status?: string;
};

type DentwebMappingSuggestion = {
  confidence?: string;
  matchedColumns?: Record<
    string,
    {
      columnName?: string;
      label?: string;
    }
  >;
  reasons?: string[];
  score?: number;
  tableName?: string;
  tableType?: string;
};

type DentwebSourceTableMapping = {
  columns?: Record<string, string>;
  tableName?: string;
};

type DentwebSourceMapping = {
  adapterId?: string;
  appointments?: DentwebSourceTableMapping | null;
  patients?: DentwebSourceTableMapping | null;
  savedAt?: string;
  sourceFile?: string;
  sourcePath?: string;
};

type DentwebSourceMappingResponse = {
  checkedAt?: string;
  configured?: boolean;
  message?: string;
  ok?: boolean;
  readOnly?: boolean;
  sourceMapping?: DentwebSourceMapping | null;
  sourcePath?: string | null;
};

type DentwebMappingPreviewField = {
  columnExists?: boolean;
  columnName?: string;
  hasValue?: boolean;
  key?: string;
  label?: string;
  length?: number;
  mapped?: boolean;
  preview?: string;
};

type DentwebMappingPreviewSection = {
  mappedFields?: DentwebMappingPreviewField[];
  sampleCount?: number;
  samples?: {
    fields?: DentwebMappingPreviewField[];
    rowNumber?: number;
  }[];
  tableName?: string;
  totalRows?: number;
  warnings?: string[];
};

type DentwebMappingPreviewResponse = {
  checkedAt?: string;
  message?: string;
  ok?: boolean;
  preview?: {
    appointments?: DentwebMappingPreviewSection;
    patients?: DentwebMappingPreviewSection;
  } | null;
  readOnly?: boolean;
  sourceFile?: string;
  sourcePath?: string;
  warnings?: string[];
};

type DentwebSchemaReportField = {
  columnName?: string;
  key?: string;
  label?: string;
};

type DentwebSchemaReportCandidate = {
  confidence?: string;
  matchRate?: number;
  matchedFieldCount?: number;
  matchedFields?: DentwebSchemaReportField[];
  missingFields?: DentwebSchemaReportField[];
  recommendation?: string;
  requiredFieldCount?: number;
  score?: number;
  tableName?: string;
  tableType?: string;
};

type DentwebSchemaReportGroup = {
  candidates?: DentwebSchemaReportCandidate[];
  requiredFields?: DentwebSchemaReportField[];
  target?: string;
  title?: string;
};

type DentwebSchemaReportResponse = {
  adapterId?: string | null;
  checkedAt?: string;
  columnCount?: number;
  groups?: DentwebSchemaReportGroup[];
  message?: string;
  ok?: boolean;
  readOnly?: boolean;
  sourceFile?: string | null;
  sourcePath?: string;
  status?: string;
  tableCount?: number;
  tables?: DentwebSourceProbeTable[];
  warnings?: string[];
};

type DentwebIntegrationStatusCheck = {
  key?: string;
  label?: string;
  message?: string;
  status?: "pass" | "warning" | "block" | "wait" | "skip";
  target?: string;
};

type DentwebIntegrationStatusResponse = {
  adapterId?: string | null;
  checkedAt?: string;
  checks?: DentwebIntegrationStatusCheck[];
  mappingConfigured?: boolean;
  message?: string;
  ok?: boolean;
  previewClean?: boolean;
  previewRequired?: boolean;
  readOnly?: boolean;
  readyToSync?: boolean;
  sourcePath?: string | null;
  sourceProbeStatus?: string | null;
  status?: string;
  warnings?: string[];
};

type DentwebSourceProbeTable = {
  columns?: {
    name?: string;
    type?: string;
  }[];
  name?: string;
  type?: string;
};

type DentwebSourceProbeEvidence = {
  appointments?: number;
  appointmentKeys?: string[];
  confidence?: string;
  mappingSuggestions?: {
    appointments?: DentwebMappingSuggestion[];
    patients?: DentwebMappingSuggestion[];
  };
  patients?: number;
  patientKeys?: string[];
  sourceFile?: string;
  tables?: DentwebSourceProbeTable[];
};

type DentwebMappingTarget = "patients" | "appointments";

type DentwebMappingFieldConfig = {
  key: string;
  label: string;
};

type DentwebSourceProbeItem = {
  adapterId?: string;
  evidence?: DentwebSourceProbeEvidence;
  label?: string;
  message?: string;
  readOnly?: boolean;
  status?: string;
  syncReady?: boolean;
};

type DentwebSourceProbeResponse = {
  candidate?: DentwebDiscoveryCandidate | null;
  checkedAt?: string;
  message?: string;
  ok?: boolean;
  probes?: DentwebSourceProbeItem[];
  readOnly?: boolean;
  selectedProbe?: DentwebSourceProbeItem | null;
  sourcePath?: string;
  status?: string;
  warnings?: string[];
};

type DentwebDiscoveryState = {
  status: "idle" | "loading" | "success" | "error";
  message: string;
  candidates: DentwebDiscoveryCandidate[];
  processes: DentwebProcessInfo[];
  selectedCandidate?: DentwebDiscoveryCandidate | null;
  sourceMapping?: DentwebSourceMappingResponse;
  sourcePreview?: DentwebMappingPreviewResponse;
  sourceProbe?: DentwebSourceProbeResponse;
  schemaReport?: DentwebSchemaReportResponse;
  integrationStatus?: DentwebIntegrationStatusResponse;
  serverUrl?: string;
};

type LocalDbStatusResponse = {
  checkedAt?: string;
  clinic?: {
    id?: string;
    name?: string;
  };
  db?: {
    exists?: boolean;
    modifiedAt?: string | null;
    path?: string;
    schemaVersion?: number;
    size?: number;
    storageMode?: string;
  };
  message?: string;
  ok?: boolean;
  lastSyncRun?: DentwebSyncRun | null;
  rowCounts?: Record<string, number>;
  tables?: string[];
};

type DentwebSyncRun = {
  errorMessage?: string;
  finishedAt?: string;
  id?: string;
  readOnly?: boolean;
  startedAt?: string;
  status?: string;
  summary?: {
    appointments?: number;
    patients?: number;
    sourceFiles?: string[];
    sourcePath?: string;
    syncedAt?: string;
  } | null;
};

type LocalDbDryRunAction = {
  description?: string;
  status?: string;
  step: string;
  target?: string;
};

type LocalDbDryRunResponse = LocalDbStatusResponse & {
  dentweb?: {
    candidate?: DentwebDiscoveryCandidate | null;
    path?: string | null;
    readable?: boolean;
  };
  dryRun?: boolean;
  plannedActions?: LocalDbDryRunAction[];
  readOnly?: boolean;
  status?: string;
  warnings?: string[];
};

type DentwebSyncNowResponse = LocalDbStatusResponse & {
  preview?: DentwebMappingPreviewResponse["preview"];
  readOnly?: boolean;
  sourcePath?: string;
  syncRun?: DentwebSyncRun;
  warnings?: string[];
};

type DentwebSnapshotAppointment = {
  appointmentDate?: string;
  appointmentTime?: string;
  chartNo?: string;
  doctor?: string;
  id?: string;
  patientName?: string;
  status?: string;
  syncedAt?: string;
};

type DentwebSnapshotPatient = {
  appointments?: DentwebSnapshotAppointment[];
  birthDate?: string;
  chartNo?: string;
  hasPhoneHash?: boolean;
  id?: string;
  latestAppointment?: DentwebSnapshotAppointment | null;
  patientName?: string;
  rawKeys?: string[];
  syncedAt?: string;
};

type DentwebPatientSearchResponse = {
  checkedAt?: string;
  clinicId?: string;
  count?: number;
  limit?: number;
  message?: string;
  ok?: boolean;
  patients?: DentwebSnapshotPatient[];
  query?: string;
  readOnly?: boolean;
};

type DentwebPatientSearchState = {
  message: string;
  payload?: DentwebPatientSearchResponse;
  status: "idle" | "loading" | "success" | "error";
};

type LocalDbState = {
  status: "idle" | "loading" | "success" | "error";
  message: string;
  serverUrl?: string;
  statusPayload?: LocalDbStatusResponse;
  dryRunPayload?: LocalDbDryRunResponse;
  syncPayload?: DentwebSyncNowResponse;
};

function parseNumberInput(value: string) {
  const parsedValue = Number(value.replace(/[^0-9]/g, ""));

  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function buildDentwebApiBaseUrl(host: string, port: number) {
  const safePort = port > 0 ? port : 34254;
  const trimmedHost = host.trim().replace(/\/+$/, "") || "127.0.0.1";
  const browserHost = trimmedHost === "0.0.0.0" || trimmedHost === "::" ? "127.0.0.1" : trimmedHost;
  const urlText = /^https?:\/\//i.test(browserHost) ? browserHost : `http://${browserHost}`;

  try {
    const url = new URL(urlText);

    if (!url.port) {
      url.port = String(safePort);
    }

    return url.origin;
  } catch {
    return `http://127.0.0.1:${safePort}`;
  }
}

function getDentwebClientStatusLabel(status: DentwebClientStatus) {
  if (status === "approved") {
    return "승인됨";
  }

  if (status === "rejected") {
    return "거절됨";
  }

  return "승인 대기";
}

function formatDentwebClientDate(value?: string) {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "-";
  }

  return parsedDate.toLocaleString("ko-KR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  });
}

function getDentwebCandidateSourceLabel(source: string) {
  if (source === "manual" || source === "manual_connection_test") {
    return "수동 입력";
  }

  if (source === "common_install_path") {
    return "설치 경로";
  }

  if (source === "db_file_candidate") {
    return "DB 후보";
  }

  return source || "기타";
}

function getDentwebCandidateTypeLabel(type: string) {
  if (type === "directory") {
    return "폴더";
  }

  if (type === "file") {
    return "파일";
  }

  if (type === "missing") {
    return "없음";
  }

  return type || "-";
}

function formatDentwebFileSize(size?: number) {
  if (typeof size !== "number" || !Number.isFinite(size)) {
    return "";
  }

  if (size < 1024) {
    return `${formatNumber(size)}B`;
  }

  if (size < 1024 * 1024) {
    return `${formatNumber(Math.round(size / 1024))}KB`;
  }

  return `${formatNumber(Math.round(size / 1024 / 1024))}MB`;
}

function getDentwebProbeStatusLabel(status?: string) {
  if (status === "sync_adapter_ready") {
    return "동기화 가능";
  }

  if (status === "schema_mapping_required") {
    return "매핑 필요";
  }

  if (status === "adapter_required") {
    return "어댑터 필요";
  }

  if (status === "no_supported_files") {
    return "지원 파일 없음";
  }

  if (status === "ready") {
    return "준비됨";
  }

  if (status === "schema_detected") {
    return "스키마 감지";
  }

  if (status === "empty_snapshot" || status === "empty_schema") {
    return "데이터 없음";
  }

  if (status === "invalid_json" || status === "open_failed") {
    return "확인 실패";
  }

  return status || "-";
}

function getDentwebProbeBadgeClass(status?: string) {
  if (status === "sync_adapter_ready" || status === "ready") {
    return "bg-[#dff8e6] text-[#146c2e]";
  }

  if (status === "schema_mapping_required" || status === "schema_detected" || status === "adapter_required") {
    return "bg-[#fff2cc] text-[#8a5a00]";
  }

  return "bg-[#ffe1e7] text-[#ad1f3d]";
}

function getDentwebMappingConfidenceLabel(confidence?: string) {
  if (confidence === "high") {
    return "높음";
  }

  if (confidence === "medium") {
    return "보통";
  }

  if (confidence === "low") {
    return "낮음";
  }

  return "확인 필요";
}

function getDentwebMappingConfidenceClass(confidence?: string) {
  if (confidence === "high") {
    return "bg-[#dff8e6] text-[#146c2e]";
  }

  if (confidence === "medium") {
    return "bg-[#fff2cc] text-[#8a5a00]";
  }

  return "bg-cloud text-slate";
}

function getDentwebIntegrationCheckLabel(status?: string) {
  if (status === "pass") {
    return "완료";
  }

  if (status === "warning") {
    return "확인";
  }

  if (status === "block") {
    return "막힘";
  }

  if (status === "wait") {
    return "대기";
  }

  if (status === "skip") {
    return "생략";
  }

  return status || "-";
}

function getDentwebIntegrationCheckClass(status?: string) {
  if (status === "pass") {
    return "bg-[#dff8e6] text-[#146c2e]";
  }

  if (status === "warning" || status === "wait") {
    return "bg-[#fff2cc] text-[#8a5a00]";
  }

  if (status === "block") {
    return "bg-[#ffe1e7] text-[#ad1f3d]";
  }

  return "bg-cloud text-slate";
}

const dentwebMappingFieldConfigs: Record<DentwebMappingTarget, DentwebMappingFieldConfig[]> = {
  patients: [
    { key: "chartNo", label: "차트번호" },
    { key: "patientName", label: "환자명" },
    { key: "birthDate", label: "생년월일" },
    { key: "phone", label: "연락처" },
  ],
  appointments: [
    { key: "appointmentDate", label: "예약일" },
    { key: "appointmentTime", label: "예약시간" },
    { key: "chartNo", label: "차트번호" },
    { key: "patientName", label: "환자명" },
    { key: "doctor", label: "담당의" },
    { key: "status", label: "예약상태" },
  ],
};

function getDentwebProbeTables(probe?: DentwebSourceProbeResponse): DentwebSourceProbeTable[] {
  return probe?.selectedProbe?.evidence?.tables ?? [];
}

function getDentwebColumnsForTable(probe: DentwebSourceProbeResponse | undefined, tableName?: string) {
  if (!tableName) {
    return [];
  }

  return (
    getDentwebProbeTables(probe)
      .find((table) => table.name === tableName)
      ?.columns?.map((column) => column.name)
      .filter((columnName): columnName is string => Boolean(columnName)) ?? []
  );
}

function createDentwebSourceTableMapping(suggestion?: DentwebMappingSuggestion): DentwebSourceTableMapping | null {
  if (!suggestion?.tableName) {
    return null;
  }

  const columns = Object.entries(suggestion.matchedColumns ?? {}).reduce<Record<string, string>>(
    (columnMap, [fieldKey, column]) => {
      if (column.columnName) {
        columnMap[fieldKey] = column.columnName;
      }

      return columnMap;
    },
    {},
  );

  return {
    tableName: suggestion.tableName,
    columns,
  };
}

function createDentwebSourceMappingFromProbe(probe?: DentwebSourceProbeResponse): DentwebSourceMapping | null {
  const suggestions = probe?.selectedProbe?.evidence?.mappingSuggestions;
  const patients = createDentwebSourceTableMapping(suggestions?.patients?.[0]);
  const appointments = createDentwebSourceTableMapping(suggestions?.appointments?.[0]);

  if (!patients && !appointments) {
    return null;
  }

  return {
    adapterId: "sqlite_mapped_readonly",
    sourcePath: probe?.sourcePath ?? "",
    sourceFile: probe?.selectedProbe?.evidence?.sourceFile ?? "",
    patients,
    appointments,
  };
}

function withDentwebMappingSource(
  mapping: DentwebSourceMapping | null,
  probe?: DentwebSourceProbeResponse,
): DentwebSourceMapping | null {
  if (!mapping) {
    return null;
  }

  return {
    ...mapping,
    adapterId: "sqlite_mapped_readonly",
    sourcePath: mapping.sourcePath || probe?.sourcePath || "",
    sourceFile: mapping.sourceFile || probe?.selectedProbe?.evidence?.sourceFile || "",
  };
}

function hasDentwebMappingTable(mapping: DentwebSourceMapping | null, target: DentwebMappingTarget) {
  return Boolean(mapping?.[target]?.tableName);
}

function hasCleanDentwebMappingPreview(preview?: DentwebMappingPreviewResponse) {
  return Boolean(preview?.ok && (preview.warnings?.length ?? 0) === 0);
}

function shouldRequireDentwebMappingPreview(mapping?: DentwebSourceMapping | null, probe?: DentwebSourceProbeResponse) {
  return (
    mapping?.adapterId === "sqlite_mapped_readonly" ||
    probe?.selectedProbe?.adapterId === "sqlite_schema_probe" ||
    probe?.status === "schema_mapping_required"
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "서버 응답 시간이 초과됐습니다. 서버 PC가 켜져 있는지, 주소와 포트를 확인해주세요.";
  }

  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return "서버 API에 연결할 수 없습니다. 서버 PC의 API가 실행 중인지, IP와 포트가 맞는지 확인해주세요.";
  }

  return error instanceof Error ? error.message : "서버 연결을 확인하지 못했습니다.";
}

async function fetchJsonWithTimeout<T>(url: string, init?: RequestInit, timeoutMs = 5000): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const message = typeof payload?.message === "string" ? payload.message : `서버 응답 오류 ${response.status}`;

      throw new Error(message);
    }

    return payload as T;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function cloneDashboardGoals(goals: DashboardGoals): DashboardGoals {
  return {
    monthlyGoals: goals.monthlyGoals.map((goal) => ({ ...goal })),
  };
}

function cloneDentwebIntegrationSettings(settings: DentwebIntegrationSettings): DentwebIntegrationSettings {
  return { ...settings };
}

function cloneRecommendationPhrases(phrases: RecommendationPhrases): RecommendationPhrases {
  return { ...phrases };
}

function cloneDisagreementReasonRecommendationPhrases(
  phrases: DisagreementReasonRecommendationPhrases,
): DisagreementReasonRecommendationPhrases {
  return { ...phrases };
}

function getYearOptions(goals: DashboardGoals) {
  const currentYear = new Date().getFullYear();
  const years = goals.monthlyGoals
    .map((goal) => goal.year)
    .filter((year) => Number.isFinite(year));

  return [...new Set([currentYear - 1, currentYear, currentYear + 1, ...years])]
    .toSorted((first, second) => first - second);
}

function SettingsHubCard({
  eyebrow,
  title,
  description,
  icon: Icon,
  children,
  onOpen,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  children: React.ReactNode;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="crm-card min-h-[240px] p-6 text-left transition hover:-translate-y-0.5 hover:border-monday-violet hover:shadow-[rgba(97,97,255,0.14)_0_18px_42px]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-monday-violet">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-bold text-ink">{title}</h2>
        </div>
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-periwinkle text-monday-violet">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate">{description}</p>
      <div className="mt-5">{children}</div>
    </button>
  );
}

function OptionGroupCard({
  groupKey,
  label,
  clinicName,
  options,
  onOpen,
}: {
  groupKey: OptionGroupKey;
  label: string;
  clinicName: string;
  options: OptionItem[];
  onOpen: (groupKey: OptionGroupKey) => void;
}) {
  const enabledCount = options.filter((option) => option.enabled).length;
  const previewOptions = options.filter((option) => option.label.trim()).slice(0, 4);

  return (
    <button
      type="button"
      onClick={() => onOpen(groupKey)}
      className="rounded-[22px] border border-mist bg-snow p-5 text-left transition hover:-translate-y-0.5 hover:border-monday-violet hover:shadow-[rgba(97,97,255,0.12)_0_14px_36px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-monday-violet">상담일지 항목</p>
          <h3 className="mt-1 text-xl font-bold text-ink">{label}</h3>
        </div>
        <span className="metric-number rounded-md bg-periwinkle px-2 py-1 text-xs font-bold text-monday-violet">
          {enabledCount}/{options.length}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {previewOptions.map((option) => (
          <span
            key={option.id}
            className={[
              "rounded-full px-3 py-1 text-xs font-bold",
              option.enabled ? "bg-cloud text-slate" : "bg-mist text-iron",
            ].join(" ")}
          >
            {option.label}
          </span>
        ))}
      </div>

      <p className="mt-5 text-sm font-bold text-slate">적용 대상: {clinicName}</p>
    </button>
  );
}

function RecommendationSettingsModal({
  clinicId,
  clinicName,
  phrases,
  disagreementReasonOptions,
  disagreementReasonPhrases,
  onClose,
}: {
  clinicId: string;
  clinicName: string;
  phrases: RecommendationPhrases;
  disagreementReasonOptions: OptionItem[];
  disagreementReasonPhrases: DisagreementReasonRecommendationPhrases;
  onClose: () => void;
}) {
  const {
    updateRecommendationPhrasesForClinic,
    updateDisagreementReasonRecommendationPhrasesForClinic,
  } = useAdminSettings();
  const [draftPhrases, setDraftPhrases] = useState(() => cloneRecommendationPhrases(phrases));
  const [draftDisagreementReasonPhrases, setDraftDisagreementReasonPhrases] = useState(() =>
    cloneDisagreementReasonRecommendationPhrases(disagreementReasonPhrases),
  );
  const visibleDisagreementReasons = disagreementReasonOptions
    .map((option) => option.label.trim())
    .filter((label) => label && label !== "선택 안함");

  const savePhrases = () => {
    updateRecommendationPhrasesForClinic(clinicId, draftPhrases);
    updateDisagreementReasonRecommendationPhrasesForClinic(clinicId, draftDisagreementReasonPhrases);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recommendation-settings-title"
    >
      <section className="flex max-h-[calc(100vh-48px)] w-full max-w-5xl flex-col overflow-hidden rounded-[26px] border border-mist bg-snow shadow-[rgba(30,41,59,0.22)_0_24px_80px]">
        <div className="flex items-center justify-between gap-3 border-b border-mist px-5 py-4">
          <div>
            <p className="text-xs font-bold text-monday-violet">추천문구 설정</p>
            <h2 id="recommendation-settings-title" className="mt-1 text-2xl font-light text-ink">
              조건별 추천문구 관리
            </h2>
            <p className="mt-1 text-sm font-bold text-slate">적용 대상: {clinicName}</p>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-md border border-pebble text-slate transition hover:border-monday-violet hover:text-monday-violet"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-5">
          {recommendationPhraseConfigs.map((config) => (
            <label
              key={config.key}
              className="grid gap-3 rounded-[18px] border border-pebble bg-white p-4 lg:grid-cols-[220px_1fr]"
            >
              <span>
                <span className="block text-sm font-bold text-ink">{config.label}</span>
                <span className="mt-1 block text-xs leading-5 text-slate">{config.description}</span>
              </span>
              <textarea
                value={draftPhrases[config.key]}
                onChange={(event) =>
                  setDraftPhrases((current) => ({
                    ...current,
                    [config.key]: event.target.value,
                  }))
                }
                className="min-h-20 w-full resize-y rounded-md border border-pebble bg-snow px-3 py-3 text-sm font-bold text-ink outline-none transition focus:border-monday-violet"
              />
            </label>
          ))}

          <div className="rounded-[20px] border border-mist bg-periwinkle px-4 py-3">
            <p className="text-sm font-bold text-monday-violet">비동의사유별 추천문구</p>
            <p className="mt-1 text-xs font-bold text-slate">
              상담일지 설정의 비동의사유 항목이 자동으로 표시됩니다.
            </p>
          </div>

          {visibleDisagreementReasons.map((reason) => (
            <label
              key={reason}
              className="grid gap-3 rounded-[18px] border border-pebble bg-white p-4 lg:grid-cols-[220px_1fr]"
            >
              <span>
                <span className="block text-sm font-bold text-ink">{reason}</span>
                <span className="mt-1 block text-xs leading-5 text-slate">
                  상담일지 비동의사유가 {reason}일 때 표시합니다.
                </span>
              </span>
              <textarea
                value={
                  draftDisagreementReasonPhrases[reason] ??
                  getDefaultDisagreementReasonRecommendationPhrase(reason)
                }
                onChange={(event) =>
                  setDraftDisagreementReasonPhrases((current) => ({
                    ...current,
                    [reason]: event.target.value,
                  }))
                }
                className="min-h-20 w-full resize-y rounded-md border border-pebble bg-snow px-3 py-3 text-sm font-bold text-ink outline-none transition focus:border-monday-violet"
              />
            </label>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-mist px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => {
              setDraftPhrases(cloneRecommendationPhrases(defaultRecommendationPhrases));
              setDraftDisagreementReasonPhrases(
                visibleDisagreementReasons.reduce(
                  (nextPhrases, reason) => ({
                    ...nextPhrases,
                    [reason]: getDefaultDisagreementReasonRecommendationPhrase(reason),
                  }),
                  {} as DisagreementReasonRecommendationPhrases,
                ),
              );
            }}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-pebble px-4 py-2 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            기본 문구로 복원
          </button>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-pebble px-4 py-2 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet"
            >
              취소
            </button>
            <button
              type="button"
              onClick={savePhrases}
              className="inline-flex items-center gap-2 rounded-full bg-monday-violet px-4 py-2 text-sm font-bold text-white transition hover:brightness-95"
            >
              <Save className="h-4 w-4" aria-hidden />
              저장
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function DashboardSettingsModal({
  clinicId,
  clinicName,
  goals,
  onClose,
}: {
  clinicId: string;
  clinicName: string;
  goals: DashboardGoals;
  onClose: () => void;
}) {
  const { updateDashboardGoalsForClinic } = useAdminSettings();
  const [draftGoals, setDraftGoals] = useState(() => cloneDashboardGoals(goals));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const yearOptions = useMemo(() => getYearOptions(draftGoals), [draftGoals]);

  const updateMonthlyGoal = (
    month: number,
    patch: {
      monthlyConsultationGoal?: number;
      monthlyAgreedAmountGoal?: number;
    },
  ) => {
    setDraftGoals((currentGoals) => {
      const currentMonthGoal = getDashboardGoalForMonth(currentGoals, selectedYear, month);

      return upsertDashboardMonthlyGoal(currentGoals, {
        year: selectedYear,
        month,
        ...currentMonthGoal,
        ...patch,
      });
    });
  };

  const saveGoals = () => {
    updateDashboardGoalsForClinic(clinicId, draftGoals);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-settings-title"
    >
      <section className="flex max-h-[calc(100vh-48px)] w-full max-w-5xl flex-col overflow-hidden rounded-[26px] border border-mist bg-snow shadow-[rgba(30,41,59,0.22)_0_24px_80px]">
        <div className="flex items-center justify-between gap-3 border-b border-mist px-5 py-4">
          <div>
            <p className="text-xs font-bold text-monday-violet">대시보드 설정</p>
            <h2 id="dashboard-settings-title" className="mt-1 text-2xl font-light text-ink">
              월별 목표 설정
            </h2>
            <p className="mt-1 text-sm font-bold text-slate">적용 대상: {clinicName}</p>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-md border border-pebble text-slate transition hover:border-monday-violet hover:text-monday-violet"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <label className="block max-w-xs space-y-2">
            <span className="text-xs font-bold text-slate">연도 선택</span>
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              className={inputClass}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </select>
          </label>

          <div className="overflow-x-auto rounded-[20px] border border-mist">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>월</th>
                  <th>상담목표</th>
                  <th>동의금액 목표</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
                  const monthGoal = getDashboardGoalForMonth(draftGoals, selectedYear, month);

                  return (
                    <tr key={month}>
                      <td className="metric-number font-bold">{month}월</td>
                      <td>
                        <input
                          inputMode="numeric"
                          value={formatNumber(monthGoal.monthlyConsultationGoal)}
                          onChange={(event) =>
                            updateMonthlyGoal(month, {
                              monthlyConsultationGoal: parseNumberInput(event.target.value),
                            })
                          }
                          className={inputClass}
                        />
                      </td>
                      <td>
                        <input
                          inputMode="numeric"
                          value={formatNumber(monthGoal.monthlyAgreedAmountGoal)}
                          onChange={(event) =>
                            updateMonthlyGoal(month, {
                              monthlyAgreedAmountGoal: parseNumberInput(event.target.value),
                            })
                          }
                          className={inputClass}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-mist px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-pebble px-4 py-2 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet"
          >
            취소
          </button>
          <button
            type="button"
            onClick={saveGoals}
            className="inline-flex items-center gap-2 rounded-full bg-monday-violet px-4 py-2 text-sm font-bold text-white transition hover:brightness-95"
          >
            <Save className="h-4 w-4" aria-hidden />
            저장
          </button>
        </div>
      </section>
    </div>
  );
}

function DentwebModeSettingsModal({
  clinicId,
  clinicName,
  settings,
  onClose,
}: {
  clinicId: string;
  clinicName: string;
  settings: DentwebIntegrationSettings;
  onClose: () => void;
}) {
  const { updateDentwebIntegrationForClinic } = useAdminSettings();
  const [draftSettings, setDraftSettings] = useState(() => cloneDentwebIntegrationSettings(settings));
  const [connectionCheck, setConnectionCheck] = useState<DentwebConnectionCheck>({
    status: "idle",
    message: "아직 서버 연결 테스트를 하지 않았습니다.",
  });
  const [clientApprovalState, setClientApprovalState] = useState<DentwebClientApprovalState>({
    status: "idle",
    message: "서버 승인 대기 목록을 아직 불러오지 않았습니다.",
    clients: [],
  });
  const [manualDentwebPath, setManualDentwebPath] = useState("");
  const [dentwebDiscoveryState, setDentwebDiscoveryState] = useState<DentwebDiscoveryState>({
    status: "idle",
    message: "아직 덴트웹 서버찾기를 실행하지 않았습니다.",
    candidates: [],
    processes: [],
  });
  const [dentwebMappingDraft, setDentwebMappingDraft] = useState<DentwebSourceMapping | null>(null);
  const [localDbState, setLocalDbState] = useState<LocalDbState>({
    status: "idle",
    message: "아직 서버 PC 중앙 DB 상태를 확인하지 않았습니다.",
  });
  const [patientSearchQuery, setPatientSearchQuery] = useState("");
  const [patientSearchState, setPatientSearchState] = useState<DentwebPatientSearchState>({
    status: "idle",
    message: "동기화된 환자 스냅샷을 아직 검색하지 않았습니다.",
  });

  const saveSettings = () => {
    updateDentwebIntegrationForClinic(clinicId, {
      ...draftSettings,
      serverHost: draftSettings.serverHost.trim() || "127.0.0.1",
      serverPort: draftSettings.serverPort > 0 ? draftSettings.serverPort : 34254,
      pairingCode: draftSettings.pairingCode.replace(/[^0-9]/g, "").slice(0, 6),
    });
    onClose();
  };

  const createPairingCode = () => {
    const nextCode = String(Math.floor(100000 + Math.random() * 900000));

    setDraftSettings((current) => ({
      ...current,
      pairingCode: nextCode,
    }));
  };

  const runDentwebDiscovery = async () => {
    const serverUrl = buildDentwebApiBaseUrl(draftSettings.serverHost, draftSettings.serverPort);

    setDentwebDiscoveryState((current) => ({
      ...current,
      status: "loading",
      message: "덴트웹 프로세스와 후보 경로를 읽기 전용으로 탐색하고 있습니다.",
      serverUrl,
    }));

    try {
      const response = await fetchJsonWithTimeout<DentwebDiscoveryResponse>(
        `${serverUrl}/dentweb/discover`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            manualPath: manualDentwebPath,
          }),
        },
        8000,
      );

      setDentwebDiscoveryState({
        status: "success",
        message: response.message ?? "덴트웹 탐색을 완료했습니다.",
        candidates: Array.isArray(response.candidates) ? response.candidates : [],
        processes: Array.isArray(response.processes) ? response.processes : [],
        selectedCandidate: response.selectedCandidate ?? null,
        serverUrl,
      });
    } catch (error) {
      setDentwebDiscoveryState({
        status: "error",
        message: getErrorMessage(error),
        candidates: [],
        processes: [],
        serverUrl,
      });
    }
  };

  const testDentwebPath = async (targetPath?: string) => {
    const serverUrl = buildDentwebApiBaseUrl(draftSettings.serverHost, draftSettings.serverPort);
    const pathToTest = targetPath || manualDentwebPath.trim() || dentwebDiscoveryState.selectedCandidate?.path || "";

    setDentwebDiscoveryState((current) => ({
      ...current,
      status: "loading",
      message: "선택한 덴트웹 경로를 읽기 전용으로 확인하고 있습니다.",
      serverUrl,
    }));

    try {
      const response = await fetchJsonWithTimeout<DentwebConnectionTestResponse>(
        `${serverUrl}/dentweb/connection-test`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: pathToTest,
          }),
        },
        8000,
      );
      const testedCandidate = response.candidate ?? null;

      setDentwebDiscoveryState((current) => ({
        status: response.ok ? "success" : "error",
        message: response.message ?? "덴트웹 경로 읽기 테스트를 완료했습니다.",
        candidates: testedCandidate
          ? [
              testedCandidate,
              ...current.candidates.filter((candidate) => candidate.path !== testedCandidate.path),
            ]
          : current.candidates,
        processes: current.processes,
        selectedCandidate: testedCandidate ?? current.selectedCandidate,
        serverUrl,
      }));
    } catch (error) {
      setDentwebDiscoveryState((current) => ({
        ...current,
        status: "error",
        message: getErrorMessage(error),
        serverUrl,
      }));
    }
  };

  const runDentwebSourceProbe = async () => {
    const serverUrl = buildDentwebApiBaseUrl(draftSettings.serverHost, draftSettings.serverPort);
    const pathToProbe = manualDentwebPath.trim() || dentwebDiscoveryState.selectedCandidate?.path || "";

    setDentwebDiscoveryState((current) => ({
      ...current,
      status: "loading",
      message: "덴트웹 소스를 읽기 전용으로 진단하고 있습니다.",
      serverUrl,
    }));

    try {
      const response = await fetchJsonWithTimeout<DentwebSourceProbeResponse>(
        `${serverUrl}/dentweb/source-probe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dentwebPath: pathToProbe,
          }),
        },
        10000,
      );
      const nextMappingDraft = createDentwebSourceMappingFromProbe(response);

      setDentwebMappingDraft(nextMappingDraft);

      setDentwebDiscoveryState((current) => {
        const nextCandidate = response.candidate ?? current.selectedCandidate ?? null;

        return {
          ...current,
          status: response.ok ? "success" : "error",
          message: response.message ?? "덴트웹 소스 진단이 완료되었습니다.",
          candidates: nextCandidate
            ? [
                nextCandidate,
                ...current.candidates.filter((candidate) => candidate.path !== nextCandidate.path),
              ]
            : current.candidates,
          selectedCandidate: nextCandidate,
          sourcePreview: undefined,
          sourceProbe: response,
          schemaReport: undefined,
          serverUrl,
        };
      });
    } catch (error) {
      setDentwebDiscoveryState((current) => ({
        ...current,
        status: "error",
        message: getErrorMessage(error),
        serverUrl,
      }));
    }
  };

  const runDentwebSchemaReport = async () => {
    const serverUrl = buildDentwebApiBaseUrl(draftSettings.serverHost, draftSettings.serverPort);
    const pathToReport =
      manualDentwebPath.trim() ||
      dentwebDiscoveryState.sourceProbe?.sourcePath ||
      dentwebDiscoveryState.selectedCandidate?.path ||
      dentwebMappingDraft?.sourcePath ||
      "";

    setDentwebDiscoveryState((current) => ({
      ...current,
      status: "loading",
      message: "덴트웹 테이블/컬럼 구조 리포트를 생성하고 있습니다.",
      serverUrl,
    }));

    try {
      const response = await fetchJsonWithTimeout<DentwebSchemaReportResponse>(
        `${serverUrl}/dentweb/schema-report`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dentwebPath: pathToReport,
          }),
        },
        10000,
      );

      setDentwebDiscoveryState((current) => ({
        ...current,
        status: response.ok ? "success" : "error",
        message: response.message ?? "덴트웹 구조 리포트 생성을 완료했습니다.",
        schemaReport: response,
        serverUrl,
      }));
    } catch (error) {
      setDentwebDiscoveryState((current) => ({
        ...current,
        status: "error",
        message: getErrorMessage(error),
        serverUrl,
      }));
    }
  };

  const loadDentwebSourceMapping = async () => {
    const serverUrl = buildDentwebApiBaseUrl(draftSettings.serverHost, draftSettings.serverPort);

    setDentwebDiscoveryState((current) => ({
      ...current,
      status: "loading",
      message: "저장된 덴트웹 매핑을 확인하고 있습니다.",
      serverUrl,
    }));

    try {
      const response = await fetchJsonWithTimeout<DentwebSourceMappingResponse>(
        `${serverUrl}/dentweb/source-mapping`,
        undefined,
        8000,
      );

      if (response.sourceMapping) {
        setDentwebMappingDraft(response.sourceMapping);
      }

      setDentwebDiscoveryState((current) => ({
        ...current,
        status: response.ok ? "success" : "error",
        message: response.message ?? "덴트웹 매핑 상태를 확인했습니다.",
        sourceMapping: response,
        sourcePreview: undefined,
        serverUrl,
      }));
    } catch (error) {
      setDentwebDiscoveryState((current) => ({
        ...current,
        status: "error",
        message: getErrorMessage(error),
        serverUrl,
      }));
    }
  };

  const saveRecommendedDentwebSourceMapping = async () => {
    const serverUrl = buildDentwebApiBaseUrl(draftSettings.serverHost, draftSettings.serverPort);
    const mapping = createDentwebSourceMappingFromProbe(dentwebDiscoveryState.sourceProbe);

    if (!mapping) {
      setDentwebDiscoveryState((current) => ({
        ...current,
        status: "error",
        message: "저장할 환자/예약 테이블 후보가 없습니다. 먼저 소스 진단을 실행해주세요.",
        serverUrl,
      }));
      return;
    }

    setDentwebDiscoveryState((current) => ({
      ...current,
      status: "loading",
      message: "추천된 덴트웹 테이블 매핑을 서버 PC에 저장하고 있습니다.",
      serverUrl,
    }));

    try {
      const response = await fetchJsonWithTimeout<DentwebSourceMappingResponse>(
        `${serverUrl}/dentweb/source-mapping`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mapping,
          }),
        },
        8000,
      );

      setDentwebMappingDraft(response.sourceMapping ?? mapping);

      setDentwebDiscoveryState((current) => ({
        ...current,
        status: response.ok ? "success" : "error",
        message: response.message ?? "덴트웹 매핑을 저장했습니다.",
        sourceMapping: response,
        sourcePreview: undefined,
        serverUrl,
      }));
    } catch (error) {
      setDentwebDiscoveryState((current) => ({
        ...current,
        status: "error",
        message: getErrorMessage(error),
        serverUrl,
      }));
    }
  };

  const resetDentwebMappingDraftToRecommendation = () => {
    const mapping = createDentwebSourceMappingFromProbe(dentwebDiscoveryState.sourceProbe);

    setDentwebMappingDraft(mapping);
    setDentwebDiscoveryState((current) => ({
      ...current,
      status: mapping ? "success" : "error",
      message: mapping
        ? "추천 매핑을 편집 초안으로 다시 불러왔습니다."
        : "추천 매핑 후보가 없습니다. 먼저 소스 진단을 실행해주세요.",
      sourcePreview: undefined,
    }));
  };

  const updateDentwebMappingTable = (target: DentwebMappingTarget, tableName: string) => {
    setDentwebDiscoveryState((current) => ({
      ...current,
      sourcePreview: undefined,
    }));
    setDentwebMappingDraft((current) => {
      const sourceMapping = withDentwebMappingSource(
        current ?? createDentwebSourceMappingFromProbe(dentwebDiscoveryState.sourceProbe) ?? {
          adapterId: "sqlite_mapped_readonly",
        },
        dentwebDiscoveryState.sourceProbe,
      );

      return {
        ...sourceMapping,
        [target]: {
          tableName,
          columns: {},
        },
      };
    });
  };

  const updateDentwebMappingColumn = (target: DentwebMappingTarget, fieldKey: string, columnName: string) => {
    setDentwebDiscoveryState((current) => ({
      ...current,
      sourcePreview: undefined,
    }));
    setDentwebMappingDraft((current) => {
      const sourceMapping = withDentwebMappingSource(
        current ?? createDentwebSourceMappingFromProbe(dentwebDiscoveryState.sourceProbe) ?? {
          adapterId: "sqlite_mapped_readonly",
        },
        dentwebDiscoveryState.sourceProbe,
      );
      const currentTableMapping = sourceMapping?.[target] ?? {};
      const nextColumns = {
        ...(currentTableMapping.columns ?? {}),
      };

      if (columnName) {
        nextColumns[fieldKey] = columnName;
      } else {
        delete nextColumns[fieldKey];
      }

      return {
        ...sourceMapping,
        [target]: {
          ...currentTableMapping,
          columns: nextColumns,
        },
      };
    });
  };

  const saveDentwebMappingDraft = async () => {
    const serverUrl = buildDentwebApiBaseUrl(draftSettings.serverHost, draftSettings.serverPort);
    const mapping = withDentwebMappingSource(dentwebMappingDraft, dentwebDiscoveryState.sourceProbe);

    if (!hasDentwebMappingTable(mapping, "patients") && !hasDentwebMappingTable(mapping, "appointments")) {
      setDentwebDiscoveryState((current) => ({
        ...current,
        status: "error",
        message: "저장할 환자 또는 예약 테이블을 선택해주세요.",
        serverUrl,
      }));
      return;
    }

    setDentwebDiscoveryState((current) => ({
      ...current,
      status: "loading",
      message: "수동으로 조정한 덴트웹 매핑을 서버 PC에 저장하고 있습니다.",
      serverUrl,
    }));

    try {
      const response = await fetchJsonWithTimeout<DentwebSourceMappingResponse>(
        `${serverUrl}/dentweb/source-mapping`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mapping,
          }),
        },
        8000,
      );

      setDentwebMappingDraft(response.sourceMapping ?? mapping);
      setDentwebDiscoveryState((current) => ({
        ...current,
        status: response.ok ? "success" : "error",
        message: response.message ?? "덴트웹 수동 매핑을 저장했습니다.",
        sourceMapping: response,
        serverUrl,
      }));
    } catch (error) {
      setDentwebDiscoveryState((current) => ({
        ...current,
        status: "error",
        message: getErrorMessage(error),
        serverUrl,
      }));
    }
  };

  const previewDentwebMappingDraft = async () => {
    const serverUrl = buildDentwebApiBaseUrl(draftSettings.serverHost, draftSettings.serverPort);
    const mapping = withDentwebMappingSource(dentwebMappingDraft, dentwebDiscoveryState.sourceProbe);
    const dentwebPath =
      manualDentwebPath.trim() ||
      dentwebDiscoveryState.sourceProbe?.sourcePath ||
      dentwebDiscoveryState.selectedCandidate?.path ||
      mapping?.sourcePath ||
      "";

    if (!mapping) {
      setDentwebDiscoveryState((current) => ({
        ...current,
        status: "error",
        message: "미리보기할 매핑이 없습니다. 먼저 소스 진단을 실행하거나 저장된 매핑을 불러와주세요.",
        serverUrl,
      }));
      return;
    }

    setDentwebDiscoveryState((current) => ({
      ...current,
      status: "loading",
      message: "덴트웹 매핑 샘플을 읽기 전용으로 미리 확인하고 있습니다.",
      serverUrl,
    }));

    try {
      const response = await fetchJsonWithTimeout<DentwebMappingPreviewResponse>(
        `${serverUrl}/dentweb/mapping-preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dentwebPath,
            mapping,
          }),
        },
        10000,
      );

      setDentwebDiscoveryState((current) => ({
        ...current,
        status: response.ok ? "success" : "error",
        message: response.message ?? "덴트웹 매핑 미리보기를 완료했습니다.",
        sourcePreview: response,
        serverUrl,
      }));
    } catch (error) {
      setDentwebDiscoveryState((current) => ({
        ...current,
        status: "error",
        message: getErrorMessage(error),
        serverUrl,
      }));
    }
  };

  const runDentwebIntegrationStatusCheck = async () => {
    const serverUrl = buildDentwebApiBaseUrl(draftSettings.serverHost, draftSettings.serverPort);
    const dentwebPath =
      manualDentwebPath.trim() ||
      dentwebDiscoveryState.sourceProbe?.sourcePath ||
      dentwebDiscoveryState.selectedCandidate?.path ||
      dentwebMappingDraft?.sourcePath ||
      "";

    setDentwebDiscoveryState((current) => ({
      ...current,
      status: "loading",
      message: "덴트웹 연동 준비 상태를 종합 점검하고 있습니다.",
      serverUrl,
    }));

    try {
      const response = await fetchJsonWithTimeout<DentwebIntegrationStatusResponse>(
        `${serverUrl}/dentweb/integration-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dentwebPath,
          }),
        },
        10000,
      );

      setDentwebDiscoveryState((current) => ({
        ...current,
        status: response.readyToSync ? "success" : "error",
        message: response.message ?? "덴트웹 연동 상태 점검을 완료했습니다.",
        integrationStatus: response,
        serverUrl,
      }));
    } catch (error) {
      setDentwebDiscoveryState((current) => ({
        ...current,
        status: "error",
        message: getErrorMessage(error),
        serverUrl,
      }));
    }
  };

  const loadLocalDbStatus = async () => {
    const serverUrl = buildDentwebApiBaseUrl(draftSettings.serverHost, draftSettings.serverPort);

    setLocalDbState((current) => ({
      ...current,
      status: "loading",
      message: "서버 PC 중앙 DB 상태를 확인하고 있습니다.",
      serverUrl,
    }));

    try {
      const response = await fetchJsonWithTimeout<LocalDbStatusResponse>(`${serverUrl}/local-db/status`);

      setLocalDbState({
        status: response.ok ? "success" : "error",
        message: response.message ?? "서버 PC 중앙 DB 상태를 확인했습니다.",
        serverUrl,
        statusPayload: response,
        dryRunPayload: localDbState.dryRunPayload,
        syncPayload: localDbState.syncPayload,
      });
    } catch (error) {
      setLocalDbState((current) => ({
        ...current,
        status: "error",
        message: getErrorMessage(error),
        serverUrl,
      }));
    }
  };

  const runLocalDbDryRun = async () => {
    const serverUrl = buildDentwebApiBaseUrl(draftSettings.serverHost, draftSettings.serverPort);
    const dentwebPath =
      manualDentwebPath.trim() || dentwebDiscoveryState.selectedCandidate?.path || "";

    setLocalDbState((current) => ({
      ...current,
      status: "loading",
      message: "서버 PC 중앙 DB dry-run 동기화 계획을 만들고 있습니다.",
      serverUrl,
    }));

    try {
      const response = await fetchJsonWithTimeout<LocalDbDryRunResponse>(
        `${serverUrl}/local-db/dry-run-sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dentwebPath,
          }),
        },
        8000,
      );

      setLocalDbState({
        status: response.ok ? "success" : "error",
        message: response.message ?? "서버 PC 중앙 DB dry-run을 완료했습니다.",
        serverUrl,
        statusPayload: response,
        dryRunPayload: response,
        syncPayload: localDbState.syncPayload,
      });
    } catch (error) {
      setLocalDbState((current) => ({
        ...current,
        status: "error",
        message: getErrorMessage(error),
        serverUrl,
      }));
    }
  };

  const runDentwebSyncNow = async () => {
    const serverUrl = buildDentwebApiBaseUrl(draftSettings.serverHost, draftSettings.serverPort);
    const mappingForSync = withDentwebMappingSource(
      dentwebMappingDraft ?? dentwebDiscoveryState.sourceMapping?.sourceMapping ?? null,
      dentwebDiscoveryState.sourceProbe,
    );
    const requiresPreview = shouldRequireDentwebMappingPreview(mappingForSync, dentwebDiscoveryState.sourceProbe);
    const previewPassed = hasCleanDentwebMappingPreview(dentwebDiscoveryState.sourcePreview);
    const dentwebPath =
      manualDentwebPath.trim() ||
      dentwebDiscoveryState.selectedCandidate?.path ||
      dentwebDiscoveryState.sourceProbe?.sourcePath ||
      mappingForSync?.sourcePath ||
      "";

    if (requiresPreview && !previewPassed) {
      setLocalDbState((current) => ({
        ...current,
        status: "error",
        message: "먼저 경고 없는 매핑 미리보기를 완료해야 read-only 동기화를 실행할 수 있습니다.",
        serverUrl,
      }));
      return;
    }

    setLocalDbState((current) => ({
      ...current,
      status: "loading",
      message: "덴트웹 read-only 스냅샷 동기화를 실행하고 있습니다.",
      serverUrl,
    }));

    try {
      const response = await fetchJsonWithTimeout<DentwebSyncNowResponse>(
        `${serverUrl}/dentweb/sync-now`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dentwebPath,
            mapping: mappingForSync,
          }),
        },
        10000,
      );

      setLocalDbState({
        status: response.ok ? "success" : "error",
        message: response.message ?? "덴트웹 read-only 동기화를 완료했습니다.",
        serverUrl,
        statusPayload: response,
        dryRunPayload: localDbState.dryRunPayload,
        syncPayload: response,
      });
    } catch (error) {
      setLocalDbState((current) => ({
        ...current,
        status: "error",
        message: getErrorMessage(error),
        serverUrl,
      }));
    }
  };

  const searchDentwebPatients = async () => {
    const serverUrl = buildDentwebApiBaseUrl(draftSettings.serverHost, draftSettings.serverPort);
    const query = patientSearchQuery.trim();

    setPatientSearchState((current) => ({
      ...current,
      status: "loading",
      message: "서버 PC 중앙 DB에서 환자 스냅샷을 검색하고 있습니다.",
    }));

    try {
      const params = new URLSearchParams({
        clinicId,
        limit: "8",
      });

      if (query) {
        params.set("q", query);
      }

      const response = await fetchJsonWithTimeout<DentwebPatientSearchResponse>(
        `${serverUrl}/dentweb/patients/search?${params.toString()}`,
        undefined,
        8000,
      );

      setPatientSearchState({
        status: response.ok ? "success" : "error",
        message: response.message ?? "환자 스냅샷 검색을 완료했습니다.",
        payload: response,
      });
    } catch (error) {
      setPatientSearchState({
        status: "error",
        message: getErrorMessage(error),
      });
    }
  };

  const loadClientRequests = async () => {
    const serverUrl = buildDentwebApiBaseUrl(draftSettings.serverHost, draftSettings.serverPort);

    setClientApprovalState({
      status: "loading",
      message: "서버 승인 요청 목록을 불러오고 있습니다.",
      clients: clientApprovalState.clients,
      serverUrl,
    });

    try {
      const response = await fetchJsonWithTimeout<DentwebClientsResponse>(`${serverUrl}/clients`);
      const clients = Array.isArray(response.clients) ? response.clients : [];

      setClientApprovalState({
        status: "success",
        message:
          clients.length > 0
            ? `클라이언트 요청 ${clients.length}개를 확인했습니다.`
            : "현재 승인 대기 중인 클라이언트 요청이 없습니다.",
        clients,
        serverUrl,
      });
    } catch (error) {
      setClientApprovalState({
        status: "error",
        message: getErrorMessage(error),
        clients: [],
        serverUrl,
      });
    }
  };

  const updateClientApproval = async (deviceId: string, action: "approve" | "reject") => {
    const serverUrl = buildDentwebApiBaseUrl(draftSettings.serverHost, draftSettings.serverPort);

    setClientApprovalState((current) => ({
      ...current,
      status: "loading",
      message: action === "approve" ? "클라이언트 연결을 승인하고 있습니다." : "클라이언트 요청을 거절하고 있습니다.",
      serverUrl,
    }));

    try {
      await fetchJsonWithTimeout(`${serverUrl}/clients/${encodeURIComponent(deviceId)}/${action}`, {
        method: "POST",
      });
      const response = await fetchJsonWithTimeout<DentwebClientsResponse>(`${serverUrl}/clients`);
      const clients = Array.isArray(response.clients) ? response.clients : [];

      setClientApprovalState({
        status: "success",
        message: action === "approve" ? "클라이언트 연결을 승인했습니다." : "클라이언트 요청을 거절했습니다.",
        clients,
        serverUrl,
      });
    } catch (error) {
      setClientApprovalState((current) => ({
        ...current,
        status: "error",
        message: getErrorMessage(error),
        serverUrl,
      }));
    }
  };

  const testClientConnection = async () => {
    const serverUrl = buildDentwebApiBaseUrl(draftSettings.serverHost, draftSettings.serverPort);

    setConnectionCheck({
      status: "checking",
      message: "서버 앱 연결을 확인하고 있습니다.",
      serverUrl,
    });

    try {
      const health = await fetchJsonWithTimeout<DentwebHealthResponse>(`${serverUrl}/health`);
      const clinic = await fetchJsonWithTimeout<DentwebClinicResponse>(`${serverUrl}/clinic`);
      const deviceId = getLocalApiDeviceId();
      const registration = await fetchJsonWithTimeout<DentwebRegisterResponse>(`${serverUrl}/client/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deviceId,
          deviceName: `${clinicName} 클라이언트`,
          pairingCode: draftSettings.pairingCode,
        }),
      });
      const registrationStatus = registration.status ?? registration.device?.status ?? "pending_approval";
      const confirmedClinicName = clinic.clinic?.name ?? health.clinicName ?? clinicName;

      saveLocalApiClientCredentials({
        clinicName: confirmedClinicName,
        deviceId,
        serverUrl,
        status: registrationStatus,
        token: registration.device?.token,
      });

      setConnectionCheck({
        status: "success",
        message: registration.message ?? "서버 연결과 클라이언트 등록 요청이 완료됐습니다.",
        clinicName: confirmedClinicName,
        registrationStatus,
        serverUrl,
      });
    } catch (error) {
      setConnectionCheck({
        status: "error",
        message: getErrorMessage(error),
        serverUrl,
      });
    }
  };

  const latestSyncRun = localDbState.syncPayload?.syncRun ?? localDbState.statusPayload?.lastSyncRun ?? null;
  const recommendedDentwebSourceMapping = createDentwebSourceMappingFromProbe(dentwebDiscoveryState.sourceProbe);
  const dentwebProbeTables = getDentwebProbeTables(dentwebDiscoveryState.sourceProbe);
  const canEditDentwebMapping = dentwebProbeTables.length > 0;
  const mappingForSyncGuard = withDentwebMappingSource(
    dentwebMappingDraft ?? dentwebDiscoveryState.sourceMapping?.sourceMapping ?? null,
    dentwebDiscoveryState.sourceProbe,
  );
  const requiresCleanMappingPreview = shouldRequireDentwebMappingPreview(
    mappingForSyncGuard,
    dentwebDiscoveryState.sourceProbe,
  );
  const hasCleanMappingPreview = hasCleanDentwebMappingPreview(dentwebDiscoveryState.sourcePreview);
  const canRunDentwebSync =
    localDbState.status !== "loading" && (!requiresCleanMappingPreview || hasCleanMappingPreview);
  const dentwebSyncGuardMessage = requiresCleanMappingPreview
    ? hasCleanMappingPreview
      ? "매핑 미리보기 검증이 완료되어 read-only 동기화를 실행할 수 있습니다."
      : "SQLite 매핑 소스는 경고 없는 매핑 미리보기 완료 후에만 read-only 동기화가 가능합니다."
    : "이 소스는 매핑 미리보기 없이 read-only 동기화를 실행할 수 있습니다.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dentweb-mode-settings-title"
    >
      <section className="flex max-h-[calc(100vh-48px)] w-full max-w-4xl flex-col overflow-hidden rounded-[26px] border border-mist bg-snow shadow-[rgba(30,41,59,0.22)_0_24px_80px]">
        <div className="flex items-center justify-between gap-3 border-b border-mist px-5 py-4">
          <div>
            <p className="text-xs font-bold text-monday-violet">덴트웹 연동</p>
            <h2 id="dentweb-mode-settings-title" className="mt-1 text-2xl font-light text-ink">
              서버/클라이언트 모드 설정
            </h2>
            <p className="mt-1 text-sm font-bold text-slate">적용 대상: {clinicName}</p>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-md border border-pebble text-slate transition hover:border-monday-violet hover:text-monday-violet"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <div className="grid gap-3 md:grid-cols-2">
            {[
              {
                mode: "server" as const,
                title: "서버 모드",
                description: "덴트웹 서버/DB를 직접 찾고, 내부 API 서버를 켜는 PC입니다.",
              },
              {
                mode: "client" as const,
                title: "클라이언트 모드",
                description: "같은 치과의 서버 앱에 연결해서 데이터를 조회하는 PC입니다.",
              },
            ].map((item) => {
              const isSelected = draftSettings.mode === item.mode;

              return (
                <button
                  key={item.mode}
                  type="button"
                  onClick={() =>
                    setDraftSettings((current) => ({
                      ...current,
                      mode: item.mode,
                    }))
                  }
                  className={[
                    "rounded-[20px] border p-4 text-left transition",
                    isSelected
                      ? "border-monday-violet bg-periwinkle shadow-[rgba(97,97,255,0.12)_0_14px_36px]"
                      : "border-pebble bg-white hover:border-monday-violet",
                  ].join(" ")}
                >
                  <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-bold text-monday-violet">
                    {isSelected ? "선택됨" : "선택"}
                  </span>
                  <h3 className="mt-3 text-xl font-bold text-ink">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate">{item.description}</p>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 rounded-[20px] border border-mist bg-white p-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-bold text-slate">
                {draftSettings.mode === "server" ? "내부 API 바인딩 주소" : "서버 앱 주소"}
              </span>
              <input
                value={draftSettings.serverHost}
                onChange={(event) =>
                  setDraftSettings((current) => ({
                    ...current,
                    serverHost: event.target.value,
                  }))
                }
                placeholder={draftSettings.mode === "server" ? "0.0.0.0" : "192.168.0.20"}
                className={inputClass}
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-bold text-slate">내부 API 포트</span>
              <input
                inputMode="numeric"
                value={formatNumber(draftSettings.serverPort)}
                onChange={(event) =>
                  setDraftSettings((current) => ({
                    ...current,
                    serverPort: parseNumberInput(event.target.value),
                  }))
                }
                placeholder="34254"
                className={inputClass}
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-xs font-bold text-slate">연결 승인 코드</span>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  inputMode="numeric"
                  value={draftSettings.pairingCode}
                  onChange={(event) =>
                    setDraftSettings((current) => ({
                      ...current,
                      pairingCode: event.target.value.replace(/[^0-9]/g, "").slice(0, 6),
                    }))
                  }
                  placeholder="예: 482913"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={createPairingCode}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-pebble px-4 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet"
                >
                  코드 생성
                </button>
              </div>
            </label>

            <label className="flex items-center gap-2 rounded-md bg-cloud px-3 py-3 text-sm font-bold text-slate md:col-span-2">
              <input
                type="checkbox"
                checked={draftSettings.autoDiscoveryEnabled}
                onChange={(event) =>
                  setDraftSettings((current) => ({
                    ...current,
                    autoDiscoveryEnabled: event.target.checked,
                  }))
                }
                className="h-4 w-4 accent-monday-violet"
              />
              내부망 자동 검색 사용
            </label>
          </div>

          {draftSettings.mode === "server" ? (
            <div className="rounded-[20px] border border-mist bg-white p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-bold text-ink">덴트웹 서버찾기</p>
                  <p className="mt-1 text-sm leading-6 text-slate">
                    서버 PC에서 덴트웹 프로세스, 흔한 설치 경로, DB 후보 파일을 읽기 전용으로 탐색합니다.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={runDentwebDiscovery}
                    disabled={dentwebDiscoveryState.status === "loading"}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-monday-violet px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
                  >
                    {dentwebDiscoveryState.status === "loading" ? "탐색 중" : "자동 탐색"}
                  </button>
                  <button
                    type="button"
                    onClick={() => testDentwebPath()}
                    disabled={dentwebDiscoveryState.status === "loading"}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-pebble bg-white px-4 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet disabled:cursor-wait disabled:opacity-60"
                  >
                    읽기 테스트
                  </button>
                  <button
                    type="button"
                    onClick={runDentwebSourceProbe}
                    disabled={dentwebDiscoveryState.status === "loading"}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-monday-violet bg-white px-4 text-sm font-bold text-monday-violet transition hover:bg-periwinkle disabled:cursor-wait disabled:opacity-60"
                  >
                    소스 진단
                  </button>
                  <button
                    type="button"
                    onClick={runDentwebSchemaReport}
                    disabled={dentwebDiscoveryState.status === "loading"}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-[#2e6b5c] bg-white px-4 text-sm font-bold text-[#2e6b5c] transition hover:bg-[#e9f7f3] disabled:cursor-wait disabled:opacity-60"
                  >
                    구조 리포트
                  </button>
                  <button
                    type="button"
                    onClick={loadDentwebSourceMapping}
                    disabled={dentwebDiscoveryState.status === "loading"}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-pebble bg-white px-4 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet disabled:cursor-wait disabled:opacity-60"
                  >
                    매핑 확인
                  </button>
                  <button
                    type="button"
                    onClick={runDentwebIntegrationStatusCheck}
                    disabled={dentwebDiscoveryState.status === "loading"}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-[#2e6b5c] bg-white px-4 text-sm font-bold text-[#2e6b5c] transition hover:bg-[#e9f7f3] disabled:cursor-wait disabled:opacity-60"
                  >
                    연동 상태 점검
                  </button>
                </div>
              </div>

              <label className="mt-4 block space-y-2">
                <span className="text-xs font-bold text-slate">덴트웹 DB 또는 폴더 직접 입력</span>
                <input
                  value={manualDentwebPath}
                  onChange={(event) => setManualDentwebPath(event.target.value)}
                  placeholder="예: C:\Dentweb 또는 \\서버PC\Dentweb"
                  className={inputClass}
                />
              </label>

              <div
                className={[
                  "mt-4 rounded-[16px] border px-4 py-3",
                  dentwebDiscoveryState.status === "success"
                    ? "border-[#b7edc4] bg-[#f0fff4]"
                    : dentwebDiscoveryState.status === "error"
                      ? "border-[#ffd0d0] bg-[#fff5f5]"
                      : "border-pebble bg-cloud",
                ].join(" ")}
              >
                <p
                  className={[
                    "text-sm font-bold",
                    dentwebDiscoveryState.status === "success"
                      ? "text-[#146c2e]"
                      : dentwebDiscoveryState.status === "error"
                        ? "text-[#ad1f3d]"
                        : "text-slate",
                  ].join(" ")}
                >
                  {dentwebDiscoveryState.message}
                </p>
                {dentwebDiscoveryState.serverUrl ? (
                  <p className="metric-number mt-2 text-xs font-bold text-slate">
                    서버: {dentwebDiscoveryState.serverUrl}
                  </p>
                ) : null}
                {dentwebDiscoveryState.selectedCandidate ? (
                  <p className="mt-1 text-xs font-bold text-slate">
                    선택 후보: {dentwebDiscoveryState.selectedCandidate.path}
                  </p>
                ) : null}
              </div>

              {dentwebDiscoveryState.integrationStatus ? (
                <div className="mt-4 rounded-[16px] border border-pebble bg-snow p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-ink">덴트웹 연동 상태 점검</p>
                      <p className="mt-1 text-xs font-bold text-slate">
                        {dentwebDiscoveryState.integrationStatus.readyToSync
                          ? "읽기 전용 동기화를 실행할 준비가 완료되었습니다."
                          : "아래 점검 항목을 완료하면 덴트웹 읽기 전용 동기화를 실행할 수 있습니다."}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-slate">
                        {dentwebDiscoveryState.integrationStatus.sourcePath ? (
                          <span className="max-w-full break-all rounded-full bg-white px-3 py-1">
                            경로: {dentwebDiscoveryState.integrationStatus.sourcePath}
                          </span>
                        ) : null}
                        {dentwebDiscoveryState.integrationStatus.adapterId ? (
                          <span className="rounded-full bg-white px-3 py-1">
                            어댑터: {dentwebDiscoveryState.integrationStatus.adapterId}
                          </span>
                        ) : null}
                        {dentwebDiscoveryState.integrationStatus.checkedAt ? (
                          <span className="rounded-full bg-white px-3 py-1">
                            점검: {formatDentwebClientDate(dentwebDiscoveryState.integrationStatus.checkedAt)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={[
                        "rounded-full px-3 py-1 text-xs font-bold",
                        dentwebDiscoveryState.integrationStatus.readyToSync
                          ? "bg-[#dff8e6] text-[#146c2e]"
                          : "bg-[#fff2cc] text-[#8a5a00]",
                      ].join(" ")}
                    >
                      {dentwebDiscoveryState.integrationStatus.readyToSync ? "동기화 준비됨" : "추가 설정 필요"}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 lg:grid-cols-2">
                    {(dentwebDiscoveryState.integrationStatus.checks ?? []).map((check, index) => (
                      <div
                        key={`${check.key ?? "check"}-${index}`}
                        className="flex items-start justify-between gap-3 rounded-[14px] border border-pebble bg-white p-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-ink">{check.label ?? check.key ?? "점검 항목"}</p>
                          <p className="mt-1 text-xs font-bold leading-relaxed text-slate">{check.message ?? "-"}</p>
                          {check.target ? (
                            <p className="metric-number mt-1 break-all text-[11px] font-bold text-muted">
                              대상: {check.target}
                            </p>
                          ) : null}
                        </div>
                        <span
                          className={[
                            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                            getDentwebIntegrationCheckClass(check.status),
                          ].join(" ")}
                        >
                          {getDentwebIntegrationCheckLabel(check.status)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {dentwebDiscoveryState.integrationStatus.warnings?.length ? (
                    <div className="mt-3 rounded-[14px] border border-[#ffe2a8] bg-[#fff8e6] p-3">
                      <p className="text-xs font-bold text-[#8a5a00]">확인 필요</p>
                      <ul className="mt-2 space-y-1">
                        {dentwebDiscoveryState.integrationStatus.warnings.map((warning) => (
                          <li key={warning} className="text-xs font-bold leading-relaxed text-slate">
                            {warning}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {dentwebDiscoveryState.schemaReport ? (
                <div className="mt-4 rounded-[16px] border border-pebble bg-snow p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-ink">덴트웹 구조 리포트</p>
                      <p className="mt-1 text-xs font-bold text-slate">
                        실제 데이터 값은 노출하지 않고 테이블명과 컬럼명 기준으로 매핑 후보를 분석합니다.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-slate">
                        <span className="rounded-full bg-white px-3 py-1">
                          테이블 {formatNumber(dentwebDiscoveryState.schemaReport.tableCount ?? 0)}개
                        </span>
                        <span className="rounded-full bg-white px-3 py-1">
                          컬럼 {formatNumber(dentwebDiscoveryState.schemaReport.columnCount ?? 0)}개
                        </span>
                        {dentwebDiscoveryState.schemaReport.sourceFile ? (
                          <span className="max-w-full break-all rounded-full bg-white px-3 py-1">
                            파일: {dentwebDiscoveryState.schemaReport.sourceFile}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={[
                        "rounded-full px-3 py-1 text-xs font-bold",
                        dentwebDiscoveryState.schemaReport.ok
                          ? "bg-[#dff8e6] text-[#146c2e]"
                          : "bg-[#ffe1e7] text-[#ad1f3d]",
                      ].join(" ")}
                    >
                      {dentwebDiscoveryState.schemaReport.ok ? "리포트 준비됨" : "확인 필요"}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {(dentwebDiscoveryState.schemaReport.groups ?? []).map((group) => (
                      <div key={group.target ?? group.title} className="rounded-[14px] border border-pebble bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold text-ink">
                            {group.target === "patients" ? "환자 테이블 후보" : "예약 테이블 후보"}
                          </p>
                          <span className="rounded-full bg-cloud px-2.5 py-1 text-[11px] font-bold text-slate">
                            후보 {formatNumber(group.candidates?.length ?? 0)}개
                          </span>
                        </div>

                        {group.candidates?.length ? (
                          <div className="mt-3 space-y-2">
                            {group.candidates.slice(0, 5).map((candidate) => (
                              <div
                                key={`${group.target}-${candidate.tableName}`}
                                className="rounded-[12px] border border-mist bg-cloud p-3"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="metric-number text-sm font-bold text-ink">
                                      {candidate.tableName ?? "-"}
                                    </p>
                                    <p className="mt-1 text-[11px] font-bold text-slate">
                                      필드 매칭 {formatNumber(candidate.matchedFieldCount ?? 0)}/
                                      {formatNumber(candidate.requiredFieldCount ?? 0)} · {candidate.matchRate ?? 0}%
                                    </p>
                                  </div>
                                  <span
                                    className={[
                                      "rounded-full px-2.5 py-1 text-[11px] font-bold",
                                      getDentwebMappingConfidenceClass(candidate.confidence),
                                    ].join(" ")}
                                  >
                                    {candidate.recommendation === "primary" ? "추천 " : ""}
                                    {getDentwebMappingConfidenceLabel(candidate.confidence)} · {candidate.score ?? 0}점
                                  </span>
                                </div>

                                <p className="mt-2 text-xs font-bold leading-relaxed text-slate">
                                  매칭:{" "}
                                  {(candidate.matchedFields ?? [])
                                    .map((field) => `${field.label ?? field.key}: ${field.columnName ?? "-"}`)
                                    .join(" / ") || "없음"}
                                </p>
                                {candidate.missingFields?.length ? (
                                  <p className="mt-1 text-xs font-bold leading-relaxed text-[#ad1f3d]">
                                    빠진 항목: {candidate.missingFields.map((field) => field.label ?? field.key).join(", ")}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 rounded-[12px] bg-cloud p-3 text-xs font-bold text-slate">
                            이 유형의 추천 후보가 아직 없습니다. 수동 매핑에서 직접 테이블을 선택해야 합니다.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {dentwebDiscoveryState.schemaReport.tables?.length ? (
                    <div className="mt-3 rounded-[14px] border border-pebble bg-white p-3">
                      <p className="text-sm font-bold text-ink">읽힌 테이블 목록</p>
                      <div className="mt-2 grid gap-2 lg:grid-cols-2">
                        {dentwebDiscoveryState.schemaReport.tables.slice(0, 10).map((table) => (
                          <div key={table.name} className="rounded-[10px] bg-cloud px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="metric-number text-xs font-bold text-ink">{table.name ?? "-"}</p>
                              <span className="text-[11px] font-bold text-slate">
                                {formatNumber(table.columns?.length ?? 0)}개 컬럼
                              </span>
                            </div>
                            <p className="mt-1 truncate text-[11px] font-bold text-slate">
                              {(table.columns ?? [])
                                .slice(0, 8)
                                .map((column) => column.name)
                                .filter(Boolean)
                                .join(", ") || "컬럼 없음"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {dentwebDiscoveryState.schemaReport.warnings?.length ? (
                    <div className="mt-3 rounded-[14px] border border-[#ffe2a8] bg-[#fff8e6] p-3">
                      <p className="text-xs font-bold text-[#8a5a00]">확인 필요</p>
                      <ul className="mt-2 space-y-1">
                        {dentwebDiscoveryState.schemaReport.warnings.map((warning) => (
                          <li key={warning} className="text-xs font-bold leading-relaxed text-slate">
                            {warning}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {dentwebDiscoveryState.sourceProbe ? (
                <div className="mt-4 rounded-[16px] border border-pebble bg-snow p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-ink">덴트웹 소스 진단</p>
                      <p className="mt-1 text-xs font-bold text-slate">
                        {dentwebDiscoveryState.sourceProbe.message ?? "-"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {recommendedDentwebSourceMapping ? (
                        <button
                          type="button"
                          onClick={saveRecommendedDentwebSourceMapping}
                          disabled={dentwebDiscoveryState.status === "loading"}
                          className="inline-flex h-8 items-center justify-center rounded-full bg-monday-violet px-3 text-xs font-bold text-white transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
                        >
                          추천 매핑 저장
                        </button>
                      ) : null}
                      <span
                        className={[
                          "rounded-full px-3 py-1 text-xs font-bold",
                          getDentwebProbeBadgeClass(dentwebDiscoveryState.sourceProbe.status),
                        ].join(" ")}
                      >
                        {getDentwebProbeStatusLabel(dentwebDiscoveryState.sourceProbe.status)}
                      </span>
                    </div>
                  </div>

                  {dentwebDiscoveryState.sourceProbe.selectedProbe ? (
                    <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.4fr]">
                      <div className="rounded-[14px] border border-pebble bg-white p-3">
                        <p className="text-xs font-bold text-slate">선택 어댑터</p>
                        <p className="mt-1 text-sm font-bold text-ink">
                          {dentwebDiscoveryState.sourceProbe.selectedProbe.label ?? "-"}
                        </p>
                        <p className="mt-2 text-xs font-bold text-slate">
                          상태: {getDentwebProbeStatusLabel(dentwebDiscoveryState.sourceProbe.selectedProbe.status)}
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate">
                          동기화 가능: {dentwebDiscoveryState.sourceProbe.selectedProbe.syncReady ? "예" : "아니오"}
                        </p>
                        {dentwebDiscoveryState.sourceProbe.selectedProbe.message ? (
                          <p className="mt-2 text-xs leading-5 text-slate">
                            {dentwebDiscoveryState.sourceProbe.selectedProbe.message}
                          </p>
                        ) : null}
                      </div>

                      <div className="rounded-[14px] border border-pebble bg-white p-3">
                        <p className="text-xs font-bold text-slate">진단 근거</p>
                        {dentwebDiscoveryState.sourceProbe.selectedProbe.evidence?.sourceFile ? (
                          <p className="metric-number mt-1 break-all text-xs font-bold text-slate">
                            {dentwebDiscoveryState.sourceProbe.selectedProbe.evidence.sourceFile}
                          </p>
                        ) : null}
                        {typeof dentwebDiscoveryState.sourceProbe.selectedProbe.evidence?.patients === "number" ||
                        typeof dentwebDiscoveryState.sourceProbe.selectedProbe.evidence?.appointments === "number" ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="rounded-[12px] bg-cloud px-3 py-2">
                              <p className="text-xs font-bold text-slate">환자 스냅샷</p>
                              <p className="metric-number mt-1 text-sm font-bold text-ink">
                                {formatNumber(dentwebDiscoveryState.sourceProbe.selectedProbe.evidence?.patients ?? 0)}건
                              </p>
                            </div>
                            <div className="rounded-[12px] bg-cloud px-3 py-2">
                              <p className="text-xs font-bold text-slate">예약 스냅샷</p>
                              <p className="metric-number mt-1 text-sm font-bold text-ink">
                                {formatNumber(
                                  dentwebDiscoveryState.sourceProbe.selectedProbe.evidence?.appointments ?? 0,
                                )}
                                건
                              </p>
                            </div>
                          </div>
                        ) : null}
                        {dentwebDiscoveryState.sourceProbe.selectedProbe.evidence?.tables?.length ? (
                          <div className="mt-3 max-h-48 space-y-2 overflow-auto pr-1">
                            {dentwebDiscoveryState.sourceProbe.selectedProbe.evidence.tables.slice(0, 8).map((table) => (
                              <div key={`${table.type}-${table.name}`} className="rounded-[12px] bg-cloud px-3 py-2">
                                <p className="metric-number text-xs font-bold text-ink">
                                  {table.name} <span className="text-slate">({table.type})</span>
                                </p>
                                <p className="mt-1 text-xs font-bold text-slate">
                                  {(table.columns ?? [])
                                    .slice(0, 10)
                                    .map((column) => column.name)
                                    .filter(Boolean)
                                    .join(", ") || "컬럼 없음"}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {dentwebDiscoveryState.sourceProbe.selectedProbe?.evidence?.mappingSuggestions ? (
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      {[
                        {
                          title: "환자 테이블 후보",
                          items: dentwebDiscoveryState.sourceProbe.selectedProbe?.evidence?.mappingSuggestions?.patients ?? [],
                        },
                        {
                          title: "예약 테이블 후보",
                          items:
                            dentwebDiscoveryState.sourceProbe.selectedProbe?.evidence?.mappingSuggestions?.appointments ?? [],
                        },
                      ].map((group) => (
                        <div key={group.title} className="rounded-[14px] border border-pebble bg-white p-3">
                          <p className="text-xs font-bold text-slate">{group.title}</p>
                          {group.items.length ? (
                            <div className="mt-2 space-y-2">
                              {group.items.slice(0, 3).map((suggestion) => (
                                <div key={`${group.title}-${suggestion.tableName}`} className="rounded-[12px] bg-cloud px-3 py-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="metric-number text-sm font-bold text-ink">
                                      {suggestion.tableName ?? "-"}
                                    </p>
                                    <span
                                      className={[
                                        "rounded-full px-2.5 py-1 text-xs font-bold",
                                        getDentwebMappingConfidenceClass(suggestion.confidence),
                                      ].join(" ")}
                                    >
                                      {getDentwebMappingConfidenceLabel(suggestion.confidence)} · {suggestion.score ?? 0}점
                                    </span>
                                  </div>
                                  <p className="mt-1 text-xs font-bold text-slate">
                                    {Object.values(suggestion.matchedColumns ?? {})
                                      .map((column) => `${column.label ?? "필드"}: ${column.columnName ?? "-"}`)
                                      .join(" / ") || "매칭 컬럼 없음"}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-xs font-bold text-slate">추천 후보가 아직 없습니다.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {canEditDentwebMapping ? (
                    <div className="mt-3 rounded-[14px] border border-pebble bg-white p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-ink">수동 매핑 편집</p>
                          <p className="mt-1 text-xs font-bold text-slate">
                            실제 덴트웹 컬럼이 다르면 여기서 테이블과 컬럼을 직접 맞춘 뒤 저장합니다.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={resetDentwebMappingDraftToRecommendation}
                            className="inline-flex h-8 items-center justify-center rounded-full border border-pebble bg-white px-3 text-xs font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet"
                          >
                            추천값 다시 채우기
                          </button>
                          <button
                            type="button"
                            onClick={saveDentwebMappingDraft}
                            disabled={dentwebDiscoveryState.status === "loading"}
                            className="inline-flex h-8 items-center justify-center rounded-full bg-monday-violet px-3 text-xs font-bold text-white transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
                          >
                            수동 매핑 저장
                          </button>
                          <button
                            type="button"
                            onClick={previewDentwebMappingDraft}
                            disabled={dentwebDiscoveryState.status === "loading"}
                            className="inline-flex h-8 items-center justify-center rounded-full border border-monday-violet bg-white px-3 text-xs font-bold text-monday-violet transition hover:bg-periwinkle disabled:cursor-wait disabled:opacity-60"
                          >
                            매핑 미리보기
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        {[
                          { target: "patients" as const, title: "환자 데이터" },
                          { target: "appointments" as const, title: "예약 데이터" },
                        ].map(({ target, title }) => {
                          const tableMapping = dentwebMappingDraft?.[target] ?? null;
                          const selectedColumns = getDentwebColumnsForTable(
                            dentwebDiscoveryState.sourceProbe,
                            tableMapping?.tableName,
                          );

                          return (
                            <div key={target} className="rounded-[12px] bg-cloud p-3">
                              <label className="block space-y-2">
                                <span className="text-xs font-bold text-slate">{title} 테이블</span>
                                <select
                                  value={tableMapping?.tableName ?? ""}
                                  onChange={(event) => updateDentwebMappingTable(target, event.target.value)}
                                  className={inputClass}
                                >
                                  <option value="">선택 안 함</option>
                                  {dentwebProbeTables.map((table) => (
                                    <option key={`${target}-${table.name}`} value={table.name ?? ""}>
                                      {table.name}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <div className="mt-3 grid gap-2">
                                {dentwebMappingFieldConfigs[target].map((field) => (
                                  <label key={`${target}-${field.key}`} className="grid gap-2 sm:grid-cols-[92px_1fr] sm:items-center">
                                    <span className="text-xs font-bold text-slate">{field.label}</span>
                                    <select
                                      value={tableMapping?.columns?.[field.key] ?? ""}
                                      onChange={(event) =>
                                        updateDentwebMappingColumn(target, field.key, event.target.value)
                                      }
                                      disabled={!tableMapping?.tableName}
                                      className={inputClass}
                                    >
                                      <option value="">매핑 안 함</option>
                                      {selectedColumns.map((columnName) => (
                                        <option key={`${target}-${field.key}-${columnName}`} value={columnName}>
                                          {columnName}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {dentwebDiscoveryState.sourcePreview?.preview ? (
                        <div className="mt-3 rounded-[12px] border border-pebble bg-snow p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-ink">매핑 미리보기 결과</p>
                              <p className="mt-1 text-xs font-bold text-slate">
                                샘플 값은 개인정보 보호를 위해 마스킹해서 표시합니다.
                              </p>
                            </div>
                            <span className="rounded-full bg-periwinkle px-3 py-1 text-xs font-bold text-monday-violet">
                              read-only
                            </span>
                          </div>

                          <div className="mt-3 grid gap-3 lg:grid-cols-2">
                            {[
                              {
                                title: "환자 샘플",
                                section: dentwebDiscoveryState.sourcePreview.preview.patients,
                              },
                              {
                                title: "예약 샘플",
                                section: dentwebDiscoveryState.sourcePreview.preview.appointments,
                              },
                            ].map(({ title, section }) => (
                              <div key={title} className="rounded-[12px] border border-mist bg-white p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-bold text-ink">{title}</p>
                                  <span className="metric-number text-xs font-bold text-slate">
                                    총 {formatNumber(section?.totalRows ?? 0)}건 · 샘플 {formatNumber(section?.sampleCount ?? 0)}건
                                  </span>
                                </div>
                                <p className="metric-number mt-1 break-all text-xs font-bold text-slate">
                                  테이블: {section?.tableName || "-"}
                                </p>

                                {section?.mappedFields?.length ? (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {section.mappedFields.map((field) => (
                                      <span
                                        key={`${title}-${field.key}`}
                                        className={[
                                          "rounded-full px-2 py-1 text-[11px] font-bold",
                                          field.mapped && field.columnExists
                                            ? "bg-[#dff8e6] text-[#146c2e]"
                                            : field.mapped
                                              ? "bg-[#ffe1e7] text-[#ad1f3d]"
                                              : "bg-cloud text-slate",
                                        ].join(" ")}
                                      >
                                        {field.label}: {field.columnName || "미매핑"}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}

                                {section?.samples?.length ? (
                                  <div className="mt-3 space-y-2">
                                    {section.samples.map((sample) => (
                                      <div key={`${title}-${sample.rowNumber}`} className="rounded-[10px] bg-cloud p-2">
                                        <p className="text-xs font-bold text-slate">샘플 {sample.rowNumber}</p>
                                        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                                          {(sample.fields ?? []).map((field) => (
                                            <div
                                              key={`${title}-${sample.rowNumber}-${field.key}`}
                                              className="rounded-md bg-white px-2 py-1.5"
                                            >
                                              <p className="text-[11px] font-bold text-slate">{field.label}</p>
                                              <p className="metric-number mt-0.5 text-xs font-bold text-ink">
                                                {field.preview ?? "-"}
                                              </p>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="mt-3 text-xs font-bold text-slate">표시할 샘플이 없습니다.</p>
                                )}

                                {section?.warnings?.length ? (
                                  <div className="mt-2 space-y-1">
                                    {section.warnings.map((warning) => (
                                      <p key={`${title}-${warning}`} className="text-xs font-bold text-[#8a5a00]">
                                        {warning}
                                      </p>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {dentwebDiscoveryState.sourceProbe.warnings?.length ? (
                    <div className="mt-3 space-y-1">
                      {dentwebDiscoveryState.sourceProbe.warnings.map((warning) => (
                        <p key={warning} className="text-xs font-bold text-[#8a5a00]">
                          {warning}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {dentwebDiscoveryState.sourceMapping ? (
                <div className="mt-4 rounded-[16px] border border-pebble bg-snow p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-ink">저장된 덴트웹 매핑</p>
                      <p className="mt-1 text-xs font-bold text-slate">
                        {dentwebDiscoveryState.sourceMapping.message ?? "-"}
                      </p>
                    </div>
                    <span
                      className={[
                        "rounded-full px-3 py-1 text-xs font-bold",
                        dentwebDiscoveryState.sourceMapping.configured
                          ? "bg-[#dff8e6] text-[#146c2e]"
                          : "bg-cloud text-slate",
                      ].join(" ")}
                    >
                      {dentwebDiscoveryState.sourceMapping.configured ? "저장됨" : "미설정"}
                    </span>
                  </div>
                  {dentwebDiscoveryState.sourceMapping.sourceMapping ? (
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      {[
                        ["환자", dentwebDiscoveryState.sourceMapping.sourceMapping.patients],
                        ["예약", dentwebDiscoveryState.sourceMapping.sourceMapping.appointments],
                      ].map(([label, tableMapping]) => {
                        const mapping = tableMapping as DentwebSourceTableMapping | null | undefined;

                        return (
                          <div key={label as string} className="rounded-[14px] border border-pebble bg-white p-3">
                            <p className="text-xs font-bold text-slate">{label as string} 테이블</p>
                            <p className="metric-number mt-1 text-sm font-bold text-ink">
                              {mapping?.tableName ?? "-"}
                            </p>
                            <p className="mt-2 text-xs font-bold text-slate">
                              {Object.entries(mapping?.columns ?? {})
                                .map(([fieldKey, columnName]) => `${fieldKey}: ${columnName}`)
                                .join(" / ") || "매핑 컬럼 없음"}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {dentwebDiscoveryState.processes.length > 0 ? (
                <div className="mt-4 rounded-[16px] border border-pebble bg-snow p-3">
                  <p className="text-xs font-bold text-slate">실행 중으로 보이는 프로세스</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {dentwebDiscoveryState.processes.map((processInfo) => (
                      <span
                        key={`${processInfo.name}-${processInfo.pid}`}
                        className="rounded-full bg-periwinkle px-3 py-1 text-xs font-bold text-monday-violet"
                      >
                        {processInfo.name} #{processInfo.pid}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {dentwebDiscoveryState.candidates.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {dentwebDiscoveryState.candidates.slice(0, 8).map((candidate) => (
                    <div
                      key={`${candidate.source}-${candidate.path}`}
                      className="grid gap-3 rounded-[16px] border border-pebble bg-snow p-3 lg:grid-cols-[1fr_auto]"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-cloud px-2.5 py-1 text-xs font-bold text-slate">
                            {getDentwebCandidateSourceLabel(candidate.source)}
                          </span>
                          <span
                            className={[
                              "rounded-full px-2.5 py-1 text-xs font-bold",
                              candidate.exists && candidate.readable
                                ? "bg-[#dff8e6] text-[#146c2e]"
                                : candidate.exists
                                  ? "bg-[#fff2cc] text-[#8a5a00]"
                                  : "bg-[#ffe1e7] text-[#ad1f3d]",
                            ].join(" ")}
                          >
                            {candidate.exists && candidate.readable
                              ? "읽기 가능"
                              : candidate.exists
                                ? "권한 확인"
                                : "없음"}
                          </span>
                          <span className="text-xs font-bold text-slate">
                            {getDentwebCandidateTypeLabel(candidate.type)}
                            {formatDentwebFileSize(candidate.size) ? ` · ${formatDentwebFileSize(candidate.size)}` : ""}
                          </span>
                        </div>
                        <p className="metric-number mt-2 break-all text-sm font-bold text-ink">{candidate.path}</p>
                        <p className="mt-1 text-xs font-bold text-slate">{candidate.message ?? "-"}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => testDentwebPath(candidate.path)}
                        disabled={dentwebDiscoveryState.status === "loading"}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-pebble bg-white px-4 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet disabled:cursor-wait disabled:opacity-60"
                      >
                        테스트
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {draftSettings.mode === "server" ? (
            <div className="rounded-[20px] border border-mist bg-white p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-bold text-ink">서버 PC 중앙 DB</p>
                  <p className="mt-1 text-sm leading-6 text-slate">
                    상담일지, 리콜, 관리자 설정, 덴트웹 스냅샷을 서버 PC 한 곳에 모으는 중앙 저장소입니다.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={loadLocalDbStatus}
                    disabled={localDbState.status === "loading"}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-pebble bg-white px-4 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet disabled:cursor-wait disabled:opacity-60"
                  >
                    {localDbState.status === "loading" ? "확인 중" : "DB 상태 확인"}
                  </button>
                  <button
                    type="button"
                    onClick={runLocalDbDryRun}
                    disabled={localDbState.status === "loading"}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-monday-violet px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
                  >
                    Dry-run 동기화
                  </button>
                  <button
                    type="button"
                    onClick={runDentwebSyncNow}
                    disabled={!canRunDentwebSync}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-monday-violet bg-white px-4 text-sm font-bold text-monday-violet transition hover:bg-periwinkle disabled:cursor-not-allowed disabled:border-pebble disabled:text-iron disabled:opacity-70"
                  >
                    Read-only 동기화
                  </button>
                </div>
              </div>

              <div
                className={[
                  "mt-4 rounded-[16px] border px-4 py-3 text-sm font-bold",
                  requiresCleanMappingPreview && !hasCleanMappingPreview
                    ? "border-[#fff2cc] bg-[#fffaf0] text-[#8a5a00]"
                    : "border-[#b7edc4] bg-[#f0fff4] text-[#146c2e]",
                ].join(" ")}
              >
                {dentwebSyncGuardMessage}
              </div>

              <div
                className={[
                  "mt-4 rounded-[16px] border px-4 py-3",
                  localDbState.status === "success"
                    ? "border-[#b7edc4] bg-[#f0fff4]"
                    : localDbState.status === "error"
                      ? "border-[#ffd0d0] bg-[#fff5f5]"
                      : "border-pebble bg-cloud",
                ].join(" ")}
              >
                <p
                  className={[
                    "text-sm font-bold",
                    localDbState.status === "success"
                      ? "text-[#146c2e]"
                      : localDbState.status === "error"
                        ? "text-[#ad1f3d]"
                        : "text-slate",
                  ].join(" ")}
                >
                  {localDbState.message}
                </p>
                {localDbState.serverUrl ? (
                  <p className="metric-number mt-2 text-xs font-bold text-slate">
                    서버: {localDbState.serverUrl}
                  </p>
                ) : null}
              </div>

              {localDbState.statusPayload?.db ? (
                <div className="mt-4 grid gap-2 md:grid-cols-3">
                  {[
                    ["DB 파일", localDbState.statusPayload.db.exists ? "준비됨" : "미생성"],
                    ["스키마", `v${localDbState.statusPayload.db.schemaVersion ?? "-"}`],
                    ["파일 크기", formatDentwebFileSize(localDbState.statusPayload.db.size) || "0B"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-[16px] border border-pebble bg-snow p-3">
                      <p className="text-xs font-bold text-slate">{label}</p>
                      <p className="metric-number mt-1 break-all text-sm font-bold text-ink">{value}</p>
                    </div>
                  ))}
                  <div className="rounded-[16px] border border-pebble bg-snow p-3 md:col-span-3">
                    <p className="text-xs font-bold text-slate">저장 위치</p>
                    <p className="metric-number mt-1 break-all text-sm font-bold text-ink">
                      {localDbState.statusPayload.db.path}
                    </p>
                  </div>
                </div>
              ) : null}

              {localDbState.statusPayload?.rowCounts ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(localDbState.statusPayload.rowCounts).map(([tableName, count]) => (
                    <div key={tableName} className="rounded-[14px] bg-cloud px-3 py-2">
                      <p className="metric-number text-xs font-bold text-slate">{tableName}</p>
                      <p className="mt-1 text-sm font-bold text-ink">{formatNumber(count)}건</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {latestSyncRun ? (
                <div className="mt-4 rounded-[16px] border border-pebble bg-snow p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-ink">최근 read-only 동기화</p>
                    <span
                      className={[
                        "rounded-full px-3 py-1 text-xs font-bold",
                        latestSyncRun.status === "success"
                          ? "bg-[#dff8e6] text-[#146c2e]"
                          : latestSyncRun.status === "failed"
                            ? "bg-[#ffe1e7] text-[#ad1f3d]"
                            : "bg-periwinkle text-monday-violet",
                      ].join(" ")}
                    >
                      {latestSyncRun.status ?? "-"}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-[14px] bg-cloud px-3 py-2">
                      <p className="text-xs font-bold text-slate">환자 스냅샷</p>
                      <p className="metric-number mt-1 text-sm font-bold text-ink">
                        {formatNumber(latestSyncRun.summary?.patients ?? 0)}건
                      </p>
                    </div>
                    <div className="rounded-[14px] bg-cloud px-3 py-2">
                      <p className="text-xs font-bold text-slate">예약 스냅샷</p>
                      <p className="metric-number mt-1 text-sm font-bold text-ink">
                        {formatNumber(latestSyncRun.summary?.appointments ?? 0)}건
                      </p>
                    </div>
                    <div className="rounded-[14px] bg-cloud px-3 py-2">
                      <p className="text-xs font-bold text-slate">완료 시각</p>
                      <p className="metric-number mt-1 text-sm font-bold text-ink">
                        {formatDentwebClientDate(latestSyncRun.finishedAt)}
                      </p>
                    </div>
                  </div>
                  {latestSyncRun.summary?.sourcePath ? (
                    <p className="metric-number mt-3 break-all text-xs font-bold text-slate">
                      원본: {latestSyncRun.summary.sourcePath}
                    </p>
                  ) : null}
                  {latestSyncRun.errorMessage ? (
                    <p className="mt-2 text-xs font-bold text-[#ad1f3d]">{latestSyncRun.errorMessage}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 rounded-[16px] border border-pebble bg-snow p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-ink">환자 검색 테스트</p>
                    <p className="mt-1 text-xs font-bold text-slate">
                      read-only 동기화된 환자/예약 스냅샷이 서버 PC 중앙 DB에서 조회되는지 확인합니다.
                    </p>
                  </div>
                  <span className="rounded-full bg-periwinkle px-3 py-1 text-xs font-bold text-monday-violet">
                    local.db 조회
                  </span>
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={patientSearchQuery}
                    onChange={(event) => setPatientSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void searchDentwebPatients();
                      }
                    }}
                    placeholder="환자명 또는 차트번호"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={searchDentwebPatients}
                    disabled={patientSearchState.status === "loading"}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-monday-violet px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
                  >
                    {patientSearchState.status === "loading" ? "검색 중" : "검색"}
                  </button>
                </div>

                {patientSearchState.status !== "idle" ? (
                  <div
                    className={[
                      "mt-3 rounded-[14px] border px-3 py-2",
                      patientSearchState.status === "success"
                        ? "border-[#b7edc4] bg-[#f0fff4]"
                        : patientSearchState.status === "error"
                          ? "border-[#ffd0d0] bg-[#fff5f5]"
                          : "border-pebble bg-cloud",
                    ].join(" ")}
                  >
                    <p
                      className={[
                        "text-xs font-bold",
                        patientSearchState.status === "success"
                          ? "text-[#146c2e]"
                          : patientSearchState.status === "error"
                            ? "text-[#ad1f3d]"
                            : "text-slate",
                      ].join(" ")}
                    >
                      {patientSearchState.message}
                    </p>
                  </div>
                ) : null}

                {patientSearchState.payload?.patients?.length ? (
                  <div className="mt-3 grid gap-2">
                    {patientSearchState.payload.patients.map((patient) => (
                      <div key={patient.id} className="rounded-[14px] border border-mist bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-ink">
                              {patient.patientName || "이름 없음"}
                              <span className="metric-number ml-2 text-xs text-slate">{patient.chartNo || "-"}</span>
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate">
                              생년월일 {patient.birthDate || "-"} · 연락처 해시 {patient.hasPhoneHash ? "있음" : "없음"}
                            </p>
                          </div>
                          <span className="metric-number rounded-full bg-cloud px-3 py-1 text-[11px] font-bold text-slate">
                            {formatDentwebClientDate(patient.syncedAt)}
                          </span>
                        </div>

                        {patient.latestAppointment ? (
                          <div className="mt-2 rounded-[12px] bg-cloud px-3 py-2">
                            <p className="text-xs font-bold text-slate">최근 예약</p>
                            <p className="metric-number mt-1 text-sm font-bold text-ink">
                              {patient.latestAppointment.appointmentDate || "-"}
                              {patient.latestAppointment.appointmentTime
                                ? ` ${patient.latestAppointment.appointmentTime}`
                                : ""}
                              {patient.latestAppointment.doctor ? ` · ${patient.latestAppointment.doctor}` : ""}
                              {patient.latestAppointment.status ? ` · ${patient.latestAppointment.status}` : ""}
                            </p>
                          </div>
                        ) : (
                          <p className="mt-2 rounded-[12px] bg-cloud px-3 py-2 text-xs font-bold text-slate">
                            연결된 예약 스냅샷이 없습니다.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {localDbState.dryRunPayload?.plannedActions?.length ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-bold text-slate">Dry-run 계획</p>
                  {localDbState.dryRunPayload.plannedActions.map((action) => (
                    <div key={action.step} className="rounded-[14px] border border-pebble bg-snow p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="metric-number text-sm font-bold text-ink">{action.step}</p>
                        <span className="rounded-full bg-periwinkle px-2.5 py-1 text-xs font-bold text-monday-violet">
                          {action.status ?? "-"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-bold text-slate">{action.description ?? "-"}</p>
                      {action.target ? (
                        <p className="metric-number mt-1 break-all text-xs font-bold text-slate">
                          {action.target}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {draftSettings.mode === "server" ? (
            <div className="rounded-[20px] border border-mist bg-white p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-bold text-ink">클라이언트 승인 대기</p>
                  <p className="mt-1 text-sm leading-6 text-slate">
                    접수 PC, 상담 PC, 원장실 PC에서 보낸 연동 요청을 서버 PC에서 승인하거나 거절합니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadClientRequests}
                  disabled={clientApprovalState.status === "loading"}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-pebble bg-white px-4 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet disabled:cursor-wait disabled:opacity-60"
                >
                  {clientApprovalState.status === "loading" ? "확인 중" : "요청 새로고침"}
                </button>
              </div>

              <div
                className={[
                  "mt-4 rounded-[16px] border px-4 py-3",
                  clientApprovalState.status === "success"
                    ? "border-[#b7edc4] bg-[#f0fff4]"
                    : clientApprovalState.status === "error"
                      ? "border-[#ffd0d0] bg-[#fff5f5]"
                      : "border-pebble bg-cloud",
                ].join(" ")}
              >
                <p
                  className={[
                    "text-sm font-bold",
                    clientApprovalState.status === "success"
                      ? "text-[#146c2e]"
                      : clientApprovalState.status === "error"
                        ? "text-[#ad1f3d]"
                        : "text-slate",
                  ].join(" ")}
                >
                  {clientApprovalState.message}
                </p>
                {clientApprovalState.serverUrl ? (
                  <p className="metric-number mt-2 text-xs font-bold text-slate">
                    서버: {clientApprovalState.serverUrl}
                  </p>
                ) : null}
              </div>

              {clientApprovalState.clients.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {clientApprovalState.clients.map((client) => {
                    const isPending = client.status === "pending_approval";

                    return (
                      <div
                        key={client.id}
                        className="grid gap-3 rounded-[16px] border border-pebble bg-snow p-3 lg:grid-cols-[1fr_auto]"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-ink">{client.name}</p>
                            <span
                              className={[
                                "rounded-full px-2.5 py-1 text-xs font-bold",
                                client.status === "approved"
                                  ? "bg-[#dff8e6] text-[#146c2e]"
                                  : client.status === "rejected"
                                    ? "bg-[#ffe1e7] text-[#ad1f3d]"
                                    : "bg-periwinkle text-monday-violet",
                              ].join(" ")}
                            >
                              {getDentwebClientStatusLabel(client.status)}
                            </span>
                          </div>
                          <div className="mt-2 grid gap-1 text-xs font-bold text-slate sm:grid-cols-2">
                            <p>기기 ID: {client.id}</p>
                            <p>요청 시각: {formatDentwebClientDate(client.requestedAt)}</p>
                            <p>접속 주소: {client.remoteAddress || "-"}</p>
                            <p>변경 시각: {formatDentwebClientDate(client.updatedAt)}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isPending ? (
                            <>
                              <button
                                type="button"
                                onClick={() => updateClientApproval(client.id, "approve")}
                                disabled={clientApprovalState.status === "loading"}
                                className="inline-flex h-9 items-center justify-center rounded-full bg-monday-violet px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
                              >
                                승인
                              </button>
                              <button
                                type="button"
                                onClick={() => updateClientApproval(client.id, "reject")}
                                disabled={clientApprovalState.status === "loading"}
                                className="inline-flex h-9 items-center justify-center rounded-full border border-pebble bg-white px-4 text-sm font-bold text-slate transition hover:border-[#ad1f3d] hover:text-[#ad1f3d] disabled:cursor-wait disabled:opacity-60"
                              >
                                거절
                              </button>
                            </>
                          ) : (
                            <span className="rounded-full bg-cloud px-3 py-2 text-xs font-bold text-slate">
                              {getDentwebClientStatusLabel(client.status)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {draftSettings.mode === "client" ? (
            <div className="rounded-[20px] border border-mist bg-white p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-bold text-ink">서버 연결 테스트</p>
                  <p className="mt-1 text-sm leading-6 text-slate">
                    입력한 서버 앱 주소로 연결하고, 치과 정보 확인 후 클라이언트 등록 요청을 보냅니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={testClientConnection}
                  disabled={connectionCheck.status === "checking"}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-monday-violet px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
                >
                  {connectionCheck.status === "checking" ? "확인 중" : "연동하기"}
                </button>
              </div>

              <div
                className={[
                  "mt-4 rounded-[16px] border px-4 py-3",
                  connectionCheck.status === "success"
                    ? "border-[#b7edc4] bg-[#f0fff4]"
                    : connectionCheck.status === "error"
                      ? "border-[#ffd0d0] bg-[#fff5f5]"
                      : "border-pebble bg-cloud",
                ].join(" ")}
              >
                <p
                  className={[
                    "text-sm font-bold",
                    connectionCheck.status === "success"
                      ? "text-[#146c2e]"
                      : connectionCheck.status === "error"
                        ? "text-[#ad1f3d]"
                        : "text-slate",
                  ].join(" ")}
                >
                  {connectionCheck.message}
                </p>
                {connectionCheck.serverUrl ? (
                  <p className="metric-number mt-2 text-xs font-bold text-slate">
                    서버: {connectionCheck.serverUrl}
                  </p>
                ) : null}
                {connectionCheck.clinicName ? (
                  <p className="mt-1 text-xs font-bold text-slate">확인된 치과: {connectionCheck.clinicName}</p>
                ) : null}
                {connectionCheck.registrationStatus ? (
                  <p className="mt-1 text-xs font-bold text-slate">
                    등록 상태: {connectionCheck.registrationStatus}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="rounded-[20px] border border-mist bg-periwinkle p-4">
            <p className="text-sm font-bold text-monday-violet">
              현재 설정: {draftSettings.mode === "server" ? "서버 모드" : "클라이언트 모드"}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate">
              {draftSettings.mode === "server"
                ? "덴트웹 서버찾기, 서버 PC 중앙 DB, 클라이언트 승인 흐름을 이 설정에서 확인할 수 있습니다."
                : "입력한 서버 앱 주소로 연결 테스트와 클라이언트 등록 요청을 보낼 수 있습니다."}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-mist px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-pebble px-4 py-2 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet"
          >
            취소
          </button>
          <button
            type="button"
            onClick={saveSettings}
            className="inline-flex items-center gap-2 rounded-full bg-monday-violet px-4 py-2 text-sm font-bold text-white transition hover:brightness-95"
          >
            <Save className="h-4 w-4" aria-hidden />
            저장
          </button>
        </div>
      </section>
    </div>
  );
}

function ConsultationSettingsModal({
  clinicName,
  options,
  onOpenGroup,
  onClose,
}: {
  clinicName: string;
  options: Record<OptionGroupKey, OptionItem[]>;
  onOpenGroup: (groupKey: OptionGroupKey) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consultation-settings-title"
    >
      <section className="flex max-h-[calc(100vh-48px)] w-full max-w-6xl flex-col overflow-hidden rounded-[26px] border border-mist bg-snow shadow-[rgba(30,41,59,0.22)_0_24px_80px]">
        <div className="flex items-center justify-between gap-3 border-b border-mist px-5 py-4">
          <div>
            <p className="text-xs font-bold text-monday-violet">상담일지 설정</p>
            <h2 id="consultation-settings-title" className="mt-1 text-2xl font-light text-ink">
              상담 등록 항목 관리
            </h2>
            <p className="mt-1 text-sm font-bold text-slate">적용 대상: {clinicName}</p>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-md border border-pebble text-slate transition hover:border-monday-violet hover:text-monday-violet"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="grid gap-4 overflow-y-auto p-5 md:grid-cols-2 2xl:grid-cols-3">
          {optionGroupConfigs.map((group) => (
            <OptionGroupCard
              key={group.key}
              groupKey={group.key}
              label={group.label}
              clinicName={clinicName}
              options={options[group.key]}
              onOpen={onOpenGroup}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function OptionGroupModal({
  clinicId,
  clinicName,
  groupKey,
  label,
  options,
  onClose,
}: {
  clinicId: string;
  clinicName: string;
  groupKey: OptionGroupKey;
  label: string;
  options: OptionItem[];
  onClose: () => void;
}) {
  const { addOptionForClinic, updateOptionForClinic, deleteOptionForClinic, moveOptionForClinic } =
    useAdminSettings();
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const enabledCount = options.filter((option) => option.enabled).length;

  const confirmDelete = () => {
    if (!deleteTarget) {
      return;
    }

    deleteOptionForClinic(clinicId, deleteTarget.groupKey, deleteTarget.optionId);
    setDeleteTarget(null);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/35 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${groupKey}-settings-title`}
    >
      <section className="flex max-h-[calc(100vh-48px)] w-full max-w-3xl flex-col overflow-hidden rounded-[26px] border border-mist bg-snow shadow-[rgba(30,41,59,0.22)_0_24px_80px]">
        <div className="flex items-center justify-between gap-3 border-b border-mist px-5 py-4">
          <div>
            <p className="text-xs font-bold text-monday-violet">상담 등록 옵션</p>
            <h2 id={`${groupKey}-settings-title`} className="mt-1 text-2xl font-light text-ink">
              {label} 수정
            </h2>
            <p className="mt-1 text-sm font-bold text-slate">적용 대상: {clinicName}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="metric-number rounded-md bg-periwinkle px-2 py-1 text-xs font-bold text-monday-violet">
              {enabledCount}/{options.length}
            </span>
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              className="grid h-10 w-10 place-items-center rounded-md border border-pebble text-slate transition hover:border-monday-violet hover:text-monday-violet"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="space-y-3 overflow-y-auto p-5">
          {options.map((option, index) => (
            <div
              key={option.id}
              className="grid gap-2 rounded-[18px] border border-pebble bg-snow p-3 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center"
            >
              <div className="flex h-10 items-center gap-1 rounded-md bg-cloud px-1">
                <button
                  type="button"
                  aria-label={`${option.label || "항목"} 위로 이동`}
                  disabled={index === 0}
                  onClick={() => moveOptionForClinic(clinicId, groupKey, option.id, "up")}
                  className="grid h-8 w-8 place-items-center rounded-md text-slate transition hover:bg-white hover:text-monday-violet disabled:cursor-not-allowed disabled:text-iron disabled:hover:bg-transparent"
                >
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`${option.label || "항목"} 아래로 이동`}
                  disabled={index === options.length - 1}
                  onClick={() => moveOptionForClinic(clinicId, groupKey, option.id, "down")}
                  className="grid h-8 w-8 place-items-center rounded-md text-slate transition hover:bg-white hover:text-monday-violet disabled:cursor-not-allowed disabled:text-iron disabled:hover:bg-transparent"
                >
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <input
                value={option.label}
                onChange={(event) =>
                  updateOptionForClinic(clinicId, groupKey, option.id, { label: event.target.value })
                }
                className={inputClass}
              />
              <label className="flex h-10 items-center gap-2 rounded-md bg-cloud px-3 text-sm font-bold text-slate">
                <input
                  type="checkbox"
                  checked={option.enabled}
                  onChange={(event) =>
                    updateOptionForClinic(clinicId, groupKey, option.id, { enabled: event.target.checked })
                  }
                  className="h-4 w-4 accent-monday-violet"
                />
                사용
              </label>
              <button
                type="button"
                aria-label={`${option.label} 삭제`}
                onClick={() => setDeleteTarget({ groupKey, optionId: option.id, label: option.label })}
                className="grid h-10 w-10 place-items-center rounded-md border border-pebble text-slate transition hover:border-[#ad1f3d] hover:text-[#ad1f3d]"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}

          <form
            className="grid gap-2 border-t border-mist pt-4 sm:grid-cols-[1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              addOptionForClinic(clinicId, groupKey, newOptionLabel);
              setNewOptionLabel("");
            }}
          >
            <input
              value={newOptionLabel}
              onChange={(event) => setNewOptionLabel(event.target.value)}
              placeholder={`${label} 항목 추가`}
              className={inputClass}
            />
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-monday-violet px-4 text-sm font-bold text-white transition hover:brightness-95"
            >
              <Plus className="h-4 w-4" aria-hidden />
              추가
            </button>
          </form>
        </div>
      </section>

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/45 px-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-option-title"
        >
          <div className="w-full max-w-md rounded-[24px] border border-mist bg-snow p-5 shadow-[rgba(30,41,59,0.26)_0_22px_70px]">
            <h3 id="delete-option-title" className="text-xl font-bold text-ink">
              항목을 삭제할까요?
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate">
              {deleteTarget.label || "선택한 항목"} 항목을 삭제하면 신규 상담 등록 선택지에서 바로 사라집니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-full border border-pebble px-4 py-2 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="rounded-full bg-[#ad1f3d] px-4 py-2 text-sm font-bold text-white transition hover:brightness-95"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AdminSettingsPanel() {
  const { settings, activeClinic, setActiveClinicId, renameClinic } = useAdminSettings();
  const [activePanel, setActivePanel] =
    useState<"dashboard" | "consultation" | "recommendations" | "dentweb" | null>(null);
  const [activeGroupKey, setActiveGroupKey] = useState<OptionGroupKey | null>(null);
  const activeGroup = activeGroupKey
    ? optionGroupConfigs.find((group) => group.key === activeGroupKey)
    : undefined;
  const currentDate = new Date();
  const currentGoal = getDashboardGoalForMonth(
    activeClinic.dashboardGoals,
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
  );
  const optionCount = optionGroupConfigs.reduce(
    (sum, group) => sum + activeClinic.options[group.key].length,
    0,
  );
  const enabledOptionCount = optionGroupConfigs.reduce(
    (sum, group) => sum + activeClinic.options[group.key].filter((option) => option.enabled).length,
    0,
  );

  const resetSettings = () => {
    window.localStorage.setItem(adminSettingsStorageKey, JSON.stringify(cloneAdminSettings(defaultAdminSettings)));
    window.dispatchEvent(new Event(adminSettingsChangedEvent));
  };

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold text-monday-violet">관리자모드</p>
          <h1 className="mt-1 text-3xl font-light text-ink">설정 관리</h1>
          <p className="mt-1 text-sm text-slate">
            선택한 치과 기준으로 대시보드와 상담일지 설정을 관리합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={resetSettings}
          className="inline-flex w-fit items-center gap-2 rounded-full border border-pebble px-4 py-2 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          기본값 복원
        </button>
      </section>

      <section className="crm-card p-4">
        <div className="grid gap-3 lg:grid-cols-[0.8fr_1fr] lg:items-end">
          <label className="space-y-2">
            <span className="text-xs font-bold text-slate">치과 선택</span>
            <select
              value={settings.activeClinicId}
              onChange={(event) => setActiveClinicId(event.target.value)}
              className={inputClass}
            >
              {settings.clinics.map((clinic) => (
                <option key={clinic.id} value={clinic.id}>
                  {clinic.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-bold text-slate">선택 치과명</span>
            <input
              value={activeClinic.name}
              onChange={(event) => renameClinic(activeClinic.id, event.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <div className="mt-3 rounded-md bg-periwinkle px-3 py-2 text-sm font-bold text-monday-violet">
          적용 대상: {activeClinic.name}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        <SettingsHubCard
          eyebrow="대시보드"
          title="대시보드 설정"
          description="월별 상담목표와 동의금액 목표를 치과별로 관리합니다."
          icon={LayoutDashboard}
          onOpen={() => setActivePanel("dashboard")}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-cloud px-3 py-2">
              <p className="text-xs font-bold text-slate">이번 달 상담목표</p>
              <p className="metric-number mt-1 text-lg font-bold text-ink">
                {formatNumber(currentGoal.monthlyConsultationGoal)}건
              </p>
            </div>
            <div className="rounded-xl bg-cloud px-3 py-2">
              <p className="text-xs font-bold text-slate">이번 달 동의금액 목표</p>
              <p className="metric-number mt-1 text-lg font-bold text-ink">
                {formatCurrency(currentGoal.monthlyAgreedAmountGoal)}
              </p>
            </div>
          </div>
        </SettingsHubCard>

        <SettingsHubCard
          eyebrow="상담일지"
          title="상담일지 설정"
          description="신규 상담 등록에 쓰는 구분, 상담사, 내원경로, 진료분류, Dr., 상담결과, 비동의사유를 관리합니다."
          icon={ClipboardList}
          onOpen={() => setActivePanel("consultation")}
        >
          <div className="flex flex-wrap gap-2">
            <span className="metric-number rounded-md bg-periwinkle px-3 py-2 text-xs font-bold text-monday-violet">
              사용 {enabledOptionCount}/{optionCount}
            </span>
            {optionGroupConfigs.slice(0, 4).map((group) => (
              <span key={group.key} className="rounded-md bg-cloud px-3 py-2 text-xs font-bold text-slate">
                {group.label}
              </span>
            ))}
          </div>
        </SettingsHubCard>

        <SettingsHubCard
          eyebrow="추천문구"
          title="추천문구 설정"
          description="골든타임 리콜 추천과 부분동의 재컨택에서 표시할 추천 사유 문구를 관리합니다."
          icon={MessageSquareText}
          onOpen={() => setActivePanel("recommendations")}
        >
          <div className="flex flex-wrap gap-2">
            {recommendationPhraseConfigs.slice(0, 4).map((config) => (
              <span key={config.key} className="rounded-md bg-cloud px-3 py-2 text-xs font-bold text-slate">
                {config.label}
              </span>
            ))}
            <span className="metric-number rounded-md bg-periwinkle px-3 py-2 text-xs font-bold text-monday-violet">
              총 {recommendationPhraseConfigs.length}개
            </span>
          </div>
        </SettingsHubCard>

        <SettingsHubCard
          eyebrow="덴트웹 연동"
          title="서버/클라이언트 모드"
          description="이 PC를 덴트웹에 직접 연결하는 서버로 쓸지, 치과 서버 앱에 붙는 클라이언트로 쓸지 설정합니다."
          icon={Server}
          onOpen={() => setActivePanel("dentweb")}
        >
          <div className="space-y-2">
            <span className="inline-flex rounded-md bg-periwinkle px-3 py-2 text-xs font-bold text-monday-violet">
              현재 {activeClinic.dentwebIntegration.mode === "server" ? "서버 모드" : "클라이언트 모드"}
            </span>
            <p className="metric-number text-sm font-bold text-slate">
              {activeClinic.dentwebIntegration.serverHost}:{activeClinic.dentwebIntegration.serverPort}
            </p>
          </div>
        </SettingsHubCard>
      </section>

      {activePanel === "dashboard" ? (
        <DashboardSettingsModal
          clinicId={activeClinic.id}
          clinicName={activeClinic.name}
          goals={activeClinic.dashboardGoals}
          onClose={() => setActivePanel(null)}
        />
      ) : null}

      {activePanel === "consultation" ? (
        <ConsultationSettingsModal
          clinicName={activeClinic.name}
          options={activeClinic.options}
          onOpenGroup={setActiveGroupKey}
          onClose={() => {
            setActivePanel(null);
            setActiveGroupKey(null);
          }}
        />
      ) : null}

      {activePanel === "recommendations" ? (
        <RecommendationSettingsModal
          clinicId={activeClinic.id}
          clinicName={activeClinic.name}
          phrases={activeClinic.recommendationPhrases}
          disagreementReasonOptions={activeClinic.options.disagreementReasons}
          disagreementReasonPhrases={activeClinic.disagreementReasonRecommendationPhrases}
          onClose={() => setActivePanel(null)}
        />
      ) : null}

      {activePanel === "dentweb" ? (
        <DentwebModeSettingsModal
          clinicId={activeClinic.id}
          clinicName={activeClinic.name}
          settings={activeClinic.dentwebIntegration}
          onClose={() => setActivePanel(null)}
        />
      ) : null}

      {activeGroup ? (
        <OptionGroupModal
          clinicId={activeClinic.id}
          clinicName={activeClinic.name}
          groupKey={activeGroup.key}
          label={activeGroup.label}
          options={activeClinic.options[activeGroup.key]}
          onClose={() => setActiveGroupKey(null)}
        />
      ) : null}
    </div>
  );
}
