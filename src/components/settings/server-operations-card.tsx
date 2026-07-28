"use client";

import { Database, RefreshCw, RotateCw, Server, Wifi } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatNumber } from "@/lib/format";
import {
  checkLocalApiConnection,
  loadDentwebOperationalStatus,
  runDentwebSyncNow,
  testDentwebSqlServerConnection,
  type DentwebOperationalStatus,
} from "@/lib/local-api-client";
import { useLocalApiStatus } from "@/hooks/use-local-api-status";

type OperationState = "idle" | "loading" | "success" | "error";

function formatCheckedAt(value?: string) {
  if (!value) {
    return "아직 확인 기록이 없습니다.";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "확인 시각을 알 수 없습니다.";
  }

  return date.toLocaleString("ko-KR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.includes("local_api_")) {
    return "서버 PC 또는 덴트웹 연결을 다시 확인해주세요.";
  }

  return error instanceof Error ? error.message : "운영 상태를 확인하지 못했습니다.";
}

export function ServerOperationsCard() {
  const localApiStatus = useLocalApiStatus();
  const [state, setState] = useState<OperationState>("idle");
  const [message, setMessage] = useState("서버 운영 상태를 확인 중입니다.");
  const [status, setStatus] = useState<DentwebOperationalStatus | null>(null);

  const refreshStatus = useCallback(async (successMessage = "서버 운영 상태를 확인했습니다.") => {
    setState("loading");

    try {
      await checkLocalApiConnection();
      const nextStatus = await loadDentwebOperationalStatus();
      setStatus(nextStatus);
      setState("success");
      setMessage(successMessage);
    } catch (error) {
      setState("error");
      setMessage(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    const initialCheckTimer = window.setTimeout(() => {
      void refreshStatus();
    }, 0);

    return () => {
      window.clearTimeout(initialCheckTimer);
    };
  }, [refreshStatus]);

  const runSync = async (action: "reconnect" | "sync") => {
    setState("loading");
    setMessage(action === "reconnect" ? "덴트웹 연결을 다시 시도하고 있습니다." : "덴트웹 데이터를 동기화하고 있습니다.");

    try {
      const sync = action === "sync" ? await runDentwebSyncNow() : null;

      if (action === "reconnect") {
        await testDentwebSqlServerConnection();
      }

      const nextStatus = await loadDentwebOperationalStatus();
      setStatus(sync ? { ...nextStatus, sync } : nextStatus);
      setState("success");
      setMessage(
        action === "reconnect"
          ? "덴트웹 연결을 다시 확인했습니다."
          : "덴트웹 환자와 예약 스냅샷을 동기화했습니다.",
      );
    } catch (error) {
      setState("error");
      setMessage(getErrorMessage(error));
    }
  };

  const isServerConnected = localApiStatus.state === "connected";
  const isDentwebReady = Boolean(status?.integration.readyToSync);
  const lastSync = status?.sync.lastSyncRun;
  const lastSyncError = lastSync?.status === "failed" ? lastSync.errorMessage : "";
  const isLoading = state === "loading";
  const patientCount = lastSync?.summary?.patients ?? status?.sync.rowCounts?.dentweb_patients_snapshot ?? 0;
  const appointmentCount =
    lastSync?.summary?.appointments ?? status?.sync.rowCounts?.dentweb_appointments_snapshot ?? 0;

  return (
    <section className="crm-card p-5" aria-labelledby="server-operations-title">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-periwinkle text-monday-violet">
              <Server className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-bold text-monday-violet">운영 안정화</p>
              <h2 id="server-operations-title" className="mt-0.5 text-xl font-bold text-ink">
                서버 운영 상태
              </h2>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate">
            서버 PC, 덴트웹 읽기 전용 연결과 최근 동기화 결과를 확인합니다. 수납 내역은 대량 저장하지 않고
            환자별로 실시간 조회합니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refreshStatus("서버 연결을 다시 확인했습니다.")}
            disabled={isLoading}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-pebble bg-white px-4 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            연결 다시 확인
          </button>
          <button
            type="button"
            onClick={() => void runSync("reconnect")}
            disabled={isLoading}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-monday-violet bg-white px-4 text-sm font-bold text-monday-violet transition hover:bg-periwinkle disabled:cursor-wait disabled:opacity-60"
          >
            <RotateCw className="h-4 w-4" aria-hidden />
            덴트웹 재연결
          </button>
          <button
            type="button"
            onClick={() => void runSync("sync")}
            disabled={isLoading}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-monday-violet px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
          >
            <Database className="h-4 w-4" aria-hidden />
            지금 동기화
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatusMetric
          icon={Wifi}
          label="서버 앱"
          value={isServerConnected ? "연결됨" : "연결 안 됨"}
          description={localApiStatus.baseUrl || "서버 주소 미설정"}
          tone={isServerConnected ? "success" : "error"}
        />
        <StatusMetric
          icon={Database}
          label="덴트웹 DB"
          value={isDentwebReady ? "연결 준비됨" : "확인 필요"}
          description={status?.integration.message || "읽기 전용 연결 상태를 확인하세요."}
          tone={isDentwebReady ? "success" : "error"}
        />
        <StatusMetric
          icon={RefreshCw}
          label="마지막 동기화"
          value={lastSync?.status === "success" ? "성공" : lastSync?.status === "failed" ? "실패" : "기록 없음"}
          description={formatCheckedAt(lastSync?.finishedAt ?? status?.sync.checkedAt)}
          tone={lastSync?.status === "success" ? "success" : lastSync?.status === "failed" ? "error" : "neutral"}
        />
        <StatusMetric
          icon={Database}
          label="동기화 건수"
          value={`환자 ${formatNumber(patientCount)} · 예약 ${formatNumber(appointmentCount)}`}
          description="수납은 환자별 실시간 조회"
          tone="neutral"
        />
      </div>

      <div
        className={[
          "mt-4 rounded-xl border px-4 py-3 text-sm font-bold",
          state === "error" || lastSyncError
            ? "border-[#ffd0d0] bg-[#fff5f5] text-[#ad1f3d]"
            : state === "success"
              ? "border-[#b7edc4] bg-[#f0fff4] text-[#146c2e]"
              : "border-pebble bg-cloud text-slate",
        ].join(" ")}
      >
        <p>{lastSyncError || message}</p>
        <p className="mt-1 text-xs font-medium opacity-80">
          마지막 확인: {formatCheckedAt(status?.health.timestamp ?? localApiStatus.checkedAt)}
        </p>
      </div>
    </section>
  );
}

function StatusMetric({
  icon: Icon,
  label,
  value,
  description,
  tone,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  description: string;
  tone: "success" | "error" | "neutral";
}) {
  const toneClass =
    tone === "success"
      ? "bg-[#ecfff1] text-[#16733a]"
      : tone === "error"
        ? "bg-[#fff1f2] text-[#c81e42]"
        : "bg-cloud text-slate";

  return (
    <div className="rounded-xl border border-pebble bg-white p-3">
      <div className="flex items-center gap-2">
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${toneClass}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <p className="text-xs font-bold text-slate">{label}</p>
      </div>
      <p className="metric-number mt-3 text-sm font-bold text-ink">{value}</p>
      <p className="mt-1 truncate text-xs font-medium text-slate" title={description}>
        {description}
      </p>
    </div>
  );
}
