"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
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

  return useMemo(() => {
    try {
      return JSON.parse(snapshot) as LocalApiRuntimeStatus;
    } catch {
      return hydrationStatus;
    }
  }, [snapshot]);
}
