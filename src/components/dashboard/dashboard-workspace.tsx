"use client";

import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  PhoneCall,
  Target,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MonthlyConsentChart } from "@/components/reports/monthly-consent-chart";
import { StatusPill } from "@/components/ui/status-pill";
import { useAdminSettings } from "@/hooks/use-admin-settings";
import { useConsultations } from "@/hooks/use-consultations";
import { useRecallRecords } from "@/hooks/use-recall-records";
import type { RecallRecord } from "@/hooks/use-recall-records";
import { getDashboardGoalForMonth } from "@/lib/admin-settings";
import {
  buildOpportunityRadarRows,
  findLowConsentSegment,
  hasRecallData,
  highValueDeclineThreshold,
  isAgreement,
  isRecallPriorityTarget,
  type OpportunityRadarRow,
} from "@/lib/consultation-recommendations";
import { consentRate, formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { Consultation, MonthlyStat, SegmentStat } from "@/types/domain";

type ViewMode = "year" | "month" | "week";
type FocusTone = "violet" | "mint" | "sky" | "apricot";

type DashboardMetrics = {
  consultations: number;
  agreements: number;
  declined: number;
  cancelled: number;
  partialAgreements: number;
  highValueDeclines: number;
  newConsultations: number;
  newAgreements: number;
  returningConsultations: number;
  returningAgreements: number;
  consultationAmount: number;
  agreedAmount: number;
  newAgreedAmount: number;
  returningAgreedAmount: number;
};

type ImprovementOpportunity = {
  label: string;
  value: string;
  detail: string;
};

const filterInputClass =
  "h-10 shrink-0 rounded-md border border-pebble bg-white px-3 text-sm font-bold text-slate outline-none transition focus:border-monday-violet";

const periodSelectClass = `${filterInputClass} min-w-28`;

const dailyDashboardMessages = [
  "좋은 상담은 꼼꼼한 기록에서 다시 힘을 얻습니다.",
  "오늘의 작은 확인이 내일의 동의를 만듭니다.",
  "환자의 망설임을 기록하면 다음 설득이 선명해집니다.",
  "놓친 상담도 다시 살피면 새로운 기회가 됩니다.",
  "상담의 온도는 한 번 더 챙기는 연락에서 올라갑니다.",
  "숫자는 방향을 알려주고, 기록은 다음 행동을 정해줍니다.",
  "잘 남긴 한 줄이 다음 상담의 자신감이 됩니다.",
];

const focusToneClasses: Record<
  FocusTone,
  { panel: string; icon: string; value: string; chip: string }
> = {
  violet: {
    panel: "border-monday-violet/20 bg-periwinkle",
    icon: "bg-monday-violet text-white",
    value: "text-monday-violet",
    chip: "bg-white text-monday-violet",
  },
  mint: {
    panel: "border-mint bg-[#f1ffe8]",
    icon: "bg-mint text-forest",
    value: "text-forest",
    chip: "bg-white text-forest",
  },
  sky: {
    panel: "border-sky bg-aqua",
    icon: "bg-sky text-ink",
    value: "text-ink",
    chip: "bg-white text-ink",
  },
  apricot: {
    panel: "border-apricot/30 bg-[#fff2e9]",
    icon: "bg-apricot text-white",
    value: "text-[#b94b10]",
    chip: "bg-white text-[#b94b10]",
  },
};

function getInitialPeriod() {
  const today = new Date();

  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  };
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDailyDashboardMessage(date: string) {
  const dateKey = Number(date.replaceAll("-", ""));
  const messageIndex = Number.isFinite(dateKey) ? dateKey % dailyDashboardMessages.length : 0;

  return dailyDashboardMessages[messageIndex];
}

function getDateParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return { year, month, day };
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

function isPartialAgreement(consultation: Consultation) {
  return isAgreement(consultation) && consultation.consultedTeeth !== consultation.agreedTeeth;
}

function safeRate(numerator: number, denominator: number) {
  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

function formatKpiRate(value: number) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function filterConsultationsByPeriod(
  consultations: Consultation[],
  viewMode: ViewMode,
  selectedYear: number,
  selectedMonth: number,
  startDay: number,
  endDay: number,
) {
  return consultations.filter((consultation) => {
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
  });
}

function filterConsultationsByMonth(
  consultations: Consultation[],
  selectedYear: number,
  selectedMonth: number,
) {
  return consultations.filter((consultation) => {
    const { year, month } = getDateParts(consultation.date);

    return year === selectedYear && month === selectedMonth;
  });
}

function calculateMetrics(consultations: Consultation[]): DashboardMetrics {
  return consultations.reduce(
    (metrics, consultation) => {
      const agreement = isAgreement(consultation);
      const isNewPatient = consultation.patientType === "new";

      metrics.consultations += 1;
      metrics.agreements += agreement ? 1 : 0;
      metrics.declined += consultation.result === "declined" ? 1 : 0;
      metrics.cancelled += consultation.result === "cancelled" ? 1 : 0;
      metrics.partialAgreements += isPartialAgreement(consultation) ? 1 : 0;
      metrics.highValueDeclines +=
        consultation.result === "declined" &&
        consultation.consultationAmount >= highValueDeclineThreshold
          ? 1
          : 0;
      metrics.consultationAmount += consultation.consultationAmount;
      metrics.agreedAmount += consultation.agreedAmount;

      if (isNewPatient) {
        metrics.newConsultations += 1;
        metrics.newAgreements += agreement ? 1 : 0;
        metrics.newAgreedAmount += consultation.agreedAmount;
      } else {
        metrics.returningConsultations += 1;
        metrics.returningAgreements += agreement ? 1 : 0;
        metrics.returningAgreedAmount += consultation.agreedAmount;
      }

      return metrics;
    },
    {
      consultations: 0,
      agreements: 0,
      declined: 0,
      cancelled: 0,
      partialAgreements: 0,
      highValueDeclines: 0,
      newConsultations: 0,
      newAgreements: 0,
      returningConsultations: 0,
      returningAgreements: 0,
      consultationAmount: 0,
      agreedAmount: 0,
      newAgreedAmount: 0,
      returningAgreedAmount: 0,
    },
  );
}

function buildSegmentStats(
  consultations: Consultation[],
  getName: (consultation: Consultation) => string,
) {
  const stats = new Map<string, SegmentStat>();

  consultations.forEach((consultation) => {
    const name = getName(consultation) || "-";
    const current = stats.get(name) ?? {
      name,
      consultations: 0,
      agreements: 0,
      consultationAmount: 0,
      agreedAmount: 0,
    };

    stats.set(name, {
      ...current,
      consultations: current.consultations + 1,
      agreements: current.agreements + (isAgreement(consultation) ? 1 : 0),
      consultationAmount: current.consultationAmount + consultation.consultationAmount,
      agreedAmount: current.agreedAmount + consultation.agreedAmount,
    });
  });

  return [...stats.values()].toSorted((first, second) => {
    if (second.agreedAmount !== first.agreedAmount) {
      return second.agreedAmount - first.agreedAmount;
    }

    return second.consultations - first.consultations;
  });
}

function createEmptyStat(label: string): MonthlyStat {
  return {
    month: label,
    consultations: 0,
    agreements: 0,
    cancellations: 0,
    sameDay: 0,
    followUp: 0,
  };
}

function addToTrendStat(stat: MonthlyStat, consultation: Consultation) {
  stat.consultations += 1;
  stat.agreements += isAgreement(consultation) ? 1 : 0;
  stat.cancellations += consultation.result === "cancelled" ? 1 : 0;
  stat.sameDay += consultation.result === "same_day" ? 1 : 0;
  stat.followUp += consultation.result === "follow_up" ? 1 : 0;
}

function buildTrendStats(
  consultations: Consultation[],
  viewMode: ViewMode,
  selectedYear: number,
  selectedMonth: number,
  startDay: number,
  endDay: number,
) {
  if (viewMode === "year") {
    const stats = Array.from({ length: 12 }, (_, index) => createEmptyStat(`${index + 1}월`));

    consultations.forEach((consultation) => {
      const { year, month } = getDateParts(consultation.date);

      if (year === selectedYear) {
        addToTrendStat(stats[month - 1], consultation);
      }
    });

    return stats;
  }

  if (viewMode === "month") {
    const weekOptions = getWeekOptions(selectedYear, selectedMonth);
    const stats = weekOptions.map((week) => createEmptyStat(`${week.value}주차`));

    consultations.forEach((consultation) => {
      const { year, month, day } = getDateParts(consultation.date);

      if (year !== selectedYear || month !== selectedMonth) {
        return;
      }

      const week = weekOptions.find((option) => day >= option.startDay && day <= option.endDay);

      if (week) {
        addToTrendStat(stats[week.value - 1], consultation);
      }
    });

    return stats;
  }

  const stats = Array.from({ length: endDay - startDay + 1 }, (_, index) =>
    createEmptyStat(`${startDay + index}일`),
  );

  consultations.forEach((consultation) => {
    const { year, month, day } = getDateParts(consultation.date);

    if (year === selectedYear && month === selectedMonth && day >= startDay && day <= endDay) {
      addToTrendStat(stats[day - startDay], consultation);
    }
  });

  return stats;
}

function hasRecallToday(record: RecallRecord | undefined, todayValue: string) {
  return [record?.round1, record?.round2, record?.round3].some(
    (round) => round?.recallDate === todayValue,
  );
}

function summarizeHighValueDeclines(consultations: Consultation[]) {
  return consultations.reduce(
    (summary, consultation) => {
      if (consultation.result === "declined" && consultation.consultationAmount >= highValueDeclineThreshold) {
        return {
          count: summary.count + 1,
          amount: summary.amount + consultation.consultationAmount,
        };
      }

      return summary;
    },
    { count: 0, amount: 0 },
  );
}

function FocusCard({
  title,
  value,
  caption,
  chip,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  caption: string;
  chip: string;
  icon: LucideIcon;
  tone: FocusTone;
}) {
  const toneClasses = focusToneClasses[tone];

  return (
    <section className={`rounded-[24px] border p-5 ${toneClasses.panel}`}>
      <div className="flex items-start justify-between gap-4">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${toneClasses.icon}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${toneClasses.chip}`}>{chip}</span>
      </div>
      <p className="mt-5 text-sm font-bold text-slate">{title}</p>
      <p className={`metric-number mt-2 text-3xl font-bold ${toneClasses.value}`}>{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate">{caption}</p>
    </section>
  );
}

function ProgressItem({
  title,
  value,
  goal,
  formattedValue,
  formattedGoal,
  tone,
}: {
  title: string;
  value: number;
  goal: number;
  formattedValue: string;
  formattedGoal: string;
  tone: "violet" | "apricot";
}) {
  const progress = goal > 0 ? Math.min(value / goal, 1) : 0;
  const percent = Math.round(progress * 100);
  const barClass = tone === "violet" ? "bg-monday-violet" : "bg-apricot";

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink">{title}</p>
          <p className="metric-number mt-1 text-2xl font-bold text-ink">{formattedValue}</p>
        </div>
        <p className="metric-number text-sm font-bold text-[#d01818]">{percent}%</p>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-cloud">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs font-bold text-slate">목표 {formattedGoal}</p>
    </div>
  );
}

function PatientMixPanel({
  newRate,
  returningRate,
  newAmount,
  returningAmount,
}: {
  newRate: number;
  returningRate: number;
  newAmount: number;
  returningAmount: number;
}) {
  const newPercent = Math.round(newRate * 100);
  const returningPercent = Math.round(returningRate * 100);

  return (
    <section className="crm-card p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-aqua text-forest">
          <Users className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h2 className="text-lg font-bold text-ink">신환·구환 비교</h2>
          <p className="mt-1 text-sm text-slate">동의율과 동의금액을 빠르게 비교합니다.</p>
        </div>
      </div>

      <div className="mt-7 space-y-7">
        {[
          ["신환", newPercent, newAmount, "bg-monday-violet"],
          ["구환", returningPercent, returningAmount, "bg-forest"],
        ].map(([label, percent, amount, barClass]) => (
          <div key={label as string}>
            <div className="flex items-end justify-between gap-3 font-bold">
              <span className="text-base text-ink">{label}</span>
              <span className="metric-number text-2xl text-[#d01818]">{percent}%</span>
            </div>
            <div className="mt-3 h-4 overflow-hidden rounded-full bg-cloud">
              <div className={`h-full rounded-full ${barClass}`} style={{ width: `${percent}%` }} />
            </div>
            <p className="metric-number mt-3 text-sm font-bold text-slate">
              동의금액 {formatCurrency(amount as number)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function OpportunityRadarPanel({
  rows,
  periodLabel,
}: {
  rows: OpportunityRadarRow[];
  periodLabel: string;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const topRows = rows.slice(0, 6);
  const pageCount = Math.max(topRows.length, 1);
  const activePageIndex = Math.min(pageIndex, pageCount - 1);
  const visibleRows = topRows.slice(activePageIndex, activePageIndex + 1);
  const canPage = topRows.length > 1;

  return (
    <section className="crm-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-periwinkle text-monday-violet">
            <Target className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-ink">상담 레이더</h2>
              <Link
                href="/recalls?tab=opportunity"
                className="inline-flex h-7 items-center justify-center rounded-full border border-pebble bg-white px-3 text-xs font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet"
              >
                전체 보기
              </Link>
            </div>
            <p className="mt-1 text-sm text-slate">{periodLabel} 기준 우선 연락 후보입니다.</p>
          </div>
        </div>
        {canPage ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="이전 상담 레이더"
              onClick={() => setPageIndex((current) => Math.max(current - 1, 0))}
              disabled={activePageIndex === 0}
              className="grid h-8 w-8 place-items-center rounded-full border border-pebble bg-white text-slate transition hover:border-monday-violet hover:text-monday-violet disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="다음 상담 레이더"
              onClick={() => setPageIndex((current) => Math.min(current + 1, pageCount - 1))}
              disabled={activePageIndex >= pageCount - 1}
              className="grid h-8 w-8 place-items-center rounded-full border border-pebble bg-white text-slate transition hover:border-monday-violet hover:text-monday-violet disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 space-y-3">
        {visibleRows.map((row, index) => (
          <div key={row.consultation.id} className="rounded-2xl border border-pebble bg-white px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-monday-violet px-3 py-1.5 text-sm font-bold text-white">
                    TOP {activePageIndex + index + 1}
                  </span>
                  <p className="text-lg font-bold text-ink">{row.consultation.patientName}</p>
                  <p className="metric-number text-sm font-bold text-slate">{row.consultation.chartNo}</p>
                </div>
                <p className="mt-3 text-base font-bold text-slate">
                  {row.consultation.treatmentCategory} · {row.statusLabel}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="metric-number text-xl font-bold text-[#d01818]">
                  {formatCurrency(row.potentialAmount)}
                </p>
                <p className="metric-number mt-1 text-sm font-bold text-slate">{formatNumber(row.score)}점</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {row.reasonLabels.slice(0, 3).map((label) => (
                <span key={label} className="rounded-full bg-periwinkle px-3 py-1.5 text-sm font-bold text-monday-violet">
                  {label}
                </span>
              ))}
            </div>
            <p className="mt-4 truncate text-sm font-bold text-slate">{row.recommendationMessage}</p>
          </div>
        ))}
        {topRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-pebble bg-cloud px-4 py-8 text-center">
            <p className="font-bold text-ink">우선 연락 대상이 없습니다.</p>
            <p className="mt-2 text-sm text-slate">선택 기간의 상담 데이터가 안정적입니다.</p>
          </div>
        ) : null}
      </div>

      {canPage ? (
        <div className="mt-4 flex justify-center gap-1.5">
          {Array.from({ length: pageCount }, (_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`상담 레이더 ${index + 1}번 후보`}
              onClick={() => setPageIndex(index)}
              className={`h-2 rounded-full transition ${
                activePageIndex === index ? "w-6 bg-monday-violet" : "w-2 bg-pebble"
              }`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function HighlightPanel({
  treatment,
  channel,
  counselor,
  opportunities,
}: {
  treatment?: SegmentStat;
  channel?: SegmentStat;
  counselor?: SegmentStat;
  opportunities: ImprovementOpportunity[];
}) {
  const highlights: Array<[string, SegmentStat | undefined]> = [
    ["진료분류", treatment],
    ["내원경로", channel],
    ["상담사", counselor],
  ];

  return (
    <section className="crm-card p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-periwinkle text-monday-violet">
          <TrendingUp className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h2 className="text-lg font-bold text-ink">성과 하이라이트</h2>
          <p className="mt-1 text-sm text-slate">선택 기간에서 가장 눈에 띄는 항목입니다.</p>
        </div>
      </div>

      <div className="mt-5 divide-y divide-pebble">
        {highlights.map(([label, stat]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div>
              <p className="text-xs font-bold text-slate">{label}</p>
              <p className="mt-1 font-bold text-ink">{stat?.name ?? "-"}</p>
            </div>
            <div className="text-right">
              <p className="metric-number text-sm font-bold text-[#d01818]">
                {stat ? formatPercent(consentRate(stat.agreements, stat.consultations)) : "-"}
              </p>
              <p className="metric-number mt-1 text-xs font-bold text-slate">
                {stat ? formatCurrency(stat.agreedAmount) : "-"}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-pebble pt-4">
        <p className="text-xs font-bold text-monday-violet">개선 기회</p>
        <div className="mt-2 space-y-2">
          {opportunities.map((item) => (
            <div key={item.label} className="grid grid-cols-[116px_minmax(0,1fr)] items-start gap-3 text-sm">
              <p className="font-bold text-slate">{item.label}</p>
              <div className="min-w-0 text-right">
                <p className="metric-number font-bold text-ink">{item.value}</p>
                <p className="mt-1 truncate text-xs font-bold text-slate">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DashboardWorkspace() {
  const { activeClinic } = useAdminSettings();
  const { consultations } = useConsultations({ clinicId: activeClinic.id });
  const { recordsByConsultationId } = useRecallRecords();
  const initialPeriod = useMemo(() => getInitialPeriod(), []);
  const todayValue = useMemo(() => toInputDate(new Date()), []);
  const [selectedYear, setSelectedYear] = useState(initialPeriod.year);
  const [selectedMonth, setSelectedMonth] = useState(initialPeriod.month);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedWeek, setSelectedWeek] = useState(1);
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
  const filteredConsultations = useMemo(
    () =>
      filterConsultationsByPeriod(
        consultations,
        viewMode,
        selectedYear,
        selectedMonth,
        activeWeek.startDay,
        activeWeek.endDay,
      ),
    [activeWeek.endDay, activeWeek.startDay, consultations, selectedMonth, selectedYear, viewMode],
  );
  const monthConsultations = useMemo(
    () => filterConsultationsByMonth(consultations, selectedYear, selectedMonth),
    [consultations, selectedMonth, selectedYear],
  );
  const todayConsultations = useMemo(
    () => consultations.filter((consultation) => consultation.date === todayValue),
    [consultations, todayValue],
  );
  const metrics = useMemo(() => calculateMetrics(filteredConsultations), [filteredConsultations]);
  const monthMetrics = useMemo(() => calculateMetrics(monthConsultations), [monthConsultations]);
  const todayMetrics = useMemo(() => calculateMetrics(todayConsultations), [todayConsultations]);
  const trendStats = useMemo(
    () =>
      buildTrendStats(
        consultations,
        viewMode,
        selectedYear,
        selectedMonth,
        activeWeek.startDay,
        activeWeek.endDay,
      ),
    [activeWeek.endDay, activeWeek.startDay, consultations, selectedMonth, selectedYear, viewMode],
  );
  const treatmentStats = useMemo(
    () => buildSegmentStats(filteredConsultations, (consultation) => consultation.treatmentCategory),
    [filteredConsultations],
  );
  const channelStats = useMemo(
    () => buildSegmentStats(filteredConsultations, (consultation) => consultation.visitChannel || "-"),
    [filteredConsultations],
  );
  const counselorStats = useMemo(
    () => buildSegmentStats(filteredConsultations, (consultation) => consultation.counselor),
    [filteredConsultations],
  );
  const recentConsultations = useMemo(
    () =>
      filteredConsultations
        .toSorted((first, second) => {
          if (first.date !== second.date) {
            return second.date.localeCompare(first.date);
          }

          return second.id - first.id;
        })
        .slice(0, 8),
    [filteredConsultations],
  );
  const recallTargets = useMemo(
    () => filteredConsultations.filter((consultation) => consultation.result === "declined"),
    [filteredConsultations],
  );
  const recallStats = useMemo(() => {
    const total = recallTargets.length;
    const unhandled = recallTargets.filter(
      (consultation) => !hasRecallData(recordsByConsultationId.get(consultation.id)),
    ).length;
    const scheduledToday = recallTargets.filter((consultation) =>
      hasRecallToday(recordsByConsultationId.get(consultation.id), todayValue),
    ).length;
    const closed = recallTargets.filter((consultation) =>
      Boolean(recordsByConsultationId.get(consultation.id)?.final),
    ).length;

    return {
      total,
      unhandled,
      scheduledToday,
      closed,
      inProgress: Math.max(total - unhandled - closed, 0),
    };
  }, [recallTargets, recordsByConsultationId, todayValue]);
  const recallPriorityTargets = useMemo(
    () =>
      recallTargets.filter((consultation) =>
        isRecallPriorityTarget(consultation, recordsByConsultationId.get(consultation.id)),
      ),
    [recallTargets, recordsByConsultationId],
  );
  const opportunityRadarRows = useMemo(
    () =>
      buildOpportunityRadarRows(
        filteredConsultations,
        recordsByConsultationId,
        activeClinic.recommendationPhrases,
        activeClinic.disagreementReasonRecommendationPhrases,
        new Date(`${todayValue}T00:00:00`),
      ),
    [
      activeClinic.disagreementReasonRecommendationPhrases,
      activeClinic.recommendationPhrases,
      filteredConsultations,
      recordsByConsultationId,
      todayValue,
    ],
  );
  const pendingRecallAmount = recallTargets.reduce(
    (sum, consultation) => sum + consultation.consultationAmount,
    0,
  );
  const highValueDeclineSummary = useMemo(
    () => summarizeHighValueDeclines(filteredConsultations),
    [filteredConsultations],
  );
  const lowConsentTreatment = useMemo(() => findLowConsentSegment(treatmentStats), [treatmentStats]);
  const improvementOpportunities = useMemo<ImprovementOpportunity[]>(
    () => [
      {
        label: "고액 미동의",
        value:
          highValueDeclineSummary.count > 0
            ? `${formatNumber(highValueDeclineSummary.count)}건 · ${formatCurrency(highValueDeclineSummary.amount)}`
            : "대상 없음",
        detail: `${formatCurrency(highValueDeclineThreshold)} 이상 비동의 상담`,
      },
      {
        label: "리콜 우선 대상",
        value:
          recallPriorityTargets.length > 0
            ? `${formatNumber(recallPriorityTargets.length)}명`
            : "대상 없음",
        detail: "미입력 또는 예약 전 상태",
      },
      {
        label: "동의율 낮은 항목",
        value: lowConsentTreatment
          ? `${lowConsentTreatment.name} ${formatPercent(
              consentRate(lowConsentTreatment.agreements, lowConsentTreatment.consultations),
            )}`
          : "대상 없음",
        detail: lowConsentTreatment
          ? `상담 ${formatNumber(lowConsentTreatment.consultations)}건 · 동의 ${formatNumber(
              lowConsentTreatment.agreements,
            )}건`
          : "상담 데이터 부족",
      },
    ],
    [highValueDeclineSummary, lowConsentTreatment, recallPriorityTargets.length],
  );
  const periodLabel =
    viewMode === "year"
      ? `${selectedYear}년`
      : viewMode === "month"
        ? `${selectedYear}년 ${selectedMonth}월`
        : `${selectedYear}년 ${selectedMonth}월 ${activeWeek.label}`;
  const trendTitle =
    viewMode === "year"
      ? "월별 상담·동의 흐름"
      : viewMode === "month"
        ? "주차별 상담·동의 흐름"
        : "일별 상담·동의 흐름";
  const selectedMonthLabel = `${selectedYear}년 ${selectedMonth}월`;
  const periodConsentRate = safeRate(metrics.agreements, metrics.consultations);
  const periodAmountRate = safeRate(metrics.agreedAmount, metrics.consultationAmount);
  const newConsentRate = safeRate(metrics.newAgreements, metrics.newConsultations);
  const returningConsentRate = safeRate(metrics.returningAgreements, metrics.returningConsultations);
  const monthlyGoal = getDashboardGoalForMonth(
    activeClinic.dashboardGoals,
    selectedYear,
    selectedMonth,
  );
  const monthlyConsultationGoal = monthlyGoal.monthlyConsultationGoal;
  const monthlyAgreedAmountGoal = monthlyGoal.monthlyAgreedAmountGoal;
  const dashboardClinicName = activeClinic.name.trim() || "선택된 치과";
  const dailyDashboardMessage = useMemo(
    () => getDailyDashboardMessage(todayValue),
    [todayValue],
  );
  const heroPriorityItems = [
    {
      label: "고액 미동의",
      value: `${formatNumber(highValueDeclineSummary.count)}건`,
      active: highValueDeclineSummary.count > 0,
    },
    {
      label: "리콜 우선 대상",
      value: `${formatNumber(recallPriorityTargets.length)}명`,
      active: recallPriorityTargets.length > 0,
    },
    {
      label: "부분동의 재컨택",
      value: `${formatNumber(metrics.partialAgreements)}건`,
      active: metrics.partialAgreements > 0,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] bg-snow shadow-card">
        <div className="grid gap-8 p-7 lg:grid-cols-[1.25fr_0.75fr] lg:p-9">
          <div>
            <p className="text-sm font-bold text-monday-violet">오늘의 상담실</p>
            <h1 className="mt-3 max-w-4xl text-5xl font-light leading-tight text-ink lg:text-6xl">
              {dashboardClinicName}
            </h1>
            <div className="mt-5 max-w-3xl rounded-2xl border border-monday-violet/10 border-l-4 border-l-monday-violet/60 bg-periwinkle/70 px-5 py-4">
              <p className="text-lg font-semibold leading-8 text-slate lg:text-xl">
                {dailyDashboardMessage}
              </p>
            </div>
            <div className="mt-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-ink">오늘의 우선 확인</span>
                <span className="rounded-full bg-periwinkle px-3 py-1 text-xs font-bold text-monday-violet">
                  선택 기간 기준
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                {heroPriorityItems.map((item) => (
                  <span
                    key={item.label}
                    className={`inline-flex min-h-12 items-center gap-3 rounded-full px-4 py-2 text-sm font-bold ring-1 ${
                      item.active
                        ? "bg-white text-ink ring-monday-violet/20"
                        : "bg-white/70 text-slate ring-mist"
                    }`}
                  >
                    <span>{item.label}</span>
                    <strong
                      className={
                        item.active
                          ? "metric-number text-lg text-monday-violet"
                          : "metric-number text-lg text-slate"
                      }
                    >
                      {item.value}
                    </strong>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:items-end lg:justify-between">
            <div className="flex w-full flex-col gap-3 lg:max-w-lg">
              <div className="w-full rounded-[28px] bg-monday-violet px-6 py-5 text-white">
                <p className="text-sm font-bold opacity-80">현재 성과</p>
                <p className="metric-number mt-2 text-3xl font-bold">{periodLabel}</p>
                <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/20 pt-4">
                  <div>
                    <p className="text-xs font-bold opacity-75">상담</p>
                    <p className="metric-number mt-1 text-xl font-bold">
                      {formatNumber(metrics.consultations)}건
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold opacity-75">동의</p>
                    <p className="metric-number mt-1 text-xl font-bold">
                      {formatNumber(metrics.agreements)}건
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold opacity-75">동의율</p>
                    <p className="metric-number mt-1 text-xl font-bold">
                      {formatKpiRate(periodConsentRate)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="inline-flex w-full max-w-full flex-nowrap items-center gap-2 overflow-x-auto rounded-[24px] border border-mist bg-white p-3">
                <span className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-pebble bg-white px-4 text-sm font-bold text-slate">
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
                  className={periodSelectClass}
                >
                  <option value="year">연도별</option>
                  <option value="month">월별</option>
                  <option value="week">주별</option>
                </select>
                <select
                  aria-label="연도 선택"
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(Number(event.target.value))}
                  className={periodSelectClass}
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}년
                    </option>
                  ))}
                </select>
                {viewMode !== "year" ? (
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
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FocusCard
          title="오늘 상담"
          value={`${formatNumber(todayMetrics.consultations)}건`}
          caption={`오늘 동의 ${formatNumber(todayMetrics.agreements)}건 · 동의율 ${formatKpiRate(
            safeRate(todayMetrics.agreements, todayMetrics.consultations),
          )}`}
          chip={todayValue}
          icon={CalendarClock}
          tone="violet"
        />
        <FocusCard
          title="선택 기간 동의율"
          value={formatKpiRate(periodConsentRate)}
          caption={`상담 ${formatNumber(metrics.consultations)}건 중 동의 ${formatNumber(metrics.agreements)}건`}
          chip={periodLabel}
          icon={CheckCircle2}
          tone="mint"
        />
        <FocusCard
          title="선택 기간 동의금액"
          value={formatCurrency(metrics.agreedAmount)}
          caption={`상담금액 대비 ${formatKpiRate(periodAmountRate)} · 총 상담금액 ${formatCurrency(
            metrics.consultationAmount,
          )}`}
          chip="수납 핵심"
          icon={WalletCards}
          tone="sky"
        />
        <FocusCard
          title="리콜 미처리"
          value={`${formatNumber(recallStats.unhandled)}명`}
          caption={`비동의 대상 ${formatNumber(recallStats.total)}명 · 예상 상담금액 ${formatCurrency(
            pendingRecallAmount,
          )}`}
          chip={`오늘 예정 ${formatNumber(recallStats.scheduledToday)}명`}
          icon={PhoneCall}
          tone="apricot"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr_0.9fr]">
        <section className="crm-card p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-periwinkle text-monday-violet">
              <Target className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">이번 달 목표 진행률</h2>
              <p className="mt-1 text-sm text-slate">{selectedMonthLabel} 운영 목표 기준입니다.</p>
            </div>
          </div>
          <div className="mt-6 space-y-6">
            <ProgressItem
              title="상담 목표"
              value={monthMetrics.consultations}
              goal={monthlyConsultationGoal}
              formattedValue={`${formatNumber(monthMetrics.consultations)}건`}
              formattedGoal={`${formatNumber(monthlyConsultationGoal)}건`}
              tone="violet"
            />
            <ProgressItem
              title="동의금액 목표"
              value={monthMetrics.agreedAmount}
              goal={monthlyAgreedAmountGoal}
              formattedValue={formatCurrency(monthMetrics.agreedAmount)}
              formattedGoal={formatCurrency(monthlyAgreedAmountGoal)}
              tone="apricot"
            />
          </div>
        </section>

        <PatientMixPanel
          newRate={newConsentRate}
          returningRate={returningConsentRate}
          newAmount={metrics.newAgreedAmount}
          returningAmount={metrics.returningAgreedAmount}
        />

        <OpportunityRadarPanel rows={opportunityRadarRows} periodLabel={periodLabel} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="crm-card p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-ink">{trendTitle}</h2>
              <p className="mt-1 text-sm text-slate">선택한 기간 단위에 맞춰 상담건수, 동의건수, 동의율을 봅니다.</p>
            </div>
            <span className="w-fit rounded-full bg-cloud px-3 py-1 text-sm font-bold text-slate">
              {periodLabel}
            </span>
          </div>
          <MonthlyConsentChart data={trendStats} />
        </section>

        <HighlightPanel
          treatment={treatmentStats[0]}
          channel={channelStats[0]}
          counselor={counselorStats[0]}
          opportunities={improvementOpportunities}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="crm-card overflow-hidden">
          <div className="border-b border-mist px-5 py-4">
            <h2 className="text-lg font-bold text-ink">리콜 액션</h2>
            <p className="mt-1 text-sm text-slate">비동의 상담 중 오늘 처리하거나 입력해야 할 항목입니다.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 p-5">
            {[
              ["비동의 대상", recallStats.total],
              ["오늘 리콜 예정", recallStats.scheduledToday],
              ["진행 중", recallStats.inProgress],
              ["종결", recallStats.closed],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-xl border border-pebble bg-cloud px-4 py-3">
                <p className="text-xs font-bold text-slate">{label}</p>
                <p className="metric-number mt-2 text-2xl font-bold text-ink">{formatNumber(value as number)}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-mist px-5 py-4">
            <p className="text-sm font-bold text-slate">
              미처리 리콜 {formatNumber(recallStats.unhandled)}명은 리콜관리에서 1차 입력부터 진행하시면 됩니다.
            </p>
          </div>
        </section>

        <section className="crm-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-mist px-5 py-4">
            <h2 className="text-lg font-bold text-ink">최근 상담일지</h2>
            <span className="rounded-full bg-mint px-3 py-1 text-xs font-bold text-forest">{periodLabel}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>연번</th>
                  <th>날짜</th>
                  <th>성함</th>
                  <th>구분</th>
                  <th>상담사</th>
                  <th>진료분류</th>
                  <th>Dr.</th>
                  <th>상담결과</th>
                  <th>상담금액</th>
                  <th>동의금액</th>
                </tr>
              </thead>
              <tbody>
                {recentConsultations.map((consultation) => (
                  <tr key={consultation.id} className={consultation.result === "declined" ? "is-attention" : ""}>
                    <td className="metric-number font-bold">{consultation.id}</td>
                    <td>{consultation.date}</td>
                    <td className="font-bold">{consultation.patientName}</td>
                    <td>{consultation.patientType === "new" ? "신환" : "구환"}</td>
                    <td>{consultation.counselor}</td>
                    <td>{consultation.treatmentCategory}</td>
                    <td>{consultation.doctor}</td>
                    <td>
                      <StatusPill result={consultation.result} />
                    </td>
                    <td className="metric-number font-bold">{formatCurrency(consultation.consultationAmount)}</td>
                    <td className="metric-number font-bold">{formatCurrency(consultation.agreedAmount)}</td>
                  </tr>
                ))}
                {recentConsultations.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-sm font-bold text-slate">
                      선택한 기간에 등록된 상담이 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </div>
  );
}
