// Design Ref: §2.4 ① — 시즌 선택 → "시즌 시작 2주 전"까지 남은 날짜 표시.
// Plan SC: 작업 18번 (다가오는 시즌을 고르는 화면, 시즌 2주 전 기준)

import { SEASONS, type SeasonDef, type SeasonMode } from "./seasons";

export const PREP_DAYS = 14; // 시즌 시작 2주 전부터 준비

const DAY_MS = 24 * 60 * 60 * 1000;
const toTime = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const toDate = (t: number) => new Date(t).toISOString().slice(0, 10);

// 한국 시간 기준 오늘 "YYYY-MM-DD"
export function todayKst(now: number = Date.now()): string {
  return toDate(now + 9 * 60 * 60 * 1000);
}

// 어떤 해에 시작하는 시즌의 첫날·마지막 날 (해를 넘기는 시즌은 다음 해에 끝남)
export function seasonRange(def: SeasonDef, seasonYear: number): { start: string; end: string } {
  let endYear = seasonYear;
  for (let i = 1; i < def.months.length; i++) if (def.months[i] < def.months[i - 1]) endYear += 1;
  const last = def.months[def.months.length - 1];
  return {
    start: toDate(Date.UTC(seasonYear, def.months[0] - 1, 1)),
    end: toDate(Date.UTC(endYear, last, 1) - DAY_MS),
  };
}

export type SeasonPlan = {
  def: SeasonDef;
  seasonYear: number; // 다가오는(또는 지금 진행 중인) 시즌이 시작하는 해
  start: string;
  end: string;
  prepStart: string; // 준비 시작일 = 시즌 시작 14일 전
  state: "waiting" | "prep" | "in-season"; // 준비 전 / 준비할 때(2주 전 ~ 시작 전) / 시즌 중
  daysToStart: number; // 시즌 시작까지 남은 날 (시즌 중이면 0)
  daysToPrep: number; // 준비 시작일까지 남은 날 (지났으면 0)
  lastYear: number; // 추천 근거로 쓸 "전년 같은 시즌"이 시작한 해
};

// today 기준으로 이 시즌의 "다가오는 또는 진행 중인" 회차를 찾는다
export function planSeason(def: SeasonDef, today: string): SeasonPlan {
  const t = toTime(today);
  const y = Number(today.slice(0, 4));
  for (const seasonYear of [y - 1, y, y + 1]) {
    const { start, end } = seasonRange(def, seasonYear);
    const s = toTime(start);
    const e = toTime(end);
    if (t > e) continue; // 이미 끝난 회차
    const prep = s - PREP_DAYS * DAY_MS;
    const state = t >= s ? "in-season" : t >= prep ? "prep" : "waiting";
    return {
      def,
      seasonYear,
      start,
      end,
      prepStart: toDate(prep),
      state,
      daysToStart: Math.max(0, Math.round((s - t) / DAY_MS)),
      daysToPrep: Math.max(0, Math.round((prep - t) / DAY_MS)),
      lastYear: seasonYear - 1,
    };
  }
  // 여기까지 오지 않지만, 안전하게 내년 회차를 돌려준다
  return planSeason(def, toDate(Date.UTC(y + 1, 0, 1)));
}

// 고를 수 있는 시즌 목록: 준비가 급한 순서(준비할 때 → 시즌 중 → 남은 날이 적은 순)
export function planAll(mode: SeasonMode, today: string): SeasonPlan[] {
  const rank = { prep: 0, "in-season": 1, waiting: 2 } as const;
  return SEASONS[mode]
    .map((def) => planSeason(def, today))
    .sort((a, b) => rank[a.state] - rank[b.state] || a.daysToStart - b.daysToStart);
}
