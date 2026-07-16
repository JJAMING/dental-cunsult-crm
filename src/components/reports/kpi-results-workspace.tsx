"use client";

import { Filter } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { useAdminSettings } from "@/hooks/use-admin-settings";
import { useConsultations } from "@/hooks/use-consultations";
import {
  buildLossAnalysisRows,
  type LossAnalysisRow,
} from "@/lib/consultation-recommendations";
import {
  filterConsultationsByPeriod,
  formatConsultationDateLabel,
  getConsultationDateParts,
  getConsultationWeekOptions,
  getConsultationYearOptions,
  getInitialConsultationPeriod,
  type ConsultationPeriodMode,
} from "@/lib/consultation-filters";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { Consultation } from "@/types/domain";

type ResultMode = "performance" | "audience" | "loss";

type ResultRow = {
  name: string;
  consultations: number;
  agreements: number;
  sameDay: number;
  followUp: number;
  cancellations: number;
  declined: number;
};

type ResultMatrix = {
  rowNames: string[];
  columnNames: string[];
  cells: Map<string, Map<string, ResultRow>>;
  rowTotals: Map<string, ResultRow>;
  columnTotals: Map<string, ResultRow>;
  total: ResultRow;
};

const resultTabs: { value: ResultMode; label: string }[] = [
  { value: "performance", label: "상담/동의 성과" },
  { value: "audience", label: "유입/환자 분석" },
  { value: "loss", label: "손실/기회 분석" },
];

const filterInputClass =
  "h-10 shrink-0 rounded-md border border-pebble bg-white px-3 text-sm font-bold text-slate outline-none transition focus:border-monday-violet";

const emphasisMetricClass = "kpi-highlight metric-number font-bold";
const strongEmphasisMetricClass = "kpi-highlight-strong metric-number font-bold";

const monthLabels = Array.from({ length: 12 }, (_, index) => `${index + 1}월`);

function createEmptyRow(name: string): ResultRow {
  return {
    name,
    consultations: 0,
    agreements: 0,
    sameDay: 0,
    followUp: 0,
    cancellations: 0,
    declined: 0,
  };
}

