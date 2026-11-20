// Design Ref: §3.2 — 서버(AI)에는 {구간, 매출 합계, 변화율, 상품별 합계} 같은 집계 숫자만 보낸다.
// PLAN 위험 대응 — "근거 숫자는 코드가 넣고 AI는 문장만 쓴다". 근거(fact)는 이 파일의 코드가 숫자로 만든다.
// Plan SC: 작업 16번 (원인 후보: "가능성" 표현, 근거 표시, 근거 없으면 "알 수 없음")
//
// 화면(보낼 내용 만들기)과 서버(근거 다시 계산하기)가 함께 쓰는 순수 계산 코드다.

import type { PeriodTotal } from "./aggregate";
import type { SalesRow } from "./sales";
import { SEASONS, seasonsOfMonth } from "./seasons";

export const MAX_CAUSE_PRODUCTS = 20; // AI에 보내는 상품 수 상한 (매출이 큰 순서)
export const MAX_CANDIDATES = 3;

export type CausePeriod = {
  label: string;
  start: string; // "YYYY-MM-DD"
  end: string;
  total: number;
  openDays: number;
  closedDays: number;
  dailyAverage: number | null;
  partial: boolean;
};

// 화면 → 서버로 보내는 내용 전부 (환자 정보·원본 줄은 없다. 기간 집계와 상품명별 합계뿐)
export type CausePayload = {
  unitLabel: string; // "주", "월", "분기", "일반 4계절", "약국 시즌"
  basisLabel: string; // "전주", "직전 기간", "전년 같은 기간"
  rate: number; // 영업일 일평균 기준 증감률(%)
  period: CausePeriod; // 고른 구간
  target: CausePeriod; // 비교한 구간
  products: { product: string; current: number; previous: number }[]; // 두 구간의 상품별 매출 합계
};

export type CauseFact = { id: string; text: string };

export type CauseCandidate = { text: string; evidence: CauseFact[] };

export type CauseResponse = {
  candidates: CauseCandidate[]; // 비어 있으면 "알 수 없음"
  unknownReason: string | null;
  facts: CauseFact[]; // 코드가 계산한 근거 전체 (AI가 없어도 보여 줄 수 있음)
};

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const manwon = (n: number) => `${(Math.round(n / 1000) / 10).toLocaleString("ko-KR")}만원`;
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

function toCausePeriod(p: PeriodTotal): CausePeriod {
  return {
    label: p.label,
    start: p.start,
    end: p.end,
    total: p.total,
    openDays: p.openDays,
    closedDays: p.closedDays,
    dailyAverage: p.dailyAverage,
    partial: p.partial,
  };
}

// 두 구간의 상품별 매출 합계 (원본 줄에서 계산, 상품명과 합계만 남김)
function productTotals(rows: SalesRow[], start: string, end: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const r of rows) {
    if (!r.product || r.date < start || r.date > end) continue;
    totals.set(r.product, (totals.get(r.product) ?? 0) + r.amount);
  }
  return totals;
}

// 화면에서: 고른 구간으로 서버에 보낼 집계를 만든다
export function buildCausePayload(
  rows: SalesRow[],
  period: PeriodTotal,
  target: PeriodTotal,
  rate: number,
  unitLabel: string,
  basisLabel: string,
): CausePayload {
  const cur = productTotals(rows, period.start, period.end);
  const prev = productTotals(rows, target.start, target.end);
  const names = new Set([...cur.keys(), ...prev.keys()]);
  const products = [...names]
    .map((product) => ({ product, current: cur.get(product) ?? 0, previous: prev.get(product) ?? 0 }))
    .sort((a, b) => b.current + b.previous - (a.current + a.previous))
    .slice(0, MAX_CAUSE_PRODUCTS);
  return { unitLabel, basisLabel, rate, period: toCausePeriod(period), target: toCausePeriod(target), products };
}

