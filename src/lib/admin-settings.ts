export type OptionGroupKey =
  | "patientTypes"
  | "counselors"
  | "visitChannels"
  | "treatmentCategories"
  | "doctors"
  | "consultationResults"
  | "disagreementReasons";

export type OptionItem = {
  id: string;
  label: string;
  enabled: boolean;
};

export type DashboardGoalValues = {
  monthlyConsultationGoal: number;
  monthlyAgreedAmountGoal: number;
};

export type DashboardMonthlyGoal = DashboardGoalValues & {
  year: number;
  month: number;
};

export type DashboardGoals = {
  monthlyGoals: DashboardMonthlyGoal[];
};

export type DentwebAppMode = "server" | "client";

export type DentwebIntegrationSettings = {
  mode: DentwebAppMode;
  serverHost: string;
  serverPort: number;
  pairingCode: string;
  autoDiscoveryEnabled: boolean;
};

export type RecommendationPhraseKey =
  | "highValueDecline"
  | "costConcern"
  | "competitorComparison"
  | "delayedDecision"
  | "goldenTime"
  | "recallMissing"
  | "partialAgreement"
  | "referralChannel";

export type RecommendationPhrases = Record<RecommendationPhraseKey, string>;
export type DisagreementReasonRecommendationPhrases = Record<string, string>;

export type ClinicSettings = {
  id: string;
  name: string;
  dentwebIntegration: DentwebIntegrationSettings;
  dashboardGoals: DashboardGoals;
  recommendationPhrases: RecommendationPhrases;
  disagreementReasonRecommendationPhrases: DisagreementReasonRecommendationPhrases;
  options: Record<OptionGroupKey, OptionItem[]>;
};

export type AdminSettings = {
  activeClinicId: string;
  clinics: ClinicSettings[];
};

export type OptionGroupConfig = {
  key: OptionGroupKey;
  label: string;
};

export const adminSettingsStorageKey = "dental-consult-admin-settings-v1";
export const adminSettingsChangedEvent = "dental-consult-admin-settings-changed";

export const defaultDashboardGoalValues: DashboardGoalValues = {
  monthlyConsultationGoal: 300,
  monthlyAgreedAmountGoal: 250_000_000,
};

export const defaultDashboardGoals: DashboardGoals = {
  monthlyGoals: createDashboardGoalsForYear(new Date().getFullYear()),
};

export const defaultDentwebIntegrationSettings: DentwebIntegrationSettings = {
  mode: "server",
  serverHost: "0.0.0.0",
  serverPort: 34254,
  pairingCode: "",
  autoDiscoveryEnabled: true,
};

export const recommendationPhraseConfigs: {
  key: RecommendationPhraseKey;
  label: string;
  description: string;
}[] = [
  {
    key: "highValueDecline",
    label: "고액 비동의",
    description: "상담금액 100만원 이상 비동의 상담에 표시합니다.",
  },
  {
    key: "costConcern",
    label: "비용부담",
    description: "비동의사유에 비용부담이 포함되면 표시합니다.",
  },
  {
    key: "competitorComparison",
    label: "타치과비교",
    description: "비동의사유에 타치과비교가 포함되면 표시합니다.",
  },
  {
    key: "delayedDecision",
    label: "기간미룸",
    description: "비동의사유에 기간미룸이 포함되면 표시합니다.",
  },
  {
    key: "goldenTime",
    label: "골든타임",
    description: "상담 후 7일 이내 비동의 상담에 표시합니다.",
  },
  {
    key: "recallMissing",
    label: "리콜 미입력",
    description: "비동의 상담인데 리콜 기록이 없을 때 표시합니다.",
  },
  {
    key: "partialAgreement",
    label: "부분동의 재컨택",
    description: "상담치아가 동의치아보다 많을 때 표시합니다.",
  },
  {
    key: "referralChannel",
    label: "소개 유입",
    description: "소개/지인 유입 환자에게 표시합니다.",
  },
];

export const defaultRecommendationPhrases: RecommendationPhrases = {
  highValueDecline: "고액 비동의 상담입니다. 우선 리콜을 권장합니다.",
  costConcern: "비용 안내와 분납/단계치료 설명이 필요합니다.",
  competitorComparison: "타치과 비교 중인 고객입니다. 차별점 안내가 필요합니다.",
  delayedDecision: "결정을 미루는 고객입니다. 치료 지연 리스크를 짧게 안내하세요.",
  goldenTime: "상담 기억이 남아있는 골든타임입니다.",
  recallMissing: "아직 리콜 입력이 없습니다. 1차 리콜부터 진행하세요.",
  partialAgreement: "잔여치료 재상담 가능성이 있습니다.",
  referralChannel: "소개 신뢰도가 높은 환자입니다.",
};

