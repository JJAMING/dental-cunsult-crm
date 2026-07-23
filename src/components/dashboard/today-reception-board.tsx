"use client";

import { ClipboardList, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadDentwebTodayReception,
  type DentwebReceptionPatient,
} from "@/lib/local-api-client";

type StatusFilter = "all" | 0 | 1 | 2 | 3 | 4;

const visibleRefreshIntervalMs = 5_000;
const backgroundRefreshIntervalMs = 30_000;

const receptionStatuses = [
  { code: 0, label: "접수" },
  { code: 1, label: "준비완료" },
  { code: 2, label: "진료중" },
  { code: 3, label: "진료완료" },
  { code: 4, label: "수납완료" },
];

const receptionStatusClasses: Record<number, string> = {
  0: "bg-[#e7efff] text-[#3567c8]",
  1: "bg-[#edf9dd] text-[#46831b]",
  2: "bg-[#fff0e8] text-[#c85b2c]",
  3: "bg-[#f2eeff] text-[#7454c8]",
  4: "bg-[#e8f8f2] text-[#23745d]",
};

function getTodayValue() {
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60_000);

  return localDate.toISOString().slice(0, 10);
}

function formatReceptionDate(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length !== 8) {
    return value;
  }

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(year, month - 1, day).getDay()];

  return `${year}년 ${month}월 ${day}일 (${weekday})`;
}

function formatLastUpdated(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatTime(value?: string) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (!digits) {
    return "-";
  }

  const normalized = digits.padStart(4, "0").slice(-4);

  return `${normalized.slice(0, 2)}:${normalized.slice(2, 4)}`;
}

