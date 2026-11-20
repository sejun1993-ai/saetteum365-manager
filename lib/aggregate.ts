// Design Ref: §3.2 — 일 매출 표 → 주·월·분기 합산. 화면과 무관한 순수 계산 코드(브라우저 안에서만 실행).
// Design Ref: §5.5 — 주는 월요일~일요일, 표시 이름은 "2026년 3월 2주"처럼 월 기준 주차.
// Plan SC: 작업 10번 (주·월·분기 합산), 11번 (일반 4계절·약국 시즌 합산), 12번 (증감률)
//
// 휴무일이 섞인 기간끼리 공정하게 비교할 수 있도록 합계와 함께
// "영업일 수"와 "영업일 일평균"(휴무일은 빼고 나눔)을 같이 계산해 둔다. 증감률은 맨 아래 withChanges.

import type { SalesRow } from "./sales";
import { monthRangeText, SEASONS, seasonsOfMonth, type SeasonMode } from "./seasons";

export type PeriodUnit = "week" | "month" | "quarter";

export const UNIT_LABELS: Record<PeriodUnit, string> = { week: "주", month: "월", quarter: "분기" };

export type PeriodTotal = {
  unit: PeriodUnit | "season";
  key: string; // 정렬·비교용 고유 이름. 주 "2026-W10", 월 "2026-03", 분기 "2026-Q1", 시즌 "2025-winter"
  label: string; // 화면 표시용. 주 "2026년 3월 2주", 월 "2026년 3월", 분기 "2026년 1분기", 시즌 "2025년 겨울"
  start: string; // 기간 첫날 "YYYY-MM-DD"
  end: string; // 기간 마지막 날
  year: number; // 주는 ISO 주차의 해, 월·분기는 그 해, 시즌은 시작하는 해
  index: number; // 주 = ISO 주 번호(1~53), 월 = 1~12, 분기 = 1~4, 시즌 = 정의 순서 (전년 같은 기간을 찾을 때 사용)
  seasonId?: string; // 시즌일 때만: lib/seasons.ts의 시즌 id
  seasonMonths?: string; // 시즌일 때만: "12~2월" 같은 달 범위
  total: number; // 매출 합계(원)
  calendarDays: number; // 기간 전체 날짜 수 (주 7, 월 28~31, 분기 90~92)
  dataDays: number; // 자료가 있는 날 수
  openDays: number; // 영업일 수 (자료가 있고 휴무가 아닌 날)
  closedDays: number; // 휴무로 표시된 날 수
  dailyAverage: number | null; // 영업일 일평균(원, 반올림). 영업일이 0이면 null
  partial: boolean; // 올린 자료의 첫날·마지막 날에 걸려 기간 일부만 들어 있으면 true (비교 때 주의)
  topProducts: { product: string; total: number }[]; // 매출 상위 상품 최대 5개 (상품별 자료일 때만)
};

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_PRODUCTS = 5;

// "YYYY-MM-DD" ↔ 날짜 (시간대 차이로 하루가 밀리지 않도록 UTC로만 계산)
function toTime(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function toDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}
function daysBetween(start: number, end: number): number {
  return Math.round((end - start) / DAY_MS) + 1;
}

type PeriodInfo = Omit<
  PeriodTotal,
  "total" | "dataDays" | "openDays" | "closedDays" | "dailyAverage" | "partial" | "topProducts" | "calendarDays" | "unit"
> & { startTime: number; endTime: number };