export const optionGroupConfigs: OptionGroupConfig[] = [
  { key: "patientTypes", label: "구분" },
  { key: "counselors", label: "상담사" },
  { key: "visitChannels", label: "내원경로" },
  { key: "treatmentCategories", label: "진료분류" },
  { key: "doctors", label: "Dr." },
  { key: "consultationResults", label: "상담결과" },
  { key: "disagreementReasons", label: "비동의사유" },
];

export const defaultVisitChannelLabels = [
  "지인소개",
  "가족소개",
  "원장님지인",
  "직원지인",
  "직장, 집근처",
  "간판",
  "네이버검색",
  "네이버블로그",
  "다음검색",
  "구글검색",
  "SNS",
  "당근마켓",
  "지나가다",
  "버스광고",
  "아파트광고",
  "생활우편",
  "병원유리창",
  "건물1층배너",
  "기념품(물티슈 등)",
  "mou/미용실",
  "기타",
];

export const defaultTreatmentCategoryLabels = [
  "임플란트",
  "보철치료",
  "보존치료",
  "교정",
  "기타",
];

export const defaultDisagreementReasonLabels = [
  "선택 안함",
  "상의 및 고민필요",
  "비용부담",
  "기간미룸",
  "타치과비교",
  "치료 전 다른 치료 필요",
  "일정 및 거리",
  "보험에서 치료거부",
  "기타",
];

const legacyVisitChannelLabels = [
  "네이버검색",
  "가족소개",
  "지인소개",
  "직장, 집근처",
  "간판",
  "기타",
];

function optionItems(groupKey: OptionGroupKey, labels: string[]): OptionItem[] {
  return labels.map((label, index) => ({
    id: `${groupKey}-${index + 1}`,
    label,
    enabled: true,
  }));
}

export function createDashboardGoalsForYear(
  year: number,
  values: DashboardGoalValues = defaultDashboardGoalValues,
): DashboardMonthlyGoal[] {
  return Array.from({ length: 12 }, (_, index) => ({
    year,
    month: index + 1,
    monthlyConsultationGoal: values.monthlyConsultationGoal,
    monthlyAgreedAmountGoal: values.monthlyAgreedAmountGoal,
  }));
}

function createDefaultOptions(): Record<OptionGroupKey, OptionItem[]> {
  return {
    patientTypes: optionItems("patientTypes", ["신환", "구환"]),
    counselors: optionItems("counselors", ["최은미", "윤서연", "김가희", "그외"]),
    visitChannels: optionItems("visitChannels", defaultVisitChannelLabels),
    treatmentCategories: optionItems("treatmentCategories", defaultTreatmentCategoryLabels),
    doctors: optionItems("doctors", ["박홍재", "임성언", "원성규", "홍지현", "배상원", "최형윤"]),
    consultationResults: optionItems("consultationResults", [
      "동의(당일진행)",
      "동의(추후진행)",
      "비동의",
      "동의 후 취소",
    ]),
    disagreementReasons: optionItems("disagreementReasons", defaultDisagreementReasonLabels),
  };
}

function hasSameLabels(options: OptionItem[], labels: string[]) {
  const optionLabels = options.map((option) => option.label);

  return optionLabels.length === labels.length && labels.every((label) => optionLabels.includes(label));
}

function normalizeOptionItems(groupKey: OptionGroupKey, options: OptionItem[]) {
  const normalizedOptions = options.map((option, index) => ({
    id: option.id || `${groupKey}-${index + 1}`,
    label: option.label || "",
    enabled: typeof option.enabled === "boolean" ? option.enabled : true,
  }));

  if (groupKey === "visitChannels" && hasSameLabels(normalizedOptions, legacyVisitChannelLabels)) {
    return optionItems("visitChannels", defaultVisitChannelLabels);
  }

  return normalizedOptions;
}