// 서버·화면 공통: 숫자로 확인되는 사실(근거)을 만든다. AI는 이 목록의 id로만 근거를 댈 수 있다.
export function buildFacts(p: CausePayload): CauseFact[] {
  const facts: CauseFact[] = [];
  const add = (text: string) => facts.push({ id: `F${facts.length + 1}`, text });
  const cur = p.period;
  const prev = p.target;

  add(
    `영업일 하루 평균 매출: 고른 구간(${cur.label}) ${cur.dailyAverage === null ? "-" : won(cur.dailyAverage)}, ` +
      `비교 구간(${prev.label}) ${prev.dailyAverage === null ? "-" : won(prev.dailyAverage)}, 변화 ${pct(p.rate)}.`,
  );

  if (cur.openDays !== prev.openDays || cur.closedDays !== prev.closedDays) {
    add(
      `영업일이 ${prev.openDays}일(휴무 ${prev.closedDays}일) → ${cur.openDays}일(휴무 ${cur.closedDays}일)로 달라져 합계가 함께 변했어요.`,
    );
  }
  if (cur.partial || prev.partial) {
    add(`${cur.partial ? `고른 구간(${cur.label})` : `비교 구간(${prev.label})`}에는 올린 자료의 일부 날짜만 들어 있어요.`);
  }

  // 상품별: 영업일 하루 평균으로 맞춰 비교하고, 전체 변화에 크게 기여한 상품을 고른다
  const curDays = Math.max(cur.openDays, 1);
  const prevDays = Math.max(prev.openDays, 1);
  const totalDiff = (cur.dailyAverage ?? 0) - (prev.dailyAverage ?? 0);
  if (p.products.length > 0 && totalDiff !== 0) {
    const movers = p.products
      .map((x) => {
        const a = x.previous / prevDays;
        const b = x.current / curDays;
        return { ...x, a, b, diff: b - a, share: (b - a) / totalDiff };
      })
      .filter((x) => Math.abs(x.share) >= 0.15)
      .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))
      .slice(0, 4);
    for (const m of movers) {
      const change = m.a > 0 ? ` (${pct(((m.b - m.a) / m.a) * 100)})` : " (전에는 매출 없음)";
      const dir = m.share > 0 ? "전체 변화와 같은 방향" : "전체 변화와 반대 방향";
      add(
        `${m.product}: 영업일 하루 평균 ${manwon(m.a)} → ${manwon(m.b)}${change}, ${dir}으로 전체 변화의 약 ${Math.round(Math.abs(m.share) * 100)}%를 차지해요.`,
      );
    }
  }

  // 달력: 약국 시즌이 시작·끝나는 달인지 (주·월 단위에서만 의미가 있음)
  if (p.unitLabel === "주" || p.unitLabel === "월") {
    const month = (d: string) => [Number(d.slice(0, 4)), Number(d.slice(5, 7))] as const;
    const [cy, cm] = month(cur.start);
    const [py, pm] = month(prev.start);
    if (cm !== pm) {
      const curIds = new Set(seasonsOfMonth(cy, cm, "pharmacy").map((s) => s.def.id));
      const prevIds = new Set(seasonsOfMonth(py, pm, "pharmacy").map((s) => s.def.id));
      for (const s of SEASONS.pharmacy) {
        if (curIds.has(s.id) && !prevIds.has(s.id)) add(`달력: 고른 구간(${cur.label})부터 '${s.name}' 시즌(${s.months[0]}월 시작)이에요.`);
        if (!curIds.has(s.id) && prevIds.has(s.id)) add(`달력: 고른 구간(${cur.label})은 '${s.name}' 시즌이 끝난 뒤예요.`);
      }
    }
  }
  return facts;
}

// AI에게 주는 규칙. 의학적 효능 판단은 하지 않고, 주어진 근거로만 "가능성"을 말하게 한다.
export const CAUSE_INSTRUCTIONS = [
  "당신은 동네 약국의 매출 자료를 함께 보는 조수입니다.",
  "아래 '근거' 목록에 있는 숫자와 사실만 사용해서, 매출이 변한 원인 후보를 최대 3개 한국어로 씁니다.",
  "규칙:",
  "1) 각 후보는 한 문장, 80자 이내이고 반드시 '~했을 가능성이 있어요'처럼 가능성으로 표현합니다. 단정하지 않습니다.",
  "2) 각 후보에는 그 후보를 뒷받침하는 근거 id(F1, F2 …)를 1개 이상 evidence_ids에 넣습니다. 목록에 없는 숫자·사실(날씨, 뉴스, 유행병 등)을 지어내지 않습니다.",
  "3) 질병 치료나 약의 효능을 판단하거나 권하지 않습니다.",
  "4) 근거만으로 원인을 말할 수 없으면 candidates를 빈 배열로 두고 unknown_reason에 그 이유를 한 문장으로 씁니다. 후보가 있으면 unknown_reason은 빈 글자입니다.",
].join("\n");

export const CAUSE_SCHEMA = {
  name: "cause_candidates",
  schema: {
    type: "object",
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            evidence_ids: { type: "array", items: { type: "string" } },
          },
          required: ["text", "evidence_ids"],
          additionalProperties: false,
        },
      },
      unknown_reason: { type: "string" },
    },
    required: ["candidates", "unknown_reason"],
    additionalProperties: false,
  },
} as const;

export function causeInput(p: CausePayload, facts: CauseFact[]): string {
  return [
    `보기 단위: ${p.unitLabel}, 비교 기준: ${p.basisLabel}`,
    `고른 구간: ${p.period.label} (${p.period.start}~${p.period.end}), 비교 구간: ${p.target.label} (${p.target.start}~${p.target.end})`,
    "근거:",
    ...facts.map((f) => `${f.id}. ${f.text}`),
  ].join("\n");
}

const POSSIBILITY = /가능|수 있/;

// AI 답을 검사해 화면용으로 바꾼다: 근거 id가 없는 후보는 버리고, 근거 문장은 코드가 만든 것으로 붙인다.
export function finalizeCause(raw: unknown, facts: CauseFact[]): CauseResponse {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const obj = (raw ?? {}) as { candidates?: unknown; unknown_reason?: unknown };
  const list = Array.isArray(obj.candidates) ? obj.candidates : [];
  const candidates: CauseCandidate[] = [];
  for (const item of list) {
    const c = item as { text?: unknown; evidence_ids?: unknown };
    if (typeof c.text !== "string" || !c.text.trim()) continue;
    const ids = Array.isArray(c.evidence_ids) ? c.evidence_ids.filter((x): x is string => typeof x === "string") : [];
    const evidence = [...new Set(ids)].map((id) => byId.get(id.trim())).filter((f): f is CauseFact => !!f);
    if (evidence.length === 0) continue; // 근거 없는 후보는 보여 주지 않는다
    let text = c.text.trim().slice(0, 150);
    if (!POSSIBILITY.test(text)) text = `${text.replace(/[.。]$/, "")} (가능성)`; // 단정으로 읽히지 않게
    candidates.push({ text, evidence });
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  const reason = typeof obj.unknown_reason === "string" && obj.unknown_reason.trim() ? obj.unknown_reason.trim().slice(0, 150) : null;
  return {
    candidates,
    unknownReason: candidates.length > 0 ? null : (reason ?? "올린 자료의 숫자만으로는 원인을 말할 근거가 부족해요."),
    facts,
  };
}
