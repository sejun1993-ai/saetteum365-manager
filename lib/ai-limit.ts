import "server-only";

// Design Ref: §5.2 — 오답 잠금 대신 AI를 부르는 API에 "호출 횟수 제한"과 "월 사용 한도"를 두어 AI 비용이 새는 것을 막는다.
// Plan SC: 작업 15번 (호출 횟수 제한과 월 사용 한도)
//
// ⚠️ 1차는 데이터베이스가 없어서, 사용량을 서버 메모리에만 센다.
//    - 내 PC에서 `npm run dev`로 쓸 때는 서버를 끄기 전까지 정확하게 센다.
//    - Vercel에 올리면 서버가 여러 개 뜨거나 다시 시작될 때 숫자가 처음부터 다시 셀 수 있다.
//    그래서 "진짜 돈의 상한"은 OpenAI 사이트의 프로젝트 사용 한도(Usage limits)로 함께 걸어 두어야 한다. (작업 24번 안내)
//
// 한도 값은 .env에서 바꿀 수 있다(없으면 아래 기본값). 비밀 값이 아니라서 화면에 보여 줘도 된다.
//   AI_LIMIT_PER_MINUTE      1분에 최대 호출 수 (기본 5)
//   AI_LIMIT_PER_DAY         하루 최대 호출 수 (기본 50)
//   AI_MONTHLY_TOKEN_LIMIT   한 달 최대 토큰 수 (기본 1,000,000)

export type AiLimits = { perMinute: number; perDay: number; monthlyTokens: number };

export type AiUsage = {
  today: number; // 오늘 호출 수
  thisMinute: number;
  monthTokens: number; // 이번 달 쓴 토큰
  monthCalls: number;
};

export type AiLimitResult = { ok: true } | { ok: false; reason: "minute" | "day" | "month"; message: string };

const DEFAULTS: AiLimits = { perMinute: 5, perDay: 50, monthlyTokens: 1_000_000 };

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function getAiLimits(): AiLimits {
  return {
    perMinute: readPositiveInt("AI_LIMIT_PER_MINUTE", DEFAULTS.perMinute),
    perDay: readPositiveInt("AI_LIMIT_PER_DAY", DEFAULTS.perDay),
    monthlyTokens: readPositiveInt("AI_MONTHLY_TOKEN_LIMIT", DEFAULTS.monthlyTokens),
  };
}

// 날짜는 한국 시간 기준으로 나눈다 (서버가 외국 시간대여도 자정·월초가 한국과 같게)
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
function keysOf(now: number) {
  const kst = new Date(now + KST_OFFSET_MS).toISOString(); // "2026-11-20T13:05:..."
  return { minute: kst.slice(0, 16), day: kst.slice(0, 10), month: kst.slice(0, 7) };
}

type Counter = {
  minuteKey: string;
  minuteCount: number;
  dayKey: string;
  dayCount: number;
  monthKey: string;
  monthCalls: number;
  monthTokens: number;
};

// 개발 중 코드가 다시 불러와져도 숫자가 0으로 돌아가지 않도록 전역에 둔다
const store = globalThis as unknown as { __saetteumAiCounter?: Counter };

function counter(now: number): Counter {
  const k = keysOf(now);
  const c = (store.__saetteumAiCounter ??= {
    minuteKey: k.minute,
    minuteCount: 0,
    dayKey: k.day,
    dayCount: 0,
    monthKey: k.month,
    monthCalls: 0,
    monthTokens: 0,
  });
  // 분·날·달이 바뀌면 그 칸만 0부터 다시 센다
  if (c.minuteKey !== k.minute) Object.assign(c, { minuteKey: k.minute, minuteCount: 0 });
  if (c.dayKey !== k.day) Object.assign(c, { dayKey: k.day, dayCount: 0 });
  if (c.monthKey !== k.month) Object.assign(c, { monthKey: k.month, monthCalls: 0, monthTokens: 0 });
  return c;
}

// 한도 안이면 이번 호출을 1회로 미리 세고 ok를 돌려준다. 넘으면 이유와 안내 문구를 돌려준다.
export function checkAiLimit(now: number = Date.now()): AiLimitResult {
  const limits = getAiLimits();
  const c = counter(now);
  if (c.monthTokens >= limits.monthlyTokens) {
    return { ok: false, reason: "month", message: "이번 달 AI 사용 한도를 다 썼어요. 다음 달 1일에 다시 쓸 수 있어요." };
  }
  if (c.dayCount >= limits.perDay) {
    return {
      ok: false,
      reason: "day",
      message: `오늘은 더 이상 AI에 요청할 수 없어요. (하루 ${limits.perDay}번까지) 내일 다시 시도해 주세요.`,
    };
  }
  if (c.minuteCount >= limits.perMinute) {
    return { ok: false, reason: "minute", message: "AI 요청이 너무 잦아요. 1분쯤 뒤에 다시 시도해 주세요." };
  }
  c.minuteCount += 1;
  c.dayCount += 1;
  c.monthCalls += 1;
  return { ok: true };
}

// 답을 받은 뒤 실제로 쓴 토큰 수를 이번 달 사용량에 더한다
export function recordAiTokens(tokens: number, now: number = Date.now()): void {
  if (tokens > 0) counter(now).monthTokens += tokens;
}

// 연결 실패처럼 AI가 답을 주지 못한 호출은 횟수에서 뺀다 (사용자가 다시 시도할 수 있게)
export function releaseAiCall(now: number = Date.now()): void {
  const c = counter(now);
  c.minuteCount = Math.max(0, c.minuteCount - 1);
  c.dayCount = Math.max(0, c.dayCount - 1);
  c.monthCalls = Math.max(0, c.monthCalls - 1);
}

export function getAiUsage(now: number = Date.now()): AiUsage {
  const c = counter(now);
  return { today: c.dayCount, thisMinute: c.minuteCount, monthTokens: c.monthTokens, monthCalls: c.monthCalls };
}

// 시험용: 사용량을 0으로 되돌린다
export function resetAiUsageForTest(): void {
  store.__saetteumAiCounter = undefined;
}
