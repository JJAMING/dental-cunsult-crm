"use client";

import type { ReactNode } from "react";
import { Fragment, useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { useAdminSettings } from "@/hooks/use-admin-settings";
import { useConsultations } from "@/hooks/use-consultations";
import { consentRate, formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { Consultation } from "@/types/domain";

type ReportMode = "consultation" | "staff" | "average";
type PeriodMode = "year" | "month";
type MetricTone = "total" | "new" | "returning";

type Metrics = {
  consultations: number;
  agreements: number;
  newConsultations: number;
  newAgreements: number;
  returningConsultations: number;
  returningAgreements: number;
  consultationAmount: number;
  agreedAmount: number;
  newConsultationAmount: number;
  newAgreedAmount: number;
  returningConsultationAmount: number;
  returningAgreedAmount: number;
};

type ReportRow = {
  name: string;
  consultations: number;
  agreements: number;
  consultationAmount: number;
  agreedAmount: number;
  consultedTeeth: number;
  agreedTeeth: number;
};

type StaffDoctorMatrix = {
  counselors: string[];
  doctors: string[];
  cells: Map<string, Map<string, ReportRow>>;
  rowTotals: Map<string, ReportRow>;
  columnTotals: Map<string, ReportRow>;
  total: ReportRow;
};

const metricToneClasses: Record<MetricTone, string> = {
  total: "bg-periwinkle text-monday-violet",
  new: "bg-lavender text-ink",
  returning: "bg-aqua text-forest",
};

const filterInputClass =
  "h-10 shrink-0 rounded-md border border-pebble bg-white px-3 text-sm font-bold text-slate outline-none transition focus:border-monday-violet";

const analysisTabs: { value: ReportMode; label: string }[] = [
  { value: "consultation", label: "상담/동의 분석" },
  { value: "staff", label: "담당자별 상담 성과 분석" },
  { value: "average", label: "객단가 분석" },
];

const amountBands = [
  {
    name: "A. 1000만원 이상",
    matches: (amount: number) => amount >= 10000000,
  },
  {
    name: "B. 500만원 이상",
    matches: (amount: number) => amount >= 5000000 && amount < 10000000,
  },
  {
    name: "C. 100만원 이상",
    matches: (amount: number) => amount >= 1000000 && amount < 5000000,
  },
  {
    name: "D. 100만원 미만",
    matches: (amount: number) => amount < 1000000,
  },
];

function getInitialPeriod() {
  const today = new Date();

  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  };
}

function getDateParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return { year, month, day };
}

function isAgreement(consultation: Consultation) {
  return consultation.result === "same_day" || consultation.result === "follow_up";
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
  periodMode: PeriodMode,
  selectedYear: number,
  selectedMonth: number,
) {
  return consultations.filter((consultation) => {
    const { year, month } = getDateParts(consultation.date);

    if (year !== selectedYear) {
      return false;
    }

    if (periodMode === "year") {
      return true;
    }

    return month === selectedMonth;
  });
}

function createEmptyRow(name: string): ReportRow {
  return {
    name,
    consultations: 0,
    agreements: 0,
    consultationAmount: 0,
    agreedAmount: 0,
    consultedTeeth: 0,
    agreedTeeth: 0,
  };
}

function addConsultationToRow(row: ReportRow, consultation: Consultation) {
  const agreement = isAgreement(consultation);

  row.consultations += 1;
  row.agreements += agreement ? 1 : 0;
  row.consultationAmount += consultation.consultationAmount;
  row.agreedAmount += consultation.agreedAmount;
  row.consultedTeeth += consultation.consultedTeeth;
  row.agreedTeeth += consultation.agreedTeeth;
}

function addAgreementToRow(row: ReportRow, consultation: Consultation) {
  if (!isAgreement(consultation)) {
    return;
  }

  row.agreements += 1;
  row.agreedAmount += consultation.agreedAmount;
}

function mergeOrderedNames(fixedNames: string[], dataNames: string[]) {
  const names: string[] = [];
  const seen = new Set<string>();

  [...fixedNames, ...dataNames].forEach((name) => {
    const normalizedName = name.trim() || "-";

    if (!seen.has(normalizedName)) {
      seen.add(normalizedName);
      names.push(normalizedName);
    }
  });

  return names;
}

function patientTypeDisplayName(patientType: Consultation["patientType"], patientTypeOptions: string[]) {
  const returningLabel = patientTypeOptions.find((option) => option.includes("구환")) ?? patientTypeOptions[1] ?? "구환";
  const newLabel = patientTypeOptions.find((option) => option.includes("신환")) ?? patientTypeOptions[0] ?? "신환";

  return patientType === "returning" ? returningLabel : newLabel;
}

function calculateMetrics(consultations: Consultation[]): Metrics {
  return consultations.reduce(
    (metrics, consultation) => {
      const agreement = isAgreement(consultation);
      const isNewPatient = consultation.patientType === "new";

      metrics.consultations += 1;
      metrics.agreements += agreement ? 1 : 0;
      metrics.consultationAmount += consultation.consultationAmount;
      metrics.agreedAmount += consultation.agreedAmount;

      if (isNewPatient) {
        metrics.newConsultations += 1;
        metrics.newAgreements += agreement ? 1 : 0;
        metrics.newConsultationAmount += consultation.consultationAmount;
        metrics.newAgreedAmount += consultation.agreedAmount;
      } else {
        metrics.returningConsultations += 1;
        metrics.returningAgreements += agreement ? 1 : 0;
        metrics.returningConsultationAmount += consultation.consultationAmount;
        metrics.returningAgreedAmount += consultation.agreedAmount;
      }

      return metrics;
    },
    {
      consultations: 0,
      agreements: 0,
      newConsultations: 0,
      newAgreements: 0,
      returningConsultations: 0,
      returningAgreements: 0,
      consultationAmount: 0,
      agreedAmount: 0,
      newConsultationAmount: 0,
      newAgreedAmount: 0,
      returningConsultationAmount: 0,
      returningAgreedAmount: 0,
    },
  );
}

