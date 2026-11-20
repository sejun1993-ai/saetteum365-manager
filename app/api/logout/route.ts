import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";

// Design Ref: §5.2 — 로그아웃: 로그인 쿠키를 지운다.
// Plan SC: 작업 2번 (로그아웃 포함)

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0, // 바로 만료시켜 지운다
  });
  return response;
}
