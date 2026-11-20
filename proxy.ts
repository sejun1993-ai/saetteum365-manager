import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth";

// Design Ref: §5.2 — 로그인 쿠키가 없는 요청은 /login으로 보낸다. (이 Next.js 버전에서는 middleware 대신 proxy)
// 이것은 1차 방어이다. AI를 부르는 서버 API(/api/cause, /api/season)는 나중에 만들 때 API 안에서도 쿠키를 다시 확인한다.
// Plan SC: 작업 2번

export function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (verifySessionToken(token, process.env.AUTH_SECRET)) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;

  // 서버 API는 화면 이동 대신 "로그인 필요"라고 답한다
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  // 화면은 로그인 화면으로 보내고, 로그인하면 원래 보던 주소로 돌아오게 한다
  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // 로그인 화면, 로그인·로그아웃 API, 정적 파일은 검사하지 않는다
  matcher: ["/((?!login(?:/|$)|api/login$|api/logout$|_next/static|_next/image|favicon\\.ico$).*)"],
};
