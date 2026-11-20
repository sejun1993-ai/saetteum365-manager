"use client";

// Design Ref: §2.3 — ② 보기 단위 (주)(월)(분기)(계절) + 계절 방식 (일반 4계절)(약국 시즌).
// 올린 매출을 추이 그래프 + 단위별 합계 표와 증감률로 보여 주고, ±20% 이상 변한 구간을 골라 볼 수 있게 한다.
// Plan SC: 작업 10번 (주·월·분기 합산), 11번 (계절·약국 시즌 합산), 12번 (증감률), 13번 (추이 그래프), 14번 (±20% 구간)

import { useMemo, useState, useSyncExternalStore } from "react";
import SelectedPeriod from "@/components/SelectedPeriod";
import { buildCausePayload } from "@/lib/cause";
import {
  aggregateSales,
  aggregateSeasons,
  BASIS_LABELS,
  BIG_CHANGE_PERCENT,
  isBigChange,
  UNIT_LABELS,
  withChanges,
  type CompareBasis,
  type PeriodChange,
  type PeriodUnit,
} from "@/lib/aggregate";
import { getServerSnapshot, getSnapshot, parseSales, subscribe } from "@/lib/sales-storage";
import SalesChart, { METRIC_LABELS, type ChartMetric } from "@/components/SalesChart";
import { monthRangeText, SEASON_MODE_LABELS, SEASONS, type SeasonMode } from "@/lib/seasons";

const won = (n: number) => n.toLocaleString("ko-KR");
const BASES: CompareBasis[] = ["prev", "lastYear"];
const METRICS: ChartMetric[] = ["average", "total"];

// 증감률 한 칸: "▲ 12.3%" + 비교한 기간. 비교할 수 없으면 "비교 불가"와 이유
function ChangeCell({ change, big }: { change: PeriodChange; big: boolean }) {
  if (change.rate === null) {
    return (
      <>
        <div className="text-neutral-400">비교 불가</div>
        <div className="text-xs text-neutral-500">{change.reason}</div>
      </>
    );
  }
  const sign = change.rate > 0 ? "▲" : change.rate < 0 ? "▼" : "−";
  return (
    <>
      <div className={`font-medium tabular-nums ${big ? "text-red-700" : ""}`}>
        {sign} {Math.abs(change.rate).toFixed(1)}%
        {big && (
          <span className="ml-1 rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
            ±{BIG_CHANGE_PERCENT}% 이상
          </span>
        )}
      </div>
      <div className="text-xs text-neutral-500">{change.targetLabel} 대비</div>
      {change.partial && <div className="text-xs text-amber-700">일부 기간끼리 비교라 참고만 해 주세요</div>}
      {change.totalRate !== null && (
        <div className="text-xs text-neutral-400">
          합계 기준 {change.totalRate > 0 ? "+" : ""}
          {change.totalRate.toFixed(1)}%
        </div>
      )}
    </>
  );
}
type View = PeriodUnit | "season";
const VIEWS: View[] = ["week", "month", "quarter", "season"];
const VIEW_LABELS: Record<View, string> = { ...UNIT_LABELS, season: "계절" };
const SEASON_MODES: SeasonMode[] = ["general", "pharmacy"];
// 약국 시즌 어디에도 들어가지 않는 달 (안내 문구용, lib/seasons.ts의 정의에서 계산)
const uncoveredMonths = Array.from({ length: 12 }, (_, i) => i + 1).filter(
  (m) => !SEASONS.pharmacy.some((s) => s.months.includes(m)),
);

