"use client";

// Design Ref: §2.4 — ① 시즌 선택(일반 4계절 / 약국 시즌) → "시즌 시작 2주 전"까지 남은 날짜, ② 추천 상품 5개(+ 근거),
// ③ 포스터. 매출 엑셀을 아직 올리지 않았다면 이 화면에서 바로 올릴 수 있게 한다(사용성 개선).
// Plan SC: 작업 18번 (시즌 선택·2주 전 기준), 19번 (추천 5개·추천 불가), 20번 (AI 이유·문구 초안)

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import PosterEditor from "@/components/PosterEditor";
import SalesUploader from "@/components/SalesUploader";
import { callAiApi, KEEP_WORKING } from "@/lib/ai-client";
import { defaultPoster, toSeasonPayload, type SeasonAiResponse } from "@/lib/poster";
import { recommendProducts } from "@/lib/recommend";
import { getServerSnapshot, getSnapshot, parseSales, subscribe } from "@/lib/sales-storage";
import { PREP_DAYS, planAll, todayKst, type SeasonPlan } from "@/lib/season-plan";
import { monthRangeText, SEASON_MODE_LABELS, type SeasonMode } from "@/lib/seasons";

const MODES: SeasonMode[] = ["general", "pharmacy"];
const noop = () => () => {};

function StateBadge({ plan }: { plan: SeasonPlan }) {
  if (plan.state === "prep")
    return <span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">지금 준비할 때</span>;
  if (plan.state === "in-season")
    return <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">시즌 중</span>;
  return <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">준비까지 {plan.daysToPrep}일</span>;
}

type AiState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; data: SeasonAiResponse; version: number }
  | { kind: "error"; message: string; retry: boolean };

