import { defaultAdminSettings } from "@/lib/admin-settings";
import type { Consultation } from "@/types/domain";

export type ConsultationPeriodMode = "year" | "month" | "week" | "day";

export type ConsultationWeekOption = {
  value: number;
  label: string;
  startDay: number;
  endDay: number;
};

export type ConsultationPeriodFilter = {
  mode: ConsultationPeriodMode;
  year: number;
  month: number;
  weekStartDay?: number;
  weekEndDay?: number;
  date?: string;
};

export const defaultConsultationClinicId = defaultAdminSettings.activeClinicId;

export function getConsultationDateParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return { year, month, day };
}

export function getDateInputValue(date: Date) {
  const timezoneOffset = date.getTimezoneOffset() * 60000;

  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

export function getInitialConsultationPeriod() {
  const today = new Date();

  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    date: getDateInputValue(today),
  };
}

export function formatConsultationDateLabel(date: string) {
  const { year, month, day } = getConsultationDateParts(date);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return date;
  }

  return `${year}년 ${month}월 ${day}일`;
}

export function getConsultationWeekOptions(year: number, month: number): ConsultationWeekOption[] {
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

export function getConsultationYearOptions(consultations: Consultation[], fallbackYear: number) {
  const years = consultations
    .map((consultation) => getConsultationDateParts(consultation.date).year)
    .filter((year) => Number.isFinite(year));

  return [...new Set([fallbackYear, ...years])].toSorted((first, second) => second - first);
}

export function isConsultationInClinic(consultation: Consultation, clinicId?: string) {
  if (!clinicId) {
    return true;
  }

  if (consultation.clinicId) {
    return consultation.clinicId === clinicId;
  }

  return clinicId === defaultConsultationClinicId;
}

export function filterConsultationsByClinic(consultations: Consultation[], clinicId?: string) {
  return consultations.filter((consultation) => isConsultationInClinic(consultation, clinicId));
}

export function filterConsultationsByPeriod(
  consultations: Consultation[],
  filter: ConsultationPeriodFilter,
) {
  return consultations.filter((consultation) => {
    if (filter.mode === "day") {
      return consultation.date === filter.date;
    }

    const { year, month, day } = getConsultationDateParts(consultation.date);

    if (year !== filter.year) {
      return false;
    }

    if (filter.mode === "year") {
      return true;
    }

    if (month !== filter.month) {
      return false;
    }

    if (filter.mode === "month") {
      return true;
    }

    return day >= (filter.weekStartDay ?? 1) && day <= (filter.weekEndDay ?? 31);
  });
}
