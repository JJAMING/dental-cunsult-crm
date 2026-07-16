"use client";

import { ClipboardList, Filter, Save, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useAdminSettings } from "@/hooks/use-admin-settings";
import { useConsultations } from "@/hooks/use-consultations";
import {
  type RecallOxValue,
  type RecallRecord,
  type RecallRecordKey,
  type RecallResultValue,
  type RecallRoundKey,
  useRecallRecords,
} from "@/hooks/use-recall-records";
import {
  buildOpportunityRadarRows,
  buildRecommendationReasons,
  isGoldenTimeRecallTarget,
  isPartialRecontactTarget,
} from "@/lib/consultation-recommendations";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { Consultation } from "@/types/domain";

type RecallDialogTarget = {
  consultation: Consultation;
  round: RecallRecordKey;
};

type ViewMode = "year" | "month" | "week" | "day";
export type RecallListMode = "declined" | "opportunity" | "goldenTime" | "partialRecontact";

type RecallEntryDialogProps = {
  target: RecallDialogTarget;
  record?: RecallRecord;
  onClose: () => void;
  onSaveRound: (
    consultationId: number,
    round: RecallRoundKey,
    input: {
      recallDate: string;
      sameDayMessageSent?: RecallOxValue;
      executed: RecallOxValue;
      result: RecallResultValue;
      noReservationReason: string;
    },
  ) => void | Promise<void>;
  onSaveFinal: (
    consultationId: number,
    input: {
      finalMessageSent: RecallOxValue;
    },
  ) => void | Promise<void>;
  onDeleteRound: (consultationId: number, round: RecallRoundKey) => void | Promise<void>;
  onDeleteFinal: (consultationId: number) => void | Promise<void>;
};

type RecallsWorkspaceProps = {
  initialTab?: RecallListMode;
};

const inputClass =
  "h-11 w-full rounded-md border border-pebble bg-white px-3 text-sm font-bold text-ink outline-none transition focus:border-monday-violet";
const textareaClass =
  "min-h-28 w-full resize-y rounded-md border border-pebble bg-white px-3 py-3 text-sm font-bold text-ink outline-none transition focus:border-monday-violet";
const filterInputClass =
  "h-10 shrink-0 rounded-md border border-pebble bg-white px-3 text-sm font-bold text-slate outline-none transition focus:border-monday-violet";

const roundLabels: Record<RecallRecordKey, string> = {
  round1: "1차",
  round2: "2차",
  round3: "3차",
  final: "종결",
};

const recallResultOptions: Exclude<RecallResultValue, "">[] = [
  "미예약",
  "부재",
  "예약",
  "추가 리콜 필요",
];

const recallActionItems: { round: RecallRecordKey; title: string }[] = [
  {
    round: "round1",
    title: "1차",
  },
  {
    round: "round2",
    title: "2차",
  },
  {
    round: "round3",
    title: "3차",
  },
  {
    round: "final",
    title: "종결",
  },
];

const recallListTabs: { value: RecallListMode; label: string; description: string }[] = [
  { value: "declined", label: "비동의 리콜", description: "상담결과 비동의" },
  { value: "opportunity", label: "상담 레이더", description: "우선 연락 후보 자동 추천" },
  { value: "goldenTime", label: "골든타임 추천", description: "상담 후 7일 이내 우선 연락" },
  { value: "partialRecontact", label: "부분동의 재컨택", description: "잔여치료 후속관리" },
];

function getInitialPeriod() {
  const today = new Date();
  const date = getDateInputValue(today);

  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    date,
  };
}

function getDateParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return { year, month, day };
}

function getDateInputValue(date: Date) {
  const timezoneOffset = date.getTimezoneOffset() * 60000;

  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function formatDateLabel(date: string) {
  const { year, month, day } = getDateParts(date);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return date;
  }

  return `${year}년 ${month}월 ${day}일`;
}

