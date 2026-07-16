"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { adminSettingsChangedEvent } from "@/lib/admin-settings";
import { fetchLocalApiJson, getActiveLocalApiClinic } from "@/lib/local-api-client";

export type RecallRoundKey = "round1" | "round2" | "round3";
export type RecallRecordKey = RecallRoundKey | "final";
export type RecallOxValue = "" | "O" | "X";
export type RecallResultValue = "" | "미예약" | "부재" | "예약" | "추가 리콜 필요";

export type RecallRoundRecord = {
  recallDate: string;
  sameDayMessageSent?: RecallOxValue;
  executed: RecallOxValue;
  result: RecallResultValue;
  noReservationReason: string;
  updatedAt: string;
};

export type RecallFinalRecord = {
  finalMessageSent: RecallOxValue;
  updatedAt: string;
};

export type RecallRecord = {
  consultationId: number;
  round1?: RecallRoundRecord;
  round2?: RecallRoundRecord;
  round3?: RecallRoundRecord;
  final?: RecallFinalRecord;
};
type RecallRecordsApiResponse = {
  records?: unknown[];
};
type RecallRecordMutationApiResponse = {
  record?: unknown;
};

const recallStorageKey = "dental-consult-recall-records-v1";
const recallStorageChangedEvent = "dental-consult-recall-records-changed";

const oxValues = new Set<RecallOxValue>(["", "O", "X"]);
const recallResultValues = new Set<RecallResultValue>(["", "미예약", "부재", "예약", "추가 리콜 필요"]);

function toText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toOxValue(value: unknown): RecallOxValue {
  return oxValues.has(value as RecallOxValue) ? (value as RecallOxValue) : "";
}

function toRecallResultValue(value: unknown): RecallResultValue {
  return recallResultValues.has(value as RecallResultValue) ? (value as RecallResultValue) : "";
}

function normalizeRoundRecord(value: unknown): RecallRoundRecord | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const item = value as Record<string, unknown>;

  return {
    recallDate: toText(item.recallDate),
    sameDayMessageSent: toOxValue(item.sameDayMessageSent),
    executed: toOxValue(item.executed),
    result: toRecallResultValue(item.result),
    noReservationReason: toText(item.noReservationReason),
    updatedAt: toText(item.updatedAt),
  };
}

function normalizeFinalRecord(value: unknown): RecallFinalRecord | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const item = value as Record<string, unknown>;

  return {
    finalMessageSent: toOxValue(item.finalMessageSent),
    updatedAt: toText(item.updatedAt),
  };
}

function normalizeRecallRecord(value: unknown): RecallRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  const consultationId = typeof item.consultationId === "number" ? item.consultationId : 0;

  if (!consultationId) {
    return null;
  }

  return {
    consultationId,
    round1: normalizeRoundRecord(item.round1),
    round2: normalizeRoundRecord(item.round2),
    round3: normalizeRoundRecord(item.round3),
    final: normalizeFinalRecord(item.final),
  };
}

function readStoredRecallRecords() {
  try {
    const storedValue = window.localStorage.getItem(recallStorageKey);

    if (!storedValue) {
      return [];
    }

    const parsedValue = JSON.parse(storedValue) as unknown;

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .map(normalizeRecallRecord)
      .filter((record): record is RecallRecord => Boolean(record));
  } catch {
    return [];
  }
}

function writeStoredRecallRecords(records: RecallRecord[]) {
  window.localStorage.setItem(recallStorageKey, JSON.stringify(records));
  window.dispatchEvent(new Event(recallStorageChangedEvent));
}

function subscribeToStoredRecallRecords(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(recallStorageChangedEvent, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(recallStorageChangedEvent, callback);
  };
}

function getStoredRecallRecordsSnapshot() {
  return window.localStorage.getItem(recallStorageKey) ?? "";
}

function parseRecallRecordsSnapshot(snapshot: string) {
  if (!snapshot) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(snapshot) as unknown;

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .map(normalizeRecallRecord)
      .filter((record): record is RecallRecord => Boolean(record));
  } catch {
    return [];
  }
}

function hasRecallData(record: RecallRecord) {
  return Boolean(record.round1 || record.round2 || record.round3 || record.final);
}

