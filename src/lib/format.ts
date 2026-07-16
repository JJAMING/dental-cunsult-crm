export function formatCurrency(value: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${Math.round(value * 100)}%`;
}

export function consentRate(agreements: number, consultations: number) {
  if (consultations === 0) {
    return 0;
  }

  return agreements / consultations;
}