function addConsultationToRow(row: ResultRow, consultation: Consultation) {
  row.consultations += 1;

  if (consultation.result === "same_day") {
    row.sameDay += 1;
    row.agreements += 1;
  }

  if (consultation.result === "follow_up") {
    row.followUp += 1;
    row.agreements += 1;
  }

  if (consultation.result === "cancelled") {
    row.cancellations += 1;
  }

  if (consultation.result === "declined") {
    row.declined += 1;
  }
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

function getDateMonthIndex(date: string) {
  const month = Number(date.split("-")[1]);

  return Number.isFinite(month) ? month - 1 : -1;
}

function formatRate(numerator: number, denominator: number) {
  if (denominator === 0) {
    return "-";
  }

  return formatPercent(numerator / denominator);
}

function formatCaseCount(value: number) {
  return `${formatNumber(value)}건`;
}

function patientTypeLabel(patientType: Consultation["patientType"], patientTypeOptions: string[]) {
  const returningLabel = patientTypeOptions.find((option) => option.includes("구환")) ?? patientTypeOptions[1] ?? "구환";
  const newLabel = patientTypeOptions.find((option) => option.includes("신환")) ?? patientTypeOptions[0] ?? "신환";

  return patientType === "returning" ? returningLabel : newLabel;
}

function isReferralChannel(visitChannel: string) {
  return visitChannel.includes("소개") || visitChannel.includes("지인");
}

function sortRowsByFixedOrder(rows: ResultRow[], fixedNames: string[]) {
  const fixedOrder = new Map(fixedNames.map((name, index) => [name, index]));

  return rows.toSorted((first, second) => {
    const firstOrder = fixedOrder.get(first.name);
    const secondOrder = fixedOrder.get(second.name);

    if (firstOrder !== undefined || secondOrder !== undefined) {
      return (firstOrder ?? Number.MAX_SAFE_INTEGER) - (secondOrder ?? Number.MAX_SAFE_INTEGER);
    }

    return second.consultations - first.consultations;
  });
}

function buildGroupedRows(
  consultations: Consultation[],
  getName: (consultation: Consultation) => string,
  fixedNames: string[] = [],
) {
  const rows = new Map<string, ResultRow>(
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

function buildMonthlyRows(consultations: Consultation[], visibleMonth?: number) {
  const rows = monthLabels.map((label) => createEmptyRow(label));

  consultations.forEach((consultation) => {
    const monthIndex = getDateMonthIndex(consultation.date);

    if (monthIndex >= 0 && monthIndex < rows.length) {
      addConsultationToRow(rows[monthIndex], consultation);
    }
  });

  return visibleMonth ? rows.slice(visibleMonth - 1, visibleMonth) : rows;
}

function buildMatrix(
  consultations: Consultation[],
  rowNames: string[],
  columnNames: string[],
  getRowName: (consultation: Consultation) => string,
  getColumnName: (consultation: Consultation) => string,
): ResultMatrix {
  const mergedRowNames = mergeOrderedNames(rowNames, consultations.map(getRowName));
  const mergedColumnNames = mergeOrderedNames(columnNames, consultations.map(getColumnName));
  const cells = new Map<string, Map<string, ResultRow>>();
  const rowTotals = new Map<string, ResultRow>();
  const columnTotals = new Map<string, ResultRow>();
  const total = createEmptyRow("총 합계");

  mergedRowNames.forEach((rowName) => {
    rowTotals.set(rowName, createEmptyRow(rowName));
    cells.set(
      rowName,
      new Map(mergedColumnNames.map((columnName) => [columnName, createEmptyRow(`${rowName} / ${columnName}`)])),
    );
  });
  mergedColumnNames.forEach((columnName) => {
    columnTotals.set(columnName, createEmptyRow(columnName));
  });

  consultations.forEach((consultation) => {
    const rowName = getRowName(consultation) || "-";
    const columnName = getColumnName(consultation) || "-";
    const cell = cells.get(rowName)?.get(columnName);
    const rowTotal = rowTotals.get(rowName);
    const columnTotal = columnTotals.get(columnName);

    if (cell && rowTotal && columnTotal) {
      addConsultationToRow(cell, consultation);
      addConsultationToRow(rowTotal, consultation);
      addConsultationToRow(columnTotal, consultation);
      addConsultationToRow(total, consultation);
    }
  });

  return {
    rowNames: mergedRowNames,
    columnNames: mergedColumnNames,
    cells,
    rowTotals,
    columnTotals,
    total,
  };
}

function buildDisagreementRows(consultations: Consultation[], fixedNames: string[]) {
  const rows = new Map<string, ResultRow>(
    fixedNames.map((name) => [name, createEmptyRow(name)]),
  );

  consultations
    .filter((consultation) => consultation.result === "declined")
    .forEach((consultation) => {
      const name = consultation.disagreementReason || "선택 안함";
      const row = rows.get(name) ?? createEmptyRow(name);

      row.declined += 1;
      rows.set(name, row);
    });

  return sortRowsByFixedOrder([...rows.values()], fixedNames);
}

function buildDoctorReferralRows(consultations: Consultation[], doctorNames: string[]) {
  const rows = new Map<string, ResultRow>(
    doctorNames.map((name) => [name, createEmptyRow(name)]),
  );

  consultations
    .filter((consultation) => consultation.patientType === "new")
    .forEach((consultation) => {
      const name = consultation.doctor || "-";
      const row = rows.get(name) ?? createEmptyRow(name);

      row.consultations += 1;

      if (isReferralChannel(consultation.visitChannel)) {
        row.agreements += 1;
      }

      rows.set(name, row);
    });

  return sortRowsByFixedOrder([...rows.values()], doctorNames);
}

function totalRows(rows: ResultRow[]) {
  return rows.reduce(
    (total, row) => ({
      ...total,
      consultations: total.consultations + row.consultations,
      agreements: total.agreements + row.agreements,
      sameDay: total.sameDay + row.sameDay,
      followUp: total.followUp + row.followUp,
      cancellations: total.cancellations + row.cancellations,
      declined: total.declined + row.declined,
    }),
    createEmptyRow("합계"),
  );
}

function ReportCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="crm-card overflow-hidden">
      <div className="border-b border-mist px-4 py-3">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function MonthlyCancelTable({ rows }: { rows: ResultRow[] }) {
  const total = totalRows(rows);
  const totalGrossAgreements = total.agreements + total.cancellations;

  return (
    <ReportCard title="월별 동의건수 및 취소건수, 취소율">
      <table className="crm-table">
        <thead>
          <tr>
            <th>월</th>
            <th>상담건수</th>
            <th>순동의건수</th>
            <th>상담동의율</th>
            <th>취소 전 동의건수</th>
            <th>취소건수</th>
            <th>취소율</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const grossAgreements = row.agreements + row.cancellations;

            return (
              <tr key={row.name}>
                <td className="font-bold">{row.name}</td>
                <td className="metric-number">{formatCaseCount(row.consultations)}</td>
                <td className="metric-number">{formatCaseCount(row.agreements)}</td>
                <td className="metric-number">{formatRate(row.agreements, row.consultations)}</td>
                <td className="metric-number">{formatCaseCount(grossAgreements)}</td>
                <td className="metric-number">{formatCaseCount(row.cancellations)}</td>
                <td className={emphasisMetricClass}>
                  {formatRate(row.cancellations, grossAgreements)}
                </td>
              </tr>
            );
          })}
          <tr>
            <td className="font-bold">합계</td>
            <td className="metric-number font-bold">{formatCaseCount(total.consultations)}</td>
            <td className="metric-number font-bold">{formatCaseCount(total.agreements)}</td>
            <td className="metric-number font-bold">{formatRate(total.agreements, total.consultations)}</td>
            <td className="metric-number font-bold">{formatCaseCount(totalGrossAgreements)}</td>
            <td className="metric-number font-bold">{formatCaseCount(total.cancellations)}</td>
            <td className={strongEmphasisMetricClass}>
              {formatRate(total.cancellations, totalGrossAgreements)}
            </td>
          </tr>
        </tbody>
      </table>
    </ReportCard>
  );
}

