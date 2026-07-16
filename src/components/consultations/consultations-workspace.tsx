"use client";

import { ChevronDown, Filter, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ConsultationFormDialog,
  type ConsultationFormInput,
} from "@/components/consultations/consultation-form-dialog";
import { ConsultationRegisterDialog } from "@/components/consultations/consultation-register-dialog";
import { StatusPill } from "@/components/ui/status-pill";
import { useAdminSettings } from "@/hooks/use-admin-settings";
import { useConsultations } from "@/hooks/use-consultations";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { Consultation } from "@/types/domain";

const filterInputClass =
  "h-10 shrink-0 rounded-md border border-pebble bg-white px-3 text-sm font-bold text-slate outline-none transition focus:border-monday-violet";

const consultationsPerPage = 10;
const consultationTableColumnCount = 21;

type ViewMode = "year" | "month" | "week" | "day";
type ColumnFilterKey =
  | "patientType"
  | "counselor"
  | "visitChannel"
  | "treatmentCategory"
  | "doctor"
  | "result"
  | "partialConsent"
  | "cancelledAfterConsent"
  | "disagreementReason";

type ColumnFilters = Record<ColumnFilterKey, string[]>;

const emptyColumnFilters: ColumnFilters = {
  patientType: [],
  counselor: [],
  visitChannel: [],
  treatmentCategory: [],
  doctor: [],
  result: [],
  partialConsent: [],
  cancelledAfterConsent: [],
  disagreementReason: [],
};

const consultationResultLabels: Record<Consultation["result"], string> = {
  same_day: "동의(당일진행)",
  follow_up: "동의(추후진행)",
  declined: "비동의",
  cancelled: "동의 후 취소",
};

const filterableColumnLabels: Record<ColumnFilterKey, string> = {
  patientType: "구분",
  counselor: "상담사",
  visitChannel: "내원경로",
  treatmentCategory: "진료분류",
  doctor: "Dr.",
  result: "상담결과",
  partialConsent: "부분동의 여부",
  cancelledAfterConsent: "동의 후 취소",
  disagreementReason: "비동의사유",
};

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

function patientTypeLabel(patientType: Consultation["patientType"]) {
  return patientType === "returning" ? "구환" : "신환";
}

function getConsultationResultLabel(result: Consultation["result"]) {
  return consultationResultLabels[result];
}

