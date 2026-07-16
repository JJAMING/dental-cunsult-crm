import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: string;
  helper: string;
  icon: ReactNode;
  tone?: "violet" | "mint" | "sky" | "apricot";
};

const toneClass = {
  violet: "bg-periwinkle text-monday-violet",
  mint: "bg-mint text-forest",
  sky: "bg-sky text-ink",
  apricot: "bg-[#ffe1c4] text-[#9a4a00]",
};

export function StatCard({ label, value, helper, icon, tone = "violet" }: StatCardProps) {
  return (
    <section className="crm-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate">{label}</p>
          <p className="metric-number mt-3 text-3xl font-bold text-ink">{value}</p>
        </div>
        <span className={`grid h-11 w-11 place-items-center rounded-[16px] ${toneClass[tone]}`}>
          {icon}
        </span>
      </div>
      <p className="mt-4 text-sm font-medium text-slate">{helper}</p>
    </section>
  );
}