function MonthlyAgreementTypeTable({ rows }: { rows: ResultRow[] }) {
  const total = totalRows(rows);

  return (
    <ReportCard title="월별 당일동의/추후동의건수 및 비율">
      <table className="crm-table">
        <thead>
          <tr>
            <th>월</th>
            <th>동의건수</th>
            <th>당일동의</th>
            <th>당일비율</th>
            <th>추후동의</th>
            <th>추후비율</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="font-bold">{row.name}</td>
              <td className="metric-number">{formatCaseCount(row.agreements)}</td>
              <td className="metric-number">{formatCaseCount(row.sameDay)}</td>
              <td className="metric-number">{formatRate(row.sameDay, row.agreements)}</td>
              <td className="metric-number">{formatCaseCount(row.followUp)}</td>
              <td className={emphasisMetricClass}>{formatRate(row.followUp, row.agreements)}</td>
            </tr>
          ))}
          <tr>
            <td className="font-bold">합계</td>
            <td className="metric-number font-bold">{formatCaseCount(total.agreements)}</td>
            <td className="metric-number font-bold">{formatCaseCount(total.sameDay)}</td>
            <td className="metric-number font-bold">{formatRate(total.sameDay, total.agreements)}</td>
            <td className="metric-number font-bold">{formatCaseCount(total.followUp)}</td>
            <td className={strongEmphasisMetricClass}>{formatRate(total.followUp, total.agreements)}</td>
          </tr>
        </tbody>
      </table>
    </ReportCard>
  );
}

function ConsultationAgreementTable({ title, rows }: { title: string; rows: ResultRow[] }) {
  const total = totalRows(rows);

  return (
    <ReportCard title={title}>
      <table className="crm-table">
        <thead>
          <tr>
            <th>구분</th>
            <th>상담건수</th>
            <th>동의건수</th>
            <th>동의율</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="font-bold">{row.name}</td>
              <td className="metric-number">{formatCaseCount(row.consultations)}</td>
              <td className="metric-number">{formatCaseCount(row.agreements)}</td>
              <td className={emphasisMetricClass}>{formatRate(row.agreements, row.consultations)}</td>
            </tr>
          ))}
          <tr>
            <td className="font-bold">합계</td>
            <td className="metric-number font-bold">{formatCaseCount(total.consultations)}</td>
            <td className="metric-number font-bold">{formatCaseCount(total.agreements)}</td>
            <td className={strongEmphasisMetricClass}>{formatRate(total.agreements, total.consultations)}</td>
          </tr>
        </tbody>
      </table>
    </ReportCard>
  );
}

