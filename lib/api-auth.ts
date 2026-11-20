import "server-only";

// Design Ref: §5.2 — proxy.ts는 1차 방어일 뿐이므로, AI를 부르는 API는 API 안에서 로그인 쿠키를 "다시" 확인한다.
// Plan SC: 작업 15번 (AI API의 쿠키 재확인)

import { NextResponse, type NextRequest } from "next/server";
import { checkAuthConfig, COOKIE_NAME, verifySessionToken } from "./auth";

// 로그인이 맞으면 null, 아니면 바로 돌려줄 401 응답을 돌려준다
export function requireSession(request: NextRequest): NextResponse | null {
  const config = checkAuthConfig();
  const secret = "secret" in config ? config.secret : undefined;
  if (!verifySessionToken(request.cookies.get(COOKIE_NAME)?.value, secret)) {
    return NextResponse.json({ ok: false, code: "unauthorized", error: "로그인이 필요해요." }, { status: 401 });
  }
  return null;
}
