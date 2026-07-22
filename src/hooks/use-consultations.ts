"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  adminSettingsChangedEvent,
} from "@/lib/admin-settings";
import {
  defaultConsultationClinicId,
  filterConsultationsByClinic,
} from "@/lib/consultation-filters";
import { consultations as demoConsultations } from "@/lib/demo-data";
import { fetchLocalApiJson, getActiveLocalApiClinic } from "@/lib/local-api-client";
import {
  createSupabaseConsultation,
  deleteSupabaseConsultation,
  readSupabaseConsultations,
  updateSupabaseConsultation,
} from "@/lib/supabase/consultations";
import { isSupabaseConfigured } from "@/lib/supabase/browser";
import type { Consultation, ConsultationResult, PatientType } from "@/types/domain";

const consultationStorageKey = "dental-consult-consultations-v1";
const deletedConsultationIdsStorageKey = "dental-consult-deleted-consultation-ids-v1";
const consultationStorageChangedEvent = "dental-consult-consultations-changed";

type ConsultationInput = Omit<Consultation, "id">;
type UseConsultationsOptions = {
  clinicId?: string;
};
type ConsultationsApiResponse = {
  consultations?: unknown[];
};
type ConsultationMutationApiResponse = {
  consultation?: unknown;
};
const patientTypes = new Set<PatientType>(["new", "returning"]);
const consultationResults = new Set<ConsultationResult>([
  "same_day",
  "follow_up",
  "declined",
  "cancelled",
]);

function toNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeConsultation(value: unknown): Consultation | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  const patientType = patientTypes.has(item.patientType as PatientType)
    ? (item.patientType as PatientType)
    : "new";
  const result = consultationResults.has(item.result as ConsultationResult)
    ? (item.result as ConsultationResult)
    : "declined";

  return {
    id: toNumber(item.id),
    clinicId: toText(item.clinicId) || undefined,
    clinicName: toText(item.clinicName) || undefined,
    date: toText(item.date),
    patientName: toText(item.patientName),
    chartNo: toText(item.chartNo),
    patientType,
    counselor: toText(item.counselor),
    doctor: toText(item.doctor),
    visitChannel: toText(item.visitChannel),
    treatmentCategory: toText(item.treatmentCategory),
    consultedTeeth: toNumber(item.consultedTeeth),
    agreedTeeth: toNumber(item.agreedTeeth),
    result,
    consultationAmount: toNumber(item.consultationAmount),
    agreedAmount: toNumber(item.agreedAmount),
    disagreementReason: toText(item.disagreementReason) || undefined,
    memo: toText(item.memo) || undefined,
  };
}

function readStoredConsultations() {
  try {
    const storedValue = window.localStorage.getItem(consultationStorageKey);

    if (!storedValue) {
      return [];
    }

    const parsedValue = JSON.parse(storedValue) as unknown;

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .map(normalizeConsultation)
      .filter((consultation): consultation is Consultation => Boolean(consultation));
  } catch {
    return [];
  }
}

function writeStoredConsultations(consultations: Consultation[]) {
  window.localStorage.setItem(consultationStorageKey, JSON.stringify(consultations));
  window.dispatchEvent(new Event(consultationStorageChangedEvent));
}

function readDeletedConsultationIds() {
  try {
    const storedValue = window.localStorage.getItem(deletedConsultationIdsStorageKey);

    if (!storedValue) {
      return [];
    }

    const parsedValue = JSON.parse(storedValue) as unknown;

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter((id): id is number => typeof id === "number" && Number.isFinite(id));
  } catch {
    return [];
  }
}

function writeDeletedConsultationIds(deletedIds: number[]) {
  window.localStorage.setItem(deletedConsultationIdsStorageKey, JSON.stringify([...new Set(deletedIds)]));
  window.dispatchEvent(new Event(consultationStorageChangedEvent));
}