export default function SalesPeriods() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const loaded = useMemo(() => parseSales(raw), [raw]);
  const [unit, setUnit] = useState<View>("month");
  const [seasonMode, setSeasonMode] = useState<SeasonMode>("general");

  const [basisChoice, setBasisChoice] = useState<CompareBasis>("prev");
  const [metric, setMetric] = useState<ChartMetric>("average");

  const periods = useMemo(() => {
    if (!loaded) return [];
    return unit === "season"
      ? withChanges(aggregateSeasons(loaded.rows, seasonMode), seasonMode)
      : withChanges(aggregateSales(loaded.rows, unit));
  }, [loaded, unit, seasonMode]);

  // Design Ref: §2.3 — 주 단위는 전주 대비로만 본다. 약국 시즌은 서로 겹쳐서 전년 같은 시즌과만 비교한다.
  const basisFixed: CompareBasis | null =
    unit === "week" ? "prev" : unit === "season" && seasonMode === "pharmacy" ? "lastYear" : null;
  const basis = basisFixed ?? basisChoice;
  const grandTotal = useMemo(() => periods.reduce((sum, p) => sum + p.total, 0), [periods]);

  // Plan SC: 작업 14번 — 지금 보기(단위·계절 방식·비교 기준)에서 ±20% 이상 변한 구간과, 사용자가 고른 구간
  const bigPeriods = useMemo(
    () => periods.filter((p) => isBigChange(basis === "prev" ? p.vsPrev : p.vsLastYear)),
    [periods, basis],
  );
  const bigKeys = useMemo(() => new Set(bigPeriods.map((p) => p.key)), [bigPeriods]);
  const viewContext = `${unit}|${seasonMode}|${basis}`;
  const [picked, setPicked] = useState<{ context: string; key: string } | null>(null);
  // 보기를 바꾸면 고른 구간은 자동으로 풀린다 (다른 보기에서 고른 key는 쓰지 않음)
  const selected = picked?.context === viewContext ? (bigPeriods.find((p) => p.key === picked.key) ?? null) : null;
  const selectPeriod = (key: string) => setPicked({ context: viewContext, key });

  if (!loaded) {
    return (
      <section className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center text-sm text-neutral-600">
        매출 엑셀을 올리면 여기에 주·월·분기·계절별 합계가 나와요.
      </section>
    );
  }

  const hasProducts = loaded.summary.hasProducts;
  const newestFirst = [...periods].reverse(); // 최근 기간이 위에 오도록

  return (
    <section className="rounded-lg border border-neutral-300 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">매출 추이와 기간별 합계</h2>
        <div role="group" aria-label="보기 단위" className="flex overflow-hidden rounded border border-neutral-300">
          {VIEWS.map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              onClick={() => setUnit(u)}
              className={`px-4 py-1.5 text-sm font-medium ${
                unit === u ? "bg-emerald-600 text-white" : "bg-white hover:bg-neutral-100"
              }`}
            >
              {VIEW_LABELS[u]}
            </button>
          ))}
        </div>
      </div>

      {unit === "season" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-neutral-600">계절 방식</span>
          <div role="group" aria-label="계절 방식" className="flex overflow-hidden rounded border border-neutral-300">
            {SEASON_MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={seasonMode === m}
                onClick={() => setSeasonMode(m)}
                className={`px-3 py-1 text-sm ${
                  seasonMode === m ? "bg-emerald-600 text-white" : "bg-white hover:bg-neutral-100"
                }`}
              >
                {SEASON_MODE_LABELS[m]}
              </button>
            ))}
          </div>
          <span className="text-xs text-neutral-500">
            {SEASONS[seasonMode].map((s) => `${s.name} ${monthRangeText(s)}`).join(" · ")}
          </span>
        </div>
      )}

      <p className="mt-2 text-xs text-neutral-500">
        {unit === "season" ? SEASON_MODE_LABELS[seasonMode] : VIEW_LABELS[unit]} {periods.length.toLocaleString("ko-KR")}개 ·{" "}
        {unit === "season" && seasonMode === "pharmacy"
          ? `겹치는 달은 두 시즌에 모두 들어가고${
              uncoveredMonths.length > 0 ? ` 어느 시즌에도 없는 달(${uncoveredMonths.join("·")}월)은 빠져서` : "서"
            }, 시즌 합계를 더해도 전체 매출과 같지 않아요`
          : `전체 합계 ${won(grandTotal)}원`}{" "}
        · 휴무일은 일평균에서 빼고 계산해요.
        {unit === "week" && " 주는 월요일~일요일이고, 목요일이 속한 달의 주로 이름을 붙여요."}
        {unit === "season" && " 해를 넘기는 시즌(예: 12~2월)은 시작한 해의 시즌으로 묶어요."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-neutral-600">비교 기준</span>
        {basisFixed ? (
          <span className="text-sm">
            <b>{basisFixed === "prev" ? "전주" : "전년 같은 시즌"}</b>
            <span className="ml-1 text-xs text-neutral-500">
              {unit === "week"
                ? "(주 단위는 전주와 비교해요)"
                : "(약국 시즌은 서로 겹쳐서 1년 전 같은 시즌과만 비교해요)"}
            </span>
          </span>
        ) : (
          <div role="group" aria-label="비교 기준" className="flex overflow-hidden rounded border border-neutral-300">
            {BASES.map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={basis === b}
                onClick={() => setBasisChoice(b)}
                className={`px-3 py-1 text-sm ${basis === b ? "bg-emerald-600 text-white" : "bg-white hover:bg-neutral-100"}`}
              >
                {BASIS_LABELS[b]}
              </button>
            ))}
          </div>
        )}
        <span className="text-xs text-neutral-500">
          증감률은 휴무일 수가 달라도 공정하게 비교하도록 영업일 일평균으로 계산해요. (합계 기준은 참고로 작게 보여 드려요)
        </span>
      </div>

      <div className="mt-4 rounded border border-neutral-200 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-neutral-600">그래프로 볼 값</span>
          <div role="group" aria-label="그래프로 볼 값" className="flex overflow-hidden rounded border border-neutral-300">
            {METRICS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={metric === m}
                onClick={() => setMetric(m)}
                className={`px-3 py-1 text-sm ${metric === m ? "bg-emerald-600 text-white" : "bg-white hover:bg-neutral-100"}`}
              >
                {METRIC_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
        <SalesChart
          periods={periods}
          metric={metric}
          basis={basis}
          bigKeys={bigKeys}
          selectedKey={selected?.key ?? null}
          onSelect={selectPeriod}
        />

        <div className="mt-3 border-t border-neutral-200 pt-3">
          {bigPeriods.length === 0 ? (
            <p className="text-sm text-neutral-600">
              이 보기에서는 {basisFixed === "prev" ? "전주" : BASIS_LABELS[basis]} 대비 ±{BIG_CHANGE_PERCENT}% 이상 변한 구간이
              없어요.
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-neutral-800">
                {basisFixed === "prev" ? "전주" : BASIS_LABELS[basis]} 대비 ±{BIG_CHANGE_PERCENT}% 이상 변한 구간{" "}
                {bigPeriods.length}개 <span className="font-normal text-neutral-500">· 눌러서 고르세요</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="큰 변화 구간">
                {[...bigPeriods].reverse().map((p) => {
                  const rate = (basis === "prev" ? p.vsPrev : p.vsLastYear).rate ?? 0;
                  const isSel = selected?.key === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      aria-pressed={isSel}
                      onClick={() => selectPeriod(p.key)}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        isSel ? "border-red-600 bg-red-600 text-white" : "border-red-300 bg-red-50 text-red-800 hover:bg-red-100"
                      }`}
                    >
                      {p.label} {rate > 0 ? "▲" : "▼"} {Math.abs(rate).toFixed(1)}%
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {selected &&
        (() => {
          const change = basis === "prev" ? selected.vsPrev : selected.vsLastYear;
          const target = periods.find((p) => p.key === change.targetKey) ?? null;
          const unitLabel = unit === "season" ? SEASON_MODE_LABELS[seasonMode] : VIEW_LABELS[unit];
          const basisLabel = basisFixed === "prev" ? "전주" : BASIS_LABELS[basis];
          return (
            <SelectedPeriod
              period={selected}
              change={change}
              target={target}
              hasProducts={hasProducts}
              causePayload={
                target && change.rate !== null
                  ? buildCausePayload(loaded.rows, selected, target, change.rate, unitLabel, basisLabel)
                  : null
              }
              onClear={() => setPicked(null)}
            />
          );
        })()}

      <h3 className="mt-4 text-sm font-semibold text-neutral-700">표로 보기 (최근 기간이 위)</h3>
      <div className="mt-1 max-h-[28rem] overflow-auto">
        <table className="w-full min-w-[46rem] text-left text-sm [&_th]:whitespace-nowrap">

          <thead className="sticky top-0 border-b border-neutral-300 bg-white text-neutral-500">
            <tr>
              <th className="py-1.5 pr-3 font-medium">기간</th>
              <th className="py-1.5 pr-3 text-right font-medium">매출 합계(원)</th>
              <th className="py-1.5 pr-3 text-right font-medium">영업일</th>
              <th className="py-1.5 pr-3 text-right font-medium">영업일 일평균(원)</th>
              <th className="py-1.5 pr-3 font-medium">{basisFixed === "prev" ? "전주" : BASIS_LABELS[basis]} 대비</th>
              {hasProducts && <th className="py-1.5 pr-3 font-medium">가장 많이 팔린 상품</th>}
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((p) => (
              <tr
                key={p.key}
                className={`border-b border-neutral-100 align-top ${
                  selected?.key === p.key ? "bg-red-50 outline outline-2 -outline-offset-2 outline-red-400" : ""
                }`}
              >
                <td className="py-1.5 pr-3">
                  <div className="font-medium">
                    {p.label}
                    {p.seasonMonths && <span className="ml-1 text-xs font-normal text-neutral-500">({p.seasonMonths})</span>}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {p.start} ~ {p.end}
                  </div>
                  {p.partial && (
                    <div className="text-xs text-amber-700">일부 기간만 있어요 ({p.dataDays}/{p.calendarDays}일)</div>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{won(p.total)}</td>
                <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums">
                  {p.openDays}일
                  {p.closedDays > 0 && <div className="text-xs text-neutral-500">휴무 {p.closedDays}일</div>}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {p.dailyAverage === null ? "—" : won(p.dailyAverage)}
                </td>
                <td className="py-1.5 pr-3">
                  <ChangeCell change={basis === "prev" ? p.vsPrev : p.vsLastYear} big={bigKeys.has(p.key)} />
                  {bigKeys.has(p.key) && selected?.key !== p.key && (
                    <button
                      type="button"
                      onClick={() => selectPeriod(p.key)}
                      className="mt-1 rounded border border-red-300 px-2 py-0.5 text-xs text-red-800 hover:bg-red-50"
                    >
                      이 구간 고르기
                    </button>
                  )}
                </td>
                {hasProducts && (
                  <td className="py-1.5 pr-3 text-xs">
                    {p.topProducts[0] ? `${p.topProducts[0].product} (${won(p.topProducts[0].total)}원)` : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
