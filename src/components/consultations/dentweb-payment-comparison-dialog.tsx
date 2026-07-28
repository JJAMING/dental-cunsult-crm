"use client";

import { ChevronDown, ReceiptText, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  loadDentwebTreatmentFees,
  type DentwebTreatmentFee,
} from "@/lib/local-api-client";
import type { Consultation } from "@/types/domain";

type ComparisonStatus = "loading" | "success" | "empty" | "error" | "unavailable";

type PaymentComparisonRow = {
  consultation: Consultation;
  fees: DentwebTreatmentFee[];
  message: string;
  status: ComparisonStatus;
  totalCollectionReference: number;
};

function createComparisonRow(consultation: Consultation): PaymentComparisonRow {
  const canLookup = Boolean(consultation.dentwebPatientId || consultation.chartNo);

  return {
    consultation,
    fees: [],
    message: canLookup ? "덴트웹 수납 내역을 조회하고 있습니다." : "덴트웹 환자 연결 정보가 없습니다.",
    status: canLookup ? "loading" : "unavailable",
    totalCollectionReference: 0,
  };
}

function formatReceiptDate(value?: string) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (digits.length < 8) {
    return value || "-";
  }

  const date = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;

  return digits.length >= 12 ? `${date} ${digits.slice(8, 10)}:${digits.slice(10, 12)}` : date;
}

function statusLabel(status: ComparisonStatus) {
  if (status === "loading") {
    return "조회 중";
  }

  if (status === "success") {
    return "조회 완료";
  }

  if (status === "empty") {
    return "수납 없음";
  }

  if (status === "unavailable") {
    return "연결 정보 없음";
  }

  return "조회 실패";
}

function statusClass(status: ComparisonStatus) {
  if (status === "success") {
    return "bg-[#e8f8f2] text-[#23745d]";
  }

  if (status === "loading") {
    return "bg-periwinkle text-monday-violet";
  }

  if (status === "error") {
    return "bg-[#fff0e8] text-[#b94b10]";
  }

  return "bg-cloud text-slate";
}