function subscribeToStoredConsultations(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(consultationStorageChangedEvent, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(consultationStorageChangedEvent, callback);
  };
}

function getStoredConsultationsSnapshot() {
  return [
    window.localStorage.getItem(consultationStorageKey) ?? "",
    window.localStorage.getItem(deletedConsultationIdsStorageKey) ?? "",
  ].join("::");
}

function nextConsultationId(storedConsultations: Consultation[]) {
  return Math.max(
    0,
    ...demoConsultations.map((consultation) => consultation.id),
    ...storedConsultations.map((consultation) => consultation.id),
  ) + 1;
}

function mergeConsultations(storedConsultations: Consultation[], deletedConsultationIds: number[]) {
  const deletedIds = new Set(deletedConsultationIds);
  const storedConsultationsById = new Map(
    storedConsultations.map((consultation) => [consultation.id, consultation]),
  );
  const demoConsultationIds = new Set(demoConsultations.map((consultation) => consultation.id));
  const storedOnlyConsultations = storedConsultations
    .filter((consultation) => !demoConsultationIds.has(consultation.id) && !deletedIds.has(consultation.id))
    .toSorted((first, second) => second.id - first.id);
  const mergedDemoConsultations = demoConsultations
    .filter((consultation) => !deletedIds.has(consultation.id))
    .map((consultation) => storedConsultationsById.get(consultation.id) ?? consultation);

  return [...storedOnlyConsultations, ...mergedDemoConsultations];
}

function upsertConsultation(consultations: Consultation[], consultation: Consultation) {
  const hasConsultation = consultations.some((item) => item.id === consultation.id);

  return hasConsultation
    ? consultations.map((item) => (item.id === consultation.id ? consultation : item))
    : [consultation, ...consultations];
}

function removeConsultation(consultations: Consultation[], consultationId: number) {
  return consultations.filter((consultation) => consultation.id !== consultationId);
}

function getServerClinicId(clinicId?: string) {
  return clinicId ?? getActiveLocalApiClinic()?.id ?? defaultConsultationClinicId;
}

async function readServerConsultations(clinicId?: string) {
  const serverClinicId = getServerClinicId(clinicId);
  const serverClinic = getActiveLocalApiClinic();

  try {
    const payload = await fetchLocalApiJson<ConsultationsApiResponse>(
      `/app-data/consultations?clinicId=${encodeURIComponent(serverClinicId)}`,
    );

    return (payload.consultations ?? [])
      .map(normalizeConsultation)
      .filter((consultation): consultation is Consultation => Boolean(consultation));
  } catch {
    const supabaseConsultations = await readSupabaseConsultations({
      clinicId: serverClinicId,
      clinicName: serverClinic?.name,
    });

    if (supabaseConsultations) {
      return supabaseConsultations;
    }

    throw new Error("remote_consultations_unavailable");
  }
}