export default function SeasonPlanner() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const loaded = useMemo(() => parseSales(raw), [raw]);
  // 오늘 날짜는 브라우저에서만 정한다 (서버에서 미리 만든 화면과 날짜가 어긋나지 않게)
  const realToday = useSyncExternalStore(noop, () => todayKst(), () => "");
  const [customToday, setCustomToday] = useState("");
  const today = customToday || realToday;

  const [mode, setMode] = useState<SeasonMode>("pharmacy");
  const [picked, setPicked] = useState<string | null>(null);
  const [ai, setAi] = useState<{ key: string; state: AiState }>({ key: "", state: { kind: "idle" } });

  const plans = useMemo(() => (today ? planAll(mode, today) : []), [mode, today]);
  const plan = plans.find((p) => p.def.id === picked) ?? plans[0] ?? null;
  const recommend = useMemo(
    () => (loaded && plan ? recommendProducts(loaded.rows, plan.def, plan.lastYear) : null),
    [loaded, plan],
  );
  const viewKey = plan ? `${mode}|${plan.def.id}|${plan.lastYear}` : "";
  const aiState: AiState = ai.key === viewKey ? ai.state : { kind: "idle" }; // 시즌을 바꾸면 AI 결과는 풀린다

  if (!today) return <p className="text-sm text-neutral-500">불러오는 중이에요…</p>;

  async function askAi() {
    if (!plan || !recommend?.ok) return;
    const key = viewKey;
    setAi({ key, state: { kind: "loading" } });
    const payload = toSeasonPayload(plan.def.name, monthRangeText(plan.def), recommend.seasonLabel, recommend.items);
    const res = await callAiApi<SeasonAiResponse & { ok: true }>("/api/season", payload, "추천 이유와 포스터 문구를");
    setAi({
      key,
      state: res.ok
        ? { kind: "done", data: res.data, version: Date.now() }
        : { kind: "error", message: res.message, retry: res.retry },
    });
  }

  const draft =
    aiState.kind === "done" && aiState.data.poster
      ? { ...aiState.data.poster, source: "ai" as const, version: aiState.version }
      : plan
        ? { ...defaultPoster(plan.def.id, plan.def.name), source: "default" as const, version: 0 }
        : null;

  return (
    <div className="space-y-6">
      {/* ① 시즌 선택 */}
      <section className="no-print rounded-lg border border-neutral-300 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">① 다가오는 시즌 고르기</h2>
          <div role="group" aria-label="계절 방식" className="flex overflow-hidden rounded border border-neutral-300">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  setPicked(null);
                }}
                className={`px-3 py-1.5 text-sm ${mode === m ? "bg-emerald-600 text-white" : "bg-white hover:bg-neutral-100"}`}
              >
                {SEASON_MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          시즌 시작 {PREP_DAYS}일(2주) 전부터 &quot;지금 준비할 때&quot;로 표시해요. 준비가 급한 시즌이 맨 앞에 와요.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label="시즌 목록">
          {plans.map((p) => {
            const sel = plan?.def.id === p.def.id;
            return (
              <button
                key={p.def.id}
                type="button"
                aria-pressed={sel}
                onClick={() => setPicked(p.def.id)}
                className={`rounded border p-3 text-left text-sm ${sel ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600" : "border-neutral-300 hover:bg-neutral-50"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {p.def.name} <span className="font-normal text-neutral-500">({monthRangeText(p.def)})</span>
                  </span>
                  <StateBadge plan={p} />
                </div>
                <div className="mt-1 text-xs text-neutral-600">
                  {p.state === "in-season"
                    ? `${p.start} ~ ${p.end} 진행 중`
                    : `시작 ${p.start} (${p.daysToStart}일 남음) · 준비 시작 ${p.prepStart}`}
                </div>
              </button>
            );
          })}
        </div>

        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-neutral-600">기준 날짜 바꿔 보기 (확인용)</summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={today}
              onChange={(e) => setCustomToday(e.target.value)}
              className="rounded border border-neutral-300 px-2 py-1"
              aria-label="기준 날짜"
            />
            {customToday && (
              <button type="button" onClick={() => setCustomToday("")} className="text-xs text-emerald-700 underline">
                오늘({realToday})로 되돌리기
              </button>
            )}
            <span className="text-xs text-neutral-500">이 날짜를 &quot;오늘&quot;로 보고 2주 전 기준을 계산해요.</span>
          </div>
        </details>
      </section>

      {/* ② 추천 상품 */}
      {plan && (
        <section className="no-print rounded-lg border border-neutral-300 bg-white p-4">
          <h2 className="text-lg font-semibold">② {plan.def.name} 추천 상품 5개</h2>
          <p className="mt-1 text-sm text-neutral-600">
            {plan.state === "prep" && `지금이 준비할 때예요. 시즌이 ${plan.daysToStart}일 뒤(${plan.start})에 시작해요.`}
            {plan.state === "waiting" &&
              `아직 준비 시작일(${plan.prepStart}) 전이에요. ${plan.daysToPrep}일 뒤부터 준비하면 돼요. 미리 봐 둘 수 있어요.`}
            {plan.state === "in-season" && `지금 시즌 중이에요 (${plan.start} ~ ${plan.end}).`}
          </p>

          {loaded && (
            <p className="mt-2 rounded bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
              근거 자료: <b>{loaded.fileName}</b> ({loaded.summary.dateFrom} ~ {loaded.summary.dateTo})
              {(loaded.summary.personalColumns ?? []).length > 0 &&
                ` · 개인정보로 보이는 열 ${(loaded.summary.personalColumns ?? []).length}개는 읽지 않고 버렸어요`}
              {" · "}
              <Link href="/sales" className="text-emerald-700 underline">
                다른 파일로 바꾸기·자세히 보기
              </Link>
            </p>
          )}

          {!loaded ? (
            // 시즌 화면에서도 바로 올릴 수 있게 한다 (매출 화면에 다녀오지 않아도 됨)
            <div className="mt-3 space-y-2">
              <p className="text-sm text-amber-900">
                추천 근거가 우리 약국 매출이라, 매출 엑셀이 필요해요. <b>여기서 바로 올리면</b> 추천과 포스터가 이어서 나와요.
              </p>
              <SalesUploader compact />
            </div>
          ) : !recommend?.ok ? (
            <div role="alert" className="mt-3 rounded border border-neutral-300 bg-neutral-50 p-3 text-sm">
              <p className="font-semibold">추천 불가</p>
              <p className="mt-1">{recommend?.reason}</p>
            </div>
          ) : (
            <>
              <p className="mt-2 text-xs text-neutral-500">
                근거: 지난해 같은 시즌({recommend.seasonLabel}, {recommend.start} ~ {recommend.end})에 많이 팔린 일반의약품·의약외품.
                순서와 숫자는 앱이 계산했어요.
              </p>
              <ol className="mt-2 space-y-2">
                {recommend.items.map((item, i) => {
                  const reason = aiState.kind === "done" ? aiState.data.reasons[i] : null;
                  return (
                    <li key={item.product} className="rounded border border-neutral-200 p-3 text-sm">
                      <p className="font-semibold">
                        {item.rank}. {item.product} <span className="font-normal text-neutral-500">· {item.category}</span>
                      </p>
                      {reason && <p className="mt-1">{reason}</p>}
                      <p className="mt-1 text-xs text-neutral-600">근거: {item.evidence}</p>
                    </li>
                  );
                })}
              </ol>
              {recommend.notes.map((n) => (
                <p key={n} className="mt-2 text-xs text-amber-800">
                  • {n}
                </p>
              ))}

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={aiState.kind === "loading"}
                  onClick={() => void askAi()}
                  className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  {aiState.kind === "loading"
                    ? "AI에게 묻는 중…"
                    : aiState.kind === "idle"
                      ? "AI에게 추천 이유·포스터 문구 받기"
                      : "다시 받기"}
                </button>
                <span className="text-xs text-neutral-500">상품명과 위 숫자만 보내요. (1번으로 세요) AI 없이도 기본 문구로 포스터를 만들 수 있어요.</span>
              </div>
              {aiState.kind === "error" && (
                <div role="alert" className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-medium">{aiState.message}</p>
                  <p className="mt-1 text-xs">
                    {KEEP_WORKING} 아래 포스터는 앱의 기본 문구로 계속 만들 수 있어요.
                    {aiState.retry && " \"다시 받기\"를 눌러 다시 시도할 수 있어요."}
                  </p>
                </div>
              )}
              {aiState.kind === "done" && aiState.data.dropped > 0 && (
                <p className="mt-2 text-xs text-neutral-600">
                  AI 문장 중 {aiState.data.dropped}개는 금지 표현이나 길이 규칙에 걸려서 넣지 않았어요.
                </p>
              )}
            </>
          )}
        </section>
      )}

      {/* ③ 포스터 */}
      {plan && draft && (
        <section className="rounded-lg border border-neutral-300 bg-white p-4 print:border-0 print:p-0">
          <h2 className="no-print mb-3 text-lg font-semibold">③ 포스터 만들기</h2>
          <PosterEditor
            key={`${viewKey}|${draft.version}`}
            initialTitle={draft.title}
            initialLines={draft.lines}
            products={recommend?.ok ? recommend.items.map((x) => x.product) : []}
            source={draft.source}
          />
        </section>
      )}
    </div>
  );
}
