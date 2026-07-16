import type { RecallRecord } from "@/hooks/use-recall-records";
import type { DisagreementReasonRecommendationPhrases, RecommendationPhrases } from "@/lib/admin-settings";
import { consentRate } from "@/lib/format";
import type { Consultation, SegmentStat } from "@/types/domain";

export const highValueDeclineThreshold = 1_000_000;
export const goldenTimeDays = 7;

export type RecommendationReason = {
  key: string;
  label: string;
  message: string;
};

export type LossAnalysisRow = SegmentStat & {
  lossAmount: number;
  declined: number;
};

export type OpportunityRadarRow = {
  consultation: Consultation;
  score: number;
  statusLabel: string;
  reasonLabels: string[];
  recommendationMessage: string;
  potentialAmount: number;
  ageInDays: number;
};

export function isAgreement(consultation: Consultation) {
  return consultation.result === "same_day" || consultation.result === "follow_up";
}

export function isReferralChannel(visitChannel: string) {
  return visitChannel.includes("소개") || visitChannel.includes("지인");
}

export function hasRecallData(record?: RecallRecord) {
  return Boolean(record?.round1 || record?.round2 || record?.round3 || record?.final);
}

export function getLatestRecallRound(record?: RecallRecord) {
  return record?.round3 ?? record?.round2 ?? record?.round1;
}

export function isRecallPriorityTarget(consultation: Consultation, record?: RecallRecord) {
  if (consultation.result !== "declined" || record?.final) {
    return false;
  }

  const latestRound = getLatestRecallRound(record);

  if (!latestRound) {
    return true;
  }

  return latestRound.result !== "예약";
}

export function getConsultationAgeInDays(consultationDate: string, baseDate = new Date()) {
  const targetDate = new Date(`${consultationDate}T00:00:00`);
  const baseDateOnly = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const diffMs = baseDateOnly.getTime() - targetDate.getTime();

  return Math.floor(diffMs / 86_400_000);
}

export function isGoldenTimeRecallTarget(
  consultation: Consultation,
  record?: RecallRecord,
  baseDate = new Date(),
) {
  const ageInDays = getConsultationAgeInDays(consultation.date, baseDate);

  return isRecallPriorityTarget(consultation, record) && ageInDays >= 0 && ageInDays <= goldenTimeDays;
}

export function isPartialRecontactTarget(consultation: Consultation) {
  return isAgreement(consultation) && consultation.consultedTeeth > consultation.agreedTeeth;
}

export function buildRecommendationReasons(
  consultation: Consultation,
  record: RecallRecord | undefined,
  phrases: RecommendationPhrases,
  disagreementReasonPhrases: DisagreementReasonRecommendationPhrases = {},
  baseDate = new Date(),
) {
  const reasons: RecommendationReason[] = [];
  const addReason = (key: keyof RecommendationPhrases, label: string) => {
    const message = phrases[key];

    if (message && !reasons.some((reason) => reason.key === key)) {
      reasons.push({ key, label, message });
    }
  };
  const addDisagreementReason = (reason: string) => {
    const normalizedReason = reason.trim();
    const message = disagreementReasonPhrases[normalizedReason];

    if (
      normalizedReason &&
      normalizedReason !== "선택 안함" &&
      message &&
      !reasons.some((item) => item.key === `disagreement:${normalizedReason}`)
    ) {
      reasons.push({
        key: `disagreement:${normalizedReason}`,
        label: normalizedReason,
        message,
      });
    }
  };

  if (consultation.result === "declined" && consultation.consultationAmount >= highValueDeclineThreshold) {
    addReason("highValueDecline", "고액 비동의");
  }

  if (consultation.disagreementReason?.includes("비용")) {
    addReason("costConcern", "비용부담");
  }

  if (consultation.disagreementReason?.includes("타치과")) {
    addReason("competitorComparison", "타치과비교");
  }

  if (consultation.disagreementReason?.includes("기간")) {
    addReason("delayedDecision", "기간미룸");
  }

  if (consultation.result === "declined" && consultation.disagreementReason) {
    addDisagreementReason(consultation.disagreementReason);
  }

  if (isGoldenTimeRecallTarget(consultation, record, baseDate)) {
    addReason("goldenTime", "골든타임");
  }

  if (consultation.result === "declined" && !hasRecallData(record)) {
    addReason("recallMissing", "리콜 미입력");
  }

  if (isPartialRecontactTarget(consultation)) {
    addReason("partialAgreement", "부분동의 재컨택");
  }

  if (isReferralChannel(consultation.visitChannel)) {
    addReason("referralChannel", "소개 유입");
  }

  return reasons;
}

function getOpportunityPotentialAmount(consultation: Consultation) {
  if (isPartialRecontactTarget(consultation)) {
    return Math.max(consultation.consultationAmount - consultation.agreedAmount, 0);
  }

  if (consultation.result === "cancelled") {
    return consultation.agreedAmount || consultation.consultationAmount;
  }

  return consultation.consultationAmount;
}

function getOpportunityStatusLabel(consultation: Consultation, record?: RecallRecord) {
  if (consultation.result === "cancelled") {
    return "동의 후 취소";
  }

  if (isPartialRecontactTarget(consultation)) {
    return "부분동의";
  }

  if (record?.final) {
    return "관리종결";
  }

  if (consultation.result === "declined" && !hasRecallData(record)) {
    return "리콜 미입력";
  }

  if (consultation.result === "declined") {
    return "비동의";
  }

  return "확인 필요";
}

