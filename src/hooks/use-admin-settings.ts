"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  adminSettingsChangedEvent,
  adminSettingsStorageKey,
  cloneAdminSettings,
  defaultAdminSettings,
  normalizeAdminSettings,
  optionGroupConfigs,
  type AdminSettings,
  type ClinicSettings,
  type DashboardGoals,
  type DentwebIntegrationSettings,
  type DisagreementReasonRecommendationPhrases,
  type OptionGroupKey,
  type RecommendationPhrases,
} from "@/lib/admin-settings";
import { syncAdminSettingsToLocalApi } from "@/lib/local-api-client";
import { readSupabaseAdminSettings, saveSupabaseAdminSettings } from "@/lib/supabase/admin-settings";

function readStoredSettings() {
  try {
    const storedValue = window.localStorage.getItem(adminSettingsStorageKey);

    if (!storedValue) {
      return cloneAdminSettings();
    }

    return normalizeAdminSettings(JSON.parse(storedValue) as AdminSettings);
  } catch {
    return cloneAdminSettings();
  }
}

function writeStoredSettings(settings: AdminSettings, options: { syncSupabase?: boolean } = {}) {
  const shouldSyncSupabase = options.syncSupabase ?? true;

  window.localStorage.setItem(adminSettingsStorageKey, JSON.stringify(settings));
  window.dispatchEvent(new Event(adminSettingsChangedEvent));
  syncAdminSettingsToLocalApi(settings).catch(() => {
    // The local API is optional while the app is still usable in browser-only mode.
  });

  if (shouldSyncSupabase) {
    saveSupabaseAdminSettings(settings).catch(() => {
      // Supabase is optional until the deployed project and login session are ready.
    });
  }
}

function subscribeToStoredSettings(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(adminSettingsChangedEvent, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(adminSettingsChangedEvent, callback);
  };
}

function getStoredSettingsSnapshot() {
  return window.localStorage.getItem(adminSettingsStorageKey) ?? "";
}

let hasStartedSupabaseSettingsHydration = false;

