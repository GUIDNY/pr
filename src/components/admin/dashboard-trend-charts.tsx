"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPrice } from "@/lib/format";
import { CHANNELS, CHANNEL_LABELS } from "@/lib/admin/order-channel";
import type { ChannelWeek, FunnelBucket, TrendPoint } from "@/lib/queries/admin-trends";

const tick = { fill: "var(--muted-foreground)", fontSize: 12 };
const tooltipStyle = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
};
const k = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v));
/* Orange first, then neutrals that stay apart in both themes. */
const CHANNEL_COLORS: Record<(typeof CHANNELS)[number], string> = {
  google_paid: "var(--brand)",
  google_organic: "#2563eb",
  ai: "#16a34a",
  social: "#9333ea",
  direct: "#64748b",
  other: "#cbd5e1",
};

/* The charts are drawn left-to-right (time runs rightwards, as on every
   chart the owner has seen); the text around them stays right-to-left. */
function Frame({ children, height = 260 }: { children: React.ReactElement; height?: number }) {
  return (
    <div dir="ltr">
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const every = data.length > 31 ? Math.ceil(data.length / 12) - 1 : data.length > 10 ? 2 : 0;
  return (
    <Frame>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={tick} interval={every} />
        <YAxis yAxisId="rev" tickLine={false} axisLine={false} tick={tick} width={38} tickFormatter={k} />
        <YAxis yAxisId="ord" orientation="right" tickLine={false} axisLine={false} tick={tick} width={28} allowDecimals={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) => (String(name).includes("הכנסות") ? formatPrice(Number(value ?? 0)) : Number(value ?? 0))}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="rev" dataKey="revenue" name="הכנסות" fill="var(--brand)" radius={[3, 3, 0, 0]} maxBarSize={22} />
        <Line
          yAxisId="rev"
          dataKey="prevRevenue"
          name="הכנסות בתקופה הקודמת"
          stroke="var(--muted-foreground)"
          strokeDasharray="5 4"
          strokeWidth={2}
          dot={false}
        />
        <Line yAxisId="ord" dataKey="orders" name="הזמנות" stroke="#111827" strokeWidth={2} dot={false} />
      </ComposedChart>
    </Frame>
  );
}

export function ProfitChart({ data }: { data: TrendPoint[] }) {
  const every = data.length > 31 ? Math.ceil(data.length / 12) - 1 : data.length > 10 ? 2 : 0;
  return (
    <Frame height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={tick} interval={every} />
        <YAxis tickLine={false} axisLine={false} tick={tick} width={42} tickFormatter={k} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatPrice(Math.round(Number(v ?? 0))), "רווח מצטבר"]} />
        <Area dataKey="profitCum" stroke="var(--brand)" strokeWidth={2} fill="url(#profitFill)" />
      </AreaChart>
    </Frame>
  );
}

export function FunnelTrendChart({ data }: { data: FunnelBucket[] }) {
  return (
    <Frame height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={tick} interval="preserveStartEnd" />
        <YAxis yAxisId="v" tickLine={false} axisLine={false} tick={tick} width={34} allowDecimals={false} />
        <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} tick={tick} width={34} tickFormatter={(v) => `${v}%`} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) => (String(name).includes("המרה") ? `${value ?? "—"}%` : Number(value ?? 0))}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="v" dataKey="visitors" name="מבקרים" fill="var(--muted-foreground)" fillOpacity={0.35} radius={[3, 3, 0, 0]} maxBarSize={26} />
        <Line yAxisId="r" dataKey="rate" name="שיעור המרה" stroke="#111827" strokeWidth={2} dot={{ r: 2 }} connectNulls />
      </ComposedChart>
    </Frame>
  );
}

export function ChannelWeeksChart({ data }: { data: ChannelWeek[] }) {
  return (
    <Frame height={240}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={tick} />
        <YAxis tickLine={false} axisLine={false} tick={tick} width={28} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {CHANNELS.map((c) => (
          <Bar key={c} dataKey={c} name={CHANNEL_LABELS[c]} stackId="s" fill={CHANNEL_COLORS[c]} maxBarSize={36} />
        ))}
      </BarChart>
    </Frame>
  );
}

export function DailyProfitChart({ data }: { data: TrendPoint[] }) {
  const every = data.length > 31 ? Math.ceil(data.length / 12) - 1 : data.length > 10 ? 2 : 0;
  return (
    <Frame height={240}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={tick} interval={every} />
        <YAxis tickLine={false} axisLine={false} tick={tick} width={42} tickFormatter={k} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatPrice(Math.round(Number(v ?? 0)))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="revenue" name="הכנסה" fill="var(--brand)" radius={[3, 3, 0, 0]} maxBarSize={18} />
        <Bar dataKey="profit" name="רווח גולמי" fill="#16a34a" radius={[3, 3, 0, 0]} maxBarSize={18} />
      </BarChart>
    </Frame>
  );
}
