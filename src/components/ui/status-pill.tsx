import type { ConsultationResult } from "@/types/domain";

const resultLabels: Record<ConsultationResult, string> = {
  same_day: "동의(당일진행)",
  follow_up: "동의(추후진행)",
  declined: "비동의",
  cancelled: "동의 후 취소",
};

const resultClasses: Record<ConsultationResult, string> = {
  same_day: "bg-mint text-forest",
  follow_up: "bg-sky text-ink",
  declined: "bg-[#ffe1c4] text-[#9a4a00]",
  cancelled: "bg-[#ffdbe3] text-[#ad1f3d]",
};

export function StatusPill({ result }: { result: ConsultationResult }) {
  return (
    <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${resultClasses[result]}`}>
      {resultLabels[result]}
    </span>
  );
}
