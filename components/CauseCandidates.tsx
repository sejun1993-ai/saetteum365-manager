"use client";

// Design Ref: §2.3 ④ — 선택한 구간의 원인 후보. "가능성" 문구 + 근거(날짜·숫자), 근거가 없으면 "알 수 없음".
// AI가 안 되면 안내 문구와 함께, 코드가 계산한 근거 숫자만이라도 보여 준다.
// Plan SC: 작업 16번 (원인 후보), 17번 (AI·인터넷 오류 안내), 성공 기준 3 (AI 실패 때도 근거와 함께 "알 수 없음")

import { useState } from "react";
import { callAiApi, KEEP_WORKING } from "@/lib/ai-client";
import { buildFacts, type CauseFact, type CausePayload, type CauseResponse } from "@/lib/cause";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; result: CauseResponse }
  | { kind: "error"; message: string; retry: boolean; facts: CauseFact[] };

function FactList({ facts, title }: { facts: CauseFact[]; title: string }) {
  if (facts.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-neutral-600">{title}</p>
      <ul className="mt-1 space-y-0.5 text-xs text-neutral-700">
        {facts.map((f) => (
          <li key={f.id}>
            <span className="text-neutral-400">{f.id}</span> {f.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CauseCandidates({ payload }: { payload: CausePayload }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function load() {
    setState({ kind: "loading" });
    const res = await callAiApi<CauseResponse & { ok: true }>("/api/cause", payload, "원인 후보를");
    if (res.ok) {
      setState({ kind: "done", result: res.data });
    } else {
      const facts = Array.isArray(res.extra?.facts) ? (res.extra.facts as CauseFact[]) : buildFacts(payload);
      setState({ kind: "error", message: res.message, retry: res.retry, facts });
    }
  }

  return (
    <div className="mt-3 rounded border border-neutral-300 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">등락 원인 후보</p>
        {state.kind !== "loading" && (
          <button
            type="button"
            onClick={() => void load()}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            {state.kind === "idle" ? "AI에게 원인 후보 묻기" : "다시 묻기"}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        두 구간의 집계 숫자와 상품명만 AI에 보내요. 근거 숫자는 앱이 직접 계산하고, AI는 그 근거로 문장만 써요. (1번으로 세요)
      </p>

      {state.kind === "loading" && <p className="mt-3 text-sm text-neutral-600">AI에게 묻는 중이에요… (최대 30초쯤 걸려요)</p>}

      {state.kind === "error" && (
        <div role="alert" className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {/* Plan SC 3: AI가 답하지 못해도 "알 수 없음"과 그 이유·근거를 함께 보여 준다 */}
          <p className="font-semibold">알 수 없음</p>
          <p className="mt-1">이유: AI의 답을 받지 못했어요. {state.message}</p>
          <p className="mt-1 text-xs">{KEEP_WORKING}</p>
          {state.retry && <p className="mt-1 text-xs">위의 &quot;다시 묻기&quot;를 눌러 다시 시도할 수 있어요.</p>}
          <FactList facts={state.facts} title="AI 없이 앱이 숫자로 확인한 변화" />
        </div>
      )}

      {state.kind === "done" && (
        <div className="mt-3">
          {state.result.candidates.length === 0 ? (
            <div className="rounded border border-neutral-300 bg-neutral-50 p-3 text-sm">
              <p className="font-semibold">알 수 없음</p>
              <p className="mt-1 text-neutral-700">{state.result.unknownReason}</p>
            </div>
          ) : (
            <ol className="space-y-2">
              {state.result.candidates.map((c, i) => (
                <li key={i} className="rounded border border-neutral-200 p-2 text-sm">
                  <p className="font-medium">
                    {i + 1}. {c.text}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs text-neutral-600">
                    {c.evidence.map((f) => (
                      <li key={f.id}>근거 {f.id}: {f.text}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-2 text-xs text-neutral-500">
            원인 후보는 가능성일 뿐이에요. 실제 원인은 약국 사정(행사·재고·날씨 등)과 함께 판단해 주세요.
          </p>
          <FactList facts={state.result.facts} title="앱이 숫자로 확인한 변화 (전체 근거)" />
        </div>
      )}
    </div>
  );
}