function normalizeDashboardGoalValues(goal: Partial<DashboardGoalValues> | undefined): DashboardGoalValues {
  return {
    monthlyConsultationGoal:
      typeof goal?.monthlyConsultationGoal === "number" && Number.isFinite(goal.monthlyConsultationGoal)
        ? goal.monthlyConsultationGoal
        : defaultDashboardGoalValues.monthlyConsultationGoal,
    monthlyAgreedAmountGoal:
      typeof goal?.monthlyAgreedAmountGoal === "number" && Number.isFinite(goal.monthlyAgreedAmountGoal)
        ? goal.monthlyAgreedAmountGoal
        : defaultDashboardGoalValues.monthlyAgreedAmountGoal,
  };
}

function normalizeDashboardGoals(goals: Partial<DashboardGoals & DashboardGoalValues> | undefined): DashboardGoals {
  const currentYear = new Date().getFullYear();

  if (Array.isArray(goals?.monthlyGoals)) {
    const monthlyGoals = goals.monthlyGoals
      .map((goal) => ({
        year: typeof goal.year === "number" && Number.isFinite(goal.year) ? goal.year : currentYear,
        month: typeof goal.month === "number" && goal.month >= 1 && goal.month <= 12 ? goal.month : 1,
        ...normalizeDashboardGoalValues(goal),
      }))
      .filter((goal, index, allGoals) =>
        allGoals.findIndex((item) => item.year === goal.year && item.month === goal.month) === index,
      );

    return {
      monthlyGoals:
        monthlyGoals.length > 0 ? monthlyGoals : createDashboardGoalsForYear(currentYear),
    };
  }

  return {
    monthlyGoals: createDashboardGoalsForYear(currentYear, normalizeDashboardGoalValues(goals)),
  };
}

function normalizeDentwebIntegrationSettings(
  settings: Partial<DentwebIntegrationSettings> | undefined,
): DentwebIntegrationSettings {
  const serverPort =
    typeof settings?.serverPort === "number" && Number.isFinite(settings.serverPort) && settings.serverPort > 0
      ? Math.round(settings.serverPort)
      : defaultDentwebIntegrationSettings.serverPort;

  return {
    mode: settings?.mode === "client" ? "client" : "server",
    serverHost:
      typeof settings?.serverHost === "string" && settings.serverHost.trim()
        ? settings.serverHost.trim()
        : defaultDentwebIntegrationSettings.serverHost,
    serverPort,
    pairingCode:
      typeof settings?.pairingCode === "string"
        ? settings.pairingCode.replace(/[^0-9]/g, "").slice(0, 6)
        : defaultDentwebIntegrationSettings.pairingCode,
    autoDiscoveryEnabled:
      typeof settings?.autoDiscoveryEnabled === "boolean"
        ? settings.autoDiscoveryEnabled
        : defaultDentwebIntegrationSettings.autoDiscoveryEnabled,
  };
}

function normalizeRecommendationPhrases(
  phrases: Partial<RecommendationPhrases> | undefined,
): RecommendationPhrases {
  return recommendationPhraseConfigs.reduce(
    (normalizedPhrases, config) => {
      const phrase = phrases?.[config.key];

      return {
        ...normalizedPhrases,
        [config.key]:
          typeof phrase === "string" && phrase.trim()
            ? phrase.trim()
            : defaultRecommendationPhrases[config.key],
      };
    },
    {} as RecommendationPhrases,
  );
}

export function getDefaultDisagreementReasonRecommendationPhrase(reason: string) {
  if (!reason || reason === "선택 안함") {
    return "비동의 사유가 명확하지 않습니다. 상담 내용을 확인한 뒤 리콜 방향을 정하세요.";
  }

  return `${reason} 사유가 입력된 비동의 상담입니다. 사유에 맞춰 재안내가 필요합니다.`;
}

export function createDefaultDisagreementReasonRecommendationPhrases(
  reasons: string[] = defaultDisagreementReasonLabels,
): DisagreementReasonRecommendationPhrases {
  return reasons.reduce(
    (phrases, reason) => {
      const normalizedReason = reason.trim();

      if (!normalizedReason) {
        return phrases;
      }

      return {
        ...phrases,
        [normalizedReason]: getDefaultDisagreementReasonRecommendationPhrase(normalizedReason),
      };
    },
    {} as DisagreementReasonRecommendationPhrases,
  );
}

function normalizeDisagreementReasonRecommendationPhrases(
  phrases: Partial<DisagreementReasonRecommendationPhrases> | undefined,
  reasons: string[],
): DisagreementReasonRecommendationPhrases {
  return reasons.reduce(
    (normalizedPhrases, reason) => {
      const normalizedReason = reason.trim();

      if (!normalizedReason) {
        return normalizedPhrases;
      }

      const phrase = phrases?.[normalizedReason];

      return {
        ...normalizedPhrases,
        [normalizedReason]:
          typeof phrase === "string" && phrase.trim()
            ? phrase.trim()
            : getDefaultDisagreementReasonRecommendationPhrase(normalizedReason),
      };
    },
    {} as DisagreementReasonRecommendationPhrases,
  );
}