function getUniqueOptions(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function mergeFilterOptions(preferredOptions: string[], dataOptions: string[]) {
  return getUniqueOptions([...preferredOptions, ...dataOptions]);
}

function isPartialConsent(consultation: Consultation) {
  const isConsentResult = consultation.result === "same_day" || consultation.result === "follow_up";

  return isConsentResult && consultation.consultedTeeth !== consultation.agreedTeeth;
}

function getColumnFilterValue(consultation: Consultation, key: ColumnFilterKey) {
  if (key === "patientType") {
    return patientTypeLabel(consultation.patientType);
  }

  if (key === "result") {
    return getConsultationResultLabel(consultation.result);
  }

  if (key === "partialConsent") {
    return isPartialConsent(consultation) ? "부분동의" : "해당 없음";
  }

  if (key === "cancelledAfterConsent") {
    return consultation.result === "cancelled" ? "동의 후 취소" : "해당 없음";
  }

  if (key === "disagreementReason") {
    return consultation.disagreementReason ?? "-";
  }

  return consultation[key] || "-";
}

function hasActiveColumnFilters(columnFilters: ColumnFilters) {
  return Object.values(columnFilters).some((values) => values.length > 0);
}

function ColumnFilterHeader({
  label,
  options,
  selectedValues,
  isOpen,
  onToggle,
  onValueToggle,
  onClear,
  onSelectAll,
  onClose,
}: {
  label: string;
  options: string[];
  selectedValues: string[];
  isOpen: boolean;
  onToggle: () => void;
  onValueToggle: (value: string) => void;
  onClear: () => void;
  onSelectAll: () => void;
  onClose: () => void;
}) {
  const filterRef = useRef<HTMLTableCellElement>(null);
  const isActive = selectedValues.length > 0;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!filterRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen, onClose]);

  return (
    <th ref={filterRef} className="relative">
      <div className="inline-flex items-center justify-center gap-1.5">
        <span>{label}</span>
        <button
          type="button"
          aria-label={`${label} 필터 열기`}
          onClick={onToggle}
          className={`grid h-6 w-6 place-items-center rounded-full transition ${
            isActive ? "bg-white text-monday-violet" : "bg-white/10 text-white hover:bg-white/20"
          }`}
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {isOpen ? (
        <div className="absolute left-1/2 top-full z-40 mt-2 w-60 -translate-x-1/2 rounded-2xl border border-mist bg-white p-3 text-left text-ink shadow-[rgba(33,35,52,0.18)_0_16px_44px]">
          <div className="flex items-center justify-between gap-2 border-b border-pebble pb-2">
            <p className="text-sm font-bold text-ink">{label} 필터</p>
            <span className="metric-number rounded-full bg-cloud px-2 py-0.5 text-xs font-bold text-slate">
              {selectedValues.length || "전체"}
            </span>
          </div>
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
            {options.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-bold text-slate hover:bg-cloud"
              >
                <input
                  type="checkbox"
                  checked={selectedValues.includes(option)}
                  onChange={() => onValueToggle(option)}
                  className="h-4 w-4 accent-monday-violet"
                />
                <span className="min-w-0 truncate">{option}</span>
              </label>
            ))}
            {options.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm font-bold text-slate">선택할 항목이 없습니다.</p>
            ) : null}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onSelectAll}
              className="flex-1 rounded-full border border-pebble px-3 py-1.5 text-xs font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet"
            >
              전체 선택
            </button>
            <button
              type="button"
              onClick={onClear}
              className="flex-1 rounded-full bg-cloud px-3 py-1.5 text-xs font-bold text-slate transition hover:text-monday-violet"
            >
              초기화
            </button>
          </div>
        </div>
      ) : null}
    </th>
  );
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