export function useAdminSettings() {
  const storedSettingsSnapshot = useSyncExternalStore(
    subscribeToStoredSettings,
    getStoredSettingsSnapshot,
    () => "",
  );

  const settings = useMemo(() => {
    if (!storedSettingsSnapshot) {
      return cloneAdminSettings();
    }

    try {
      return normalizeAdminSettings(JSON.parse(storedSettingsSnapshot) as AdminSettings);
    } catch {
      return cloneAdminSettings();
    }
  }, [storedSettingsSnapshot]);

  const updateSettings = useCallback((updater: (current: AdminSettings) => AdminSettings) => {
    writeStoredSettings(normalizeAdminSettings(updater(readStoredSettings())));
  }, []);

  useEffect(() => {
    if (hasStartedSupabaseSettingsHydration) {
      return;
    }

    hasStartedSupabaseSettingsHydration = true;
    let isMounted = true;

    readSupabaseAdminSettings(readStoredSettings())
      .then((remoteSettings) => {
        if (isMounted && remoteSettings) {
          writeStoredSettings(remoteSettings, { syncSupabase: false });
        }
      })
      .catch(() => {
        // Browser/local API settings remain the fallback while Supabase is unavailable.
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const activeClinic = useMemo(
    () => settings.clinics.find((clinic) => clinic.id === settings.activeClinicId) ?? settings.clinics[0],
    [settings.activeClinicId, settings.clinics],
  );

  const setActiveClinicId = useCallback(
    (clinicId: string) => {
      updateSettings((current) => ({
        ...current,
        activeClinicId: clinicId,
      }));
    },
    [updateSettings],
  );

  const addClinic = useCallback(
    (name: string) => {
      const trimmedName = name.trim();

      if (!trimmedName) {
        return;
      }

      updateSettings((current) => {
        const templateClinic = current.clinics[0] ?? defaultAdminSettings.clinics[0];
        const newClinic: ClinicSettings = {
          id: `clinic-${Date.now()}`,
          name: trimmedName,
          dentwebIntegration: { ...templateClinic.dentwebIntegration },
          dashboardGoals: { ...templateClinic.dashboardGoals },
          recommendationPhrases: { ...templateClinic.recommendationPhrases },
          disagreementReasonRecommendationPhrases: { ...templateClinic.disagreementReasonRecommendationPhrases },
          options: cloneAdminSettings({
            activeClinicId: templateClinic.id,
            clinics: [templateClinic],
          }).clinics[0].options,
        };

        return {
          activeClinicId: newClinic.id,
          clinics: [...current.clinics, newClinic],
        };
      });
    },
    [updateSettings],
  );

  const renameClinic = useCallback(
    (clinicId: string, name: string) => {
      updateSettings((current) => ({
        ...current,
        clinics: current.clinics.map((clinic) =>
          clinic.id === clinicId ? { ...clinic, name } : clinic,
        ),
      }));
    },
    [updateSettings],
  );

  const updateClinic = useCallback(
    (clinicId: string, updater: (clinic: ClinicSettings) => ClinicSettings) => {
      updateSettings((current) => ({
        ...current,
        clinics: current.clinics.map((clinic) =>
          clinic.id === clinicId ? updater(clinic) : clinic,
        ),
      }));
    },
    [updateSettings],
  );

  const addOptionForClinic = useCallback(
    (clinicId: string, groupKey: OptionGroupKey, label: string) => {
      const trimmedLabel = label.trim();

      if (!clinicId || !trimmedLabel) {
        return;
      }

      updateClinic(clinicId, (clinic) => ({
        ...clinic,
        options: {
          ...clinic.options,
          [groupKey]: [
            ...clinic.options[groupKey],
            {
              id: `${clinicId}-${groupKey}-${Date.now()}`,
              label: trimmedLabel,
              enabled: true,
            },
          ],
        },
      }));
    },
    [updateClinic],
  );

  const updateOptionForClinic = useCallback(
    (
      clinicId: string,
      groupKey: OptionGroupKey,
      optionId: string,
      patch: { label?: string; enabled?: boolean },
    ) => {
      updateClinic(clinicId, (clinic) => ({
        ...clinic,
        options: {
          ...clinic.options,
          [groupKey]: clinic.options[groupKey].map((option) =>
            option.id === optionId ? { ...option, ...patch } : option,
          ),
        },
      }));
    },
    [updateClinic],
  );

  const deleteOptionForClinic = useCallback(
    (clinicId: string, groupKey: OptionGroupKey, optionId: string) => {
      updateClinic(clinicId, (clinic) => ({
        ...clinic,
        options: {
          ...clinic.options,
          [groupKey]: clinic.options[groupKey].filter((option) => option.id !== optionId),
        },
      }));
    },
    [updateClinic],
  );

  const moveOptionForClinic = useCallback(
    (clinicId: string, groupKey: OptionGroupKey, optionId: string, direction: "up" | "down") => {
      updateClinic(clinicId, (clinic) => {
        const options = clinic.options[groupKey];
        const currentIndex = options.findIndex((option) => option.id === optionId);

        if (currentIndex < 0) {
          return clinic;
        }

        const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

        if (nextIndex < 0 || nextIndex >= options.length) {
          return clinic;
        }

        const reorderedOptions = [...options];
        const [targetOption] = reorderedOptions.splice(currentIndex, 1);
        reorderedOptions.splice(nextIndex, 0, targetOption);

        return {
          ...clinic,
          options: {
            ...clinic.options,
            [groupKey]: reorderedOptions,
          },
        };
      });
    },
    [updateClinic],
  );

  const updateDashboardGoalsForClinic = useCallback(
    (clinicId: string, goals: DashboardGoals) => {
      updateClinic(clinicId, (clinic) => ({
        ...clinic,
        dashboardGoals: goals,
      }));
    },
    [updateClinic],
  );

  const updateDentwebIntegrationForClinic = useCallback(
    (clinicId: string, dentwebIntegration: DentwebIntegrationSettings) => {
      updateClinic(clinicId, (clinic) => ({
        ...clinic,
        dentwebIntegration,
      }));
    },
    [updateClinic],
  );

  const updateDentwebIntegration = useCallback(
    (dentwebIntegration: DentwebIntegrationSettings) => {
      updateDentwebIntegrationForClinic(settings.activeClinicId, dentwebIntegration);
    },
    [settings.activeClinicId, updateDentwebIntegrationForClinic],
  );

  const updateDashboardGoals = useCallback(
    (goals: DashboardGoals) => {
      updateDashboardGoalsForClinic(settings.activeClinicId, goals);
    },
    [settings.activeClinicId, updateDashboardGoalsForClinic],
  );

  const updateRecommendationPhrasesForClinic = useCallback(
    (clinicId: string, phrases: RecommendationPhrases) => {
      updateClinic(clinicId, (clinic) => ({
        ...clinic,
        recommendationPhrases: phrases,
      }));
    },
    [updateClinic],
  );

  const updateRecommendationPhrases = useCallback(
    (phrases: RecommendationPhrases) => {
      updateRecommendationPhrasesForClinic(settings.activeClinicId, phrases);
    },
    [settings.activeClinicId, updateRecommendationPhrasesForClinic],
  );

  const updateDisagreementReasonRecommendationPhrasesForClinic = useCallback(
    (clinicId: string, phrases: DisagreementReasonRecommendationPhrases) => {
      updateClinic(clinicId, (clinic) => ({
        ...clinic,
        disagreementReasonRecommendationPhrases: phrases,
      }));
    },
    [updateClinic],
  );

  const updateDisagreementReasonRecommendationPhrases = useCallback(
    (phrases: DisagreementReasonRecommendationPhrases) => {
      updateDisagreementReasonRecommendationPhrasesForClinic(settings.activeClinicId, phrases);
    },
    [settings.activeClinicId, updateDisagreementReasonRecommendationPhrasesForClinic],
  );

  const addOption = useCallback(
    (groupKey: OptionGroupKey, label: string) => {
      addOptionForClinic(settings.activeClinicId, groupKey, label);
    },
    [addOptionForClinic, settings.activeClinicId],
  );

  const updateOption = useCallback(
    (groupKey: OptionGroupKey, optionId: string, patch: { label?: string; enabled?: boolean }) => {
      updateOptionForClinic(settings.activeClinicId, groupKey, optionId, patch);
    },
    [settings.activeClinicId, updateOptionForClinic],
  );

  const deleteOption = useCallback(
    (groupKey: OptionGroupKey, optionId: string) => {
      deleteOptionForClinic(settings.activeClinicId, groupKey, optionId);
    },
    [deleteOptionForClinic, settings.activeClinicId],
  );

  const moveOption = useCallback(
    (groupKey: OptionGroupKey, optionId: string, direction: "up" | "down") => {
      moveOptionForClinic(settings.activeClinicId, groupKey, optionId, direction);
    },
    [moveOptionForClinic, settings.activeClinicId],
  );

  const enabledOptions = useMemo(() => {
    return optionGroupConfigs.reduce(
      (groups, group) => ({
        ...groups,
        [group.key]: activeClinic.options[group.key]
          .filter((option) => option.enabled && option.label.trim())
          .map((option) => option.label.trim()),
      }),
      {} as Record<OptionGroupKey, string[]>,
    );
  }, [activeClinic]);

  return {
    settings,
    activeClinic,
    enabledOptions,
    setActiveClinicId,
    addClinic,
    renameClinic,
    addOptionForClinic,
    updateOptionForClinic,
    deleteOptionForClinic,
    moveOptionForClinic,
    updateDashboardGoalsForClinic,
    updateDashboardGoals,
    updateDentwebIntegrationForClinic,
    updateDentwebIntegration,
    updateRecommendationPhrasesForClinic,
    updateRecommendationPhrases,
    updateDisagreementReasonRecommendationPhrasesForClinic,
    updateDisagreementReasonRecommendationPhrases,
    addOption,
    updateOption,
    deleteOption,
    moveOption,
  };
}
