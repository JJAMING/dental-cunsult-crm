"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  checkLocalApiConnection,
  type LocalApiRuntimeStatus,
  readLocalApiRuntimeStatus,
  subscribeToLocalApiRuntimeStatus,
} from "@/lib/local-api-client";

const hydrationStatus: LocalApiRuntimeStatus = {
  baseUrl: "",
  checkedAt: "",
  clinicName: "",
  message: "상태 확인 중입니다.",
  mode: "server",
  state: "unknown",
};
const hydrationSnapshot = JSON.stringify(hydrationStatus);

function getStatusSnapshot() {
  return JSON.stringify(readLocalApiRuntimeStatus());
}

export function useLocalApiStatus() {
  const snapshot = useSyncExternalStore(
    subscribeToLocalApiRuntimeStatus,
    getStatusSnapshot,
    () => hydrationSnapshot,
  );

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    let attempt = 0;

    const checkConnection = async () => {
      await checkLocalApiConnection();

      if (!cancelled && attempt < 2) {
        attempt += 1;
        retryTimer = window.setTimeout(() => {
          void checkConnection();
        }, 1500);
      }
    };

    void checkConnection();

    return () => {
      cancelled = true;

      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, []);

  return useMemo(() => {
    try {
      return JSON.parse(snapshot) as LocalApiRuntimeStatus;
    } catch {
      return hydrationStatus;
    }
  }, [snapshot]);
}