export function getDashboardGoalForMonth(
  goals: DashboardGoals,
  year: number,
  month: number,
): DashboardGoalValues {
  const matchedGoal = goals.monthlyGoals.find(
    (goal) => goal.year === year && goal.month === month,
  );

  return matchedGoal ? normalizeDashboardGoalValues(matchedGoal) : defaultDashboardGoalValues;
}

export function upsertDashboardMonthlyGoal(
  goals: DashboardGoals,
  nextGoal: DashboardMonthlyGoal,
): DashboardGoals {
  const monthlyGoals = goals.monthlyGoals.filter(
    (goal) => !(goal.year === nextGoal.year && goal.month === nextGoal.month),
  );

  return {
    monthlyGoals: [...monthlyGoals, nextGoal].toSorted((first, second) => {
      if (first.year !== second.year) {
        return first.year - second.year;
      }

      return first.month - second.month;
    }),
  };
}

export const defaultAdminSettings: AdminSettings = {
  activeClinicId: "acro-dental",
  clinics: [
    {
      id: "acro-dental",
      name: "아크로치과",
      dentwebIntegration: defaultDentwebIntegrationSettings,
      dashboardGoals: defaultDashboardGoals,
      recommendationPhrases: defaultRecommendationPhrases,
      disagreementReasonRecommendationPhrases: createDefaultDisagreementReasonRecommendationPhrases(),
      options: createDefaultOptions(),
    },
    {
      id: "demo-dental",
      name: "테스트 치과",
      dentwebIntegration: defaultDentwebIntegrationSettings,
      dashboardGoals: defaultDashboardGoals,
      recommendationPhrases: defaultRecommendationPhrases,
      disagreementReasonRecommendationPhrases: createDefaultDisagreementReasonRecommendationPhrases(),
      options: createDefaultOptions(),
    },
  ],
};

export function cloneAdminSettings(settings: AdminSettings = defaultAdminSettings) {
  return JSON.parse(JSON.stringify(settings)) as AdminSettings;
}

export function normalizeAdminSettings(settings: AdminSettings): AdminSettings {
  const fallback = cloneAdminSettings();
  const clinics = Array.isArray(settings.clinics) && settings.clinics.length > 0
    ? settings.clinics
    : fallback.clinics;

  const normalizedClinics = clinics.map((clinic, clinicIndex) => {
    const fallbackClinic = fallback.clinics[clinicIndex] ?? fallback.clinics[0];
    const fallbackOptions = fallbackClinic.options;
    const normalizedOptions = optionGroupConfigs.reduce(
      (groups, group) => ({
        ...groups,
        [group.key]: Array.isArray(clinic.options?.[group.key])
          ? normalizeOptionItems(group.key, clinic.options[group.key])
          : normalizeOptionItems(group.key, fallbackOptions[group.key]),
      }),
      {} as Record<OptionGroupKey, OptionItem[]>,
    );
    const disagreementReasonLabels = normalizedOptions.disagreementReasons.map((option) => option.label);

    return {
      id: clinic.id || `clinic-${clinicIndex + 1}`,
      name: clinic.name || fallbackClinic.name,
      dentwebIntegration: normalizeDentwebIntegrationSettings(
        clinic.dentwebIntegration ?? fallbackClinic.dentwebIntegration,
      ),
      dashboardGoals: normalizeDashboardGoals(clinic.dashboardGoals ?? fallbackClinic.dashboardGoals),
      recommendationPhrases: normalizeRecommendationPhrases(
        clinic.recommendationPhrases ?? fallbackClinic.recommendationPhrases,
      ),
      disagreementReasonRecommendationPhrases: normalizeDisagreementReasonRecommendationPhrases(
        clinic.disagreementReasonRecommendationPhrases ?? fallbackClinic.disagreementReasonRecommendationPhrases,
        disagreementReasonLabels,
      ),
      options: normalizedOptions,
    };
  });

  const activeClinicId = normalizedClinics.some((clinic) => clinic.id === settings.activeClinicId)
    ? settings.activeClinicId
    : normalizedClinics[0].id;

  return {
    activeClinicId,
    clinics: normalizedClinics,
  };
}
