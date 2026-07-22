"use client";

import { Save, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminSettings } from "@/hooks/use-admin-settings";
import { optionGroupConfigs, type OptionGroupKey } from "@/lib/admin-settings";
import {
  loadDentwebPatientAppointments,
  searchDentwebPatients,
  type DentwebSnapshotAppointment,
  type DentwebSnapshotPatient,
} from "@/lib/local-api-client";
import type { Consultation, ConsultationResult, PatientType } from "@/types/domain";

const baseInputClass =
  "h-11 w-full rounded-md border border-pebble bg-white px-3 text-sm text-ink outline-none transition placeholder:text-iron focus:border-monday-violet";

const amountFormatter = new Intl.NumberFormat("ko-KR");

export type ConsultationFormInput = Omit<Consultation, "id">;

type FormState = {
  date: string;
  patientName: string;
  chartNo: string;
  consultationAmount: string;
  agreedAmount: string;
  consultedTeeth: string;
  agreedTeeth: string;
  patientType: string;
  counselor: string;
  visitChannel: string;
  treatmentCategory: string;
  doctor: string;
  result: string;
  disagreementReason: string;
  memo: string;
};

type FormMode = "default" | "treatmentPlan";
type PatientSearchState = {
  message: string;
  patients: DentwebSnapshotPatient[];
  selectedPatientId?: number | string;
  status: "idle" | "loading" | "success" | "empty" | "error";
};
type AppointmentLookupState = {
  appointments: DentwebSnapshotAppointment[];
  message: string;
  patientKey: string;
  status: "idle" | "loading" | "success" | "empty" | "error";
};

type SelectFormKey =
  | "patientType"
  | "counselor"
  | "visitChannel"
  | "treatmentCategory"
  | "doctor"
  | "result";

const textFields: Array<{
  name: keyof Pick<
    FormState,
    "date" | "patientName" | "chartNo" | "consultationAmount" | "agreedAmount" | "consultedTeeth" | "agreedTeeth"
  >;
  label: string;
  type: "date" | "text";
  placeholder: string;
  required?: boolean;
  numeric?: boolean;
  amount?: boolean;
}> = [
  { name: "date", label: "날짜", type: "date", placeholder: "", required: true },
  { name: "patientName", label: "성함", type: "text", placeholder: "홍길동", required: true },
  { name: "chartNo", label: "차트번호", type: "text", placeholder: "7001" },
  { name: "consultationAmount", label: "상담금액", type: "text", placeholder: "1,200,000", numeric: true, amount: true },
  { name: "agreedAmount", label: "동의금액", type: "text", placeholder: "900,000", numeric: true, amount: true },
  { name: "consultedTeeth", label: "상담치아", type: "text", placeholder: "3", numeric: true },
  { name: "agreedTeeth", label: "동의치아", type: "text", placeholder: "2", numeric: true },
];

const selectFields: Array<{ groupKey: OptionGroupKey; formKey: SelectFormKey }> = [
  { groupKey: "patientTypes", formKey: "patientType" },
  { groupKey: "counselors", formKey: "counselor" },
  { groupKey: "visitChannels", formKey: "visitChannel" },
  { groupKey: "treatmentCategories", formKey: "treatmentCategory" },
  { groupKey: "doctors", formKey: "doctor" },
  { groupKey: "consultationResults", formKey: "result" },
];

const resultLabelByValue: Record<ConsultationResult, string> = {
  same_day: "동의(당일진행)",
  follow_up: "동의(추후진행)",
  declined: "비동의",
  cancelled: "동의 후 취소",
};

function getTodayInputValue() {
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60_000);

  return localDate.toISOString().slice(0, 10);
}

function digitsOnly(value: string) {
  return value.replace(/[^\d]/g, "");
}

function formatAmountInput(value: string) {
  const digits = digitsOnly(value);

  if (!digits) {
    return "";
  }

  return amountFormatter.format(Number(digits));
}

