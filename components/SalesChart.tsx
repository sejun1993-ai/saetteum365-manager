"use client";

// Design Ref: §2.3 — ③ 매출 추이 그래프. 표와 같은 기간 자료를 선 그래프로 그리고,
// ±20% 이상 변한 구간은 빨간 점으로 표시해 클릭하면 그 구간을 고른다. (원인 후보는 작업 15~16번)
// Plan SC: 작업 13번 (4단위 추이 그래프), 14번 (±20% 구간 표시·클릭)

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BIG_CHANGE_PERCENT, type CompareBasis, type PeriodWithChange } from "@/lib/aggregate";

export type ChartMetric = "average" | "total";

export const METRIC_LABELS: Record<ChartMetric, string> = {
  average: "영업일 일평균",
  total: "매출 합계",
};

const LINE = "#059669"; // 화면의 초록(emerald-600)과 같은 색
const ALERT = "#dc2626"; // 큰 변화 구간 표시(red-600). 색만으로 구분하지 않도록 ▲▼ 글자와 함께 쓴다
const GRID = "#e5e5e5";
const AXIS_TEXT = "#737373";
const won = (n: number) => n.toLocaleString("ko-KR");

// 축 글자: 1,234,000 → "123만"
const manwon = (v: number) => `${Math.round(v / 10000).toLocaleString("ko-KR")}만`;
// 축 아래 이름은 짧게: "2026년 3월 2주" → "26년 3월 2주"
const shortLabel = (label: string) => label.replace(/^20(\d\d)년 /, "$1년 ");

type Point = {
  key: string;
  label: string;
  value: number | null;
  big: boolean;
  period: PeriodWithChange;
};

type TooltipProps = { active?: boolean; payload?: { payload: Point }[]; basis: CompareBasis };

function ChartTooltip({ active, payload, basis }: TooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const p = point.period;
  const change = basis === "prev" ? p.vsPrev : p.vsLastYear;
  return (
    <div className="rounded border border-neutral-300 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold text-neutral-900">
        {p.label}
        {p.seasonMonths && <span className="ml-1 font-normal text-neutral-500">({p.seasonMonths})</span>}
      </p>
      <p className="text-neutral-500">
        {p.start} ~ {p.end}
      </p>
      <p className="mt-1 text-neutral-800">매출 합계 {won(p.total)}원</p>
      <p className="text-neutral-800">
        영업일 일평균 {p.dailyAverage === null ? "—" : `${won(p.dailyAverage)}원`} ({p.openDays}일 영업)
      </p>
      <p className="text-neutral-800">
        {change.rate === null
          ? `비교 불가: ${change.reason}`
          : `${change.targetLabel} 대비 ${change.rate > 0 ? "▲" : change.rate < 0 ? "▼" : "−"} ${Math.abs(change.rate).toFixed(1)}%`}
      </p>
      {p.partial && <p className="mt-1 text-amber-700">일부 기간만 있어요 ({p.dataDays}/{p.calendarDays}일)</p>}
      {point.big && (
        <p className="mt-1 font-semibold text-red-700">
          ±{BIG_CHANGE_PERCENT}% 이상 변한 구간이에요 · 클릭하면 이 구간을 골라요
        </p>
      )}
    </div>
  );
}

type DotProps = { cx?: number; cy?: number; payload?: Point; index?: number };

export default function SalesChart({
  periods,
  metric,
  basis,
  bigKeys,
  selectedKey,
  onSelect,
}: {
  periods: PeriodWithChange[]; // 오래된 것 → 최근 순서
  metric: ChartMetric;
  basis: CompareBasis;
  bigKeys: Set<string>; // ±20% 이상 변한 기간의 key
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const data: Point[] = periods.map((p) => ({
    key: p.key,
    label: shortLabel(p.label),
    value: metric === "average" ? p.dailyAverage : p.total,
    big: bigKeys.has(p.key),
    period: p,
  }));
  const showAllDots = data.length <= 24; // 점이 너무 많으면(주 단위) 큰 변화·일부 기간 점만 그린다

  // 점: 큰 변화 = 빨간 점(고르면 바깥 고리), 일부 기간 = 속이 빈 점, 보통 = 초록 점
  const renderDot = ({ cx, cy, payload, index }: DotProps) => {
    const k = `d-${index}`;
    if (cx === undefined || cy === undefined || !payload || payload.value === null) return <g key={k} />;
    if (payload.big) {
      const selected = payload.key === selectedKey;
      return (
        <g key={k} style={{ cursor: "pointer" }} onClick={() => onSelect(payload.key)}>
          {selected && <circle cx={cx} cy={cy} r={10} fill="none" stroke={ALERT} strokeWidth={2} />}
          <circle cx={cx} cy={cy} r={6} fill={payload.period.partial ? "#fff" : ALERT} stroke={payload.period.partial ? ALERT : "#fff"} strokeWidth={2} />
        </g>
      );
    }
    if (payload.period.partial) {
      return <circle key={k} cx={cx} cy={cy} r={4.5} fill="#fff" stroke={LINE} strokeWidth={2} />;
    }
    if (!showAllDots) return <g key={k} />;
    return <circle key={k} cx={cx} cy={cy} r={4} fill={LINE} stroke="#fff" strokeWidth={2} />;
  };

  return (
    <figure>
      <div
        className="h-72 w-full"
        role="img"
        aria-label={`${METRIC_LABELS[metric]} 추이 그래프, ${data.length}개 기간, ±${BIG_CHANGE_PERCENT}% 이상 변한 구간 ${bigKeys.size}개`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 14, right: 16, bottom: 4, left: 4 }}
            // 점을 정확히 누르지 않아도, 말풍선이 가리키는 기간이 큰 변화 구간이면 고른다 (누르기 쉬운 범위)
            onClick={(state) => {
              const i = Number(state?.activeTooltipIndex);
              const point = Number.isInteger(i) ? data[i] : undefined;
              if (point?.big) onSelect(point.key);
            }}
          >
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: AXIS_TEXT, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={manwon}
              tick={{ fill: AXIS_TEXT, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={56}
              domain={["auto", "auto"]}
            />
            <Tooltip
              content={<ChartTooltip basis={basis} />}
              cursor={{ stroke: AXIS_TEXT, strokeWidth: 1, strokeDasharray: "3 3" }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={LINE}
              strokeWidth={2}
              dot={renderDot}
              activeDot={{ r: 5, fill: LINE, stroke: "#fff", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-1 text-xs text-neutral-500">
        {METRIC_LABELS[metric]}(원) · 점에 마우스를 올리면 자세한 숫자가 나와요 · 속이 빈 점(○)은 일부 기간만 있는 기간이에요 ·{" "}
        <span className="font-medium text-red-700">빨간 점(●)은 ±{BIG_CHANGE_PERCENT}% 이상 변한 구간</span>이고 누르면 골라져요
        {metric === "total" && " (합계는 일부 기간이 작게 나오니 일평균과 함께 보세요)"}
      </figcaption>
    </figure>
  );
}