export function DentwebPaymentComparisonDialog({
  clinicId,
  consultations,
  onClose,
}: {
  clinicId: string;
  consultations: Consultation[];
  onClose: () => void;
}) {
  const [rows, setRows] = useState<PaymentComparisonRow[]>(() => consultations.map(createComparisonRow));
  const [expandedConsultationId, setExpandedConsultationId] = useState<number | null>(null);

  useEffect(() => {
    let isCurrent = true;
    const initialRows = consultations.map(createComparisonRow);

    const pendingRows = initialRows.filter((row) => row.status === "loading");
    let nextIndex = 0;

    const loadNext = async () => {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const pendingRow = pendingRows[currentIndex];

      if (!pendingRow) {
        return;
      }

      const { consultation } = pendingRow;

      try {
        const payload = await loadDentwebTreatmentFees({
          chartNo: consultation.chartNo,
          clinicId,
          fromDate: consultation.date,
          limit: 10,
          patientId: consultation.dentwebPatientId,
        });
        const fees = payload.fees ?? [];

        if (isCurrent) {
          setRows((currentRows) =>
            currentRows.map((row) =>
              row.consultation.id === consultation.id
                ? {
                    ...row,
                    fees,
                    message: fees.length
                      ? "상담일 이후 카드·현금·통장 수납을 참고용으로 표시합니다."
                      : "상담일 이후 덴트웹 수납 내역이 없습니다.",
                    status: fees.length ? "success" : "empty",
                    totalCollectionReference: payload.totalCollectionReference ?? 0,
                  }
                : row,
            ),
          );
        }
      } catch {
        if (isCurrent) {
          setRows((currentRows) =>
            currentRows.map((row) =>
              row.consultation.id === consultation.id
                ? {
                    ...row,
                    message: "덴트웹 수납 내역을 불러오지 못했습니다.",
                    status: "error",
                  }
                : row,
            ),
          );
        }
      }

      await loadNext();
    };

    const workerCount = Math.min(4, pendingRows.length);
    void Promise.all(Array.from({ length: workerCount }, () => loadNext()));

    return () => {
      isCurrent = false;
    };
  }, [clinicId, consultations]);

  const summary = useMemo(() => {
    const agreedAmount = rows.reduce((sum, row) => sum + row.consultation.agreedAmount, 0);
    const collectionReference = rows.reduce((sum, row) => sum + row.totalCollectionReference, 0);
    const completedCount = rows.filter((row) => row.status === "success" || row.status === "empty").length;

    return {
      agreedAmount,
      collectionReference,
      completedCount,
      difference: agreedAmount - collectionReference,
    };
  }, [rows]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/35 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dentweb-payment-comparison-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-[1280px] overflow-y-auto rounded-2xl border border-mist bg-white shadow-[rgba(33,35,52,0.24)_0_22px_70px]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-mist px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-periwinkle text-monday-violet">
              <ReceiptText className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-bold text-monday-violet">상담일지</p>
              <h2 id="dentweb-payment-comparison-title" className="mt-1 text-xl font-bold text-ink">
                덴트웹 수납내역
              </h2>
              <p className="mt-1 text-xs text-slate">
                현재 상담목록 {formatNumber(consultations.length)}건을 기준으로 상담일 이후 수납을 참고용으로 비교합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="덴트웹 수납내역 닫기"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-md border border-pebble text-slate transition hover:border-monday-violet hover:text-monday-violet"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="grid border-b border-mist sm:grid-cols-3">
          <div className="border-b border-mist px-5 py-4 sm:border-b-0 sm:border-r">
            <p className="text-xs font-bold text-slate">동의금액 합계</p>
            <p className="metric-number mt-1 text-xl font-bold text-ink">{formatCurrency(summary.agreedAmount)}</p>
          </div>
          <div className="border-b border-mist px-5 py-4 sm:border-b-0 sm:border-r">
            <p className="text-xs font-bold text-slate">덴트웹 수납금액 합계</p>
            <p className="metric-number mt-1 text-xl font-bold text-ink">{formatCurrency(summary.collectionReference)}</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs font-bold text-slate">참고 차이</p>
            <p className="metric-number mt-1 text-xl font-bold text-ink">{formatCurrency(Math.abs(summary.difference))}</p>
            <p className="mt-1 text-xs font-bold text-slate">수납 조회 완료 {formatNumber(summary.completedCount)}건</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="crm-table min-w-[960px]">
            <thead>
              <tr>
                <th>상담일</th>
                <th>환자</th>
                <th>차트번호</th>
                <th>진료분류</th>
                <th>동의금액</th>
                <th>덴트웹 수납금액</th>
                <th>참고 차이</th>
                <th>최근 수납일</th>
                <th>상태</th>
                <th aria-label="수납 상세" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isExpanded = expandedConsultationId === row.consultation.id;
                const latestFee = row.fees[0];
                const difference = row.consultation.agreedAmount - row.totalCollectionReference;

                return (
                  <Fragment key={row.consultation.id}>
                    <tr>
                      <td className="metric-number">{row.consultation.date}</td>
                      <td className="font-bold">{row.consultation.patientName}</td>
                      <td className="metric-number">{row.consultation.chartNo || "-"}</td>
                      <td>{row.consultation.treatmentCategory}</td>
                      <td className="metric-number font-bold">{formatCurrency(row.consultation.agreedAmount)}</td>
                      <td className="metric-number font-bold">{formatCurrency(row.totalCollectionReference)}</td>
                      <td className="metric-number font-bold">{formatCurrency(Math.abs(difference))}</td>
                      <td className="metric-number">{latestFee ? formatReceiptDate(latestFee.receivedAt || latestFee.treatmentDate) : "-"}</td>
                      <td>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(row.status)}`}>
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={!row.fees.length}
                          onClick={() => setExpandedConsultationId((current) => (current === row.consultation.id ? null : row.consultation.id))}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-pebble bg-white px-2.5 text-xs font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          상세
                          <ChevronDown className={`h-3.5 w-3.5 transition ${isExpanded ? "rotate-180" : ""}`} aria-hidden />
                        </button>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr>
                        <td colSpan={10} className="!whitespace-normal bg-cloud !px-5 !py-4 text-left">
                          <p className="text-xs font-bold text-slate">{row.message}</p>
                          <div className="mt-3 overflow-x-auto rounded-lg border border-mist bg-white">
                            <table className="w-full min-w-[680px] text-sm">
                              <thead className="border-b border-mist bg-fog text-xs text-slate">
                                <tr>
                                  <th className="px-3 py-2 text-left font-bold">수납일</th>
                                  <th className="px-3 py-2 text-left font-bold">진료·메모</th>
                                  <th className="px-3 py-2 text-left font-bold">Dr.</th>
                                  <th className="px-3 py-2 text-right font-bold">수납금액</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.fees.map((fee, index) => (
                                  <tr key={`${fee.receivedAt ?? fee.treatmentDate ?? "fee"}-${index}`} className="border-b border-mist last:border-b-0">
                                    <td className="metric-number px-3 py-2 text-slate">{formatReceiptDate(fee.receivedAt || fee.treatmentDate)}</td>
                                    <td className="px-3 py-2 text-ink">{fee.treatmentContent || fee.memo || "진료비 내역"}</td>
                                    <td className="px-3 py-2 text-slate">{fee.doctor ? `Dr. ${fee.doctor}` : "-"}</td>
                                    <td className="metric-number px-3 py-2 text-right font-bold text-ink">{formatCurrency(fee.collectionReference ?? 0)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-sm font-bold text-slate">
                    현재 필터 조건에 해당하는 상담이 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