function mergeRecallRecords(localRecords: RecallRecord[], serverRecords: RecallRecord[] | null) {
  if (!serverRecords) {
    return localRecords;
  }

  const recordsByConsultationId = new Map<number, RecallRecord>();

  localRecords.forEach((record) => {
    recordsByConsultationId.set(record.consultationId, record);
  });
  serverRecords.forEach((record) => {
    recordsByConsultationId.set(record.consultationId, record);
  });

  return [...recordsByConsultationId.values()];
}

function upsertRecallRecord(records: RecallRecord[], record: RecallRecord) {
  const hasRecord = records.some((item) => item.consultationId === record.consultationId);

  return hasRecord
    ? records.map((item) => (item.consultationId === record.consultationId ? record : item))
    : [record, ...records];
}

function removeRecallRecord(records: RecallRecord[], consultationId: number) {
  return records.filter((record) => record.consultationId !== consultationId);
}

async function readServerRecallRecords() {
  const clinicId = getActiveLocalApiClinic()?.id;
  const path = clinicId
    ? `/app-data/recall-records?clinicId=${encodeURIComponent(clinicId)}`
    : "/app-data/recall-records";
  const payload = await fetchLocalApiJson<RecallRecordsApiResponse>(path);

  return (payload.records ?? [])
    .map(normalizeRecallRecord)
    .filter((record): record is RecallRecord => Boolean(record));
}