function ConsultationRatioTable({ title, rows }: { title: string; rows: ResultRow[] }) {
  const total = totalRows(rows);

  return (
    <ReportCard title={title}>
      <table className="crm-table">
        <thead>
          <tr>
            <th>구분</th>
            <th>상담건수</th>
            <th>비율</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="font-bold">{row.name}</td>
              <td className="metric-number">{formatCaseCount(row.consultations)}</td>
              <td className={emphasisMetricClass}>{formatRate(row.consultations, total.consultations)}</td>
            </tr>
          ))}
          <tr>
            <td className="font-bold">합계</td>
            <td className="metric-number font-bold">{formatCaseCount(total.consultations)}</td>
            <td className={strongEmphasisMetricClass}>{total.consultations > 0 ? "100%" : "-"}</td>
          </tr>
        </tbody>
      </table>
    </ReportCard>
  );
}

function DisagreementReasonTable({ rows }: { rows: ResultRow[] }) {
  const total = totalRows(rows);

  return (
    <ReportCard title="비동의 사유 비율">
      <table className="crm-table">
        <thead>
          <tr>
            <th>구분</th>
            <th>비동의건수</th>
            <th>비율</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="font-bold">{row.name}</td>
              <td className="metric-number">{formatCaseCount(row.declined)}</td>
              <td className={emphasisMetricClass}>{formatRate(row.declined, total.declined)}</td>
            </tr>
          ))}
          <tr>
            <td className="font-bold">합계</td>
            <td className="metric-number font-bold">{formatCaseCount(total.declined)}</td>
            <td className={strongEmphasisMetricClass}>{total.declined > 0 ? "100%" : "-"}</td>
          </tr>
        </tbody>
      </table>
    </ReportCard>
  );
}

function DoctorReferralTable({ rows }: { rows: ResultRow[] }) {
  const total = totalRows(rows);

  return (
    <ReportCard title="원장님별 신환상담에 대한 소개건수 비율">
      <table className="crm-table">
        <thead>
          <tr>
            <th>Dr.</th>
            <th>신환 상담건수</th>
            <th>소개건수</th>
            <th>비율</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="font-bold">{row.name}</td>
              <td className="metric-number">{formatCaseCount(row.consultations)}</td>
              <td className="metric-number">{formatCaseCount(row.agreements)}</td>
              <td className={emphasisMetricClass}>{formatRate(row.agreements, row.consultations)}</td>
            </tr>
          ))}
          <tr>
            <td className="font-bold">합계</td>
            <td className="metric-number font-bold">{formatCaseCount(total.consultations)}</td>
            <td className="metric-number font-bold">{formatCaseCount(total.agreements)}</td>
            <td className={strongEmphasisMetricClass}>{formatRate(total.agreements, total.consultations)}</td>
          </tr>
        </tbody>
      </table>
    </ReportCard>
  );
}

function totalLossRows(rows: LossAnalysisRow[]) {
  return rows.reduce(
    (total, row) => ({
      ...total,
      consultations: total.consultations + row.consultations,
      agreements: total.agreements + row.agreements,
      consultationAmount: total.consultationAmount + row.consultationAmount,
      agreedAmount: total.agreedAmount + row.agreedAmount,
      lossAmount: total.lossAmount + row.lossAmount,
      declined: total.declined + row.declined,
    }),
    {
      name: "합계",
      consultations: 0,
      agreements: 0,
      consultationAmount: 0,
      agreedAmount: 0,
      lossAmount: 0,
      declined: 0,
    },
  );
}