export function ConsultationsWorkspace() {
  const { activeClinic } = useAdminSettings();
  const { consultations, addConsultation, deleteConsultation, updateConsultation } = useConsultations({
    clinicId: activeClinic.id,
  });
  const initialPeriod = useMemo(() => getInitialPeriod(), []);
  const [selectedYear, setSelectedYear] = useState(initialPeriod.year);
  const [selectedMonth, setSelectedMonth] = useState(initialPeriod.month);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedDate, setSelectedDate] = useState(initialPeriod.date);
  const [confirmTarget, setConfirmTarget] = useState<Consultation | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<Consultation | null>(null);
  const [editingConsultation, setEditingConsultation] = useState<Consultation | null>(null);
  const [treatmentPlanSource, setTreatmentPlanSource] = useState<Consultation | null>(null);
  const [openColumnFilter, setOpenColumnFilter] = useState<ColumnFilterKey | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(emptyColumnFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const [saveErrorMessage, setSaveErrorMessage] = useState("");
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
  const periodConsultations = useMemo(() => {
    return consultations.filter((consultation) => {
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

      if (viewMode === "week") {
        return day >= activeWeek.startDay && day <= activeWeek.endDay;
      }

      return true;
    });
  }, [activeWeek.endDay, activeWeek.startDay, consultations, selectedDate, selectedMonth, selectedYear, viewMode]);
  const columnFilterOptions = useMemo(
    () => ({
      patientType: mergeFilterOptions(
        activeClinic.options.patientTypes.map((option) => option.label),
        periodConsultations.map((consultation) => getColumnFilterValue(consultation, "patientType")),
      ),
      counselor: mergeFilterOptions(
        activeClinic.options.counselors.map((option) => option.label),
        periodConsultations.map((consultation) => getColumnFilterValue(consultation, "counselor")),
      ),
      visitChannel: mergeFilterOptions(
        activeClinic.options.visitChannels.map((option) => option.label),
        periodConsultations.map((consultation) => getColumnFilterValue(consultation, "visitChannel")),
      ),
      treatmentCategory: mergeFilterOptions(
        activeClinic.options.treatmentCategories.map((option) => option.label),
        periodConsultations.map((consultation) => getColumnFilterValue(consultation, "treatmentCategory")),
      ),
      doctor: mergeFilterOptions(
        activeClinic.options.doctors.map((option) => option.label),
        periodConsultations.map((consultation) => getColumnFilterValue(consultation, "doctor")),
      ),
      result: mergeFilterOptions(
        [...activeClinic.options.consultationResults.map((option) => option.label), "동의 후 취소"],
        periodConsultations.map((consultation) => getColumnFilterValue(consultation, "result")),
      ),
      partialConsent: mergeFilterOptions(
        ["부분동의", "해당 없음"],
        periodConsultations.map((consultation) => getColumnFilterValue(consultation, "partialConsent")),
      ),
      cancelledAfterConsent: mergeFilterOptions(
        ["동의 후 취소", "해당 없음"],
        periodConsultations.map((consultation) => getColumnFilterValue(consultation, "cancelledAfterConsent")),
      ),
      disagreementReason: mergeFilterOptions(
        activeClinic.options.disagreementReasons.map((option) => option.label),
        periodConsultations.map((consultation) => getColumnFilterValue(consultation, "disagreementReason")),
      ),
    }),
    [
      activeClinic.options.consultationResults,
      activeClinic.options.counselors,
      activeClinic.options.disagreementReasons,
      activeClinic.options.doctors,
      activeClinic.options.patientTypes,
      activeClinic.options.treatmentCategories,
      activeClinic.options.visitChannels,
      periodConsultations,
    ],
  );
  const filteredConsultations = useMemo(() => {
    return periodConsultations.filter((consultation) =>
      (Object.keys(columnFilters) as ColumnFilterKey[]).every((key) => {
        const selectedValues = columnFilters[key];

        return selectedValues.length === 0 || selectedValues.includes(getColumnFilterValue(consultation, key));
      }),
    );
  }, [columnFilters, periodConsultations]);
  const totalPages = Math.max(1, Math.ceil(filteredConsultations.length / consultationsPerPage));
  const activePage = Math.min(currentPage, totalPages);
  const paginatedConsultations = useMemo(() => {
    const startIndex = (activePage - 1) * consultationsPerPage;

    return filteredConsultations.slice(startIndex, startIndex + consultationsPerPage);
  }, [activePage, filteredConsultations]);
  const pageStartIndex = filteredConsultations.length === 0 ? 0 : (activePage - 1) * consultationsPerPage + 1;
  const pageEndIndex = Math.min(activePage * consultationsPerPage, filteredConsultations.length);
  const emptyPageRows =
    filteredConsultations.length > 0 ? Math.max(0, consultationsPerPage - paginatedConsultations.length) : 0;
  const activeColumnFilterCount = Object.values(columnFilters).filter((values) => values.length > 0).length;
  const periodLabel = viewMode === "year"
    ? `${selectedYear}년`
    : viewMode === "month"
      ? `${selectedYear}년 ${selectedMonth}월`
      : viewMode === "week"
        ? `${selectedYear}년 ${selectedMonth}월 ${activeWeek.label}`
        : formatDateLabel(selectedDate);

  const handleDateChange = (date: string) => {
    const { year, month, day } = getDateParts(date);

    setCurrentPage(1);
    setSelectedDate(date);

    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      setSelectedYear(year);
      setSelectedMonth(month);
      setSelectedWeek(Math.ceil(day / 7));
    }
  };

  const handleEditSubmit = async (input: ConsultationFormInput) => {
    if (!editingConsultation) {
      return;
    }

    try {
      setSaveErrorMessage("");
      await updateConsultation(editingConsultation.id, input);
      setEditingConsultation(null);
    } catch (error) {
      setSaveErrorMessage(error instanceof Error ? error.message : "상담일지 수정에 실패했습니다.");
    }
  };

  const handleTreatmentPlanSubmit = async (input: ConsultationFormInput) => {
    try {
      setSaveErrorMessage("");
      await addConsultation(input);
      setTreatmentPlanSource(null);
    } catch (error) {
      setSaveErrorMessage(error instanceof Error ? error.message : "치료계획 추가에 실패했습니다.");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmTarget) {
      return;
    }

    try {
      setSaveErrorMessage("");
      await deleteConsultation(deleteConfirmTarget.id);
      setDeleteConfirmTarget(null);
    } catch (error) {
      setSaveErrorMessage(error instanceof Error ? error.message : "상담일지 삭제에 실패했습니다.");
    }
  };

  const toggleColumnFilterValue = (key: ColumnFilterKey, value: string) => {
    setCurrentPage(1);
    setColumnFilters((current) => {
      const currentValues = current[key];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];

      return {
        ...current,
        [key]: nextValues,
      };
    });
  };

  const clearColumnFilter = (key: ColumnFilterKey) => {
    setCurrentPage(1);
    setColumnFilters((current) => ({
      ...current,
      [key]: [],
    }));
  };

  const selectAllColumnFilter = (key: ColumnFilterKey) => {
    setCurrentPage(1);
    setColumnFilters((current) => ({
      ...current,
      [key]: columnFilterOptions[key],
    }));
  };

  const renderFilterHeader = (key: ColumnFilterKey) => (
    <ColumnFilterHeader
      label={filterableColumnLabels[key]}
      options={columnFilterOptions[key]}
      selectedValues={columnFilters[key]}
      isOpen={openColumnFilter === key}
      onToggle={() => setOpenColumnFilter((current) => (current === key ? null : key))}
      onValueToggle={(value) => toggleColumnFilterValue(key, value)}
      onClear={() => clearColumnFilter(key)}
      onSelectAll={() => selectAllColumnFilter(key)}
      onClose={() => setOpenColumnFilter(null)}
    />
  );

  return (
    <div className="space-y-3">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-monday-violet">상담일지</p>
          <h1 className="mt-1 text-3xl font-light text-ink">상담 목록 관리</h1>
          <p className="mt-1 text-sm text-slate">
            신규 상담은 팝업으로 등록하고, 일지 목록은 넓게 확인합니다.
          </p>
        </div>
        <ConsultationRegisterDialog />
      </section>

      {saveErrorMessage ? (
        <div className="rounded-2xl border border-[#ffd0d0] bg-[#fff5f5] px-4 py-3 text-sm font-bold text-[#ad1f3d]">
          {saveErrorMessage}
        </div>
      ) : null}

      <section className="crm-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-mist px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink">상담 목록</h2>
            <p className="mt-1 text-sm text-slate">
              {periodLabel} 기준 {formatNumber(filteredConsultations.length)}건을 보고 있습니다.
              {hasActiveColumnFilters(columnFilters) ? (
                <span className="ml-2 font-bold text-monday-violet">
                  필터 {formatNumber(activeColumnFilterCount)}개 적용
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasActiveColumnFilters(columnFilters) ? (
              <button
                type="button"
                onClick={() => {
                  setColumnFilters(emptyColumnFilters);
                  setOpenColumnFilter(null);
                  setCurrentPage(1);
                }}
                className="inline-flex h-10 items-center rounded-full border border-monday-violet bg-white px-3 text-sm font-bold text-monday-violet transition hover:bg-periwinkle"
              >
                필터 초기화
              </button>
            ) : null}
            <span className="inline-flex h-10 items-center gap-2 rounded-full border border-pebble bg-white px-3 text-sm font-bold text-slate">
              <Filter className="h-4 w-4" aria-hidden />
              기간
            </span>
            <select
              aria-label="보기 단위 선택"
              value={viewMode}
              onChange={(event) => {
                setViewMode(event.target.value as ViewMode);
                setSelectedWeek(1);
                setCurrentPage(1);
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
                aria-label="년도 선택"
                value={selectedYear}
                onChange={(event) => {
                  setSelectedYear(Number(event.target.value));
                  setCurrentPage(1);
                }}
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
                  setCurrentPage(1);
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
                onChange={(event) => {
                  setSelectedWeek(Number(event.target.value));
                  setCurrentPage(1);
                }}
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
        <div className={`overflow-x-auto ${openColumnFilter ? "min-h-96 pb-6" : ""}`}>
          <table className="crm-table consultation-ledger-table">
            <thead>
              <tr>
                <th>연번</th>
                <th>날짜</th>
                <th>성함</th>
                <th>차트번호</th>
                {renderFilterHeader("patientType")}
                {renderFilterHeader("counselor")}
                {renderFilterHeader("visitChannel")}
                {renderFilterHeader("treatmentCategory")}
                {renderFilterHeader("doctor")}
                <th>상담치아</th>
                <th>동의치아</th>
                {renderFilterHeader("result")}
                {renderFilterHeader("partialConsent")}
                {renderFilterHeader("cancelledAfterConsent")}
                {renderFilterHeader("disagreementReason")}
                <th>상담내용</th>
                <th>상담금액</th>
                <th>동의금액</th>
                <th>치료계획</th>
                <th>수정</th>
                <th>삭제</th>
              </tr>
            </thead>
            <tbody>
              {paginatedConsultations.map((consultation) => {
                const isConsentResult = consultation.result === "same_day" || consultation.result === "follow_up";
                const isPartialConsent =
                  isConsentResult && consultation.consultedTeeth !== consultation.agreedTeeth;
                const isCancelledAfterConsent = consultation.result === "cancelled";

                return (
                  <tr key={consultation.id} className={consultation.result === "declined" ? "is-attention" : ""}>
                    <td className="metric-number font-bold">{consultation.id}</td>
                    <td>{consultation.date}</td>
                    <td className="font-bold">{consultation.patientName}</td>
                    <td className="metric-number">{consultation.chartNo}</td>
                    <td>{consultation.patientType === "new" ? "신환" : "구환"}</td>
                    <td>{consultation.counselor}</td>
                    <td>{consultation.visitChannel || "-"}</td>
                    <td>{consultation.treatmentCategory}</td>
                    <td>{consultation.doctor}</td>
                    <td className="metric-number">{consultation.consultedTeeth}</td>
                    <td className="metric-number">{consultation.agreedTeeth}</td>
                    <td><StatusPill result={consultation.result} /></td>
                    <td>
                      {isPartialConsent ? (
                        <span className="inline-flex rounded-md bg-sky px-2.5 py-1 text-xs font-bold text-ink">
                          부분동의
                        </span>
                      ) : "-"}
                    </td>
                    <td>
                      {isCancelledAfterConsent ? (
                        <span className="inline-flex rounded-md bg-[#ffdbe3] px-2.5 py-1 text-xs font-bold text-[#ad1f3d]">
                          동의 후 취소
                        </span>
                      ) : "-"}
                    </td>
                    <td>{consultation.disagreementReason ?? "-"}</td>
                    <td>{consultation.memo ?? "-"}</td>
                    <td className="metric-number font-bold">{formatCurrency(consultation.consultationAmount)}</td>
                    <td className="metric-number font-bold">{formatCurrency(consultation.agreedAmount)}</td>
                    <td>
                      <button
                        type="button"
                        aria-label={`${consultation.patientName} 치료계획 추가`}
                        title="치료계획 추가"
                        onClick={() => setTreatmentPlanSource(consultation)}
                        className="grid h-9 w-9 place-items-center rounded-md border border-pebble text-slate transition hover:border-monday-violet hover:text-monday-violet"
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        aria-label={`${consultation.patientName} 상담 수정`}
                        onClick={() => setConfirmTarget(consultation)}
                        className="grid h-9 w-9 place-items-center rounded-md border border-pebble text-slate transition hover:border-monday-violet hover:text-monday-violet"
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        aria-label={`${consultation.patientName} 상담 삭제`}
                        title="상담 삭제"
                        onClick={() => setDeleteConfirmTarget(consultation)}
                        className="grid h-9 w-9 place-items-center rounded-md border border-pebble text-slate transition hover:border-[#ad1f3d] hover:text-[#ad1f3d]"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {Array.from({ length: emptyPageRows }, (_, rowIndex) => (
                <tr
                  key={`empty-page-row-${activePage}-${rowIndex}`}
                  aria-hidden="true"
                  className="is-placeholder"
                >
                  {Array.from({ length: consultationTableColumnCount }, (_, cellIndex) => (
                    <td key={cellIndex}>&nbsp;</td>
                  ))}
                </tr>
              ))}
              {filteredConsultations.length === 0 ? (
                <tr>
                  <td colSpan={consultationTableColumnCount} className="py-12 text-center text-sm font-bold text-slate">
                    선택한 기간에 등록된 상담이 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {filteredConsultations.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-mist px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold text-slate">
              {formatNumber(pageStartIndex)}-{formatNumber(pageEndIndex)} / 총{" "}
              {formatNumber(filteredConsultations.length)}건
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage(Math.max(1, activePage - 1))}
                disabled={activePage === 1}
                className="h-9 rounded-full border border-pebble bg-white px-3 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet disabled:cursor-not-allowed disabled:opacity-40"
              >
                이전
              </button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  aria-current={activePage === page ? "page" : undefined}
                  className={`metric-number h-9 min-w-9 rounded-full px-3 text-sm font-bold transition ${
                    activePage === page
                      ? "bg-monday-violet text-white"
                      : "border border-pebble bg-white text-slate hover:border-monday-violet hover:text-monday-violet"
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCurrentPage(Math.min(totalPages, activePage + 1))}
                disabled={activePage === totalPages}
                className="h-9 rounded-full border border-pebble bg-white px-3 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet disabled:cursor-not-allowed disabled:opacity-40"
              >
                다음
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {confirmTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="edit-confirm-title"
        >
          <div className="w-full max-w-md rounded-[24px] border border-mist bg-white p-5 shadow-[rgba(33,35,52,0.24)_0_22px_70px]">
            <h2 id="edit-confirm-title" className="text-xl font-bold text-ink">
              상담을 수정할까요?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate">
              {confirmTarget.patientName}님의 상담 내용을 수정하시겠습니까?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="rounded-full border border-pebble px-4 py-2 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet"
              >
                아니오
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingConsultation(confirmTarget);
                  setConfirmTarget(null);
                }}
                className="rounded-full bg-monday-violet px-4 py-2 text-sm font-bold text-white transition hover:brightness-95"
              >
                네
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirmTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
        >
          <div className="w-full max-w-md rounded-[24px] border border-mist bg-white p-5 shadow-[rgba(33,35,52,0.24)_0_22px_70px]">
            <h2 id="delete-confirm-title" className="text-xl font-bold text-ink">
              상담을 삭제할까요?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate">
              {deleteConfirmTarget.patientName}님의 상담 기록을 삭제합니다. 삭제 후에는 상담목록과 리콜/리포트 집계에서도 제외됩니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="rounded-full border border-pebble px-4 py-2 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteConfirm()}
                className="rounded-full bg-[#ad1f3d] px-4 py-2 text-sm font-bold text-white transition hover:brightness-95"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingConsultation ? (
        <ConsultationFormDialog
          consultation={editingConsultation}
          title="상담 수정"
          submitLabel="수정 저장"
          onClose={() => {
            setSaveErrorMessage("");
            setEditingConsultation(null);
          }}
          onSubmit={handleEditSubmit}
          saveErrorMessage={saveErrorMessage}
        />
      ) : null}

      {treatmentPlanSource ? (
        <ConsultationFormDialog
          consultation={treatmentPlanSource}
          mode="treatmentPlan"
          title="치료계획 추가"
          submitLabel="치료계획 등록"
          onClose={() => {
            setSaveErrorMessage("");
            setTreatmentPlanSource(null);
          }}
          onSubmit={handleTreatmentPlanSubmit}
          saveErrorMessage={saveErrorMessage}
        />
      ) : null}
    </div>
  );
}