function parseNumberInput(value: string) {
  const digits = digitsOnly(value);

  return digits ? Number(digits) : 0;
}

function toPatientType(value: string): PatientType {
  return value.includes("구환") ? "returning" : "new";
}

function isReturningPatient(value: string) {
  return toPatientType(value) === "returning";
}

function getAllowedVisitChannel(patientTypeValue: string, visitChannel: string, options: string[]) {
  if (isReturningPatient(patientTypeValue)) {
    return "";
  }

  return options.includes(visitChannel) ? visitChannel : (options[0] ?? "");
}

function toConsultationResult(value: string): ConsultationResult {
  if (value.includes("추후")) {
    return "follow_up";
  }

  if (value.includes("비동의")) {
    return "declined";
  }

  if (value.includes("취소")) {
    return "cancelled";
  }

  return "same_day";
}

function uniqueOptions(options: string[]) {
  return [...new Set(options.filter((option) => option.trim()))];
}

function includeOption(options: string[], value: string) {
  if (!value || options.includes(value)) {
    return options;
  }

  return [value, ...options];
}

function formatDentwebAppointment(appointment?: DentwebSnapshotAppointment | null) {
  if (!appointment) {
    return "";
  }

  const dateDigits = String(appointment.appointmentDate ?? "").replace(/\D/g, "");
  const timeDigits = String(appointment.appointmentTime ?? "").replace(/\D/g, "");
  const dateText = (() => {
    if (dateDigits.length !== 8) {
      return appointment.appointmentDate || "";
    }

    const year = Number(dateDigits.slice(0, 4));
    const month = Number(dateDigits.slice(4, 6));
    const day = Number(dateDigits.slice(6, 8));
    const date = new Date(year, month - 1, day);
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];

    return Number.isNaN(date.getTime())
      ? appointment.appointmentDate || ""
      : `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}(${weekday})`;
  })();
  const timeText = (() => {
    if (!timeDigits) {
      return "";
    }

    const normalized = timeDigits.padStart(4, "0").slice(-4);
    const hour = Number(normalized.slice(0, 2));
    const minute = Number(normalized.slice(2, 4));

    return hour <= 23 && minute <= 59
      ? `${hour}시 ${String(minute).padStart(2, "0")}분`
      : appointment.appointmentTime || "";
  })();

  return [
    dateText,
    timeText,
    appointment.doctor ? `Dr. ${appointment.doctor}` : "",
    appointment.status,
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatDentwebBirthDate(value?: string) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (digits.length !== 8) {
    return value || "-";
  }

  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function getDentwebAge(value?: string) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (digits.length !== 8) {
    return "-";
  }

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const today = new Date();
  let age = today.getFullYear() - year;

  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) {
    age -= 1;
  }

  return Number.isFinite(age) && age >= 0 ? `${age}세` : "-";
}

function formatDentwebGender(value?: string) {
  if (value === "female" || value === "true" || value === "1") {
    return "여";
  }

  if (value === "male" || value === "false" || value === "0") {
    return "남";
  }

  return "-";
}

function formatDentwebPhone(value?: string) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return value || "-";
}