function formatReceptionAt(value?: string) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (digits.length < 12) {
    return "-";
  }

  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)} ${digits.slice(8, 10)}:${digits.slice(10, 12)}`;
}

function formatPhone(value?: string) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return value || "-";
}

function StatusBadge({ patient }: { patient: DentwebReceptionPatient }) {
  return (
    <span
      className={`inline-flex min-w-16 justify-center rounded-full px-2.5 py-1 text-xs font-bold ${
        receptionStatusClasses[patient.statusCode] ?? "bg-cloud text-slate"
      }`}
    >
      {patient.statusLabel}
    </span>
  );
}

function ReceptionTable({
  patients,
  onSelect,
  onConsult,
  scrollable = false,
}: {
  patients: DentwebReceptionPatient[];
  onSelect: (patient: DentwebReceptionPatient) => void;
  onConsult: (patient: DentwebReceptionPatient) => void;
  scrollable?: boolean;
}) {
  return (
    <div className={scrollable ? "max-h-[680px] overflow-auto" : "overflow-x-auto"}>
      <table className="crm-table min-w-[980px]">
        <thead className={scrollable ? "sticky top-0 z-10 shadow-[0_1px_0_rgba(6,43,100,0.16)]" : undefined}>
          <tr>
            <th>순번</th>
            <th>상태</th>
            <th>환자</th>
            <th>연령/성별</th>
            <th>구분</th>
            <th>예약시각</th>
            <th>Dr.</th>
            <th>체어</th>
            <th aria-label="접수 환자 작업" />
          </tr>
        </thead>
        <tbody>
          {patients.map((patient) => (
            <tr key={`${patient.patientId ?? patient.chartNo}-${patient.sequence}`}>
              <td className="metric-number font-bold text-slate">{patient.sequence}</td>
              <td>
                <StatusBadge patient={patient} />
              </td>
              <td>
                <p className="font-bold text-ink">{patient.patientName || "이름 없음"}</p>
                <p className="metric-number mt-1 text-xs font-bold text-slate">{patient.chartNo || "차트번호 없음"}</p>
              </td>
              <td>
                <span className="metric-number font-bold text-ink">{patient.age === null || patient.age === undefined ? "-" : `${patient.age}세`}</span>
                <span className={`ml-1.5 font-bold ${patient.gender === "female" ? "text-[#d95b89]" : "text-[#3b72d9]"}`}>
                  {patient.gender === "female" ? "여" : patient.gender === "male" ? "남" : "-"}
                </span>
              </td>
              <td>
                <span className={patient.patientType === "new" ? "font-bold text-monday-violet" : "font-bold text-slate"}>
                  {patient.patientType === "new" ? "신환" : "구환"}
                </span>
              </td>
              <td className="metric-number font-bold text-ink">{formatTime(patient.reservationTime)}</td>
              <td>{patient.doctor || "-"}</td>
              <td>{patient.chair || "-"}</td>
              <td>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSelect(patient)}
                    className="inline-flex h-8 items-center rounded-md border border-pebble bg-white px-2.5 text-xs font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet"
                  >
                    상세
                  </button>
                  <button
                    type="button"
                    onClick={() => onConsult(patient)}
                    className="inline-flex h-8 items-center rounded-md border border-monday-violet bg-periwinkle px-2.5 text-xs font-bold text-monday-violet transition hover:brightness-95"
                  >
                    상담
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReceptionDetailDialog({
  patient,
  onClose,
}: {
  patient: DentwebReceptionPatient;
  onClose: () => void;
}) {
  const detailRows: Array<[string, string]> = [
    ["차트번호", patient.chartNo || "-"],
    ["연령/성별", `${patient.age === null || patient.age === undefined ? "-" : `${patient.age}세`} · ${patient.gender === "female" ? "여" : patient.gender === "male" ? "남" : "-"}`],
    ["신환/구환", patient.patientType === "new" ? "신환" : "구환"],
    ["접수시각", formatReceptionAt(patient.receptionAt)],
    ["예약시각", formatTime(patient.reservationTime)],
    ["담당 Dr.", patient.doctor || "-"],
    ["담당직원", patient.staff || "-"],
    ["체어", patient.chair || "-"],
    ["전화번호", formatPhone(patient.phone)],
  ];

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-ink/40 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="reception-detail-title" className="w-full max-w-2xl overflow-hidden rounded-xl border border-mist bg-white shadow-[0_24px_72px_rgba(24,32,55,0.28)]">
        <header className="flex items-start justify-between gap-4 border-b border-mist px-5 py-4">
          <div>
            <p className="text-sm font-bold text-monday-violet">오늘의 접수·예약 현황</p>
            <h2 id="reception-detail-title" className="mt-1 text-xl font-bold text-ink">
              {patient.patientName || "환자"} 상세
            </h2>
          </div>
          <button
            type="button"
            aria-label="상세 닫기"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-md border border-pebble text-slate transition hover:border-monday-violet hover:text-monday-violet"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <div className="grid gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2">
          {detailRows.map(([label, value]) => (
            <div key={label}>
              <p className="text-xs font-bold text-slate">{label}</p>
              <p className="mt-1 font-bold text-ink">{value}</p>
            </div>
          ))}
          <div className="sm:col-span-2">
            <p className="text-xs font-bold text-slate">접수/예약 내용</p>
            <p className="mt-1 min-h-16 whitespace-pre-wrap rounded-md bg-cloud px-3 py-3 text-sm leading-6 text-ink">
              {patient.detail || "등록된 접수 또는 예약 내용이 없습니다."}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function ReceptionListDialog({
  patients,
  onClose,
  onSelect,
  onConsult,
}: {
  patients: DentwebReceptionPatient[];
  onClose: () => void;
  onSelect: (patient: DentwebReceptionPatient) => void;
  onConsult: (patient: DentwebReceptionPatient) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="reception-list-title" className="max-h-[calc(100vh-2rem)] w-full max-w-7xl overflow-y-auto rounded-xl border border-mist bg-white shadow-[0_24px_72px_rgba(24,32,55,0.28)]">
        <header className="flex items-center justify-between gap-4 border-b border-mist px-5 py-4">
          <div>
            <p className="text-sm font-bold text-monday-violet">오늘의 접수·예약 현황</p>
            <h2 id="reception-list-title" className="mt-1 text-xl font-bold text-ink">전체 접수 목록</h2>
          </div>
          <button
            type="button"
            aria-label="전체 목록 닫기"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-md border border-pebble text-slate transition hover:border-monday-violet hover:text-monday-violet"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <ReceptionTable patients={patients} onSelect={onSelect} onConsult={onConsult} />
      </section>
    </div>
  );
}

export function TodayReceptionBoard({
  clinicId,
  onConsult,
}: {
  clinicId: string;
  onConsult?: (patient: DentwebReceptionPatient) => void;
}) {
  const [patients, setPatients] = useState<DentwebReceptionPatient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedPatient, setSelectedPatient] = useState<DentwebReceptionPatient | null>(null);
  const [isAllListOpen, setIsAllListOpen] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");
  const todayValue = useMemo(() => getTodayValue(), []);
  const requestInFlightRef = useRef(false);
  const hasReceptionDataRef = useRef(false);

  useEffect(() => {
    let isCurrent = true;
    let refreshTimer: number | undefined;
    hasReceptionDataRef.current = false;

    const loadReception = async (showLoading = false) => {
      if (requestInFlightRef.current) {
        return;
      }

      requestInFlightRef.current = true;

      if (showLoading && isCurrent) {
        setIsLoading(true);
      }

      try {
        const payload = await loadDentwebTodayReception({ clinicId, date: todayValue });

        if (!isCurrent) {
          return;
        }

        const nextPatients = payload.patients ?? [];
        hasReceptionDataRef.current = nextPatients.length > 0;
        setPatients(nextPatients);
        setLastUpdatedAt(new Date().toISOString());
        setMessage("");
      } catch {
        if (isCurrent && !hasReceptionDataRef.current) {
          setMessage("덴트웹 서버에 연결하지 못했습니다. 서버 PC 연동 상태를 확인해주세요.");
        }
      } finally {
        requestInFlightRef.current = false;

        if (isCurrent && showLoading) {
          setIsLoading(false);
        }
      }
    };

    const scheduleRefresh = () => {
      if (refreshTimer) {
        window.clearInterval(refreshTimer);
      }

      const interval = document.visibilityState === "visible"
        ? visibleRefreshIntervalMs
        : backgroundRefreshIntervalMs;
      refreshTimer = window.setInterval(() => {
        void loadReception();
      }, interval);
    };

    const handleVisibilityChange = () => {
      scheduleRefresh();

      if (document.visibilityState === "visible") {
        void loadReception();
      }
    };

    void loadReception(true);
    scheduleRefresh();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isCurrent = false;

      if (refreshTimer) {
        window.clearInterval(refreshTimer);
      }

      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clinicId, reloadKey, todayValue]);

  const statusCounts = useMemo(
    () =>
      receptionStatuses.reduce<Record<number, number>>((counts, status) => {
        counts[status.code] = patients.filter((patient) => patient.statusCode === status.code).length;
        return counts;
      }, {}),
    [patients],
  );
  const filteredPatients = useMemo(
    () => (statusFilter === "all" ? patients : patients.filter((patient) => patient.statusCode === statusFilter)),
    [patients, statusFilter],
  );
  const refreshReception = () => {
    setIsLoading(true);
    setMessage("");
    setReloadKey((current) => current + 1);
  };
  const openConsultation = (patient: DentwebReceptionPatient) => {
    setSelectedPatient(null);
    setIsAllListOpen(false);
    onConsult?.(patient);
  };

  return (
    <section className="crm-card overflow-hidden">
      <header className="flex flex-col gap-4 border-b border-mist px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-periwinkle text-monday-violet">
            <ClipboardList className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink">오늘의 접수·예약 현황</h2>
            <p className="mt-1 text-sm text-slate">
              {formatReceptionDate(todayValue)} · 덴트웹 실시간 조회
              {lastUpdatedAt ? ` · 마지막 갱신 ${formatLastUpdated(lastUpdatedAt)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={refreshReception}
            disabled={isLoading}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-pebble bg-white px-3 text-xs font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} aria-hidden />
            새로고침
          </button>
          <button
            type="button"
            onClick={() => setIsAllListOpen(true)}
            disabled={filteredPatients.length === 0}
            className="inline-flex h-9 items-center rounded-md border border-monday-violet bg-white px-3 text-xs font-bold text-monday-violet transition hover:bg-periwinkle disabled:cursor-not-allowed disabled:opacity-45"
          >
            전체 보기
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-mist px-5 py-3">
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
            statusFilter === "all" ? "bg-monday-violet text-white" : "bg-cloud text-slate hover:bg-periwinkle"
          }`}
        >
          전체 {patients.length}명
        </button>
        {receptionStatuses.map((status) => (
          <button
            key={status.code}
            type="button"
            onClick={() => setStatusFilter(status.code as StatusFilter)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
              statusFilter === status.code
                ? "bg-ink text-white"
                : `${receptionStatusClasses[status.code]} hover:brightness-95`
            }`}
          >
            {status.label} {statusCounts[status.code] ?? 0}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="px-5 py-10 text-center text-sm font-bold text-slate">오늘의 접수 목록을 불러오는 중입니다.</div>
      ) : message ? (
        <div className="px-5 py-10 text-center text-sm font-bold text-[#b94b10]">{message}</div>
      ) : filteredPatients.length ? (
        <ReceptionTable
          patients={filteredPatients}
          onSelect={setSelectedPatient}
          onConsult={openConsultation}
          scrollable
        />
      ) : (
        <div className="px-5 py-10 text-center text-sm font-bold text-slate">선택한 상태의 접수 환자가 없습니다.</div>
      )}

      {isAllListOpen ? (
        <ReceptionListDialog
          patients={filteredPatients}
          onClose={() => setIsAllListOpen(false)}
          onSelect={(patient) => {
            setSelectedPatient(patient);
            setIsAllListOpen(false);
          }}
          onConsult={openConsultation}
        />
      ) : null}
      {selectedPatient ? <ReceptionDetailDialog patient={selectedPatient} onClose={() => setSelectedPatient(null)} /> : null}
    </section>
  );
}
