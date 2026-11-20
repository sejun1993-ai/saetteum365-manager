"use client";

import { useState, type FormEvent } from "react";
import { isSafeNextPath } from "@/lib/safe-path";

// Design Ref: §2.1 — 공용 비밀번호 입력 화면 (/login). 개인 계정은 없고 비밀번호 하나만 쓴다.
// Plan SC: 작업 2번

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        // 로그인 전에 보던 주소가 있으면 거기로, 없으면 가격표 화면으로 (화면을 새로 불러와 쿠키를 적용한다)
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.assign(isSafeNextPath(next) ? next : "/tags");
        return;
      }
      const data: { error?: string } | null = await response.json().catch(() => null);
      setError(data?.error ?? "로그인하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } catch {
      setError("서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-6 py-16">
      <h1 className="text-center text-2xl font-bold text-emerald-700">새뜸365 매니저</h1>
      <p className="mt-2 text-center text-sm text-neutral-600">비밀번호를 입력해 주세요.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-3">
        <label className="block text-sm font-medium" htmlFor="password">
          비밀번호
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          className="w-full rounded border border-neutral-300 px-3 py-2"
          value={password}
          maxLength={200}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div role="alert" className="min-h-5 text-sm text-red-600">
          {error}
        </div>
        <button
          type="submit"
          disabled={busy || password === ""}
          className="w-full rounded bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          {busy ? "확인하는 중…" : "들어가기"}
        </button>
      </form>
    </main>
  );
}
