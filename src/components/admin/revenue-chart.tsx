"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPrice } from "@/lib/format";

export function RevenueChart({ data }: { data: { label: string; total: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          width={40}
          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          formatter={(value) => [formatPrice(Number(value ?? 0)), "הכנסות"]}
          contentStyle={{
            background: "var(--popover)",
            color: "var(--popover-foreground)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar dataKey="total" fill="var(--brand)" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