function sortRowsByFixedOrder(rows: ReportRow[], fixedNames: string[]) {
  const fixedOrder = new Map(fixedNames.map((name, index) => [name, index]));

  return rows.toSorted((first, second) => {
    const firstOrder = fixedOrder.get(first.name);
    const secondOrder = fixedOrder.get(second.name);

    if (firstOrder !== undefined || secondOrder !== undefined) {
      return (firstOrder ?? Number.MAX_SAFE_INTEGER) - (secondOrder ?? Number.MAX_SAFE_INTEGER);
    }

    if (second.consultations !== first.consultations) {
      return second.consultations - first.consultations;
    }

    return second.agreedAmount - first.agreedAmount;
  });
}

function buildGroupedRows(
  consultations: Consultation[],
  getName: (consultation: Consultation) => string,
  fixedNames: string[] = [],
) {
  const rows = new Map<string, ReportRow>(
    fixedNames.map((name) => [name, createEmptyRow(name)]),
  );

  consultations.forEach((consultation) => {
    const name = getName(consultation) || "-";
    const row = rows.get(name) ?? createEmptyRow(name);

    addConsultationToRow(row, consultation);
    rows.set(name, row);
  });

  return sortRowsByFixedOrder([...rows.values()], fixedNames);
}

function buildAverageRows(
  consultations: Consultation[],
  getName: (consultation: Consultation) => string,
  fixedNames: string[] = [],
) {
  const rows = new Map<string, ReportRow>(
    fixedNames.map((name) => [name, createEmptyRow(name)]),
  );

  consultations.forEach((consultation) => {
    const name = getName(consultation) || "-";
    const row = rows.get(name) ?? createEmptyRow(name);

    addAgreementToRow(row, consultation);
    rows.set(name, row);
  });

  return sortRowsByFixedOrder([...rows.values()], fixedNames);
}

function buildAmountBandRows(consultations: Consultation[]) {
  const rows = amountBands.map((band) => createEmptyRow(band.name));

  consultations.forEach((consultation) => {
    const targetRow = rows.find((row, index) => amountBands[index].matches(consultation.consultationAmount));

    if (targetRow) {
      addConsultationToRow(targetRow, consultation);
    }
  });

  return rows;
}

function buildStaffDoctorMatrix(
  consultations: Consultation[],
  fixedCounselors: string[],
  fixedDoctors: string[],
): StaffDoctorMatrix {
  const counselors = mergeOrderedNames(
    fixedCounselors,
    consultations.map((consultation) => consultation.counselor || "-"),
  );
  const doctors = mergeOrderedNames(
    fixedDoctors,
    consultations.map((consultation) => consultation.doctor || "-"),
  );
  const cells = new Map<string, Map<string, ReportRow>>();
  const rowTotals = new Map<string, ReportRow>();
  const columnTotals = new Map<string, ReportRow>();
  const total = createEmptyRow("총 합계");

  counselors.forEach((counselor) => {
    rowTotals.set(counselor, createEmptyRow(counselor));
    cells.set(
      counselor,
      new Map(doctors.map((doctor) => [doctor, createEmptyRow(`${counselor} / ${doctor}`)])),
    );
  });
  doctors.forEach((doctor) => {
    columnTotals.set(doctor, createEmptyRow(doctor));
  });

  consultations.forEach((consultation) => {
    const counselor = consultation.counselor || "-";
    const doctor = consultation.doctor || "-";
    const row = cells.get(counselor)?.get(doctor);
    const rowTotal = rowTotals.get(counselor);
    const columnTotal = columnTotals.get(doctor);

    if (row && rowTotal && columnTotal) {
      addConsultationToRow(row, consultation);
      addConsultationToRow(rowTotal, consultation);
      addConsultationToRow(columnTotal, consultation);
      addConsultationToRow(total, consultation);
    }
  });

  return {
    counselors,
    doctors,
    cells,
    rowTotals,
    columnTotals,
    total,
  };
}

function buildAverageStaffDoctorMatrix(
  consultations: Consultation[],
  fixedCounselors: string[],
  fixedDoctors: string[],
): StaffDoctorMatrix {
  const counselors = mergeOrderedNames(
    fixedCounselors,
    consultations.map((consultation) => consultation.counselor || "-"),
  );
  const doctors = mergeOrderedNames(
    fixedDoctors,
    consultations.map((consultation) => consultation.doctor || "-"),
  );
  const cells = new Map<string, Map<string, ReportRow>>();
  const rowTotals = new Map<string, ReportRow>();
  const columnTotals = new Map<string, ReportRow>();
  const total = createEmptyRow("총 합계");

  counselors.forEach((counselor) => {
    rowTotals.set(counselor, createEmptyRow(counselor));
    cells.set(
      counselor,
      new Map(doctors.map((doctor) => [doctor, createEmptyRow(`${counselor} / ${doctor}`)])),
    );
  });
  doctors.forEach((doctor) => {
    columnTotals.set(doctor, createEmptyRow(doctor));
  });

  consultations.forEach((consultation) => {
    const counselor = consultation.counselor || "-";
    const doctor = consultation.doctor || "-";
    const row = cells.get(counselor)?.get(doctor);
    const rowTotal = rowTotals.get(counselor);
    const columnTotal = columnTotals.get(doctor);

    if (row && rowTotal && columnTotal) {
      addAgreementToRow(row, consultation);
      addAgreementToRow(rowTotal, consultation);
      addAgreementToRow(columnTotal, consultation);
      addAgreementToRow(total, consultation);
    }
  });

  return {
    counselors,
    doctors,
    cells,
    rowTotals,
    columnTotals,
    total,
  };
}

