// Design Ref: §5.4 — 가격표 한 장의 데이터 모델과 표시 규칙 (화면과 상관없는 규칙 코드)
// Plan SC: 작업 3번 (가격표 1장 양식: 약이름·가격·간단한 설명 3칸)

// 가격표 한 장
export type PriceTag = {
  id: string; // 고유 문자열
  name: string; // 약 이름 (30자 이내)
  price: number | null; // 숫자로 저장하고, 보여 줄 때만 콤마를 붙인다 (비어 있으면 null)
  desc: string; // 간단한 설명 (40자 이내)
};

export const NAME_MAX = 30; // 약 이름 최대 글자 수
export const DESC_MAX = 40; // PRD: 설명은 40자 이내
export const PRICE_MAX_DIGITS = 9; // 가격 최대 자릿수 (9자리까지)
export const PER_PAGE = 10; // A4 한 장에 7x5cm 가격표 10장 (2열 x 5행)
export const STORAGE_KEY = "saetteum365-nametags"; // 브라우저 저장 이름

// 새 가격표 한 장 (모두 비어 있음)
export function createEmptyTag(): PriceTag {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    price: null,
    desc: "",
  };
}

// 숫자 가격을 "15,000원"처럼 보여 준다. 비어 있으면 빈 글자.
export function formatPrice(price: number | null): string {
  if (price === null) return "";
  return price.toLocaleString("ko-KR") + "원";
}

// 입력칸에 쓰는 가격 글자(콤마만 붙임, 원은 붙이지 않음)
export function formatPriceInput(price: number | null): string {
  return price === null ? "" : price.toLocaleString("ko-KR");
}

// 입력된 글자에서 숫자만 뽑아 가격으로 바꾼다. 숫자가 없으면 null.
export function parsePriceInput(text: string): number | null {
  const digits = text.replace(/\D/g, "").slice(0, PRICE_MAX_DIGITS);
  return digits === "" ? null : Number(digits);
}

// ----- 입력 규칙 (Plan SC: 작업 4번) -----

// 한 장의 입력 오류 (없으면 빈 객체)
export type TagErrors = { name?: string; price?: string };

// Design Ref: §2.2 — 약이름이 비었거나 가격이 비었거나 0원이면 그 칸에 표시하고 인쇄를 막는다.
export function validateTag(tag: PriceTag): TagErrors {
  const errors: TagErrors = {};
  if (tag.name.trim() === "") errors.name = "약 이름을 적어 주세요";
  if (tag.price === null) errors.price = "가격을 적어 주세요";
  else if (tag.price === 0) errors.price = "0원은 쓸 수 없어요";
  return errors;
}

// ----- 가격 변경 확인 (Plan SC: 작업 6번) -----

export const PRICE_WARN_PERCENT = 30; // 이전 가격보다 이만큼(%) 이상 달라지면 오타 경고

// 가격이 바뀔 때 얼마나 달라졌는지 계산한다.
// percent는 반올림한 변화율(%), up은 올랐는지 여부, warn은 ±30% 이상이라 오타 경고를 띄울지 여부이다.
export function describePriceChange(
  oldPrice: number,
  newPrice: number,
): { percent: number; up: boolean; warn: boolean } {
  if (oldPrice <= 0) return { percent: 0, up: newPrice > oldPrice, warn: false }; // 비교할 이전 가격이 없음
  const percent = Math.round((Math.abs(newPrice - oldPrice) / oldPrice) * 100);
  return { percent, up: newPrice > oldPrice, warn: percent >= PRICE_WARN_PERCENT };
}

// 오류가 있는 가격표가 몇 장인지 센다
export function countInvalidTags(tags: PriceTag[]): number {
  return tags.filter((t) => Object.keys(validateTag(t)).length > 0).length;
}

// 가격이 8자리 이상이면 글자를 줄여 칸 밖으로 나가지 않게 한다 (30pt → 24pt)
export function priceFontSize(price: number | null): string {
  const digits = price === null ? 0 : String(price).length;
  return digits <= 7 ? "30pt" : "24pt";
}

// 약 이름이 길수록 글자를 줄여 칸 안에 들어가게 한다 (20pt → 16pt → 13pt)
export function nameFontSize(name: string): string {
  if (name.length <= 8) return "20pt";
  if (name.length <= 14) return "16pt";
  return "13pt";
}
