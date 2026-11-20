"use client";

// Design Ref: §2.3 — ④ 선택한 구간. ±20% 이상 변한 구간을 고르면 그 구간과 비교 기간의 숫자를 나란히 보여 준다.
// 그 아래에 AI 원인 후보(작업 16·17번)를 붙인다.
// Plan SC: 작업 14번 (±20% 구간 클릭), 16번 (원인 후보)

import CauseCandidates from "@/components/CauseCandidates";
import type { PeriodChange, PeriodTotal } from "@/lib/aggregate";
import type { CausePayload } from "@/lib/cause";

const won = (n: number) => n.toLocaleString("ko-KR");

function TopList({ title, period }: { title: string; period: PeriodTotal }) {
  return (
    <div>
      <p className="text-xs font-medium text-neutral-600">{title}</p>
      {period.topProducts.length === 0 ? (
        <p className="text-xs text-neutral-500">상품별 매출이 없어요</p>
      ) : (
        <ol className="mt-1 space-y-0.5 text-sm">
          {period.topProducts.map((t, i) => (
            <li key={t.product} className="flex justify-between gap-3">
              <span>
                {i + 1}. {t.product}
              </span>
              <span className="tabular-nums text-neutral-700">{won(t.total)}원</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function SelectedPeriod({
  period,
  change,
  target,
  hasProducts,
  causePayload,
  onClear,
}: {
  period: PeriodTotal;
  change: PeriodChange;
  target: PeriodTotal | null; // 비교한 기간
  hasProducts: boolean;
  causePayload: CausePayload | null; // AI에 보낼 집계 (비교 구간이 없으면 null)
  onClear: () => void;
}) {
  const rate = change.rate ?? 0;
  const rows: [string, (p: PeriodTotal) => string][] = [
    ["기간", (p) => `${p.start} ~ ${p.end}`],
    ["매출 합계", (p) => `${won(p.total)}원`],
    ["영업일 (휴무)", (p) => `${p.openDays}일 (${p.closedDays}일)`],
    ["영업일 일평균", (p) => (p.dailyAverage === null ? "—" : `${won(p.dailyAverage)}원`)],
  ];

  return (
    <section aria-label="선택한 구간" className="mt-4 rounded-lg border-2 border-red-300 bg-red-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-red-700">선택한 구간</p>
          <h3 className="text-lg font-semibold">
            {period.label}{" "}
            <span className="text-red-700">
              {rate > 0 ? "▲" : "▼"} {Math.abs(rate).toFixed(1)}%
            </span>
          </h3>
          <p className="text-sm text-neutral-600">
            {change.targetLabel} 대비, 영업일 일평균 기준
            {change.totalRate !== null && ` (합계 기준 ${change.totalRate > 0 ? "+" : ""}${change.totalRate.toFixed(1)}%)`}
          </p>
          {change.partial && (
            <p className="mt-1 text-xs text-amber-700">일부 기간만 있는 기간이 끼어 있어서 참고만 해 주세요.</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-100"
        >
          선택 풀기
        </button>
      </div>

      {target && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[28rem] bg-white text-left text-sm">
            <thead className="border-b border-neutral-300 text-neutral-500">
              <tr>
                <th className="px-2 py-1 font-medium"></th>
                <th className="px-2 py-1 font-medium">{period.label} (선택)</th>
                <th className="px-2 py-1 font-medium">{target.label} (비교)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, value]) => (
                <tr key={name} className="border-b border-neutral-100">
                  <th className="px-2 py-1 font-normal text-neutral-500">{name}</th>
                  <td className="px-2 py-1 tabular-nums">{value(period)}</td>
                  <td className="px-2 py-1 tabular-nums">{value(target)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasProducts && target && (
        <div className="mt-3 grid gap-3 rounded bg-white p-3 sm:grid-cols-2">
          <TopList title={`${period.label} 많이 팔린 상품`} period={period} />
          <TopList title={`${target.label} 많이 팔린 상품`} period={target} />
        </div>
      )}

      {causePayload ? (
        <CauseCandidates key={`${period.key}|${causePayload.basisLabel}`} payload={causePayload} />
      ) : (
        <p className="mt-3 rounded border border-neutral-300 bg-white p-3 text-sm text-neutral-600">
          <b>알 수 없음</b> · 비교할 구간의 자료가 없어서 원인 후보를 찾을 수 없어요.
        </p>
      )}
    </section>
  );
}