function KpiCard({
  label,
  value,
  helper,
  tone,
  highlightValue = false,
}: {
  label: string;
  value: string;
  helper?: string;
  tone: MetricTone;
  highlightValue?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-mist bg-white shadow-card">
      <div className={`px-4 py-3 text-center text-sm font-bold ${metricToneClasses[tone]}`}>
        {label}
      </div>
      <div className="grid min-h-28 place-items-center px-4 py-4 text-center">
        <div>
          <p className={`metric-number text-xl font-bold 2xl:text-2xl ${highlightValue ? "kpi-highlight" : "text-ink"}`}>
            {value}
          </p>
          {helper ? (
            <p className="metric-number mt-3 text-sm font-bold text-[#d01818]">{helper}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function KpiGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold text-slate">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{children}</div>
    </section>
  );
}

function ReportCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="crm-card overflow-hidden">
      <div className="border-b border-mist px-4 py-3">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10 text-center text-sm font-bold text-slate">
        표시할 데이터가 없습니다.
      </td>
    </tr>
  );
}

function FullSummaryTable({
  title,
  rows,
  consultationAmountLabel = "총 상담금액",
  highlightConsultationAmount = false,
  highlightTotalRow = false,
}: {
  title: string;
  rows: ReportRow[];
  consultationAmountLabel?: string;
  highlightConsultationAmount?: boolean;
  highlightTotalRow?: boolean;
}) {
  const totalRow = rows.reduce(
    (total, row) => ({
      ...total,
      consultations: total.consultations + row.consultations,
      agreements: total.agreements + row.agreements,
      consultationAmount: total.consultationAmount + row.consultationAmount,
      agreedAmount: total.agreedAmount + row.agreedAmount,
      consultedTeeth: total.consultedTeeth + row.consultedTeeth,
      agreedTeeth: total.agreedTeeth + row.agreedTeeth,
    }),
    createEmptyRow("합계"),
  );

  return (
    <ReportCard title={title}>
      <table className="crm-table">
        <thead>
          <tr>
            <th>구분</th>
            <th>상담건수</th>
            <th>동의건수</th>
            <th>상담동의율</th>
            <th>비율</th>
            <th>{consultationAmountLabel}</th>
            <th>동의금액</th>
            <th>동의금액/상담금액</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="font-bold">{row.name}</td>
              <td className="metric-number">{formatNumber(row.consultations)}</td>
              <td className="metric-number">{formatNumber(row.agreements)}</td>
              <td className={kpiHighlightClass}>
                {formatPercent(consentRate(row.agreements, row.consultations))}
              </td>
              <td className="metric-number">
                {formatPercent(safeRate(row.consultations, totalRow.consultations))}
              </td>
              <td className={highlightConsultationAmount ? kpiStrongHighlightClass : "metric-number"}>
                {formatCurrency(row.consultationAmount)}
              </td>
              <td className="metric-number font-bold">{formatCurrency(row.agreedAmount)}</td>
              <td className="metric-number font-bold text-[#d01818]">
                {formatPercent(safeRate(row.agreedAmount, row.consultationAmount))}
              </td>
            </tr>
          ))}
          <tr>
            <td className={highlightTotalRow ? kpiLabelStrongHighlightClass : "font-bold"}>합계</td>
            <td className={highlightTotalRow ? kpiStrongHighlightClass : "metric-number font-bold"}>
              {formatNumber(totalRow.consultations)}
            </td>
            <td className={highlightTotalRow ? kpiStrongHighlightClass : "metric-number font-bold"}>
              {formatNumber(totalRow.agreements)}
            </td>
            <td className={highlightTotalRow ? kpiStrongHighlightClass : kpiHighlightClass}>
              {formatPercent(consentRate(totalRow.agreements, totalRow.consultations))}
            </td>
            <td className={highlightTotalRow ? kpiStrongHighlightClass : "metric-number font-bold"}>
              {totalRow.consultations > 0 ? "100%" : "0%"}
            </td>
            <td className={highlightConsultationAmount || highlightTotalRow ? kpiStrongHighlightClass : "metric-number font-bold"}>
              {formatCurrency(totalRow.consultationAmount)}
            </td>
            <td className={highlightTotalRow ? kpiStrongHighlightClass : "metric-number font-bold"}>
              {formatCurrency(totalRow.agreedAmount)}
            </td>
            <td className={highlightTotalRow ? kpiStrongHighlightClass : "metric-number font-bold text-[#d01818]"}>
              {formatPercent(safeRate(totalRow.agreedAmount, totalRow.consultationAmount))}
            </td>
          </tr>
        </tbody>
      </table>
    </ReportCard>
  );
}