function DentwebPatientSearchDropdown({
  loading,
  message,
  onSelect,
  patients,
  status,
}: {
  loading: boolean;
  message: string;
  onSelect: (patient: DentwebSnapshotPatient) => void;
  patients: DentwebSnapshotPatient[];
  status: PatientSearchState["status"];
}) {
  return (
    <div className="absolute left-0 top-full z-30 mt-2 w-[min(44rem,calc(100vw-3rem))] overflow-hidden rounded-lg border border-pebble bg-white shadow-[0_18px_38px_rgba(28,39,66,0.18)]">
      <div className="flex items-center justify-between gap-3 border-b border-mist bg-fog px-3 py-2">
        <p className="text-xs font-bold text-ink">덴트웹 환자 검색</p>
        <p className={status === "error" ? "text-xs font-bold text-red-600" : "text-xs font-bold text-slate"}>{message}</p>
      </div>
      {patients.length ? (
        <div className="max-h-80 overflow-y-auto p-2">
          {patients.map((patient, index) => {
            const appointmentText = formatDentwebAppointment(patient.latestAppointment);

            return (
              <button
                key={`${patient.id ?? patient.chartNo ?? patient.patientName}-${index}`}
                type="button"
                onClick={() => onSelect(patient)}
                className="w-full rounded-md px-3 py-3 text-left transition hover:bg-periwinkle focus:bg-periwinkle"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-ink">{patient.patientName || "이름 없음"}</span>
                  <span className="text-sm font-bold text-monday-violet">차트 {patient.chartNo || "-"}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate">
                  <span>성별 {formatDentwebGender(patient.gender)}</span>
                  <span>생년월일 {formatDentwebBirthDate(patient.birthDate)}</span>
                  <span>만 나이 {getDentwebAge(patient.birthDate)}</span>
                  <span>전화번호 {formatDentwebPhone(patient.phone)}</span>
                </div>
                <p className="mt-1 text-xs text-slate">마지막 예약 {appointmentText || "-"}</p>
              </button>
            );
          })}
        </div>
      ) : loading ? null : (
        <p className="px-3 py-4 text-xs font-bold text-slate">검색 조건에 맞는 환자가 없습니다.</p>
      )}
    </div>
  );
}

function getDentwebPatientKey(patient?: DentwebSnapshotPatient) {
  if (!patient) {
    return "";
  }

  return String(patient.id ?? `${patient.chartNo ?? ""}:${patient.patientName ?? ""}`);
}

