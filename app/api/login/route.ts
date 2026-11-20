import { NextResponse } from "next/server";
import {
  COOKIE_NAME,
  SESSION_MAX_AGE,
  checkAuthConfig,
  createSessionToken,
  passwordMatches,
} from "@/lib/auth";

// Design Ref: §5.2 — 비밀번호가 맞으면 서명된 쿠키를 발급한다. (1차는 오답 잠금 없음)
// Plan SC: 작업 2번

export async function POST(request: Request) {
  const config = checkAuthConfig();
  if ("error" in config) {
    // 설정이 비어 있으면 아무도 들어올 수 없게 막는다 (열어 두지 않음)
    console.error(`[login] 서버 설정 오류: ${config.error}`);
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "서버 설정이 아직 끝나지 않았어요."
            : `서버 설정이 아직 끝나지 않았어요. (${config.error})`,
      },
      { status: 500 },
    );
  }

  let password = "";
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null && "password" in body && typeof body.password === "string") {
      password = body.password.slice(0, 200);
    }
  } catch {
    // 본문이 비었거나 잘못된 경우: 빈 비밀번호로 보고 아래에서 거절한다
  }

  if (!passwordMatches(password, config.password)) {
    return NextResponse.json({ error: "비밀번호가 맞지 않아요." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: COOKIE_NAME,
    value: createSessionToken(config.secret),
    httpOnly: true, // 화면의 자바스크립트는 쿠키를 읽을 수 없다
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // 배포(https)에서는 https로만 전송
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
