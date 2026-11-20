// Design Ref: §5.5 — 일반 4계절과 약국 시즌 정의. 시즌의 달은 이 파일 한 곳에서만 정한다.
// Plan SC: 작업 11번 (일반 4계절과 약국 시즌 단위로 합산)
//
// 시즌 달을 바꾸고 싶으면 아래 months 배열만 고치면 된다. (첫 번째 숫자가 시즌이 시작하는 달)
// - 해를 넘기는 시즌(예: 12~2월)은 "시작하는 해"의 시즌으로 묶는다. 2025년 12월~2026년 2월 = 2025년 겨울.
// - 떨어진 두 구간(환절기 감기 3~4월, 9~10월)은 따로 계산하도록 서로 다른 시즌으로 둔다.
// - 약국 시즌은 겹치는 달을 허용한다. (3~4월은 봄 환절기 감기이면서 꽃가루 알레르기 시즌)

export type SeasonMode = "general" | "pharmacy";

export type SeasonDef = {
  id: string; // 고유 이름 (전년 같은 시즌을 찾을 때 사용)
  name: string; // 화면 표시 이름
  months: number[]; // 이 시즌에 들어가는 달, 시작하는 달부터 순서대로 (1~12)
};

export const SEASON_MODE_LABELS: Record<SeasonMode, string> = {
  general: "일반 4계절",
  pharmacy: "약국 시즌",
};

export const SEASONS: Record<SeasonMode, SeasonDef[]> = {
  general: [
    { id: "spring", name: "봄", months: [3, 4, 5] },
    { id: "summer", name: "여름", months: [6, 7, 8] },
    { id: "autumn", name: "가을", months: [9, 10, 11] },
    { id: "winter", name: "겨울", months: [12, 1, 2] },
  ],
  // 초안 그대로 사용 중 (사용자 확정 전). 달을 바꾸려면 여기만 고치면 된다.
  pharmacy: [
    { id: "cold-spring", name: "봄 환절기 감기", months: [3, 4] },
    { id: "pollen", name: "꽃가루 알레르기", months: [3, 4, 5] },
    { id: "summer-stomach", name: "여름 위장·냉방병", months: [7, 8] },
    { id: "cold-autumn", name: "가을 환절기 감기", months: [9, 10] },
    { id: "flu", name: "독감", months: [11, 12, 1, 2] },
  ],
};

// "3~5월", "12~2월"처럼 시즌의 달 범위를 글로 만든다
export function monthRangeText(def: SeasonDef): string {
  const first = def.months[0];
  const last = def.months[def.months.length - 1];
  return first === last ? `${first}월` : `${first}~${last}월`;
}

// 어떤 해·달이 들어가는 시즌들과, 그 시즌의 "시작하는 해"를 돌려준다.
// 예: 2026년 1월, 일반 4계절 → [{ 겨울, seasonYear: 2025 }]
export function seasonsOfMonth(year: number, month: number, mode: SeasonMode): { def: SeasonDef; seasonYear: number }[] {
  const found: { def: SeasonDef; seasonYear: number }[] = [];
  for (const def of SEASONS[mode]) {
    const pos = def.months.indexOf(month);
    if (pos < 0) continue;
    // 시작 달보다 앞 번호의 달(예: 겨울의 1·2월)은 해를 넘긴 것이므로 시작한 해는 전년
    const crossed = def.months.slice(0, pos).some((m) => m > month);
    found.push({ def, seasonYear: crossed ? year - 1 : year });
  }
  return found;
}