function buildDentwebMemoText(patient?: DentwebSnapshotPatient) {
  if (!patient) {
    return "";
  }

  const appointmentText = formatDentwebAppointment(patient.latestAppointment);
  const appointmentMemo = patient.latestAppointment?.memo?.trim();
  const patientMemo = patient.memo?.trim();

  return [
    patientMemo ? `덴트웹 환자메모: ${patientMemo}` : "",
    appointmentText ? `최근 예약: ${appointmentText}` : "",
    appointmentMemo ? `예약메모: ${appointmentMemo}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function patientTypeLabel(patientType: PatientType) {
  return patientType === "returning" ? "구환" : "신환";
}

function createFormState({
  consultation,
  enabledOptions,
  mode = "default",
}: {
  consultation?: Consultation;
  enabledOptions: Record<OptionGroupKey, string[]>;
  mode?: FormMode;
}): FormState {
  if (consultation) {
    if (mode === "treatmentPlan") {
      const patientTypeValue = patientTypeLabel(consultation.patientType);

      return {
        date: getTodayInputValue(),
        patientName: consultation.patientName,
        chartNo: consultation.chartNo,
        consultationAmount: "",
        agreedAmount: "",
        consultedTeeth: "",
        agreedTeeth: "",
        patientType: patientTypeValue,
        counselor: consultation.counselor,
        visitChannel: getAllowedVisitChannel(
          patientTypeValue,
          consultation.visitChannel,
          enabledOptions.visitChannels,
        ),
        treatmentCategory: enabledOptions.treatmentCategories[0] ?? "",
        doctor: consultation.doctor,
        result: resultLabelByValue[consultation.result],
        disagreementReason: enabledOptions.disagreementReasons[0] ?? "선택 안함",
        memo: "",
      };
    }

    return {
      date: consultation.date,
      patientName: consultation.patientName,
      chartNo: consultation.chartNo,
      consultationAmount: String(consultation.consultationAmount || ""),
      agreedAmount: String(consultation.agreedAmount || ""),
      consultedTeeth: String(consultation.consultedTeeth || ""),
      agreedTeeth: String(consultation.agreedTeeth || ""),
      patientType: patientTypeLabel(consultation.patientType),
      counselor: consultation.counselor,
      visitChannel: getAllowedVisitChannel(
        patientTypeLabel(consultation.patientType),
        consultation.visitChannel,
        enabledOptions.visitChannels,
      ),
      treatmentCategory: consultation.treatmentCategory,
      doctor: consultation.doctor,
      result: resultLabelByValue[consultation.result],
      disagreementReason: consultation.disagreementReason ?? "선택 안함",
      memo: consultation.memo ?? "",
    };
  }

  return {
    date: getTodayInputValue(),
    patientName: "",
    chartNo: "",
    consultationAmount: "",
    agreedAmount: "",
    consultedTeeth: "",
    agreedTeeth: "",
    patientType: enabledOptions.patientTypes[0] ?? "",
    counselor: enabledOptions.counselors[0] ?? "",
    visitChannel: enabledOptions.visitChannels[0] ?? "",
    treatmentCategory: enabledOptions.treatmentCategories[0] ?? "",
    doctor: enabledOptions.doctors[0] ?? "",
    result: enabledOptions.consultationResults[0] ?? "동의(당일진행)",
    disagreementReason: enabledOptions.disagreementReasons[0] ?? "선택 안함",
    memo: "",
  };
}

export function ConsultationFormDialog({
  consultation,
  mode = "default",
  title,
  submitLabel,
  onClose,
  onSubmit,
  saveErrorMessage = "",
}: {
  consultation?: Consultation;
  saveErrorMessage?: string;
  mode?: FormMode;
  title: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (input: ConsultationFormInput) => void | Promise<void>;
}) {
  const { activeClinic, enabledOptions } = useAdminSettings();
  const groupLabels = useMemo(
    () =>
      Object.fromEntries(
        optionGroupConfigs.map((group) => [group.key, group.label]),
      ) as Record<OptionGroupKey, string>,
    [],
  );
  const [formState, setFormState] = useState<FormState>(() =>
    createFormState({ consultation, enabledOptions, mode }),
  );
  const resultOptions = useMemo(
    () => uniqueOptions([...enabledOptions.consultationResults, "동의 후 취소"]),
    [enabledOptions.consultationResults],
  );
  const [patientSearchState, setPatientSearchState] = useState<PatientSearchState>({
    message: "",
    patients: [],
    status: "idle",
  });
  const [isPatientSearchDropdownOpen, setIsPatientSearchDropdownOpen] = useState(false);
  const patientSearchDropdownRef = useRef<HTMLLabelElement | null>(null);
  const [appointmentLookupState, setAppointmentLookupState] = useState<AppointmentLookupState>({
    appointments: [],
    message: "",
    patientKey: "",
    status: "idle",
  });
  const selectedDentwebPatient = useMemo(
    () =>
      patientSearchState.patients.find(
        (patient) => patientSearchState.selectedPatientId !== undefined && patient.id === patientSearchState.selectedPatientId,
      ),
    [patientSearchState.patients, patientSearchState.selectedPatientId],
  );
  const selectedDentwebMemo = useMemo(
    () => buildDentwebMemoText(selectedDentwebPatient),
    [selectedDentwebPatient],
  );
  const selectedDentwebAppointments = useMemo(() => {
    if (!selectedDentwebPatient) {
      return [];
    }

    const selectedKey = getDentwebPatientKey(selectedDentwebPatient);

    if (appointmentLookupState.patientKey === selectedKey && appointmentLookupState.appointments.length) {
      return appointmentLookupState.appointments;
    }

    return selectedDentwebPatient.appointments ?? [];
  }, [appointmentLookupState.appointments, appointmentLookupState.patientKey, selectedDentwebPatient]);

  const updateField = (name: keyof FormState, value: string) => {
    setFormState((current) => ({
      ...current,
      [name]: value,
    }));
  };
  const lastAutoSearchQueryRef = useRef("");

  const runPatientSearch = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const query = (formState.patientName.trim() || formState.chartNo.trim()).trim();

    if (!query) {
      setIsPatientSearchDropdownOpen(false);
      if (!silent) {
        setPatientSearchState({
          message: "성함 또는 차트번호를 입력한 뒤 검색하세요.",
          patients: [],
          status: "error",
        });
      }
      return;
    }

    setIsPatientSearchDropdownOpen(true);

    if (!silent) {
      setPatientSearchState({
        message: "덴트웹 환자 정보를 검색하고 있습니다.",
        patients: [],
        status: "loading",
      });
    }

    try {
      const payload = await searchDentwebPatients({
        clinicId: activeClinic.id,
        limit: 30,
        query,
      });
      const patients = payload.patients ?? [];

      setPatientSearchState({
        message: patients.length
          ? `${patients.length}명의 덴트웹 환자 후보를 찾았습니다.`
          : "일치하는 덴트웹 환자 스냅샷이 없습니다.",
        patients,
        status: patients.length ? "success" : "empty",
      });
      setAppointmentLookupState({
        appointments: [],
        message: "",
        patientKey: "",
        status: "idle",
      });
    } catch {
      if (!silent) {
        setPatientSearchState({
          message: "덴트웹 서버 또는 내부 API에 연결할 수 없습니다. 관리자 모드의 서버 상태를 확인하세요.",
          patients: [],
          status: "error",
        });
      }
    }
  }, [activeClinic.id, formState.chartNo, formState.patientName]);

  const loadAppointmentsForPatient = async (patient: DentwebSnapshotPatient) => {
    const patientKey = getDentwebPatientKey(patient);

    setAppointmentLookupState({
      appointments: patient.appointments ?? [],
      message: "덴트웹 예약 스냅샷을 확인하고 있습니다.",
      patientKey,
      status: "loading",
    });

    try {
      const payload = await loadDentwebPatientAppointments({
        chartNo: patient.chartNo,
        clinicId: activeClinic.id,
        limit: 10,
        patientId: patient.id,
        patientName: patient.patientName,
      });
      const appointments = payload.appointments ?? [];

      setAppointmentLookupState({
        appointments,
        message: appointments.length
          ? `${appointments.length}개의 덴트웹 예약 스냅샷을 불러왔습니다.`
          : "이 환자의 덴트웹 예약 스냅샷이 없습니다.",
        patientKey,
        status: appointments.length ? "success" : "empty",
      });
    } catch {
      setAppointmentLookupState({
        appointments: patient.appointments ?? [],
        message: "예약 스냅샷을 추가로 불러오지 못했습니다. 검색 결과의 기본 예약 정보만 표시합니다.",
        patientKey,
        status: "error",
      });
    }
  };

  const applyDentwebPatient = (patient: DentwebSnapshotPatient) => {
    setFormState((current) => ({
      ...current,
      chartNo: patient.chartNo || current.chartNo,
      patientName: patient.patientName || current.patientName,
    }));
    setPatientSearchState((current) => ({
      ...current,
      message: `${patient.patientName || "선택한 환자"} 정보를 상담 등록에 반영했습니다.`,
      selectedPatientId: patient.id,
    }));
    setIsPatientSearchDropdownOpen(false);
    void loadAppointmentsForPatient(patient);
  };

  const appendDentwebMemo = () => {
    if (!selectedDentwebMemo) {
      return;
    }

    setFormState((current) => ({
      ...current,
      memo: [current.memo.trim(), selectedDentwebMemo].filter(Boolean).join("\n\n"),
    }));
  };

  const getSelectOptions = (groupKey: OptionGroupKey) => {
    if (groupKey === "consultationResults") {
      return includeOption(resultOptions, formState.result);
    }

    if (groupKey === "visitChannels") {
      return enabledOptions.visitChannels;
    }

    return includeOption(enabledOptions[groupKey], formState[selectFields.find((field) => field.groupKey === groupKey)?.formKey ?? "result"]);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isPatientSearchDropdownOpen) {
          setIsPatientSearchDropdownOpen(false);
          return;
        }

        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPatientSearchDropdownOpen, onClose]);

  useEffect(() => {
    if (!isPatientSearchDropdownOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (patientSearchDropdownRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsPatientSearchDropdownOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isPatientSearchDropdownOpen]);

  useEffect(() => {
    const query = (formState.patientName.trim() || formState.chartNo.trim()).trim();

    if (query.length < 2 || query === lastAutoSearchQueryRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      lastAutoSearchQueryRef.current = query;
      void runPatientSearch({ silent: true });
    }, 550);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [formState.chartNo, formState.patientName, runPatientSearch]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="consultation-form-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-y-auto rounded-2xl border border-mist bg-white shadow-[rgba(33,35,52,0.24)_0_22px_70px]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-mist px-5 py-4 sm:px-6">
          <div>
            <p className="text-sm font-bold text-monday-violet">상담일지</p>
            <h2 id="consultation-form-title" className="mt-1 text-2xl font-light text-ink">
              {title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-md border border-pebble text-slate transition hover:border-monday-violet hover:text-monday-violet"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <form
          className="space-y-5 px-5 py-5 sm:px-6"
          onSubmit={async (event) => {
            event.preventDefault();
            const visitChannel = getAllowedVisitChannel(
              formState.patientType,
              formState.visitChannel,
              enabledOptions.visitChannels,
            );

            await onSubmit({
              clinicId: consultation?.clinicId ?? activeClinic.id,
              clinicName: consultation?.clinicName ?? activeClinic.name,
              date: formState.date,
              patientName: formState.patientName.trim(),
              chartNo: formState.chartNo.trim(),
              patientType: toPatientType(formState.patientType),
              counselor: formState.counselor,
              doctor: formState.doctor,
              visitChannel,
              treatmentCategory: formState.treatmentCategory,
              consultedTeeth: parseNumberInput(formState.consultedTeeth),
              agreedTeeth: parseNumberInput(formState.agreedTeeth),
              result: toConsultationResult(formState.result),
              consultationAmount: parseNumberInput(formState.consultationAmount),
              agreedAmount: parseNumberInput(formState.agreedAmount),
              disagreementReason:
                formState.disagreementReason && formState.disagreementReason !== "선택 안함"
                  ? formState.disagreementReason
                  : undefined,
              memo: formState.memo.trim() || undefined,
            });
          }}
        >
          {saveErrorMessage ? (
            <div className="rounded-2xl border border-[#ffd0d0] bg-[#fff5f5] px-4 py-3 text-sm font-bold text-[#ad1f3d]">
              {saveErrorMessage}
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {textFields.map((field) => {
              const fieldValue = formState[field.name];
              const visibleValue = field.amount ? formatAmountInput(fieldValue) : fieldValue;

              return (
                <label
                  key={field.name}
                  ref={field.name === "patientName" ? patientSearchDropdownRef : undefined}
                  className={field.name === "patientName" ? "relative space-y-2" : "space-y-2"}
                >
                  <span className="text-xs font-bold text-slate">{field.label}</span>
                  <div className={field.name === "patientName" ? "flex gap-2" : undefined}>
                    <input
                      type={field.type}
                      inputMode={field.numeric ? "numeric" : undefined}
                      placeholder={field.placeholder}
                      required={field.required}
                      value={visibleValue}
                      onChange={(event) => {
                        updateField(
                          field.name,
                          field.numeric ? digitsOnly(event.target.value) : event.target.value,
                        );

                        if (field.name === "patientName") {
                          setIsPatientSearchDropdownOpen(Boolean(event.target.value.trim()));
                          setPatientSearchState((current) => ({
                            ...current,
                            selectedPatientId: undefined,
                          }));
                        }
                      }}
                      className={baseInputClass}
                    />
                    {field.name === "patientName" ? (
                      <button
                        type="button"
                        onClick={() => void runPatientSearch()}
                        disabled={patientSearchState.status === "loading"}
                        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-pebble bg-white px-3 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet disabled:cursor-wait disabled:opacity-60"
                      >
                        <Search className="h-4 w-4" aria-hidden />
                        덴트웹
                      </button>
                    ) : null}
                  </div>
                  {field.name === "patientName" &&
                  isPatientSearchDropdownOpen &&
                  patientSearchState.status !== "idle" ? (
                    <DentwebPatientSearchDropdown
                      loading={patientSearchState.status === "loading"}
                      message={patientSearchState.message}
                      onSelect={applyDentwebPatient}
                      patients={patientSearchState.patients}
                      status={patientSearchState.status}
                    />
                  ) : null}
                </label>
              );
            })}
            {selectedDentwebPatient ? (
              <div className="md:col-span-2 xl:col-span-4">
                <div
                  className={[
                    "rounded-xl border px-4 py-3 text-sm",
                    patientSearchState.status === "error"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-pebble bg-fog text-slate",
                  ].join(" ")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-ink">덴트웹 환자 검색</p>
                    <p className="text-xs font-bold">{patientSearchState.message}</p>
                  </div>
                  {!selectedDentwebPatient && patientSearchState.patients.length ? (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {patientSearchState.patients.map((patient, index) => {
                        const appointmentText = formatDentwebAppointment(patient.latestAppointment);
                        const isSelected = patientSearchState.selectedPatientId === patient.id;

                        return (
                          <button
                            key={`${patient.id ?? patient.chartNo ?? patient.patientName}-${index}`}
                            type="button"
                            onClick={() => applyDentwebPatient(patient)}
                            className={[
                              "rounded-lg border bg-white px-3 py-2 text-left transition hover:border-monday-violet",
                              isSelected ? "border-monday-violet ring-2 ring-monday-violet/20" : "border-mist",
                            ].join(" ")}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-ink">{patient.patientName || "이름 없음"}</span>
                              <span className="text-xs font-bold text-monday-violet">
                                {patient.chartNo ? `차트 ${patient.chartNo}` : "차트번호 없음"}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate">
                              {patient.birthDate ? <span>생년월일 {patient.birthDate}</span> : null}
                              {appointmentText ? <span>최근 예약 {appointmentText}</span> : <span>예약 스냅샷 없음</span>}
                              {patient.memo ? <span>환자메모 있음</span> : null}
                              {patient.latestAppointment?.memo ? <span>예약메모 있음</span> : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {selectedDentwebPatient ? (
                    <div className="mt-3 rounded-lg border border-mist bg-white px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-ink">
                            {selectedDentwebPatient.patientName || "선택한 환자"} 덴트웹 요약
                          </p>
                          <p className="mt-1 text-xs text-slate">
                            차트 {selectedDentwebPatient.chartNo || "-"} · 생년월일{" "}
                            {selectedDentwebPatient.birthDate || "-"}
                          </p>
                        </div>
                        {selectedDentwebMemo ? (
                          <button
                            type="button"
                            onClick={appendDentwebMemo}
                            className="inline-flex h-9 items-center rounded-full border border-monday-violet bg-white px-3 text-xs font-bold text-monday-violet transition hover:bg-periwinkle"
                          >
                            상담내용에 추가
                          </button>
                        ) : null}
                      </div>
                      {selectedDentwebMemo ? (
                        <pre className="mt-3 whitespace-pre-wrap rounded-md bg-cloud px-3 py-2 text-xs leading-5 text-slate">
                          {selectedDentwebMemo}
                        </pre>
                      ) : (
                        <p className="mt-3 rounded-md bg-cloud px-3 py-2 text-xs font-bold text-slate">
                          표시할 덴트웹 메모나 최근 예약 정보가 없습니다.
                        </p>
                      )}
                      <div className="mt-3 rounded-md border border-pebble bg-fog px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-bold text-ink">예약 스냅샷</p>
                          {appointmentLookupState.patientKey === getDentwebPatientKey(selectedDentwebPatient) &&
                          appointmentLookupState.message ? (
                            <p
                              className={[
                                "text-xs font-bold",
                                appointmentLookupState.status === "error" ? "text-red-600" : "text-slate",
                              ].join(" ")}
                            >
                              {appointmentLookupState.message}
                            </p>
                          ) : null}
                        </div>
                        {selectedDentwebAppointments.length ? (
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            {selectedDentwebAppointments.slice(0, 6).map((appointment, index) => (
                              <div
                                key={`${appointment.id ?? appointment.appointmentDate ?? "appointment"}-${index}`}
                                className="rounded-lg border border-mist bg-white px-3 py-2 text-xs text-slate"
                              >
                                <p className="font-bold text-ink">
                                  {appointment.appointmentDate || "날짜 없음"}
                                  {appointment.appointmentTime ? ` ${appointment.appointmentTime}` : ""}
                                </p>
                                <p className="mt-1">
                                  {[appointment.doctor ? `담당 ${appointment.doctor}` : "", appointment.status]
                                    .filter(Boolean)
                                    .join(" · ") || "예약 상태 정보 없음"}
                                </p>
                                {appointment.memo ? (
                                  <p className="mt-1 line-clamp-2 text-iron">{appointment.memo}</p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs font-bold text-slate">표시할 예약 스냅샷이 없습니다.</p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {selectFields.map(({ groupKey, formKey }) => (
              <label key={groupKey} className="space-y-2">
                <span className="text-xs font-bold text-slate">{groupLabels[groupKey]}</span>
                <select
                  value={
                    groupKey === "visitChannels"
                      ? getAllowedVisitChannel(
                          formState.patientType,
                          formState.visitChannel,
                          enabledOptions.visitChannels,
                        )
                      : formState[formKey]
                  }
                  onChange={(event) => {
                    if (formKey === "patientType") {
                      setFormState((current) => ({
                        ...current,
                        patientType: event.target.value,
                        visitChannel: getAllowedVisitChannel(
                          event.target.value,
                          current.visitChannel,
                          enabledOptions.visitChannels,
                        ),
                      }));
                      return;
                    }

                    updateField(formKey, event.target.value);
                  }}
                  className={baseInputClass}
                >
                  {groupKey === "visitChannels" && isReturningPatient(formState.patientType) ? (
                    <option value="" aria-label="빈 내원경로" />
                  ) : null}
                  {getSelectOptions(groupKey).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.4fr_1fr]">
            <label className="space-y-2">
              <span className="text-xs font-bold text-slate">비동의사유</span>
              <select
                value={formState.disagreementReason}
                onChange={(event) => updateField("disagreementReason", event.target.value)}
                className={baseInputClass}
              >
                {includeOption(enabledOptions.disagreementReasons, formState.disagreementReason).map((reason) => (
                  <option key={reason}>{reason}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-bold text-slate">상담내용</span>
              <textarea
                value={formState.memo}
                onChange={(event) => updateField("memo", event.target.value)}
                placeholder="상담 메모를 입력하세요"
                className="min-h-28 w-full resize-y rounded-md border border-pebble bg-white px-3 py-3 text-sm text-ink outline-none transition placeholder:text-iron focus:border-monday-violet"
              />
            </label>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-mist pt-5 sm:flex-row sm:justify-end">
            <div className="mr-auto flex items-center text-xs font-bold text-slate">
              {consultation?.clinicName ?? activeClinic.name}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center justify-center rounded-md border border-pebble px-5 text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet"
            >
              취소
            </button>
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-monday-violet px-5 text-sm font-bold text-white transition hover:brightness-95"
            >
              <Save className="h-4 w-4" aria-hidden />
              {submitLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