// 그 날짜가 속한 주(월~일)의 정보
// 주의 이름은 그 주의 목요일이 속한 달로 정한다 (달이 바뀌는 주를 한 달에만 넣기 위한 흔한 기준, ISO 주차와 같은 방식)
function weekOf(time: number): PeriodInfo {
  const dow = (new Date(time).getUTCDay() + 6) % 7; // 월=0 … 일=6
  const startTime = time - dow * DAY_MS;
  const endTime = startTime + 6 * DAY_MS;
  const thursday = new Date(startTime + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const month = thursday.getUTCMonth() + 1;
  const weekInMonth = Math.floor((thursday.getUTCDate() - 1) / 7) + 1;
  const isoWeek = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return {
    key: `${year}-W${String(isoWeek).padStart(2, "0")}`,
    label: `${year}년 ${month}월 ${weekInMonth}주`,
    start: toDate(startTime),
    end: toDate(endTime),
    year,
    index: isoWeek,
    startTime,
    endTime,
  };
}

function monthOf(time: number): PeriodInfo {
  const d = new Date(time);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const startTime = Date.UTC(year, month - 1, 1);
  const endTime = Date.UTC(year, month, 1) - DAY_MS;
  return {
    key: `${year}-${String(month).padStart(2, "0")}`,
    label: `${year}년 ${month}월`,
    start: toDate(startTime),
    end: toDate(endTime),
    year,
    index: month,
    startTime,
    endTime,
  };
}

function quarterOf(time: number): PeriodInfo {
  const d = new Date(time);
  const year = d.getUTCFullYear();
  const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
  const startTime = Date.UTC(year, (quarter - 1) * 3, 1);
  const endTime = Date.UTC(year, quarter * 3, 1) - DAY_MS;
  return {
    key: `${year}-Q${quarter}`,
    label: `${year}년 ${quarter}분기`,
    start: toDate(startTime),
    end: toDate(endTime),
    year,
    index: quarter,
    startTime,
    endTime,
  };
}

const PERIOD_OF: Record<PeriodUnit, (time: number) => PeriodInfo> = {
  week: weekOf,
  month: monthOf,
  quarter: quarterOf,
};

type DayTotal = { time: number; amount: number; closed: boolean; products: Map<string, number> };

// 같은 날의 여러 줄(상품별)을 하루 한 줄로 모은다. 그날 한 줄이라도 휴무 표시가 있으면 휴무일로 본다.
export function toDailyTotals(rows: SalesRow[]): DayTotal[] {
  const days = new Map<string, DayTotal>();
  for (const row of rows) {
    let day = days.get(row.date);
    if (!day) {
      day = { time: toTime(row.date), amount: 0, closed: false, products: new Map() };
      days.set(row.date, day);
    }
    day.amount += row.amount;
    if (row.closed) day.closed = true;
    if (row.product) day.products.set(row.product, (day.products.get(row.product) ?? 0) + row.amount);
  }
  return [...days.values()].sort((a, b) => a.time - b.time);
}

// 일 매출 줄을 주·월·분기 단위로 합산한다. 결과는 기간 순서(오래된 것 → 최근)로 돌려준다.
// 자료가 하나도 없는 기간(예: 중간에 몇 주 통째로 빠짐)은 결과에 넣지 않는다.
export function aggregateSales(rows: SalesRow[], unit: PeriodUnit): PeriodTotal[] {
  return aggregateBy(rows, unit, (time) => [PERIOD_OF[unit](time)]);
}

// 그 날짜가 들어가는 시즌들 (약국 시즌은 겹칠 수 있어서 여러 개일 수 있다)
function seasonPeriodsOf(time: number, mode: SeasonMode): PeriodInfo[] {
  const d = new Date(time);
  return seasonsOfMonth(d.getUTCFullYear(), d.getUTCMonth() + 1, mode).map(({ def, seasonYear }) => {
    // 시즌의 마지막 달이 속한 해: 달 번호가 작아질 때마다(12월 → 1월) 해가 하나 넘어간다
    let endYear = seasonYear;
    for (let i = 1; i < def.months.length; i++) if (def.months[i] < def.months[i - 1]) endYear += 1;
    const lastMonth = def.months[def.months.length - 1];
    const startTime = Date.UTC(seasonYear, def.months[0] - 1, 1);
    const endTime = Date.UTC(endYear, lastMonth, 1) - DAY_MS;
    return {
      key: `${seasonYear}-${def.id}`,
      label: `${seasonYear}년 ${def.name}`,
      start: toDate(startTime),
      end: toDate(endTime),
      year: seasonYear,
      index: SEASONS[mode].indexOf(def) + 1,
      seasonId: def.id,
      seasonMonths: monthRangeText(def),
      startTime,
      endTime,
    };
  });
}

// 일 매출 줄을 일반 4계절 또는 약국 시즌 단위로 합산한다.
// 일반 4계절은 모든 날이 한 계절에만 들어간다(계절 합계를 더하면 전체 합계와 같다).
// 약국 시즌은 겹치는 달이 두 시즌에 모두 들어가고, 어느 시즌에도 없는 달(예: 6월)은 빠진다.
export function aggregateSeasons(rows: SalesRow[], mode: SeasonMode): PeriodTotal[] {
  return aggregateBy(rows, "season", (time) => seasonPeriodsOf(time, mode));
}

function aggregateBy(rows: SalesRow[], unit: PeriodTotal["unit"], periodsOf: (time: number) => PeriodInfo[]): PeriodTotal[] {
  const days = toDailyTotals(rows);
  if (days.length === 0) return [];
  const firstTime = days[0].time;
  const lastTime = days[days.length - 1].time;

  type Acc = PeriodInfo & {
    total: number;
    dataDays: number;
    openDays: number;
    closedDays: number;
    openAmount: number;
    products: Map<string, number>;
  };
  const periods = new Map<string, Acc>();

  for (const day of days) {
    for (const info of periodsOf(day.time)) {
      let acc = periods.get(info.key);
      if (!acc) {
        acc = { ...info, total: 0, dataDays: 0, openDays: 0, closedDays: 0, openAmount: 0, products: new Map() };
        periods.set(info.key, acc);
      }
      acc.total += day.amount;
      acc.dataDays += 1;
      if (day.closed) {
        acc.closedDays += 1;
      } else {
        acc.openDays += 1;
        acc.openAmount += day.amount;
      }
      for (const [product, amount] of day.products) {
        acc.products.set(product, (acc.products.get(product) ?? 0) + amount);
      }
    }
  }

  return [...periods.values()]
    .sort((a, b) => a.startTime - b.startTime || a.index - b.index) // 같은 날 시작하는 시즌은 정의 순서대로
    .map((acc) => ({
      unit,
      key: acc.key,
      label: acc.label,
      start: acc.start,
      end: acc.end,
      year: acc.year,
      index: acc.index,
      ...(acc.seasonId ? { seasonId: acc.seasonId, seasonMonths: acc.seasonMonths } : {}),
      total: acc.total,
      calendarDays: daysBetween(acc.startTime, acc.endTime),
      dataDays: acc.dataDays,
      openDays: acc.openDays,
      closedDays: acc.closedDays,
      // 휴무일 매출은 일평균에서 뺀다 (휴무일에 들어온 소액 매출이 있어도 합계에는 포함)
      dailyAverage: acc.openDays > 0 ? Math.round(acc.openAmount / acc.openDays) : null,
      partial: acc.startTime < firstTime || acc.endTime > lastTime,
      topProducts: [...acc.products.entries()]
        .filter(([, total]) => total > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_PRODUCTS)
        .map(([product, total]) => ({ product, total })),
    }));
}

// ───────────────────────── 증감률 (작업 12번) ─────────────────────────
// Design Ref: §5.5 — 직전 기간 = 바로 앞의 같은 단위(전주·전월·전분기·앞 계절), 전년 같은 기간 = 1년 전 같은 주(ISO 주차)·달·분기·시즌.
// Plan SC: 작업 12번 (직전 기간 대비, 전년 같은 기간 대비 증감률)
//
// 증감률은 "영업일 일평균"으로 계산한다. 휴무일 수가 다른 기간이나, 자료가 일부만 들어 있는 기간(처음·마지막 기간)도
// 공정하게 비교하기 위해서다. 합계로 계산한 증감률도 참고용으로 함께 둔다.

export type CompareBasis = "prev" | "lastYear";

export const BASIS_LABELS: Record<CompareBasis, string> = { prev: "직전 기간", lastYear: "전년 같은 기간" };

export type PeriodChange = {
  basis: CompareBasis;
  targetKey: string | null; // 비교한 기간의 key (비교 기간이 정해지지 않으면 null)
  targetLabel: string | null; // 비교한 기간의 이름 (예: "2025년 3월")
  rate: number | null; // 영업일 일평균 기준 증감률(%, 소수 첫째 자리). 비교할 수 없으면 null
  totalRate: number | null; // 합계 기준 증감률(%, 참고용)
  reason: string | null; // 비교할 수 없을 때 이유
  partial: boolean; // 두 기간 중 하나라도 일부 기간만 있으면 true
};

export type PeriodWithChange = PeriodTotal & { vsPrev: PeriodChange; vsLastYear: PeriodChange };

const ratePercent = (current: number, base: number) => Math.round(((current - base) / base) * 1000) / 10;

// 바로 앞 기간의 key. 약국 시즌은 서로 겹치고 성격이 달라 "앞 시즌"이 정해지지 않으므로 null
function prevKeyOf(p: PeriodTotal, seasonMode?: SeasonMode): string | null {
  const before = toTime(p.start) - DAY_MS; // 이 기간 첫날의 하루 전
  switch (p.unit) {
    case "week":
      return weekOf(before).key;
    case "month":
      return monthOf(before).key;
    case "quarter":
      return quarterOf(before).key;
    case "season":
      return seasonMode === "general" ? (seasonPeriodsOf(before, "general")[0]?.key ?? null) : null;
  }
}

// 1년 전 같은 기간의 key
function lastYearKeyOf(p: PeriodTotal): string {
  switch (p.unit) {
    case "week":
      return `${p.year - 1}-W${String(p.index).padStart(2, "0")}`;
    case "month":
      return `${p.year - 1}-${String(p.index).padStart(2, "0")}`;
    case "quarter":
      return `${p.year - 1}-Q${p.index}`;
    case "season":
      return `${p.year - 1}-${p.seasonId}`;
  }
}

function compare(p: PeriodTotal, basis: CompareBasis, targetKey: string | null, byKey: Map<string, PeriodTotal>): PeriodChange {
  const none = (reason: string, target: PeriodTotal | null = null): PeriodChange => ({
    basis,
    targetKey,
    targetLabel: target?.label ?? null,
    rate: null,
    totalRate: null,
    reason,
    partial: false,
  });
  if (!targetKey) return none("약국 시즌은 서로 겹쳐서 직전 시즌과는 비교하지 않아요");
  const target = byKey.get(targetKey);
  if (!target) return none(basis === "prev" ? "직전 기간 자료가 없어요" : "1년 전 같은 기간 자료가 없어요");
  if (!target.dailyAverage || p.dailyAverage === null) return none("비교할 영업일이 없어요", target);
  return {
    basis,
    targetKey,
    targetLabel: target.label,
    rate: ratePercent(p.dailyAverage, target.dailyAverage),
    totalRate: target.total > 0 ? ratePercent(p.total, target.total) : null,
    reason: null,
    partial: p.partial || target.partial,
  };
}

// 합산 결과에 직전 기간·전년 같은 기간 대비 증감률을 붙인다.
// 계절로 합산한 결과라면 어떤 계절 방식인지(seasonMode)를 함께 넘긴다.
export function withChanges(periods: PeriodTotal[], seasonMode?: SeasonMode): PeriodWithChange[] {
  const byKey = new Map(periods.map((p) => [p.key, p]));
  return periods.map((p) => ({
    ...p,
    vsPrev: compare(p, "prev", prevKeyOf(p, seasonMode), byKey),
    vsLastYear: compare(p, "lastYear", lastYearKeyOf(p), byKey),
  }));
}

// ───────────────────────── 큰 변화 구간 (작업 14번) ─────────────────────────
// Design Ref: §2.3 — 주는 전주 대비, 월·분기·계절은 고른 비교 기준 대비로 ±20% 이상 변한 구간만 빨간 표시한다.
// Plan SC: 작업 14번 (±20% 이상 변한 구간 표시)
export const BIG_CHANGE_PERCENT = 20;

// 영업일 일평균 기준 증감률이 ±20% "이상"이면 큰 변화 (비교할 수 없으면 아님)
export function isBigChange(change: PeriodChange): boolean {
  return change.rate !== null && Math.abs(change.rate) >= BIG_CHANGE_PERCENT;
}