function getOpportunityFallbackMessage(consultation: Consultation, statusLabel: string) {
  if (consultation.result === "cancelled") {
    return "동의 후 취소된 상담입니다. 재예약 가능 여부를 먼저 확인하세요.";
  }

  if (statusLabel === "부분동의") {
    return "동의하지 않은 잔여치료가 있습니다. 후속 상담으로 다시 연결하세요.";
  }

  if (statusLabel === "관리종결") {
    return "관리종결된 상담입니다. 필요 시 최근 상황을 확인하세요.";
  }

  return "후속 상담 가능성이 있는 대상입니다. 리콜 상태를 확인하세요.";
}

export function buildOpportunityRadarRows(
  consultations: Consultation[],
  recordsByConsultationId: ReadonlyMap<number, RecallRecord>,
  phrases: RecommendationPhrases,
  disagreementReasonPhrases: DisagreementReasonRecommendationPhrases = {},
  baseDate = new Date(),
) {
  return consultations
    .map<OpportunityRadarRow | null>((consultation) => {
      const record = recordsByConsultationId.get(consultation.id);
      const latestRound = getLatestRecallRound(record);
      const ageInDays = getConsultationAgeInDays(consultation.date, baseDate);
      const reasons = buildRecommendationReasons(
        consultation,
        record,
        phrases,
        disagreementReasonPhrases,
        baseDate,
      );
      const reasonLabels = reasons.map((reason) => reason.label);
      let score = 0;

      if (consultation.result === "declined" && consultation.consultationAmount >= highValueDeclineThreshold) {
        score += 35;
      }

      if (consultation.result === "declined" && !hasRecallData(record)) {
        score += 25;
      }

      if (/(비용|기간|상의|고민|타치과)/.test(consultation.disagreementReason ?? "")) {
        score += 15;
      }

      if (isGoldenTimeRecallTarget(consultation, record, baseDate)) {
        score += 15;
      }

      if (isPartialRecontactTarget(consultation)) {
        score += 20;
      }

      if (consultation.result === "cancelled") {
        score += 20;
      }

      if (latestRound?.result === "예약") {
        score -= 20;
      }

      if (record?.final) {
        score -= 30;
      }

      if (score <= 0) {
        return null;
      }

      const statusLabel = getOpportunityStatusLabel(consultation, record);
      const uniqueReasonLabels = [...new Set([statusLabel, ...reasonLabels])].filter(Boolean);

      return {
        consultation,
        score,
        statusLabel,
        reasonLabels: uniqueReasonLabels,
        recommendationMessage: reasons[0]?.message ?? getOpportunityFallbackMessage(consultation, statusLabel),
        potentialAmount: getOpportunityPotentialAmount(consultation),
        ageInDays,
      };
    })
    .filter((row): row is OpportunityRadarRow => Boolean(row))
    .toSorted((first, second) => {
      if (first.score !== second.score) {
        return second.score - first.score;
      }

      if (first.potentialAmount !== second.potentialAmount) {
        return second.potentialAmount - first.potentialAmount;
      }

      return second.consultation.date.localeCompare(first.consultation.date);
    });
}

export function buildLossAnalysisRows(
  consultations: Consultation[],
  getName: (consultation: Consultation) => string,
  fixedNames: string[] = [],
) {
  const rows = new Map<string, LossAnalysisRow>(
    fixedNames.map((name) => [
      name,
      {
        name,
        consultations: 0,
        agreements: 0,
        consultationAmount: 0,
        agreedAmount: 0,
        lossAmount: 0,
        declined: 0,
      },
    ]),
  );

  consultations.forEach((consultation) => {
    const name = getName(consultation).trim() || "-";
    const row = rows.get(name) ?? {
      name,
      consultations: 0,
      agreements: 0,
      consultationAmount: 0,
      agreedAmount: 0,
      lossAmount: 0,
      declined: 0,
    };

    row.consultations += 1;
    row.agreements += isAgreement(consultation) ? 1 : 0;
    row.consultationAmount += consultation.consultationAmount;
    row.agreedAmount += consultation.agreedAmount;

    if (consultation.result === "declined") {
      row.declined += 1;
      row.lossAmount += consultation.consultationAmount;
    }

    rows.set(name, row);
  });

  const order = new Map(fixedNames.map((name, index) => [name, index]));

  return [...rows.values()].toSorted((first, second) => {
    const firstOrder = order.get(first.name);
    const secondOrder = order.get(second.name);

    if (firstOrder !== undefined || secondOrder !== undefined) {
      return (firstOrder ?? Number.MAX_SAFE_INTEGER) - (secondOrder ?? Number.MAX_SAFE_INTEGER);
    }

    return second.lossAmount - first.lossAmount;
  });
}

export function findLowConsentSegment(stats: SegmentStat[]) {
  const stableStats = stats.filter((stat) => stat.consultations >= 2);
  const eligibleStats = stableStats.length > 0 ? stableStats : stats.filter((stat) => stat.consultations > 0);

  return eligibleStats.toSorted((first, second) => {
    const rateGap =
      consentRate(first.agreements, first.consultations) - consentRate(second.agreements, second.consultations);

    if (rateGap !== 0) {
      return rateGap;
    }

    return second.consultations - first.consultations;
  })[0];
}
