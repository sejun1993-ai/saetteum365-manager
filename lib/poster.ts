// Design Ref: §3.3, §5.6 — 추천 이유와 포스터 문구 초안은 AI가 쓰고, 근거 숫자는 코드가 붙인다.
// AI가 안 될 때도 포스터를 만들 수 있도록 코드가 만든 "안전한 기본 문구"를 둔다.
// 문구는 질병 치료·효능 대신 계절 안내만 쓴다. (예: "환절기, 건강 챙기세요.")
// Plan SC: 작업 20번 (추천 이유·포스터 문구 초안), 21번 (포스터 양식)

import { findForbidden, TITLE_MAX, titleLength } from "./poster-guard";
import type { RecommendItem } from "./recommend";

export const POSTER_MAX_LINES = 3;
export const POSTER_LINE_MAX = 40;

// 시즌별 기본 안내 문구 (코드가 쓴 것, 금지 표현 없음)
const DEFAULT_LINES: Record<string, string[]> = {
  spring: ["따뜻한 봄, 건강하게 맞이하세요.", "필요한 상품을 미리 준비해 두었어요."],
  summer: ["무더운 여름, 건강 관리에 신경 써 주세요.", "필요한 상품을 미리 준비해 두었어요."],
  autumn: ["선선한 가을, 일교차에 대비하세요.", "필요한 상품을 미리 준비해 두었어요."],
  winter: ["추운 겨울, 따뜻하게 건강 챙기세요.", "필요한 상품을 미리 준비해 두었어요."],
  "cold-spring": ["환절기, 건강 챙기세요.", "필요한 상품을 미리 준비해 두었어요."],
  "cold-autumn": ["환절기, 건강 챙기세요.", "필요한 상품을 미리 준비해 두었어요."],
  pollen: ["꽃가루가 많은 계절이에요.", "외출 후에는 손을 깨끗이 씻어 주세요."],
  flu: ["독감이 유행하는 계절이에요.", "손 씻기와 마스크를 챙겨 주세요."],
  "summer-stomach": ["더운 여름, 음식 보관에 신경 써 주세요.", "실내외 온도 차이에도 주의하세요."],
};

export function defaultPoster(seasonId: string, seasonName: string): { title: string; lines: string[] } {
  const title = `${seasonName} 준비하세요`;
  return {
    title: titleLength(title) <= TITLE_MAX ? title : `${seasonName}`.slice(0, TITLE_MAX),
    lines: DEFAULT_LINES[seasonId] ?? ["계절에 맞게 건강 챙기세요.", "필요한 상품을 미리 준비해 두었어요."],
  };
}

// 서버로 보내는 내용: 시즌 이름과 추천 상품의 집계 숫자·상품명뿐
export type SeasonAiPayload = {
  seasonName: string;
  seasonMonths: string; // "11~2월"
  basisLabel: string; // "2025년 독감"
  items: { product: string; category: string; total: number; share: number; lift: number | null }[];
};

export type SeasonAiResponse = {
  reasons: (string | null)[]; // items와 같은 순서. null이면 AI 이유를 쓰지 않음(코드 근거만 표시)
  poster: { title: string; lines: string[] } | null; // null이면 기본 문구 사용
  dropped: number; // 규칙에 맞지 않아 버린 AI 문장 수
};

export const SEASON_INSTRUCTIONS = [
  "당신은 동네 약국의 시즌 진열을 돕는 조수입니다. 한국어로 답합니다.",
  "1) reasons: 상품마다 추천 이유를 한 문장(60자 이내)으로, 주어진 숫자(지난 시즌 매출, 비율, 평소 대비 배수)만 근거로 씁니다. 순서는 입력 상품 순서와 같습니다.",
  "2) poster_title: 시즌을 알리는 포스터 제목, 20자 이내.",
  "3) poster_lines: 계절 안내 문구 2~3줄, 각 40자 이내. 예: '환절기, 건강 챙기세요.'",
  "반드시 지킬 것: 질병을 치료·예방한다거나 약의 효능·효과를 말하지 않습니다. '완치', '최고', '100%', '즉시', '특효', '확실', '보장', '부작용 없음' 같은 단정·과장 표현을 쓰지 않습니다.",
  "포스터에는 상품 이름이나 가격을 쓰지 않습니다(상품 목록은 앱이 따로 넣습니다). 주어지지 않은 숫자나 사실을 지어내지 않습니다.",
].join("\n");

export const SEASON_SCHEMA = {
  name: "season_poster",
  schema: {
    type: "object",
    properties: {
      reasons: { type: "array", items: { type: "string" } },
      poster_title: { type: "string" },
      poster_lines: { type: "array", items: { type: "string" } },
    },
    required: ["reasons", "poster_title", "poster_lines"],
    additionalProperties: false,
  },
} as const;

const manwon = (n: number) => `${(Math.round(n / 1000) / 10).toLocaleString("ko-KR")}만원`;

export function seasonInput(p: SeasonAiPayload): string {
  return [
    `다가오는 시즌: ${p.seasonName} (${p.seasonMonths})`,
    `근거 기간: 지난해 같은 시즌 (${p.basisLabel})`,
    "추천 상품 (지난 시즌 매출 순):",
    ...p.items.map(
      (x, i) =>
        `${i + 1}. ${x.product} [${x.category}] 매출 ${manwon(x.total)}, 추천 대상 중 ${x.share}%` +
        (x.lift !== null ? `, 시즌 중 하루 평균이 평소의 ${x.lift}배` : ""),
    ),
  ].join("\n");
}

// AI 답을 검사: 금지 표현이 있거나 길이가 넘는 문장은 버린다(버린 곳은 코드 근거·기본 문구로 대신)
export function finalizeSeason(raw: unknown, count: number): SeasonAiResponse {
  const obj = (raw ?? {}) as { reasons?: unknown; poster_title?: unknown; poster_lines?: unknown };
  let dropped = 0;
  const clean = (s: unknown, max: number): string | null => {
    if (typeof s !== "string") return null;
    const t = s.trim();
    if (!t) return null;
    if (findForbidden(t).length > 0 || [...t].length > max) {
      dropped++;
      return null;
    }
    return t;
  };
  const rawReasons = Array.isArray(obj.reasons) ? obj.reasons : [];
  const reasons = Array.from({ length: count }, (_, i) => clean(rawReasons[i], 80));
  const title = clean(obj.poster_title, TITLE_MAX);
  const lines = (Array.isArray(obj.poster_lines) ? obj.poster_lines : [])
    .map((l) => clean(l, POSTER_LINE_MAX))
    .filter((l): l is string => !!l)
    .slice(0, POSTER_MAX_LINES);
  return { reasons, poster: title && lines.length > 0 ? { title, lines } : null, dropped };
}

export function toSeasonPayload(
  seasonName: string,
  seasonMonths: string,
  basisLabel: string,
  items: RecommendItem[],
): SeasonAiPayload {
  return {
    seasonName,
    seasonMonths,
    basisLabel,
    items: items.map((x) => ({ product: x.product, category: x.category, total: x.total, share: x.share, lift: x.lift })),
  };
}