export function useConsultations(options: UseConsultationsOptions = {}) {
  const [serverConsultations, setServerConsultations] = useState<Consultation[] | null>(null);
  const storedConsultationsSnapshot = useSyncExternalStore(
    subscribeToStoredConsultations,
    getStoredConsultationsSnapshot,
    () => "",
  );

  const refreshServerConsultations = useCallback(async () => {
    try {
      setServerConsultations(await readServerConsultations(options.clinicId));
    } catch {
      setServerConsultations(null);
    }
  }, [options.clinicId]);

  useEffect(() => {
    const refreshTimerId = window.setTimeout(() => {
      refreshServerConsultations();
    }, 0);

    window.addEventListener(adminSettingsChangedEvent, refreshServerConsultations);
    window.addEventListener(consultationStorageChangedEvent, refreshServerConsultations);

    return () => {
      window.clearTimeout(refreshTimerId);
      window.removeEventListener(adminSettingsChangedEvent, refreshServerConsultations);
      window.removeEventListener(consultationStorageChangedEvent, refreshServerConsultations);
    };
  }, [refreshServerConsultations]);

  const storedConsultations = useMemo(() => {
    const [storedConsultationsValue = ""] = storedConsultationsSnapshot.split("::");

    if (!storedConsultationsValue) {
      return [];
    }

    try {
      const parsedValue = JSON.parse(storedConsultationsValue) as unknown;

      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue
        .map(normalizeConsultation)
        .filter((consultation): consultation is Consultation => Boolean(consultation));
    } catch {
      return [];
    }
  }, [storedConsultationsSnapshot]);
  const deletedConsultationIds = useMemo(() => {
    const [, deletedIdsValue = ""] = storedConsultationsSnapshot.split("::");

    if (!deletedIdsValue) {
      return [];
    }

    try {
      const parsedValue = JSON.parse(deletedIdsValue) as unknown;

      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue.filter((id): id is number => typeof id === "number" && Number.isFinite(id));
    } catch {
      return [];
    }
  }, [storedConsultationsSnapshot]);

  const syncedConsultations = useMemo(
    () =>
      serverConsultations
        ? [...storedConsultations, ...serverConsultations.filter((consultation) => !deletedConsultationIds.includes(consultation.id))]
        : storedConsultations,
    [deletedConsultationIds, serverConsultations, storedConsultations],
  );
  const allConsultations = useMemo(
    () => mergeConsultations(syncedConsultations, deletedConsultationIds),
    [deletedConsultationIds, syncedConsultations],
  );
  const consultations = useMemo(
    () => filterConsultationsByClinic(allConsultations, options.clinicId),
    [allConsultations, options.clinicId],
  );

  const addConsultation = useCallback(async (input: ConsultationInput) => {
    const serverClinic = getActiveLocalApiClinic();
    const currentConsultations = readStoredConsultations();
    const nextId = nextConsultationId(currentConsultations);
    const serverInput = {
      ...input,
      clinicId: input.clinicId ?? serverClinic?.id ?? defaultConsultationClinicId,
      clinicName: input.clinicName ?? serverClinic?.name,
    };
    try {
      const payload = await fetchLocalApiJson<ConsultationMutationApiResponse>("/app-data/consultations", {
        body: JSON.stringify(serverInput),
        method: "POST",
      });
      const serverConsultation = normalizeConsultation(payload.consultation);

      if (serverConsultation) {
        setServerConsultations((current) => upsertConsultation(current ?? [], serverConsultation));
        window.dispatchEvent(new Event(consultationStorageChangedEvent));

        return serverConsultation;
      }
    } catch {
      // Fall back to browser storage when the server PC API is not available.
    }

    try {
      const supabaseConsultation = await createSupabaseConsultation(serverInput, nextId);

      if (supabaseConsultation) {
        setServerConsultations((current) => upsertConsultation(current ?? [], supabaseConsultation));
        window.dispatchEvent(new Event(consultationStorageChangedEvent));

        return supabaseConsultation;
      }
    } catch (error) {
      if (isSupabaseConfigured()) {
        throw new Error(
          error instanceof Error
            ? `Supabase 상담일지 저장 실패: ${error.message}`
            : "Supabase 상담일지 저장에 실패했습니다.",
        );
      }
    }

    if (isSupabaseConfigured()) {
      throw new Error("Supabase 로그인 세션을 확인하지 못해 상담일지를 저장하지 못했습니다.");
    }

    const consultation: Consultation = {
      ...input,
      clinicId: input.clinicId ?? defaultConsultationClinicId,
      id: nextId,
    };

    writeStoredConsultations([...currentConsultations, consultation]);

    return consultation;
  }, []);

  const updateConsultation = useCallback(async (consultationId: number, input: ConsultationInput) => {
    const serverClinic = getActiveLocalApiClinic();
    const serverInput = {
      ...input,
      clinicId: input.clinicId ?? serverClinic?.id ?? defaultConsultationClinicId,
      clinicName: input.clinicName ?? serverClinic?.name,
    };
    try {
      const payload = await fetchLocalApiJson<ConsultationMutationApiResponse>(
        `/app-data/consultations/${consultationId}`,
        {
          body: JSON.stringify(serverInput),
          method: "PUT",
        },
      );
      const serverConsultation = normalizeConsultation(payload.consultation);

      if (serverConsultation) {
        setServerConsultations((current) => upsertConsultation(current ?? [], serverConsultation));
        window.dispatchEvent(new Event(consultationStorageChangedEvent));

        return serverConsultation;
      }
    } catch {
      // Existing local-only rows, demo rows, or offline work continue to use browser storage.
    }

    try {
      const supabaseConsultation = await updateSupabaseConsultation(consultationId, serverInput);

      if (supabaseConsultation) {
        setServerConsultations((current) => upsertConsultation(current ?? [], supabaseConsultation));
        window.dispatchEvent(new Event(consultationStorageChangedEvent));

        return supabaseConsultation;
      }
    } catch (error) {
      if (isSupabaseConfigured()) {
        throw new Error(
          error instanceof Error
            ? `Supabase 상담일지 수정 실패: ${error.message}`
            : "Supabase 상담일지 수정에 실패했습니다.",
        );
      }
    }

    if (isSupabaseConfigured()) {
      throw new Error("Supabase 로그인 세션을 확인하지 못해 상담일지를 수정하지 못했습니다.");
    }

    const currentConsultations = readStoredConsultations();
    const deletedIds = readDeletedConsultationIds().filter((id) => id !== consultationId);
    const currentStoredConsultation = currentConsultations.find(
      (consultation) => consultation.id === consultationId,
    );
    const currentDemoConsultation = demoConsultations.find(
      (consultation) => consultation.id === consultationId,
    );
    const baseConsultation = currentStoredConsultation ?? currentDemoConsultation;

    if (!baseConsultation) {
      return null;
    }

    const updatedConsultation: Consultation = {
      ...baseConsultation,
      ...input,
      clinicId: input.clinicId ?? baseConsultation.clinicId ?? defaultConsultationClinicId,
      id: consultationId,
    };
    const hasStoredConsultation = currentConsultations.some(
      (consultation) => consultation.id === consultationId,
    );
    const nextConsultations = hasStoredConsultation
      ? currentConsultations.map((consultation) =>
          consultation.id === consultationId ? updatedConsultation : consultation,
        )
      : [...currentConsultations, updatedConsultation];

    writeStoredConsultations(nextConsultations);
    writeDeletedConsultationIds(deletedIds);

    return updatedConsultation;
  }, []);

  const deleteConsultation = useCallback(async (consultationId: number) => {
    const currentConsultations = readStoredConsultations();
    const nextDeletedIds = [...readDeletedConsultationIds(), consultationId];

    writeStoredConsultations(removeConsultation(currentConsultations, consultationId));
    writeDeletedConsultationIds(nextDeletedIds);
    setServerConsultations((current) => (current ? removeConsultation(current, consultationId) : current));

    try {
      await fetchLocalApiJson(`/app-data/consultations/${consultationId}`, {
        method: "DELETE",
      });
      window.dispatchEvent(new Event(consultationStorageChangedEvent));

      return true;
    } catch {
      try {
        await deleteSupabaseConsultation({
          clinicId: getServerClinicId(options.clinicId),
          clinicName: getActiveLocalApiClinic()?.name,
          consultationId,
        });

        return true;
      } catch (error) {
        if (isSupabaseConfigured()) {
          throw new Error(
            error instanceof Error
              ? `Supabase 상담일지 삭제 실패: ${error.message}`
              : "Supabase 상담일지 삭제에 실패했습니다.",
          );
        }

        return false;
      }
    }
  }, [options.clinicId]);

  return {
    consultations,
    allConsultations,
    addConsultation,
    deleteConsultation,
    updateConsultation,
  };
}