function LossAnalysisTable({ title, rows }: { title: string; rows: LossAnalysisRow[] }) {
  const total = totalLossRows(rows);

  return (
    <ReportCard title={title}>
      <table className="crm-table">
        <thead>
          <tr>
            <th>구분</th>
            <th>상담건수</th>
            <th>비동의건수</th>
            <th>비동의율</th>
            <th>손실금액</th>
            <th>건당 손실금액</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="font-bold">{row.name}</td>
              <td className="metric-number">{formatCaseCount(row.consultations)}</td>
              <td className="metric-number">{formatCaseCount(row.declined)}</td>
              <td className={emphasisMetricClass}>{formatRate(row.declined, row.consultations)}</td>
              <td className={emphasisMetricClass}>{formatCurrency(row.lossAmount)}</td>
              <td className="metric-number font-bold">
                {row.declined > 0 ? formatCurrency(row.lossAmount / row.declined) : "-"}
              </td>
            </tr>
          ))}
          <tr>
            <td className="font-bold">합계</td>
            <td className="metric-number font-bold">{formatCaseCount(total.consultations)}</td>
            <td className="metric-number font-bold">{formatCaseCount(total.declined)}</td>
            <td className={strongEmphasisMetricClass}>{formatRate(total.declined, total.consultations)}</td>
            <td className={strongEmphasisMetricClass}>{formatCurrency(total.lossAmount)}</td>
            <td className="metric-number font-bold">
              {total.declined > 0 ? formatCurrency(total.lossAmount / total.declined) : "-"}
            </td>
          </tr>
        </tbody>
      </table>
    </ReportCard>
  );
}

function getMatrixCell(matrix: ResultMatrix, rowName: string, columnName: string) {
  return matrix.cells.get(rowName)?.get(columnName) ?? createEmptyRow(`${rowName} / ${columnName}`);
}

const matrixSubRowStyle = { background: "#fff3cf" };
const matrixTotalRowStyle = { background: "#eef5ff" };

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

type MatrixCountTableProps = {
  title: string;
  matrix: ResultMatrix;
  highlightRowTotals?: boolean;
  showColumnSummary?: boolean;
};

