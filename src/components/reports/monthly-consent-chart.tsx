"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { consentRate, formatPercent } from "@/lib/format";
import type { MonthlyStat } from "@/types/domain";

type ChartDatum = MonthlyStat & {
  consentRate: number;
};

export function MonthlyConsentChart({ data }: { data: MonthlyStat[] }) {
  const chartData: ChartDatum[] = data.map((item) => ({
    ...item,
    consentRate: Math.round(consentRate(item.agreements, item.consultations) * 100),
  }));

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 16, right: 12, bottom: 0, left: -20 }}>
          <CartesianGrid stroke="#e6e7ea" vertical={false} />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#535768", fontSize: 12 }} />
          <YAxis yAxisId="count" axisLine={false} tickLine={false} tick={{ fill: "#535768", fontSize: 12 }} />
          <YAxis
            yAxisId="rate"
            orientation="right"
            domain={[0, 100]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#535768", fontSize: 12 }}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip
            contentStyle={{
              border: "1px solid #d0d4e4",
              borderRadius: 16,
              boxShadow: "rgba(205, 208, 223, 0.4) 0 2px 48px 0",
            }}
            formatter={(value, name) => {
              if (name === "동의율") {
                return [formatPercent(Number(value) / 100), name];
              }

              return [value, name];
            }}
          />
          <Bar yAxisId="count" dataKey="consultations" name="상담건수" fill="#abf0ff" radius={[10, 10, 0, 0]} />
          <Bar yAxisId="count" dataKey="agreements" name="동의건수" fill="#6161ff" radius={[10, 10, 0, 0]} />
          <Line
            yAxisId="rate"
            type="monotone"
            dataKey="consentRate"
            name="동의율"
            stroke="#ff8940"
            strokeWidth={3}
            dot={{ r: 4, fill: "#ff8940" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