function AmountBandTable({ rows }: { rows: ReportRow[] }) {
  return (
    <FullSummaryTable
      title="금액대별 상담건수 및 동의건수"
      rows={rows}
      highlightConsultationAmount
    />
  );
}

function TeethTable({ rows }: { rows: ReportRow[] }) {
  return (
    <ReportCard title="진료분류별 상담/동의 치아개수">
      <table className="crm-table">
        <thead>
          <tr>
            <th>구분</th>
            <th>상담치아수</th>
            <th>동의치아수</th>
            <th>상담 동의율</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="font-bold">{row.name}</td>
              <td className="metric-number">{formatNumber(row.consultedTeeth)}</td>
              <td className="metric-number">{formatNumber(row.agreedTeeth)}</td>
              <td className={kpiHighlightClass}>
                {formatPercent(safeRate(row.agreedTeeth, row.consultedTeeth))}
              </td>
            </tr>
          ))}
          {rows.length === 0 ? <EmptyRow colSpan={4} /> : null}
        </tbody>
      </table>
    </ReportCard>
  );
}

const matrixSubRowStyle = { background: "#fff3cf" };
const matrixTotalRowStyle = { background: "#eef5ff" };
const kpiHighlightClass = "metric-number kpi-highlight";
const kpiStrongHighlightClass = "metric-number kpi-highlight-strong";
const kpiLabelStrongHighlightClass = "kpi-highlight-strong font-bold";

function getMatrixCell(matrix: StaffDoctorMatrix, counselor: string, doctor: string) {
  return matrix.cells.get(counselor)?.get(doctor) ?? createEmptyRow(`${counselor} / ${doctor}`);
}

function formatMatrixRate(numerator: number, denominator: number) {
  if (denominator === 0) {
    return "-";
  }

  return formatPercent(numerator / denominator);
}

function formatCaseCount(value: number) {
  return `${formatNumber(value)}건`;
}

function StaffAmountTable({ matrix }: { matrix: StaffDoctorMatrix }) {
  return (
    <ReportCard title="상담사 및 원장님별 상담/동의 수납금액 요약">
      <table className="crm-table">
        <thead>
          <tr>
            <th colSpan={2}>구분</th>
            {matrix.doctors.map((doctor) => (
              <th key={doctor}>{doctor}</th>
            ))}
            <th>총금액</th>
            <th>해당금액/총수주금액</th>
          </tr>
        </thead>
        <tbody>
          {matrix.counselors.map((counselor) => {
            const rowTotal = matrix.rowTotals.get(counselor) ?? createEmptyRow(counselor);

            return (
              <Fragment key={`${counselor}-amount-rows`}>
                <tr key={`${counselor}-consultation-amount`}>
                  <td rowSpan={2} className="font-bold">
                    {counselor}
                  </td>
                  <td className="font-bold">총상담금액</td>
                  {matrix.doctors.map((doctor) => (
                    <td key={`${counselor}-${doctor}-consultation-amount`} className="metric-number font-bold">
                      {formatCurrency(getMatrixCell(matrix, counselor, doctor).consultationAmount)}
                    </td>
                  ))}
                  <td className={kpiStrongHighlightClass}>
                    {formatCurrency(rowTotal.consultationAmount)}
                  </td>
                  <td rowSpan={2} className="metric-number font-bold">
                    {formatMatrixRate(rowTotal.agreedAmount, rowTotal.consultationAmount)}
                  </td>
                </tr>
                <tr key={`${counselor}-agreed-amount`}>
                  <td className="font-bold" style={matrixSubRowStyle}>
                    동의금액
                  </td>
                  {matrix.doctors.map((doctor) => (
                    <td
                      key={`${counselor}-${doctor}-agreed-amount`}
                      className="metric-number"
                      style={matrixSubRowStyle}
                    >
                      {formatCurrency(getMatrixCell(matrix, counselor, doctor).agreedAmount)}
                    </td>
                  ))}
                  <td className="metric-number font-bold" style={matrixSubRowStyle}>
                    {formatCurrency(rowTotal.agreedAmount)}
                  </td>
                </tr>
              </Fragment>
            );
          })}
          {matrix.counselors.length === 0 ? <EmptyRow colSpan={matrix.doctors.length + 4} /> : null}
          <tr>
            <td rowSpan={2} className="font-bold" style={matrixTotalRowStyle}>
              총 합계
            </td>
            <td className={kpiLabelStrongHighlightClass} style={matrixTotalRowStyle}>
              총상담금액
            </td>
            {matrix.doctors.map((doctor) => {
              const columnTotal = matrix.columnTotals.get(doctor) ?? createEmptyRow(doctor);

              return (
                <td
                  key={`${doctor}-total-consultation-amount`}
                  className={kpiStrongHighlightClass}
                  style={matrixTotalRowStyle}
                >
                  {formatCurrency(columnTotal.consultationAmount)}
                </td>
              );
            })}
            <td className={kpiStrongHighlightClass} style={matrixTotalRowStyle}>
              {formatCurrency(matrix.total.consultationAmount)}
            </td>
            <td rowSpan={2} className="metric-number font-bold" style={matrixTotalRowStyle}>
              {formatMatrixRate(matrix.total.agreedAmount, matrix.total.consultationAmount)}
            </td>
          </tr>
          <tr>
            <td className="font-bold" style={matrixTotalRowStyle}>
              동의금액
            </td>
            {matrix.doctors.map((doctor) => {
              const columnTotal = matrix.columnTotals.get(doctor) ?? createEmptyRow(doctor);

              return (
                <td
                  key={`${doctor}-total-agreed-amount`}
                  className="metric-number font-bold"
                  style={matrixTotalRowStyle}
                >
                  {formatCurrency(columnTotal.agreedAmount)}
                </td>
              );
            })}
            <td className="metric-number font-bold" style={matrixTotalRowStyle}>
              {formatCurrency(matrix.total.agreedAmount)}
            </td>
          </tr>
        </tbody>
      </table>
    </ReportCard>
  );
}