function getWeekOptions(year: number, month: number) {
  const lastDay = new Date(year, month, 0).getDate();
  const weekCount = Math.ceil(lastDay / 7);

  return Array.from({ length: weekCount }, (_, index) => {
    const startDay = index * 7 + 1;
    const endDay = Math.min(startDay + 6, lastDay);

    return {
      value: index + 1,
      label: `${index + 1}주차`,
      startDay,
      endDay,
    };
  });
}

function isRoundKey(value: RecallRecordKey): value is RecallRoundKey {
  return value !== "final";
}

function getTodayInputValue() {
  return getDateInputValue(new Date());
}

function getRoundDateLabel(round: RecallRoundKey) {
  if (round === "round1") {
    return "첫 리콜 예정일";
  }

  return `${roundLabels[round]} 리콜날짜`;
}

function getRecallStatus(record?: RecallRecord) {
  if (record?.final) {
    return "종결";
  }

  if (record?.round3) {
    return `3차 ${record.round3.result || "입력"}`;
  }

  if (record?.round2) {
    return `2차 ${record.round2.result || "입력"}`;
  }

  if (record?.round1) {
    return `1차 ${record.round1.result || "입력"}`;
  }

  return "대상";
}

function getStatusClass(status: string) {
  if (status === "종결") {
    return "bg-periwinkle text-monday-violet";
  }

  if (status.includes("미예약")) {
    return "bg-[#ffe9ce] text-[#a85b15]";
  }

  if (status.includes("예약")) {
    return "bg-mint text-forest";
  }

  if (status.includes("부재")) {
    return "bg-[#ffdbe3] text-[#ad1f3d]";
  }

  if (status !== "대상") {
    return "bg-sky text-ink";
  }

  return "bg-cloud text-slate";
}

function formatRoundSummary(record?: RecallRecord, round?: RecallRoundKey) {
  if (!round) {
    return "-";
  }

  const roundRecord = record?.[round];

  if (!roundRecord) {
    return "-";
  }

  if (round === "round1") {
    return (
      <div className="space-y-1">
        <p>{roundRecord.recallDate || "날짜 없음"} · {roundRecord.result || "결과 없음"}</p>
        <p className="text-xs font-bold text-slate">
          당일문자 {roundRecord.sameDayMessageSent || "-"} · 리콜시행 {roundRecord.executed || "-"}
        </p>
      </div>
    );
  }

  return `${roundRecord.recallDate || "날짜 없음"} · ${roundRecord.result || "결과 없음"}`;
}

function formatFinalSummary(record?: RecallRecord) {
  if (!record?.final) {
    return "-";
  }

  return `문자 ${record.final.finalMessageSent || "-"}`;
}

function isConsultationInPeriod(
  consultation: Consultation,
  viewMode: ViewMode,
  selectedYear: number,
  selectedMonth: number,
  startDay: number,
  endDay: number,
  selectedDate: string,
) {
  if (viewMode === "day") {
    return consultation.date === selectedDate;
  }

  const { year, month, day } = getDateParts(consultation.date);

  if (year !== selectedYear) {
    return false;
  }

  if (viewMode === "year") {
    return true;
  }

  if (month !== selectedMonth) {
    return false;
  }

  if (viewMode === "month") {
    return true;
  }

  return day >= startDay && day <= endDay;
}

function sortRecallConsultations(consultations: Consultation[]) {
  return consultations.toSorted((first, second) => {
    if (first.date !== second.date) {
      return second.date.localeCompare(first.date);
    }

    return second.id - first.id;
  });
}

