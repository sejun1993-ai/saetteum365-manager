// Design Ref: §3.3 — 상위 5개를 고르는 일은 코드가 한다(AI는 이유와 포스터 문구 초안만). 전문의약품은 제외하고,
// 전년 같은 시즌 자료가 없으면 "추천 불가"로 안내한다.
// Plan SC: 작업 19번 (지난 같은 시즌에 잘 팔린 일반의약품·의약외품 5개와 추천 근거)

import type { SalesRow } from "./sales";
import { seasonRange } from "./season-plan";
import type { SeasonDef } from "./seasons";

export const RECOMMEND_COUNT = 5;

export type RecommendItem = {
  rank: number;
  product: string;
  category: string;
  total: number; // 전년 같은 시즌 매출 합계
  share: number; // 시즌 동안 추천 후보 상품 매출 중 차지한 비율(%)
  lift: number | null; // 시즌 중 하루 평균 ÷ 올린 자료 전체의 하루 평균 (평소보다 몇 배)
  evidence: string; // 코드가 숫자로 만든 근거 문장
};

export type RecommendResult =
  | {
      ok: true;
      seasonLabel: string; // "2025년 독감"
      start: string;
      end: string;
      items: RecommendItem[];
      notes: string[]; // 참고 안내 (일부 기간만 있음, 뺀 상품 등)
    }
  | { ok: false; reason: string };

const manwon = (n: number) => `${(Math.round(n / 1000) / 10).toLocaleString("ko-KR")}만원`;

// 일반의약품·의약외품만 추천 대상 (전문의약품, 조제, 구분을 알 수 없는 상품은 제외)
export function isRecommendable(category: string): boolean {
  const c = category.replace(/\s/g, "");
  if (!c || /전문|조제|처방/.test(c.replace(/비처방|처방불필요/g, ""))) return false;
  return /일반의약품|일반약|의약외품/.test(c);
}

export function recommendProducts(rows: SalesRow[], def: SeasonDef, lastYear: number): RecommendResult {
  const { start, end } = seasonRange(def, lastYear);
  const seasonLabel = `${lastYear}년 ${def.name}`;
  const productRows = rows.filter((r) => r.product);
  if (productRows.length === 0) {
    return { ok: false, reason: "상품명이 있는 매출 자료가 필요해요. ERP에서 '상품별' 매출로 내려받아 올려 주세요." };
  }
  if (productRows.every((r) => !r.category)) {
    return {
      ok: false,
      reason: "자료에 구분(일반의약품·의약외품·전문의약품) 열이 없어서, 전문의약품을 뺄 수 없어 추천하지 않아요. 구분 열이 있는 자료를 올려 주세요.",
    };
  }

  const inSeason = productRows.filter((r) => r.date >= start && r.date <= end);
  if (inSeason.length === 0) {
    return {
      ok: false,
      reason: `추천 불가: 전년 같은 시즌(${seasonLabel}, ${start} ~ ${end}) 자료가 없어요. ERP에서 13개월 이상 내려받아 올려 주세요.`,
    };
  }

  // 날짜 수: 시즌 중 자료가 있는 날, 전체 자료가 있는 날
  const seasonDays = new Set(inSeason.map((r) => r.date)).size;
  const allDays = new Set(productRows.map((r) => r.date)).size;
  const calendarDays = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;

  const seasonTotals = new Map<string, { total: number; category: string }>();
  const excluded = new Set<string>();
  for (const r of inSeason) {
    if (!isRecommendable(r.category)) {
      excluded.add(r.product);
      continue;
    }
    const cur = seasonTotals.get(r.product) ?? { total: 0, category: r.category };
    cur.total += r.amount;
    seasonTotals.set(r.product, cur);
  }
  const overall = new Map<string, number>();
  for (const r of productRows) overall.set(r.product, (overall.get(r.product) ?? 0) + r.amount);

  const eligibleTotal = [...seasonTotals.values()].reduce((a, x) => a + x.total, 0);
  const ranked = [...seasonTotals.entries()]
    .filter(([, x]) => x.total > 0)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, RECOMMEND_COUNT);

  if (ranked.length === 0) {
    return { ok: false, reason: `추천 불가: ${seasonLabel} 시즌에 팔린 일반의약품·의약외품이 없어요.` };
  }

  const items: RecommendItem[] = ranked.map(([product, x], i) => {
    const seasonAvg = x.total / Math.max(seasonDays, 1);
    const overallAvg = (overall.get(product) ?? 0) / Math.max(allDays, 1);
    const lift = overallAvg > 0 ? Math.round((seasonAvg / overallAvg) * 10) / 10 : null;
    const share = eligibleTotal > 0 ? Math.round((x.total / eligibleTotal) * 1000) / 10 : 0;
    return {
      rank: i + 1,
      product,
      category: x.category,
      total: x.total,
      share,
      lift,
      evidence:
        `${seasonLabel} 시즌(${start} ~ ${end}) 매출 ${manwon(x.total)} · 추천 대상 상품 매출의 ${share}%` +
        (lift !== null ? ` · 시즌 중 하루 평균이 평소의 ${lift}배` : ""),
    };
  });

  const notes: string[] = [];
  if (seasonDays < calendarDays * 0.5) {
    notes.push(`${seasonLabel} 시즌 ${calendarDays}일 중 ${seasonDays}일 자료만 있어요. 추천은 참고만 해 주세요.`);
  }
  if (excluded.size > 0) notes.push(`전문의약품이거나 구분을 알 수 없는 상품 ${excluded.size}개는 추천에서 뺐어요.`);
  if (items.length < RECOMMEND_COUNT) notes.push(`추천할 수 있는 상품이 ${items.length}개뿐이에요.`);
  return { ok: true, seasonLabel, start, end, items, notes };
}
