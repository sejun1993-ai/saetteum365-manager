"use client";

// Design Ref: §5.2·5.3 — AI 연결 상태와 사용량을 보여 주고, 직접 연결을 시험해 볼 수 있게 한다.
// 키 값은 화면으로 오지 않는다. (서버가 "설정됐는지"만 알려 줌)
// Plan SC: 작업 15번

import { useCallback, useEffect, useState } from "react";

type Status = {
  configured: boolean;
  model: string | null;
  problem: string | null;
  limits: { perMinute: number; perDay: number; monthlyTokens: number };
  usage: { today: number; monthTokens: number };
};

const num = (n: number) => n.toLocaleString("ko-KR");

export default function AiStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/status", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Status;
      setStatus(data);
      setLoadError("");
    } catch {
      setLoadError("AI 연결 상태를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.");
    }
  }, []);

  useEffect(() => {
    // 화면이 열릴 때 한 번 서버에 상태를 묻는다 (외부 시스템과 맞추는 용도라 effect에서 부른다)
    let cancelled = false;
    fetch("/api/ai/status", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Status>) : Promise.reject(new Error(String(res.status)))))
      .then((data) => !cancelled && setStatus(data))
      .catch(() => !cancelled && setLoadError("AI 연결 상태를 불러오지 못했어요. 인터넷 연결을 확인해 주세요."));
    return () => {
      cancelled = true;
    };
  }, []);

  async function runCheck() {
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch("/api/ai/check", { method: "POST" });
      const data = (await res.json()) as { ok: boolean; error?: string };
      setCheckResult(data.ok ? { ok: true, text: "AI와 연결됐어요." } : { ok: false, text: data.error ?? "연결하지 못했어요." });
    } catch {
      setCheckResult({ ok: false, text: "AI 서비스에 연결하지 못했어요. 인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요." });
    }
    setChecking(false);
    void load();
  }

  return (
    <section aria-label="AI 연결 상태" className="rounded-lg border border-neutral-300 bg-white p-4 text-sm">
      <h2 className="font-semibold">AI 연결 상태</h2>
      <p className="mt-1 text-xs text-neutral-500">
        AI는 고른 구간의 원인 후보(작업 16번)와 시즌 추천 이유·포스터 문구(작업 20번)에만 써요. 보낼 때는 집계 숫자와 상품명만 보내요.
      </p>

      {loadError && <p className="mt-2 text-red-700">{loadError}</p>}
      {!status && !loadError && <p className="mt-2 text-neutral-500">상태를 불러오는 중이에요…</p>}

      {status && (
        <>
          <p className="mt-2">
            {status.configured ? (
              <>
                <span className="font-medium text-emerald-700">✔ 설정됨</span>
                <span className="ml-2 text-neutral-600">모델: {status.model}</span>
              </>
            ) : (
              <>
                <span className="font-medium text-red-700">✖ 설정 필요</span>
                <span className="ml-2 text-neutral-600">{status.problem}</span>
              </>
            )}
          </p>
          <p className="mt-1 text-neutral-600">
            오늘 {num(status.usage.today)} / {num(status.limits.perDay)}번 · 이번 달 {num(status.usage.monthTokens)} /{" "}
            {num(status.limits.monthlyTokens)} 토큰 · 1분에 {num(status.limits.perMinute)}번까지
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            사용량은 이 앱 서버가 켜져 있는 동안 세요. 서버를 다시 켜면 처음부터 다시 세니, 실제 요금 상한은 OpenAI 사이트의 사용 한도
            설정으로도 꼭 걸어 두세요.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!status.configured || checking}
              onClick={() => void runCheck()}
              className="rounded border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100 disabled:opacity-40"
            >
              {checking ? "확인하는 중…" : "AI 연결 시험"}
            </button>
            <span className="text-xs text-neutral-500">짧은 확인 문장만 보내요. 1번으로 세고, 아주 적은 요금이 들어요.</span>
          </div>
          {checkResult && (
            <p role="status" className={`mt-2 ${checkResult.ok ? "text-emerald-700" : "text-red-700"}`}>
              {checkResult.text}
            </p>
          )}
        </>
      )}
    </section>
  );
}