function MatrixColumnSummaryTable({ matrix }: { matrix: ResultMatrix }) {
  return (
    <div className="border-t border-mist bg-white p-3">
      <div className="mb-2 text-sm font-bold text-slate">진료분류별 총합계</div>
      <table className="crm-table min-w-[520px] overflow-hidden rounded-[16px] border border-mist">
        <thead>
          <tr>
            <th>구분</th>
            <th>상담건수</th>
            <th>동의건수</th>
            <th>상담동의율</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="font-bold">합계</td>
            <td className="kpi-highlight-strong metric-number">{formatCaseCount(matrix.total.consultations)}</td>
            <td className="kpi-highlight-strong metric-number">{formatCaseCount(matrix.total.agreements)}</td>
            <td className="kpi-highlight-strong metric-number">
              {formatRate(matrix.total.agreements, matrix.total.consultations)}
            </td>
          </tr>
          {matrix.columnNames.map((columnName) => {
            const columnTotal = matrix.columnTotals.get(columnName) ?? createEmptyRow(columnName);

            return (
              <tr key={`${columnName}-column-summary`}>
                <td className="font-bold">{columnName}</td>
                <td className="kpi-highlight metric-number">{formatCaseCount(columnTotal.consultations)}</td>
                <td className="kpi-highlight metric-number">{formatCaseCount(columnTotal.agreements)}</td>
                <td className="kpi-highlight metric-number">
                  {formatRate(columnTotal.agreements, columnTotal.consultations)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatrixCountTable({
  title,
  matrix,
  highlightRowTotals = false,
  showColumnSummary = false,
}: MatrixCountTableProps) {
  return (
    <ReportCard title={title}>
      <table className="crm-table">
        <thead>
          <tr>
            <th colSpan={2}>구분</th>
            {matrix.columnNames.map((columnName) => (
              <th key={columnName}>{columnName}</th>
            ))}
            <th>총합계</th>
          </tr>
        </thead>
        <tbody>
          {matrix.rowNames.map((rowName) => {
            const rowTotal = matrix.rowTotals.get(rowName) ?? createEmptyRow(rowName);

            return (
              <Fragment key={`${rowName}-rows`}>
                <tr>
                  <td rowSpan={3} className="font-bold">
                    {rowName}
                  </td>
                  <td className="font-bold">상담건수</td>
                  {matrix.columnNames.map((columnName) => (
                    <td key={`${rowName}-${columnName}-consultations`} className="metric-number font-bold">
                      {formatCaseCount(getMatrixCell(matrix, rowName, columnName).consultations)}
                    </td>
                  ))}
                  <td
                    className={joinClassNames("metric-number font-bold", highlightRowTotals && "kpi-highlight-strong")}
                  >
                    {formatCaseCount(rowTotal.consultations)}
                  </td>
                </tr>
                <tr>
                  <td className="font-bold" style={matrixSubRowStyle}>
                    동의건수
                  </td>
                  {matrix.columnNames.map((columnName) => (
                    <td
                      key={`${rowName}-${columnName}-agreements`}
                      className="metric-number"
                      style={matrixSubRowStyle}
                    >
                      {formatCaseCount(getMatrixCell(matrix, rowName, columnName).agreements)}
                    </td>
                  ))}
                  <td
                    className={joinClassNames("metric-number font-bold", highlightRowTotals && "kpi-highlight-strong")}
                    style={highlightRowTotals ? undefined : matrixSubRowStyle}
                  >
                    {formatCaseCount(rowTotal.agreements)}
                  </td>
                </tr>
                <tr>
                  <td className="font-bold" style={matrixSubRowStyle}>
                    동의율
                  </td>
                  {matrix.columnNames.map((columnName) => {
                    const cell = getMatrixCell(matrix, rowName, columnName);

                    return (
                      <td
                        key={`${rowName}-${columnName}-rate`}
                        className="metric-number font-bold"
                        style={matrixSubRowStyle}
                      >
                        {formatRate(cell.agreements, cell.consultations)}
                      </td>
                    );
                  })}
                  <td
                    className={joinClassNames("metric-number font-bold", highlightRowTotals && "kpi-highlight-strong")}
                    style={highlightRowTotals ? undefined : matrixSubRowStyle}
                  >
                    {formatRate(rowTotal.agreements, rowTotal.consultations)}
                  </td>
                </tr>
              </Fragment>
            );
          })}
          <tr>
            <td rowSpan={3} className="font-bold" style={matrixTotalRowStyle}>
              총 합계
            </td>
            <td className="font-bold" style={matrixTotalRowStyle}>
              상담건수
            </td>
            {matrix.columnNames.map((columnName) => {
              const columnTotal = matrix.columnTotals.get(columnName) ?? createEmptyRow(columnName);

              return (
                <td
                  key={`${columnName}-total-consultations`}
                  className="metric-number font-bold"
                  style={matrixTotalRowStyle}
                >
                  {formatCaseCount(columnTotal.consultations)}
                </td>
              );
            })}
            <td
              className={joinClassNames("metric-number font-bold", highlightRowTotals && "kpi-highlight-strong")}
              style={highlightRowTotals ? undefined : matrixTotalRowStyle}
            >
              {formatCaseCount(matrix.total.consultations)}
            </td>
          </tr>
          <tr>
            <td className="font-bold" style={matrixTotalRowStyle}>
              동의건수
            </td>
            {matrix.columnNames.map((columnName) => {
              const columnTotal = matrix.columnTotals.get(columnName) ?? createEmptyRow(columnName);

              return (
                <td key={`${columnName}-total-agreements`} className="metric-number font-bold" style={matrixTotalRowStyle}>
                  {formatCaseCount(columnTotal.agreements)}
                </td>
              );
            })}
            <td
              className={joinClassNames("metric-number font-bold", highlightRowTotals && "kpi-highlight-strong")}
              style={highlightRowTotals ? undefined : matrixTotalRowStyle}
            >
              {formatCaseCount(matrix.total.agreements)}
            </td>
          </tr>
          <tr>
            <td className="font-bold" style={matrixTotalRowStyle}>
              동의율
            </td>
            {matrix.columnNames.map((columnName) => {
              const columnTotal = matrix.columnTotals.get(columnName) ?? createEmptyRow(columnName);

              return (
                <td key={`${columnName}-total-rate`} className="metric-number font-bold" style={matrixTotalRowStyle}>
                  {formatRate(columnTotal.agreements, columnTotal.consultations)}
                </td>
              );
            })}
            <td
              className={joinClassNames("metric-number font-bold", highlightRowTotals && "kpi-highlight-strong")}
              style={highlightRowTotals ? undefined : matrixTotalRowStyle}
            >
              {formatRate(matrix.total.agreements, matrix.total.consultations)}
            </td>
          </tr>
        </tbody>
      </table>
      {showColumnSummary ? <MatrixColumnSummaryTable matrix={matrix} /> : null}
    </ReportCard>
  );
}

export function KpiResultsWorkspace() {
  const { activeClinic, enabledOptions } = useAdminSettings();
  const { consultations } = useConsultations({ clinicId: activeClinic.id });
  const initialPeriod = useMemo(() => getInitialConsultationPeriod(), []);
  const [resultMode, setResultMode] = useState<ResultMode>("performance");
  const [periodMode, setPeriodMode] = useState<ConsultationPeriodMode>("month");
  const [selectedYear, setSelectedYear] = useState(initialPeriod.year);
  const [selectedMonth, setSelectedMonth] = useState(initialPeriod.month);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedDate, setSelectedDate] = useState(initialPeriod.date);
  const weekOptions = useMemo(
    () => getConsultationWeekOptions(selectedYear, selectedMonth),
    [selectedMonth, selectedYear],
  );
  const activeWeekValue = Math.min(selectedWeek, weekOptions.length);
  const activeWeek = weekOptions.find((week) => week.value === activeWeekValue) ?? weekOptions[0];
  const yearOptions = useMemo(
    () => getConsultationYearOptions(consultations, initialPeriod.year),
    [consultations, initialPeriod.year],
  );
  const filteredConsultations = useMemo(
    () =>
      filterConsultationsByPeriod(consultations, {
        mode: periodMode,
        year: selectedYear,
        month: selectedMonth,
        weekStartDay: activeWeek.startDay,
        weekEndDay: activeWeek.endDay,
        date: selectedDate,
      }),
    [
      activeWeek.endDay,
      activeWeek.startDay,
      consultations,
      periodMode,
      selectedDate,
      selectedMonth,
      selectedYear,
    ],
  );
  const periodLabel = periodMode === "year"
    ? `${selectedYear}년`
    : periodMode === "month"
      ? `${selectedYear}년 ${selectedMonth}월`
      : periodMode === "week"
        ? `${selectedYear}년 ${selectedMonth}월 ${activeWeek.label}`
        : formatConsultationDateLabel(selectedDate);
  const monthlyRows = useMemo(
    () => buildMonthlyRows(filteredConsultations, periodMode === "year" ? undefined : selectedMonth),
    [filteredConsultations, periodMode, selectedMonth],
  );
  const treatmentRows = useMemo(
    () =>
      buildGroupedRows(
        filteredConsultations,
        (consultation) => consultation.treatmentCategory,
        enabledOptions.treatmentCategories,
      ),
    [enabledOptions.treatmentCategories, filteredConsultations],
  );
  const counselorTreatmentMatrix = useMemo(
    () =>
      buildMatrix(
        filteredConsultations,
        enabledOptions.counselors,
        enabledOptions.treatmentCategories,
        (consultation) => consultation.counselor,
        (consultation) => consultation.treatmentCategory,
      ),
    [enabledOptions.counselors, enabledOptions.treatmentCategories, filteredConsultations],
  );
  const doctorTreatmentMatrix = useMemo(
    () =>
      buildMatrix(
        filteredConsultations,
        enabledOptions.doctors,
        enabledOptions.treatmentCategories,
        (consultation) => consultation.doctor,
        (consultation) => consultation.treatmentCategory,
      ),
    [enabledOptions.doctors, enabledOptions.treatmentCategories, filteredConsultations],
  );
  const disagreementRows = useMemo(
    () => buildDisagreementRows(filteredConsultations, enabledOptions.disagreementReasons),
    [enabledOptions.disagreementReasons, filteredConsultations],
  );
  const channelRows = useMemo(
    () => buildGroupedRows(filteredConsultations, (consultation) => consultation.visitChannel || "-", enabledOptions.visitChannels),
    [enabledOptions.visitChannels, filteredConsultations],
  );
  const doctorReferralRows = useMemo(
    () => buildDoctorReferralRows(filteredConsultations, enabledOptions.doctors),
    [enabledOptions.doctors, filteredConsultations],
  );
  const patientTypeRows = useMemo(
    () =>
      buildGroupedRows(
        filteredConsultations,
        (consultation) => patientTypeLabel(consultation.patientType, enabledOptions.patientTypes),
        enabledOptions.patientTypes,
      ),
    [enabledOptions.patientTypes, filteredConsultations],
  );
  const treatmentLossRows = useMemo(
    () =>
      buildLossAnalysisRows(
        filteredConsultations,
        (consultation) => consultation.treatmentCategory,
        enabledOptions.treatmentCategories,
      ),
    [enabledOptions.treatmentCategories, filteredConsultations],
  );
  const channelLossRows = useMemo(
    () =>
      buildLossAnalysisRows(
        filteredConsultations,
        (consultation) => consultation.visitChannel || "-",
        enabledOptions.visitChannels,
      ),
    [enabledOptions.visitChannels, filteredConsultations],
  );
  const counselorLossRows = useMemo(
    () =>
      buildLossAnalysisRows(
        filteredConsultations,
        (consultation) => consultation.counselor,
        enabledOptions.counselors,
      ),
    [enabledOptions.counselors, filteredConsultations],
  );
  const disagreementLossRows = useMemo(
    () =>
      buildLossAnalysisRows(
        filteredConsultations,
        (consultation) => consultation.disagreementReason || "선택 안함",
        enabledOptions.disagreementReasons,
      ),
    [enabledOptions.disagreementReasons, filteredConsultations],
  );
  const handleDateChange = (date: string) => {
    const { year, month, day } = getConsultationDateParts(date);

    setSelectedDate(date);

    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      setSelectedYear(year);
      setSelectedMonth(month);
      setSelectedWeek(Math.ceil(day / 7));
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold text-monday-violet">리포트</p>
          <h1 className="mt-1 text-3xl font-light text-ink">KPI 결과 보고서</h1>
          <p className="mt-1 text-sm text-slate">
            선택한 치과와 기간 기준으로 결과 지표를 집계합니다.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <div className="flex w-fit max-w-full flex-wrap items-center gap-2 rounded-[24px] border border-mist bg-white p-2">
            <span className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-pebble bg-white px-3 text-sm font-bold text-slate">
              <Filter className="h-4 w-4" aria-hidden />
              기간
            </span>
            <select
              aria-label="보기 단위 선택"
              value={periodMode}
              onChange={(event) => {
                setPeriodMode(event.target.value as ConsultationPeriodMode);
                setSelectedWeek(1);
              }}
              className={`${filterInputClass} min-w-28`}
            >
              <option value="year">연도별</option>
              <option value="month">월별</option>
              <option value="week">주별</option>
              <option value="day">일별</option>
            </select>
            {periodMode === "day" ? (
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
            {periodMode !== "year" && periodMode !== "day" ? (
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
            {periodMode === "week" ? (
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
          <div className="flex w-fit max-w-full flex-wrap gap-2 rounded-[24px] border border-mist bg-white p-2">
            {resultTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setResultMode(tab.value)}
                className={[
                  "rounded-full px-4 py-2 text-sm font-bold transition",
                  resultMode === tab.value
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
        {activeClinic.name} · {periodLabel} 기준 {formatNumber(filteredConsultations.length)}건의 상담 데이터를 집계하고 있습니다.
      </section>

      {resultMode === "performance" ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <MonthlyCancelTable rows={monthlyRows} />
          <MonthlyAgreementTypeTable rows={monthlyRows} />
          <ConsultationAgreementTable title="진료분류별 상담 및 동의건수" rows={treatmentRows} />
          <DisagreementReasonTable rows={disagreementRows} />
          <section className="xl:col-span-2">
            <MatrixCountTable
              title="상담사/진료분류별 상담 및 동의건수"
              matrix={counselorTreatmentMatrix}
              highlightRowTotals
              showColumnSummary
            />
          </section>
          <section className="xl:col-span-2">
            <MatrixCountTable title="원장님/진료분류별 상담 및 동의건수" matrix={doctorTreatmentMatrix} highlightRowTotals />
          </section>
        </section>
      ) : resultMode === "audience" ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <ConsultationAgreementTable title="내원경로별 상담 및 동의건수" rows={channelRows} />
          <ConsultationRatioTable title="내원경로별 상담건수 비율" rows={channelRows} />
          <DoctorReferralTable rows={doctorReferralRows} />
          <ConsultationAgreementTable title="환자구분별 상담 및 동의건수" rows={patientTypeRows} />
        </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          <LossAnalysisTable title="진료분류별 비동의 손실금액" rows={treatmentLossRows} />
          <LossAnalysisTable title="내원경로별 비동의 손실금액" rows={channelLossRows} />
          <LossAnalysisTable title="상담사별 비동의 손실금액" rows={counselorLossRows} />
          <LossAnalysisTable title="비동의사유별 손실금액" rows={disagreementLossRows} />
        </section>
      )}
    </div>
  );
}