function StaffCountTable({ matrix }: { matrix: StaffDoctorMatrix }) {
  return (
    <ReportCard title="상담사 및 원장님별 상담/동의 건수 및 동의율">
      <table className="crm-table">
        <thead>
          <tr>
            <th colSpan={2}>구분</th>
            {matrix.doctors.map((doctor) => (
              <th key={doctor}>{doctor}</th>
            ))}
            <th>총합계</th>
          </tr>
        </thead>
        <tbody>
          {matrix.counselors.map((counselor) => {
            const rowTotal = matrix.rowTotals.get(counselor) ?? createEmptyRow(counselor);

            return (
              <Fragment key={`${counselor}-count-rows`}>
                <tr key={`${counselor}-consultation-count`}>
                  <td rowSpan={3} className="font-bold">
                    {counselor}
                  </td>
                  <td className="font-bold">총상담건수</td>
                  {matrix.doctors.map((doctor) => (
                    <td key={`${counselor}-${doctor}-consultation-count`} className="metric-number font-bold">
                      {formatCaseCount(getMatrixCell(matrix, counselor, doctor).consultations)}
                    </td>
                  ))}
                  <td className={kpiStrongHighlightClass}>
                    {formatNumber(rowTotal.consultations)}
                  </td>
                </tr>
                <tr key={`${counselor}-agreement-count`}>
                  <td className="font-bold" style={matrixSubRowStyle}>
                    동의건수
                  </td>
                  {matrix.doctors.map((doctor) => (
                    <td
                      key={`${counselor}-${doctor}-agreement-count`}
                      className="metric-number"
                      style={matrixSubRowStyle}
                    >
                      {formatCaseCount(getMatrixCell(matrix, counselor, doctor).agreements)}
                    </td>
                  ))}
                  <td className="metric-number font-bold" style={matrixSubRowStyle}>
                    {formatNumber(rowTotal.agreements)}
                  </td>
                </tr>
                <tr key={`${counselor}-consent-rate`}>
                  <td className="font-bold" style={matrixSubRowStyle}>
                    동의율
                  </td>
                  {matrix.doctors.map((doctor) => {
                    const cell = getMatrixCell(matrix, counselor, doctor);

                    return (
                      <td
                        key={`${counselor}-${doctor}-consent-rate`}
                        className="metric-number font-bold"
                        style={matrixSubRowStyle}
                      >
                        {formatMatrixRate(cell.agreements, cell.consultations)}
                      </td>
                    );
                  })}
                  <td className="metric-number font-bold" style={matrixSubRowStyle}>
                    {formatMatrixRate(rowTotal.agreements, rowTotal.consultations)}
                  </td>
                </tr>
              </Fragment>
            );
          })}
          {matrix.counselors.length === 0 ? <EmptyRow colSpan={matrix.doctors.length + 3} /> : null}
          <tr>
            <td rowSpan={3} className="font-bold" style={matrixTotalRowStyle}>
              총 합계
            </td>
            <td className={kpiLabelStrongHighlightClass} style={matrixTotalRowStyle}>
              총상담건수
            </td>
            {matrix.doctors.map((doctor) => {
              const columnTotal = matrix.columnTotals.get(doctor) ?? createEmptyRow(doctor);

              return (
                <td
                  key={`${doctor}-total-consultation-count`}
                  className={kpiStrongHighlightClass}
                  style={matrixTotalRowStyle}
                >
                  {formatCaseCount(columnTotal.consultations)}
                </td>
              );
            })}
            <td className={kpiStrongHighlightClass} style={matrixTotalRowStyle}>
              {formatNumber(matrix.total.consultations)}
            </td>
          </tr>
          <tr>
            <td className="font-bold" style={matrixTotalRowStyle}>
              동의건수
            </td>
            {matrix.doctors.map((doctor) => {
              const columnTotal = matrix.columnTotals.get(doctor) ?? createEmptyRow(doctor);

              return (
                <td
                  key={`${doctor}-total-agreement-count`}
                  className="metric-number font-bold"
                  style={matrixTotalRowStyle}
                >
                  {formatCaseCount(columnTotal.agreements)}
                </td>
              );
            })}
            <td className="metric-number font-bold" style={matrixTotalRowStyle}>
              {formatNumber(matrix.total.agreements)}
            </td>
          </tr>
          <tr>
            <td className="font-bold" style={matrixTotalRowStyle}>
              동의율
            </td>
            {matrix.doctors.map((doctor) => {
              const columnTotal = matrix.columnTotals.get(doctor) ?? createEmptyRow(doctor);

              return (
                <td
                  key={`${doctor}-total-consent-rate`}
                  className="metric-number font-bold"
                  style={matrixTotalRowStyle}
                >
                  {formatMatrixRate(columnTotal.agreements, columnTotal.consultations)}
                </td>
              );
            })}
            <td className="metric-number font-bold" style={matrixTotalRowStyle}>
              {formatMatrixRate(matrix.total.agreements, matrix.total.consultations)}
            </td>
          </tr>
        </tbody>
      </table>
    </ReportCard>
  );
}