export function useRecallRecords() {
  const [serverRecords, setServerRecords] = useState<RecallRecord[] | null>(null);
  const storedRecallRecordsSnapshot = useSyncExternalStore(
    subscribeToStoredRecallRecords,
    getStoredRecallRecordsSnapshot,
    () => "",
  );

  const refreshServerRecords = useCallback(async () => {
    try {
      setServerRecords(await readServerRecallRecords());
    } catch {
      setServerRecords(null);
    }
  }, []);

  useEffect(() => {
    const refreshTimerId = window.setTimeout(() => {
      refreshServerRecords();
    }, 0);

    window.addEventListener(adminSettingsChangedEvent, refreshServerRecords);
    window.addEventListener(recallStorageChangedEvent, refreshServerRecords);

    return () => {
      window.clearTimeout(refreshTimerId);
      window.removeEventListener(adminSettingsChangedEvent, refreshServerRecords);
      window.removeEventListener(recallStorageChangedEvent, refreshServerRecords);
    };
  }, [refreshServerRecords]);

  const localRecords = useMemo(
    () => parseRecallRecordsSnapshot(storedRecallRecordsSnapshot),
    [storedRecallRecordsSnapshot],
  );
  const records = useMemo(
    () => mergeRecallRecords(localRecords, serverRecords),
    [localRecords, serverRecords],
  );
  const recordsByConsultationId = useMemo(
    () => new Map(records.map((record) => [record.consultationId, record])),
    [records],
  );

  const updateRecallRound = useCallback(
    async (consultationId: number, round: RecallRoundKey, input: Omit<RecallRoundRecord, "updatedAt">) => {
      const currentRecords = readStoredRecallRecords();
      const currentRecord = records.find((record) => record.consultationId === consultationId) ?? {
        consultationId,
      };
      const nextRecord: RecallRecord = {
        ...currentRecord,
        [round]: {
          ...input,
          updatedAt: new Date().toISOString(),
        },
      };

      try {
        const clinicId = getActiveLocalApiClinic()?.id;
        const payload = await fetchLocalApiJson<RecallRecordMutationApiResponse>(
          `/app-data/recall-records/${consultationId}`,
          {
            body: JSON.stringify({
              ...nextRecord,
              clinicId,
            }),
            method: "PUT",
          },
        );
        const serverRecord = normalizeRecallRecord(payload.record);

        if (serverRecord) {
          setServerRecords((current) => upsertRecallRecord(current ?? [], serverRecord));
          window.dispatchEvent(new Event(recallStorageChangedEvent));

          return;
        }
      } catch {
        // Browser storage remains available when the server PC API is offline.
      }

      const hasRecord = currentRecords.some((record) => record.consultationId === consultationId);
      const nextRecords = hasRecord
        ? currentRecords.map((record) => (record.consultationId === consultationId ? nextRecord : record))
        : [...currentRecords, nextRecord];

      writeStoredRecallRecords(nextRecords);
    },
    [records],
  );

  const updateRecallFinal = useCallback(
    async (consultationId: number, input: Omit<RecallFinalRecord, "updatedAt">) => {
      const currentRecords = readStoredRecallRecords();
      const currentRecord = records.find((record) => record.consultationId === consultationId) ?? {
        consultationId,
      };
      const nextRecord: RecallRecord = {
        ...currentRecord,
        final: {
          ...input,
          updatedAt: new Date().toISOString(),
        },
      };

      try {
        const clinicId = getActiveLocalApiClinic()?.id;
        const payload = await fetchLocalApiJson<RecallRecordMutationApiResponse>(
          `/app-data/recall-records/${consultationId}`,
          {
            body: JSON.stringify({
              ...nextRecord,
              clinicId,
            }),
            method: "PUT",
          },
        );
        const serverRecord = normalizeRecallRecord(payload.record);

        if (serverRecord) {
          setServerRecords((current) => upsertRecallRecord(current ?? [], serverRecord));
          window.dispatchEvent(new Event(recallStorageChangedEvent));

          return;
        }
      } catch {
        // Browser storage remains available when the server PC API is offline.
      }

      const hasRecord = currentRecords.some((record) => record.consultationId === consultationId);
      const nextRecords = hasRecord
        ? currentRecords.map((record) => (record.consultationId === consultationId ? nextRecord : record))
        : [...currentRecords, nextRecord];

      writeStoredRecallRecords(nextRecords);
    },
    [records],
  );

  const deleteRecallRound = useCallback(async (consultationId: number, round: RecallRoundKey) => {
    const currentRecords = readStoredRecallRecords();
    const currentRecord = records.find((record) => record.consultationId === consultationId);

    if (!currentRecord) {
      return;
    }

    const nextRecord: RecallRecord = { ...currentRecord };
    delete nextRecord[round];

    const nextRecords = hasRecallData(nextRecord)
      ? currentRecords.map((record) => (record.consultationId === consultationId ? nextRecord : record))
      : currentRecords.filter((record) => record.consultationId !== consultationId);

    try {
      const clinicId = getActiveLocalApiClinic()?.id;
      const payload = await fetchLocalApiJson<RecallRecordMutationApiResponse>(
        `/app-data/recall-records/${consultationId}/${round}`,
        {
          body: JSON.stringify({ clinicId }),
          method: "DELETE",
        },
      );
      const serverRecord = normalizeRecallRecord(payload.record);

      setServerRecords((current) =>
        serverRecord ? upsertRecallRecord(current ?? [], serverRecord) : removeRecallRecord(current ?? [], consultationId),
      );
      window.dispatchEvent(new Event(recallStorageChangedEvent));

      return;
    } catch {
      // Browser storage remains available when the server PC API is offline.
    }

    writeStoredRecallRecords(nextRecords);
  }, [records]);

  const deleteRecallFinal = useCallback(async (consultationId: number) => {
    const currentRecords = readStoredRecallRecords();
    const currentRecord = records.find((record) => record.consultationId === consultationId);

    if (!currentRecord) {
      return;
    }

    const nextRecord: RecallRecord = { ...currentRecord };
    delete nextRecord.final;

    const nextRecords = hasRecallData(nextRecord)
      ? currentRecords.map((record) => (record.consultationId === consultationId ? nextRecord : record))
      : currentRecords.filter((record) => record.consultationId !== consultationId);

    try {
      const clinicId = getActiveLocalApiClinic()?.id;
      const payload = await fetchLocalApiJson<RecallRecordMutationApiResponse>(
        `/app-data/recall-records/${consultationId}/final`,
        {
          body: JSON.stringify({ clinicId }),
          method: "DELETE",
        },
      );
      const serverRecord = normalizeRecallRecord(payload.record);

      setServerRecords((current) =>
        serverRecord ? upsertRecallRecord(current ?? [], serverRecord) : removeRecallRecord(current ?? [], consultationId),
      );
      window.dispatchEvent(new Event(recallStorageChangedEvent));

      return;
    } catch {
      // Browser storage remains available when the server PC API is offline.
    }

    writeStoredRecallRecords(nextRecords);
  }, [records]);

  return {
    records,
    recordsByConsultationId,
    updateRecallRound,
    updateRecallFinal,
    deleteRecallRound,
    deleteRecallFinal,
  };
}
