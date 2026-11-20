// Design Ref: §5.2 — 공용 비밀번호 1개로 앱을 지킨다. 로그인하면 서명된 쿠키(7일)를 준다.
// Plan SC: 작업 2번 (공용 비밀번호 입력 화면)
//
// 서버 쪽 코드에서만 쓴다 (proxy.ts, app/api/*). 브라우저 화면 코드에서 불러오지 않는다.
// 비밀번호(APP_PASSWORD)와 쿠키 서명 비밀 값(AUTH_SECRET)은 .env에서만 읽고, 코드에는 적지 않는다.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "saetteum365-session"; // 로그인 쿠키 이름
export const SESSION_DAYS = 7; // 브라우저를 닫아도 7일 동안 로그인 유지
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60; // 초 단위
export const MIN_SECRET_LENGTH = 16; // AUTH_SECRET 최소 길이

// 값에 서명을 붙인다 (같은 비밀 값이 없으면 만들 수 없는 글자)
function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

// 같은 길이의 글자끼리 시간 차이 없이 비교한다
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// 로그인 성공 시 줄 쿠키 값: "만료시각.서명"
export function createSessionToken(secret: string, now: number = Date.now()): string {
  const expires = now + SESSION_MAX_AGE * 1000;
  return `${expires}.${sign(String(expires), secret)}`;
}

// 쿠키 값이 올바르고 아직 만료되지 않았는지 확인한다
export function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
  now: number = Date.now(),
): boolean {
  if (!token || !secret || secret.length < MIN_SECRET_LENGTH) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expiresText, signature] = parts;
  if (!/^\d+$/.test(expiresText) || !signature) return false;
  if (Number(expiresText) <= now) return false; // 만료됨
  return safeEqual(signature, sign(expiresText, secret));
}

// 입력한 비밀번호가 맞는지 확인한다. 길이가 달라도 걸리는 시간이 같도록 해시끼리 비교한다.
export function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// 서버 설정(.env)이 준비됐는지 확인한다. 비어 있으면 문제 설명을, 괜찮으면 null을 돌려준다.
export function checkAuthConfig(): { password: string; secret: string } | { error: string } {
  const password = process.env.APP_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!password) return { error: "APP_PASSWORD가 .env에 없어요" };
  if (!secret) return { error: "AUTH_SECRET이 .env에 없어요" };
  if (secret.length < MIN_SECRET_LENGTH) return { error: `AUTH_SECRET은 ${MIN_SECRET_LENGTH}자 이상이어야 해요` };
  return { password, secret };
}