function formatAverageValue(agreedAmount: number, agreements: number) {
  if (agreements === 0) {
    return "-";
  }

  return formatCurrency(agreedAmount / agreements);
}

function AverageSummaryTable({ title, rows }: { title: string; rows: ReportRow[] }) {
  const totalRow = rows.reduce(
    (total, row) => ({
      ...total,
      agreements: total.agreements + row.agreements,
      agreedAmount: total.agreedAmount + row.agreedAmount,
    }),
    createEmptyRow("합계"),
  );

  return (
    <ReportCard title={title}>
      <table className="crm-table">
        <thead>
          <tr>
            <th>구분</th>
            <th>동의금액</th>
            <th>동의건수</th>
            <th>객단가</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="font-bold">{row.name}</td>
              <td className="metric-number font-bold">{formatCurrency(row.agreedAmount)}</td>
              <td className="metric-number">{formatCaseCount(row.agreements)}</td>
              <td className={kpiHighlightClass}>{formatAverageValue(row.agreedAmount, row.agreements)}</td>
            </tr>
          ))}
          <tr>
            <td className="font-bold">합계</td>
            <td className="metric-number font-bold">{formatCurrency(totalRow.agreedAmount)}</td>
            <td className="metric-number font-bold">{formatCaseCount(totalRow.agreements)}</td>
            <td className={kpiStrongHighlightClass}>
              {formatAverageValue(totalRow.agreedAmount, totalRow.agreements)}
            </td>
          </tr>
        </tbody>
      </table>
    </ReportCard>
  );
}

function StaffAverageTable({ matrix }: { matrix: StaffDoctorMatrix }) {
  return (
    <ReportCard title="상담사 및 원장님별 동의금액/객단가">
      <table className="crm-table">
        <thead>
          <tr>
            <th colSpan={2}>구분</th>
            {matrix.doctors.map((doctor) => (
              <th key={doctor}>{doctor}</th>
            ))}
            <th>총합계</th>
          </tr>
        </thead>
        <tbody>
          {matrix.counselors.map((counselor) => {
            const rowTotal = matrix.rowTotals.get(counselor) ?? createEmptyRow(counselor);

            return (
              <Fragment key={`${counselor}-average-rows`}>
                <tr key={`${counselor}-average`}>
                  <td rowSpan={3} className="font-bold">
                    {counselor}
                  </td>
                  <td className={kpiLabelStrongHighlightClass} style={matrixSubRowStyle}>
                    객단가
                  </td>
                  {matrix.doctors.map((doctor) => {
                    const cell = getMatrixCell(matrix, counselor, doctor);

                    return (
                      <td
                        key={`${counselor}-${doctor}-average`}
                        className={kpiHighlightClass}
                        style={matrixSubRowStyle}
                      >
                        {formatAverageValue(cell.agreedAmount, cell.agreements)}
                      </td>
                    );
                  })}
                  <td className={kpiStrongHighlightClass} style={matrixSubRowStyle}>
                    {formatAverageValue(rowTotal.agreedAmount, rowTotal.agreements)}
                  </td>
                </tr>
                <tr key={`${counselor}-average-agreed-amount`}>
                  <td className="font-bold">동의금액</td>
                  {matrix.doctors.map((doctor) => (
                    <td key={`${counselor}-${doctor}-average-agreed-amount`} className="metric-number">
                      {formatCurrency(getMatrixCell(matrix, counselor, doctor).agreedAmount)}
                    </td>
                  ))}
                  <td className="metric-number font-bold">{formatCurrency(rowTotal.agreedAmount)}</td>
                </tr>
                <tr key={`${counselor}-average-agreement-count`}>
                  <td className="font-bold">동의건수</td>
                  {matrix.doctors.map((doctor) => (
                    <td key={`${counselor}-${doctor}-average-agreement-count`} className="metric-number">
                      {formatCaseCount(getMatrixCell(matrix, counselor, doctor).agreements)}
                    </td>
                  ))}
                  <td className="metric-number font-bold">{formatCaseCount(rowTotal.agreements)}</td>
                </tr>
              </Fragment>
            );
          })}
          {matrix.counselors.length === 0 ? <EmptyRow colSpan={matrix.doctors.length + 3} /> : null}
          <tr>
            <td rowSpan={3} className="font-bold" style={matrixTotalRowStyle}>
              총 합계
            </td>
            <td className={kpiLabelStrongHighlightClass} style={matrixTotalRowStyle}>
              객단가
            </td>
            {matrix.doctors.map((doctor) => {
              const columnTotal = matrix.columnTotals.get(doctor) ?? createEmptyRow(doctor);

              return (
                <td
                  key={`${doctor}-average-total`}
                  className={kpiStrongHighlightClass}
                  style={matrixTotalRowStyle}
                >
                  {formatAverageValue(columnTotal.agreedAmount, columnTotal.agreements)}
                </td>
              );
            })}
            <td className={kpiStrongHighlightClass} style={matrixTotalRowStyle}>
              {formatAverageValue(matrix.total.agreedAmount, matrix.total.agreements)}
            </td>
          </tr>
          <tr>
            <td className="font-bold" style={matrixTotalRowStyle}>
              동의금액
            </td>
            {matrix.doctors.map((doctor) => {
              const columnTotal = matrix.columnTotals.get(doctor) ?? createEmptyRow(doctor);

              return (
                <td
                  key={`${doctor}-average-total-agreed-amount`}
                  className="metric-number font-bold"
                  style={matrixTotalRowStyle}
                >
                  {formatCurrency(columnTotal.agreedAmount)}
                </td>
              );
            })}
            <td className="metric-number font-bold" style={matrixTotalRowStyle}>
              {formatCurrency(matrix.total.agreedAmount)}
            </td>
          </tr>
          <tr>
            <td className="font-bold" style={matrixTotalRowStyle}>
              동의건수
            </td>
            {matrix.doctors.map((doctor) => {
              const columnTotal = matrix.columnTotals.get(doctor) ?? createEmptyRow(doctor);

              return (
                <td
                  key={`${doctor}-average-total-agreement-count`}
                  className="metric-number font-bold"
                  style={matrixTotalRowStyle}
                >
                  {formatCaseCount(columnTotal.agreements)}
                </td>
              );
            })}
            <td className="metric-number font-bold" style={matrixTotalRowStyle}>
              {formatCaseCount(matrix.total.agreements)}
            </td>
          </tr>
        </tbody>
      </table>
    </ReportCard>
  );
}

