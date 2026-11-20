// Design Ref: §5.6 — 포스터 금지 표현 목록은 이 파일 한 곳에 두고 추가할 수 있게 한다.
// 질병 치료·효능을 단정하는 표현을 막고, 필수 안내 문구가 들어 있는지 확인한다. 제목은 20자 이내.
// Plan SC: 작업 22번 (단정·과장 표현 차단, 필수 안내 문구 검사), 성공 기준 6 (단정·과장 표현 0건)

export const TITLE_MAX = 20;

// 필수 안내 문구 (포스터 맨 아래에 항상 들어간다)
export const REQUIRED_NOTICE = "복용 전 약사와 상담하세요.";

// 금지 표현: 띄어쓰기를 무시하고 찾는다. 필요하면 여기에 더 추가하면 된다.
export const FORBIDDEN_WORDS = [
  "완치",
  "최고",
  "최상",
  "1위",
  "일위",
  "100%",
  "100프로",
  "백퍼",
  "특효",
  "즉효",
  "즉시",
  "기적",
  "부작용없",
  "무조건",
  "확실",
  "보장",
  "완벽",
  "만병",
  "특허",
  "단번에",
  "한번에낫",
  "영구",
  "근본치료",
  "치료됩니다",
  "낫습니다",
  "예방됩니다",
  "효과만점",
  "최강",
  "유일",
  "넘버원",
  "no.1",
];

export type PosterText = { title: string; lines: string[]; products: string[]; notice: string };

export type GuardIssue = { word: string; where: string };

export type GuardResult = {
  ok: boolean;
  forbidden: GuardIssue[]; // 찾은 금지 표현과 위치
  titleTooLong: boolean;
  titleEmpty: boolean;
  missingNotice: boolean;
};

const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase();

// 한 문장에서 금지 표현을 찾는다
export function findForbidden(text: string): string[] {
  const n = normalize(text);
  return FORBIDDEN_WORDS.filter((w) => n.includes(normalize(w)));
}

export const titleLength = (title: string) => [...title.trim()].length;

export function checkPoster(p: PosterText): GuardResult {
  const forbidden: GuardIssue[] = [];
  const scan = (text: string, where: string) => findForbidden(text).forEach((word) => forbidden.push({ word, where }));
  scan(p.title, "제목");
  p.lines.forEach((line, i) => scan(line, `안내 문구 ${i + 1}번째 줄`));
  p.products.forEach((name) => scan(name, `상품 이름 "${name}"`));
  scan(p.notice, "필수 안내 문구");
  const titleEmpty = p.title.trim().length === 0;
  const titleTooLong = titleLength(p.title) > TITLE_MAX;
  const missingNotice = !normalize(p.notice).includes(normalize(REQUIRED_NOTICE));
  return { ok: forbidden.length === 0 && !titleTooLong && !titleEmpty && !missingNotice, forbidden, titleTooLong, titleEmpty, missingNotice };
}