function RecallEntryDialog({
  target,
  record,
  onClose,
  onSaveRound,
  onSaveFinal,
  onDeleteRound,
  onDeleteFinal,
}: RecallEntryDialogProps) {
  const { consultation, round } = target;
  const roundKey = isRoundKey(round) ? round : null;
  const roundRecord = roundKey ? record?.[roundKey] : undefined;
  const finalRecord = round === "final" ? record?.final : undefined;
  const [recallDate, setRecallDate] = useState(roundRecord?.recallDate ?? getTodayInputValue());
  const [sameDayMessageSent, setSameDayMessageSent] = useState<RecallOxValue>(
    roundRecord?.sameDayMessageSent || "X",
  );
  const [executed, setExecuted] = useState<RecallOxValue>(roundRecord?.executed || "X");
  const [result, setResult] = useState<RecallResultValue>(roundRecord?.result || "미예약");
  const [noReservationReason, setNoReservationReason] = useState(
    roundRecord?.noReservationReason ?? "",
  );
  const [finalMessageSent, setFinalMessageSent] = useState<RecallOxValue>(
    finalRecord?.finalMessageSent || "X",
  );
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const hasExistingRecord = roundKey ? Boolean(roundRecord) : Boolean(finalRecord);
  const deleteLabel = roundKey ? `${roundLabels[roundKey]} 리콜 기록` : "종결 기록";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (roundKey) {
      await onSaveRound(consultation.id, roundKey, {
        recallDate,
        sameDayMessageSent: roundKey === "round1" ? sameDayMessageSent : undefined,
        executed,
        result,
        noReservationReason,
      });
    } else {
      await onSaveFinal(consultation.id, {
        finalMessageSent,
      });
    }

    onClose();
  };

  const handleDelete = async () => {
    if (!hasExistingRecord) {
      return;
    }

    if (roundKey) {
      await onDeleteRound(consultation.id, roundKey);
    } else {
      await onDeleteFinal(consultation.id);
    }

    setIsDeleteConfirmOpen(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recall-entry-title"
    >
      <form
        onSubmit={handleSubmit}
        className="relative max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-[24px] border border-mist bg-white shadow-[rgba(33,35,52,0.24)_0_22px_70px]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-mist px-6 py-5">
          <div>
            <p className="text-sm font-bold text-monday-violet">리콜관리</p>
            <h2 id="recall-entry-title" className="mt-1 text-2xl font-light text-ink">
              {roundLabels[round]} 리콜 입력
            </h2>
            <p className="mt-2 text-sm text-slate">
              {consultation.patientName} · {consultation.chartNo} · {consultation.disagreementReason ?? "비동의"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-pebble text-slate transition hover:border-monday-violet hover:text-monday-violet"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="max-h-[calc(92vh-160px)] overflow-y-auto px-6 py-5">
          {roundKey ? (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-bold text-slate">
                <span>{getRoundDateLabel(roundKey)}</span>
                <input
                  type="date"
                  value={recallDate}
                  onChange={(event) => setRecallDate(event.target.value)}
                  className={inputClass}
                />
              </label>
              {roundKey === "round1" ? (
                <label className="space-y-2 text-sm font-bold text-slate">
                  <span>당일문자 발송여부</span>
                  <select
                    value={sameDayMessageSent}
                    onChange={(event) => setSameDayMessageSent(event.target.value as RecallOxValue)}
                    className={inputClass}
                  >
                    <option value="O">O</option>
                    <option value="X">X</option>
                  </select>
                </label>
              ) : null}
              <label className="space-y-2 text-sm font-bold text-slate">
                <span>{roundLabels[roundKey]} 리콜 시행여부</span>
                <select
                  value={executed}
                  onChange={(event) => setExecuted(event.target.value as RecallOxValue)}
                  className={inputClass}
                >
                  <option value="O">O</option>
                  <option value="X">X</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-bold text-slate">
                <span>리콜결과</span>
                <select
                  value={result}
                  onChange={(event) => setResult(event.target.value as RecallResultValue)}
                  className={inputClass}
                >
                  {recallResultOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm font-bold text-slate md:col-span-2">
                <span>미예약사유</span>
                <textarea
                  value={noReservationReason}
                  onChange={(event) => setNoReservationReason(event.target.value)}
                  placeholder="미예약 사유를 입력하세요"
                  className={textareaClass}
                />
              </label>
            </div>
          ) : (
            <label className="block space-y-2 text-sm font-bold text-slate">
              <span>관리종결 문자 발송 여부</span>
              <select
                value={finalMessageSent}
                onChange={(event) => setFinalMessageSent(event.target.value as RecallOxValue)}
                className={inputClass}
              >
                <option value="O">O</option>
                <option value="X">X</option>
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-mist px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {hasExistingRecord ? (
              <button
                type="button"
                onClick={() => setIsDeleteConfirmOpen(true)}
                className="inline-flex items-center gap-2 rounded-md border border-[#f4b6c2] px-5 py-2 text-sm font-bold text-[#ad1f3d] transition hover:bg-[#fff1f4]"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                삭제
              </button>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-pebble px-5 py-2 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet"
            >
              취소
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-md bg-monday-violet px-5 py-2 text-sm font-bold text-white transition hover:brightness-95"
            >
              <Save className="h-4 w-4" aria-hidden />
              저장
            </button>
          </div>
        </div>

        {isDeleteConfirmOpen ? (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-ink/35 p-4 backdrop-blur-sm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="recall-delete-confirm-title"
          >
            <div className="w-full max-w-md rounded-[20px] border border-mist bg-white p-5 shadow-[rgba(33,35,52,0.24)_0_22px_70px]">
              <h3 id="recall-delete-confirm-title" className="text-xl font-bold text-ink">
                {deleteLabel}을 삭제할까요?
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate">
                삭제하면 이 차수의 입력값만 지워지고, 다른 리콜 기록은 그대로 유지됩니다.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className="rounded-md border border-pebble px-4 py-2 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="rounded-md bg-[#ad1f3d] px-4 py-2 text-sm font-bold text-white transition hover:brightness-95"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}

export function RecallsWorkspace({ initialTab = "declined" }: RecallsWorkspaceProps) {
  const { activeClinic } = useAdminSettings();
  const { consultations } = useConsultations({ clinicId: activeClinic.id });
  const {
    recordsByConsultationId,
    updateRecallRound,
    updateRecallFinal,
    deleteRecallRound,
    deleteRecallFinal,
  } = useRecallRecords();
  const initialPeriod = useMemo(() => getInitialPeriod(), []);
  const [selectedYear, setSelectedYear] = useState(initialPeriod.year);
  const [selectedMonth, setSelectedMonth] = useState(initialPeriod.month);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedDate, setSelectedDate] = useState(initialPeriod.date);
  const [recallListMode, setRecallListMode] = useState<RecallListMode>(initialTab);
  const [dialogTarget, setDialogTarget] = useState<RecallDialogTarget | null>(null);
  const weekOptions = useMemo(
    () => getWeekOptions(selectedYear, selectedMonth),
    [selectedMonth, selectedYear],
  );
  const activeWeekValue = Math.min(selectedWeek, weekOptions.length);
  const activeWeek = weekOptions.find((week) => week.value === activeWeekValue) ?? weekOptions[0];
  const yearOptions = useMemo(() => {
    const years = consultations
      .map((consultation) => getDateParts(consultation.date).year)
      .filter((year) => Number.isFinite(year));

    return [...new Set([initialPeriod.year, ...years])].toSorted((first, second) => second - first);
  }, [consultations, initialPeriod.year]);
  const periodConsultations = useMemo(
    () =>
      consultations
        .filter((consultation) =>
          isConsultationInPeriod(
            consultation,
            viewMode,
            selectedYear,
            selectedMonth,
            activeWeek.startDay,
            activeWeek.endDay,
            selectedDate,
          ),
        ),
    [activeWeek.endDay, activeWeek.startDay, consultations, selectedDate, selectedMonth, selectedYear, viewMode],
  );
  const declinedConsultations = useMemo(
    () => sortRecallConsultations(periodConsultations.filter((consultation) => consultation.result === "declined")),
    [periodConsultations],
  );
  const goldenTimeConsultations = useMemo(
    () =>
      sortRecallConsultations(
        periodConsultations.filter((consultation) =>
          isGoldenTimeRecallTarget(consultation, recordsByConsultationId.get(consultation.id)),
        ),
      ),
    [periodConsultations, recordsByConsultationId],
  );
  const partialRecontactConsultations = useMemo(
    () => sortRecallConsultations(periodConsultations.filter(isPartialRecontactTarget)),
    [periodConsultations],
  );
  const opportunityRadarRows = useMemo(
    () =>
      buildOpportunityRadarRows(
        periodConsultations,
        recordsByConsultationId,
        activeClinic.recommendationPhrases,
        activeClinic.disagreementReasonRecommendationPhrases,
      ),
    [
      activeClinic.disagreementReasonRecommendationPhrases,
      activeClinic.recommendationPhrases,
      periodConsultations,
      recordsByConsultationId,
    ],
  );
  const opportunityRowsByConsultationId = useMemo(
    () => new Map(opportunityRadarRows.map((row) => [row.consultation.id, row])),
    [opportunityRadarRows],
  );
  const opportunityConsultations = useMemo(
    () => opportunityRadarRows.map((row) => row.consultation),
    [opportunityRadarRows],
  );
  const activeConsultations = recallListMode === "declined"
    ? declinedConsultations
    : recallListMode === "opportunity"
      ? opportunityConsultations
      : recallListMode === "goldenTime"
        ? goldenTimeConsultations
        : partialRecontactConsultations;
  const activeTab = recallListTabs.find((tab) => tab.value === recallListMode) ?? recallListTabs[0];
  const periodLabel = viewMode === "year"
    ? `${selectedYear}년`
    : viewMode === "month"
      ? `${selectedYear}년 ${selectedMonth}월`
      : viewMode === "week"
        ? `${selectedYear}년 ${selectedMonth}월 ${activeWeek.label}`
        : formatDateLabel(selectedDate);
  const recallCounts = useMemo(() => {
    return activeConsultations.reduce(
      (counts, consultation) => {
        const record = recordsByConsultationId.get(consultation.id);

        counts.total += 1;
        counts.round1 += record?.round1 ? 1 : 0;
        counts.round2 += record?.round2 ? 1 : 0;
        counts.round3 += record?.round3 ? 1 : 0;
        counts.final += record?.final ? 1 : 0;

        return counts;
      },
      { total: 0, round1: 0, round2: 0, round3: 0, final: 0 },
    );
  }, [activeConsultations, recordsByConsultationId]);

  const openRecallDialog = (consultation: Consultation, round: RecallRecordKey) => {
    setDialogTarget({ consultation, round });
  };

  const handleDateChange = (date: string) => {
    const { year, month, day } = getDateParts(date);

    setSelectedDate(date);

    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      setSelectedYear(year);
      setSelectedMonth(month);
      setSelectedWeek(Math.ceil(day / 7));
    }
  };

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-monday-violet">리콜관리</p>
          <h1 className="mt-1 text-3xl font-light text-ink">비동의 환자 후속관리</h1>
          <p className="mt-1 text-sm text-slate">
            상담일지에서 비동의로 등록된 환자만 리콜 대상으로 관리합니다.
          </p>
        </div>
        <div className="inline-flex w-fit max-w-full flex-wrap items-center gap-2 rounded-[24px] border border-mist bg-white p-3">
          <span className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-pebble bg-white px-3 text-sm font-bold text-slate">
            <Filter className="h-4 w-4" aria-hidden />
            기간
          </span>
          <select
            aria-label="보기 단위 선택"
            value={viewMode}
            onChange={(event) => {
              setViewMode(event.target.value as ViewMode);
              setSelectedWeek(1);
            }}
            className={`${filterInputClass} min-w-28`}
          >
            <option value="year">연도별</option>
            <option value="month">월별</option>
            <option value="week">주별</option>
            <option value="day">일별</option>
          </select>
          {viewMode === "day" ? (
            <input
              type="date"
              aria-label="날짜 선택"
              value={selectedDate}
              onChange={(event) => handleDateChange(event.target.value)}
              className={`${filterInputClass} min-w-40`}
            />
          ) : (
            <select
              aria-label="연도 선택"
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              className={`${filterInputClass} min-w-28`}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </select>
          )}
          {viewMode !== "year" && viewMode !== "day" ? (
            <select
              aria-label="월 선택"
              value={selectedMonth}
              onChange={(event) => {
                setSelectedMonth(Number(event.target.value));
                setSelectedWeek(1);
              }}
              className={`${filterInputClass} min-w-24`}
            >
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <option key={month} value={month}>
                  {month}월
                </option>
              ))}
            </select>
          ) : null}
          {viewMode === "week" ? (
            <select
              aria-label="주차 선택"
              value={activeWeek.value}
              onChange={(event) => setSelectedWeek(Number(event.target.value))}
              className={`${filterInputClass} min-w-24`}
            >
              {weekOptions.map((week) => (
                <option key={week.value} value={week.value}>
                  {week.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          [activeTab.label, recallCounts.total, activeTab.description, "bg-periwinkle text-monday-violet"],
          ["1차 입력", recallCounts.round1, "첫 리콜 진행", "bg-lavender text-ink"],
          ["2차 입력", recallCounts.round2, "후속 리콜 진행", "bg-aqua text-forest"],
          ["3차 입력", recallCounts.round3, "장기 고민 고객", "bg-sky text-ink"],
          ["종결 입력", recallCounts.final, "관리종결 기록", "bg-cloud text-slate"],
        ].map(([title, value, helper, tone]) => (
          <section key={title} className="crm-card overflow-hidden">
            <div className={`px-4 py-3 text-sm font-bold ${tone}`}>{title}</div>
            <div className="px-4 py-4">
              <p className="metric-number text-3xl font-bold text-ink">{formatNumber(Number(value))}</p>
              <p className="mt-2 text-sm text-slate">{helper}</p>
            </div>
          </section>
        ))}
      </section>

      <section className="flex w-fit max-w-full flex-wrap gap-2 rounded-[24px] border border-mist bg-white p-2">
        {recallListTabs.map((tab) => {
          const count = tab.value === "declined"
            ? declinedConsultations.length
            : tab.value === "opportunity"
              ? opportunityRadarRows.length
              : tab.value === "goldenTime"
                ? goldenTimeConsultations.length
                : partialRecontactConsultations.length;

          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setRecallListMode(tab.value)}
              className={[
                "rounded-full px-4 py-2 text-sm font-bold transition",
                recallListMode === tab.value
                  ? "bg-monday-violet text-white shadow-[rgba(97,97,255,0.18)_0_8px_18px]"
                  : "text-slate hover:bg-cloud hover:text-ink",
              ].join(" ")}
            >
              {tab.label}
              <span className="metric-number ml-2 opacity-80">{formatNumber(count)}</span>
            </button>
          );
        })}
      </section>

      <section>
        <section className="crm-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-mist px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-ink">리콜 대상 목록</h2>
              <p className="mt-1 text-sm text-slate">
                {periodLabel} 기준 {formatNumber(activeConsultations.length)}명의 {activeTab.label} 대상이 표시됩니다.
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-cloud px-3 py-2 text-sm font-bold text-slate">
              <ClipboardList className="h-4 w-4" aria-hidden />
              {activeTab.description}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>상태</th>
                  <th>연번</th>
                  <th>날짜</th>
                  <th>성함</th>
                  <th>차트번호</th>
                  <th>상담사</th>
                  <th>Dr.</th>
                  <th>진료분류</th>
                  <th>비동의사유</th>
                  <th>상담금액</th>
                  <th>추천 사유</th>
                  <th>1차</th>
                  <th>2차</th>
                  <th>3차</th>
                  <th>종결</th>
                  <th>리콜 입력</th>
                </tr>
              </thead>
              <tbody>
                {activeConsultations.map((consultation) => {
                  const record = recordsByConsultationId.get(consultation.id);
                  const opportunityRow = opportunityRowsByConsultationId.get(consultation.id);
                  const status =
                    recallListMode === "opportunity" && opportunityRow
                      ? opportunityRow.statusLabel
                      : getRecallStatus(record);
                  const reasons = buildRecommendationReasons(
                    consultation,
                    record,
                    activeClinic.recommendationPhrases,
                    activeClinic.disagreementReasonRecommendationPhrases,
                  );
                  const reasonLabels = opportunityRow?.reasonLabels ?? reasons.map((reason) => reason.label);
                  const recommendationMessage = opportunityRow?.recommendationMessage ?? reasons[0]?.message;

                  return (
                    <tr
                      key={consultation.id}
                      className={consultation.result === "declined" ? "is-attention" : undefined}
                    >
                      <td>
                        <span className={`rounded-md px-2.5 py-1 text-xs font-bold ${getStatusClass(status)}`}>
                          {status}
                        </span>
                      </td>
                      <td className="metric-number font-bold">{consultation.id}</td>
                      <td>{consultation.date}</td>
                      <td className="font-bold">{consultation.patientName}</td>
                      <td className="metric-number">{consultation.chartNo}</td>
                      <td>{consultation.counselor}</td>
                      <td>{consultation.doctor}</td>
                      <td>{consultation.treatmentCategory}</td>
                      <td>{consultation.disagreementReason ?? "-"}</td>
                      <td className="metric-number font-bold">{formatCurrency(consultation.consultationAmount)}</td>
                      <td className="min-w-64">
                        {reasonLabels.length > 0 ? (
                          <div className="space-y-1 text-left">
                            <div className="flex flex-wrap gap-1">
                              {opportunityRow ? (
                                <span className="rounded-full bg-monday-violet px-2 py-1 text-xs font-bold text-white">
                                  {formatNumber(opportunityRow.score)}점
                                </span>
                              ) : null}
                              {reasonLabels.slice(0, 3).map((label) => (
                                <span
                                  key={label}
                                  className="rounded-full bg-periwinkle px-2 py-1 text-xs font-bold text-monday-violet"
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                            <p className="truncate text-xs font-bold text-slate">{recommendationMessage}</p>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{formatRoundSummary(record, "round1")}</td>
                      <td>{formatRoundSummary(record, "round2")}</td>
                      <td>{formatRoundSummary(record, "round3")}</td>
                      <td>{formatFinalSummary(record)}</td>
                      <td>
                        <div className="flex gap-1.5">
                          {recallActionItems.map((item) => (
                            <button
                              key={item.round}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openRecallDialog(consultation, item.round);
                              }}
                              className="rounded-md border border-pebble bg-white px-2.5 py-1.5 text-xs font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet"
                            >
                              {item.title}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {activeConsultations.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="py-12 text-center text-sm font-bold text-slate">
                      조건에 맞는 {activeTab.label} 대상이 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      {dialogTarget ? (
        <RecallEntryDialog
          key={`${dialogTarget.consultation.id}-${dialogTarget.round}`}
          target={dialogTarget}
          record={recordsByConsultationId.get(dialogTarget.consultation.id)}
          onClose={() => setDialogTarget(null)}
          onSaveRound={updateRecallRound}
          onSaveFinal={updateRecallFinal}
          onDeleteRound={deleteRecallRound}
          onDeleteFinal={deleteRecallFinal}
        />
      ) : null}
    </div>
  );
}