export function ReportsWorkspace() {
  const { activeClinic, enabledOptions } = useAdminSettings();
  const { consultations } = useConsultations({ clinicId: activeClinic.id });
  const initialPeriod = useMemo(() => getInitialPeriod(), []);
  const [reportMode, setReportMode] = useState<ReportMode>("consultation");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [selectedYear, setSelectedYear] = useState(initialPeriod.year);
  const [selectedMonth, setSelectedMonth] = useState(initialPeriod.month);
  const yearOptions = useMemo(() => {
    const years = consultations
      .map((consultation) => getDateParts(consultation.date).year)
      .filter((year) => Number.isFinite(year));

    return [...new Set([initialPeriod.year, ...years])].toSorted((first, second) => second - first);
  }, [consultations, initialPeriod.year]);
  const filteredConsultations = useMemo(
    () => filterConsultationsByPeriod(consultations, periodMode, selectedYear, selectedMonth),
    [consultations, periodMode, selectedMonth, selectedYear],
  );
  const periodLabel = periodMode === "year" ? `${selectedYear}년` : `${selectedYear}년 ${selectedMonth}월`;
  const metrics = useMemo(() => calculateMetrics(filteredConsultations), [filteredConsultations]);
  const amountBandRows = useMemo(() => buildAmountBandRows(filteredConsultations), [filteredConsultations]);
  const treatmentRows = useMemo(
    () =>
      buildGroupedRows(
        filteredConsultations,
        (consultation) => consultation.treatmentCategory,
        enabledOptions.treatmentCategories,
      ),
    [enabledOptions.treatmentCategories, filteredConsultations],
  );
  const channelRows = useMemo(
    () =>
      buildGroupedRows(
        filteredConsultations,
        (consultation) => consultation.visitChannel || "-",
        enabledOptions.visitChannels,
      ),
    [enabledOptions.visitChannels, filteredConsultations],
  );
  const counselorRows = useMemo(
    () =>
      buildGroupedRows(
        filteredConsultations,
        (consultation) => consultation.counselor,
        enabledOptions.counselors,
      ),
    [enabledOptions.counselors, filteredConsultations],
  );
  const staffDoctorMatrix = useMemo(
    () => buildStaffDoctorMatrix(filteredConsultations, enabledOptions.counselors, enabledOptions.doctors),
    [enabledOptions.counselors, enabledOptions.doctors, filteredConsultations],
  );
  const patientTypeAverageRows = useMemo(
    () =>
      buildAverageRows(
        filteredConsultations,
        (consultation) => patientTypeDisplayName(consultation.patientType, enabledOptions.patientTypes),
        enabledOptions.patientTypes,
      ),
    [enabledOptions.patientTypes, filteredConsultations],
  );
  const treatmentAverageRows = useMemo(
    () =>
      buildAverageRows(
        filteredConsultations,
        (consultation) => consultation.treatmentCategory,
        enabledOptions.treatmentCategories,
      ),
    [enabledOptions.treatmentCategories, filteredConsultations],
  );
  const channelAverageRows = useMemo(
    () =>
      buildAverageRows(
        filteredConsultations,
        (consultation) => consultation.visitChannel || "-",
        enabledOptions.visitChannels,
      ),
    [enabledOptions.visitChannels, filteredConsultations],
  );
  const staffDoctorAverageMatrix = useMemo(
    () => buildAverageStaffDoctorMatrix(filteredConsultations, enabledOptions.counselors, enabledOptions.doctors),
    [enabledOptions.counselors, enabledOptions.doctors, filteredConsultations],
  );
  const overallConsentRate = safeRate(metrics.agreements, metrics.consultations);
  const newConsentRate = safeRate(metrics.newAgreements, metrics.newConsultations);
  const returningConsentRate = safeRate(metrics.returningAgreements, metrics.returningConsultations);
  const overallAmountRate = safeRate(metrics.agreedAmount, metrics.consultationAmount);
  const newAmountRate = safeRate(metrics.newAgreedAmount, metrics.newConsultationAmount);
  const returningAmountRate = safeRate(metrics.returningAgreedAmount, metrics.returningConsultationAmount);
  const overallAverageAmount = formatAverageValue(metrics.agreedAmount, metrics.agreements);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold text-monday-violet">리포트</p>
          <h1 className="mt-1 text-3xl font-light text-ink">KPI 요약 보고서</h1>
          <p className="mt-1 text-sm text-slate">
            상담일지 데이터를 기준으로 핵심 KPI와 상세 분석 리포트를 확인합니다.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <div className="flex w-fit max-w-full flex-wrap items-center gap-2 rounded-[24px] border border-mist bg-white p-2">
            <span className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-pebble bg-white px-3 text-sm font-bold text-slate">
              <Filter className="h-4 w-4" aria-hidden />
              기간
            </span>
            {[
              { value: "year", label: "연도별" },
              { value: "month", label: "월별" },
            ].map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => setPeriodMode(mode.value as PeriodMode)}
                className={[
                  "h-10 rounded-full px-4 text-sm font-bold transition",
                  periodMode === mode.value
                    ? "bg-monday-violet text-white shadow-[rgba(97,97,255,0.18)_0_8px_18px]"
                    : "text-slate hover:bg-cloud hover:text-ink",
                ].join(" ")}
              >
                {mode.label}
              </button>
            ))}
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
            {periodMode === "month" ? (
              <select
                aria-label="월 선택"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(Number(event.target.value))}
                className={`${filterInputClass} min-w-24`}
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                  <option key={month} value={month}>
                    {month}월
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="flex w-fit max-w-full flex-wrap gap-2 rounded-[24px] border border-mist bg-white p-2">
            {analysisTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setReportMode(tab.value)}
                className={[
                  "rounded-full px-4 py-2 text-sm font-bold transition",
                  reportMode === tab.value
                    ? "bg-monday-violet text-white shadow-[rgba(97,97,255,0.18)_0_8px_18px]"
                    : "text-slate hover:bg-cloud hover:text-ink",
                ].join(" ")}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-mist bg-white px-4 py-3 text-sm font-bold text-slate">
        {periodLabel} 기준 {formatNumber(filteredConsultations.length)}건의 상담 데이터를 집계하고 있습니다.
      </section>

      {reportMode === "average" ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-slate">객단가 분석</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard label="전체 동의금액" value={formatNumber(metrics.agreedAmount)} tone="total" />
            <KpiCard label="전체 동의건수" value={formatNumber(metrics.agreements)} tone="total" />
            <KpiCard label="전체 객단가" value={overallAverageAmount} tone="total" highlightValue />
          </div>
        </section>
      ) : (
        <section className="space-y-6">
          <KpiGroup title="상담 및 동의 건수">
            <KpiCard label="전체 상담건수" value={formatNumber(metrics.consultations)} tone="total" />
            <KpiCard
              label="전체 동의건수"
              value={formatNumber(metrics.agreements)}
              helper={formatKpiRate(overallConsentRate)}
              tone="total"
            />
            <KpiCard label="신환 상담건수" value={formatNumber(metrics.newConsultations)} tone="new" />
            <KpiCard
              label="신환 동의건수"
              value={formatNumber(metrics.newAgreements)}
              helper={formatKpiRate(newConsentRate)}
              tone="new"
            />
            <KpiCard label="구환 상담건수" value={formatNumber(metrics.returningConsultations)} tone="returning" />
            <KpiCard
              label="구환 동의건수"
              value={formatNumber(metrics.returningAgreements)}
              helper={formatKpiRate(returningConsentRate)}
              tone="returning"
            />
          </KpiGroup>

          <KpiGroup title="상담 및 동의 금액">
            <KpiCard label="전체 상담금액" value={formatNumber(metrics.consultationAmount)} tone="total" />
            <KpiCard
              label="전체 동의금액"
              value={formatNumber(metrics.agreedAmount)}
              helper={formatKpiRate(overallAmountRate)}
              tone="total"
            />
            <KpiCard label="신환 상담금액" value={formatNumber(metrics.newConsultationAmount)} tone="new" />
            <KpiCard
              label="신환 동의금액"
              value={formatNumber(metrics.newAgreedAmount)}
              helper={formatKpiRate(newAmountRate)}
              tone="new"
            />
            <KpiCard
              label="구환 상담금액"
              value={formatNumber(metrics.returningConsultationAmount)}
              tone="returning"
            />
            <KpiCard
              label="구환 동의금액"
              value={formatNumber(metrics.returningAgreedAmount)}
              helper={formatKpiRate(returningAmountRate)}
              tone="returning"
            />
          </KpiGroup>
        </section>
      )}

      {reportMode === "consultation" ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <AmountBandTable rows={amountBandRows} />
          <FullSummaryTable title="진료분류별 상담/동의건수 및 금액" rows={treatmentRows} />
          <TeethTable rows={treatmentRows} />
          <FullSummaryTable title="내원경로별 상담/동의건수" rows={channelRows} />
        </section>
      ) : reportMode === "staff" ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <FullSummaryTable
            title="상담자별 상담/동의건수"
            rows={counselorRows}
            consultationAmountLabel="상담금액"
            highlightTotalRow
          />
          <StaffAmountTable matrix={staffDoctorMatrix} />
          <section className="xl:col-span-2">
            <StaffCountTable matrix={staffDoctorMatrix} />
          </section>
        </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-3">
          <AverageSummaryTable title="환자구분별 동의금액/객단가" rows={patientTypeAverageRows} />
          <AverageSummaryTable title="진료분류별 동의금액/객단가" rows={treatmentAverageRows} />
          <AverageSummaryTable title="내원경로별 상담/동의건수" rows={channelAverageRows} />
          <section className="xl:col-span-3">
            <StaffAverageTable matrix={staffDoctorAverageMatrix} />
          </section>
        </section>
      )}
    </div>
  );
}
