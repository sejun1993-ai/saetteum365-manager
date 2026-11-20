"use client";

// Design Ref: §2.4 ③, §5.6 — 포스터 미리보기(제목 20자 이내 + 안내 문구) · 문구 검사 · "문구를 확인했습니다" · 인쇄(A4 세로 1장).
// 인쇄하기는 문구 검사를 통과하고 사람이 확인해야만 눌린다. 글을 고치면 확인을 다시 받아야 한다.
// Plan SC: 작업 21번 (포스터 양식), 22번 (문구 검사), 23번 (사람 확인 후 인쇄)

import { useMemo, useState } from "react";
import { POSTER_LINE_MAX, POSTER_MAX_LINES } from "@/lib/poster";
import { checkPoster, REQUIRED_NOTICE, TITLE_MAX, titleLength } from "@/lib/poster-guard";

export default function PosterEditor({
  initialTitle,
  initialLines,
  products,
  source,
}: {
  initialTitle: string;
  initialLines: string[];
  products: string[]; // 추천 상품 이름 (포스터에 넣을지 고를 수 있음)
  source: "default" | "ai"; // 초안을 누가 썼는지
}) {
  const [title, setTitle] = useState(initialTitle);
  const [linesText, setLinesText] = useState(initialLines.join("\n"));
  const [withProducts, setWithProducts] = useState(true);
  const [confirmed, setConfirmed] = useState(false);

  const lines = useMemo(
    () =>
      linesText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    [linesText],
  );
  const shownProducts = withProducts ? products : [];
  const guard = checkPoster({ title, lines, products: shownProducts, notice: REQUIRED_NOTICE });
  const tooManyLines = lines.length > POSTER_MAX_LINES;
  const longLines = lines.filter((l) => [...l].length > POSTER_LINE_MAX).length;
  const passed = guard.ok && !tooManyLines && longLines === 0 && lines.length > 0;
  const canPrint = passed && confirmed;

  // 글을 고치면 "확인했습니다"를 다시 눌러야 한다
  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setConfirmed(false);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,26rem)]">
      <div className="no-print space-y-3">
        <p className="text-xs text-neutral-500">
          {source === "ai" ? "AI가 쓴 초안이에요. 금지 표현 검사를 통과한 문장만 넣었어요." : "앱이 준비한 기본 문구예요."} 자유롭게
          고칠 수 있어요.
        </p>
        <label className="block text-sm">
          <span className="font-medium">제목</span>
          <span className={`ml-2 text-xs ${titleLength(title) > TITLE_MAX ? "text-red-700" : "text-neutral-500"}`}>
            {titleLength(title)}/{TITLE_MAX}자
          </span>
          <input
            value={title}
            onChange={(e) => edit(setTitle)(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">안내 문구</span>
          <span className="ml-2 text-xs text-neutral-500">
            한 줄에 한 문장, 최대 {POSTER_MAX_LINES}줄 · 줄마다 {POSTER_LINE_MAX}자 이내
          </span>
          <textarea
            value={linesText}
            onChange={(e) => edit(setLinesText)(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withProducts} onChange={(e) => edit(setWithProducts)(e.target.checked)} />
          추천 상품 이름 {products.length}개를 포스터에 넣기
        </label>
        <p className="text-xs text-neutral-500">
          필수 안내 문구 &quot;{REQUIRED_NOTICE}&quot;는 포스터 맨 아래에 항상 들어가요.
        </p>

        <div
          role="status"
          className={`rounded border p-3 text-sm ${passed ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-300 bg-red-50 text-red-900"}`}
        >
          <p className="font-semibold">문구 검사: {passed ? "통과 ✔" : "수정 필요 ✖"}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {guard.forbidden.map((f, i) => (
              <li key={i}>
                금지 표현 &quot;{f.word}&quot; 발견 ({f.where}) — 효능·효과를 단정하거나 과장하는 표현은 쓸 수 없어요.
              </li>
            ))}
            {guard.titleEmpty && <li>제목을 넣어 주세요.</li>}
            {guard.titleTooLong && <li>제목은 {TITLE_MAX}자 이내로 줄여 주세요.</li>}
            {lines.length === 0 && <li>안내 문구를 한 줄 이상 넣어 주세요.</li>}
            {tooManyLines && <li>안내 문구는 {POSTER_MAX_LINES}줄까지만 넣을 수 있어요.</li>}
            {longLines > 0 && <li>{POSTER_LINE_MAX}자를 넘는 줄이 {longLines}개 있어요.</li>}
            {guard.missingNotice && <li>필수 안내 문구가 빠졌어요.</li>}
            {passed && <li>단정·과장 표현이 없고, 필수 안내 문구가 들어 있어요.</li>}
          </ul>
        </div>

        <label className={`flex items-start gap-2 text-sm ${passed ? "" : "opacity-50"}`}>
          <input
            type="checkbox"
            disabled={!passed}
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1"
          />
          <span>
            <b>✔ 문구를 확인했습니다.</b> 포스터 문구에 효능·효과를 단정하는 내용이 없는지 약사가 직접 읽어 보았습니다.
          </span>
        </label>
        <button
          type="button"
          disabled={!canPrint}
          onClick={() => window.print()}
          className="rounded bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          포스터 인쇄하기
        </button>
        <p className="text-xs text-neutral-500">
          {canPrint
            ? "인쇄 창에서 용지 A4 · 세로 · 배율 100% · 머리글/바닥글 끄기로 설정해 주세요."
            : passed
              ? "문구를 확인했다고 체크하면 인쇄할 수 있어요."
              : "문구 검사를 통과해야 인쇄할 수 있어요."}
        </p>
      </div>

      {/* 포스터: 화면에서는 줄인 미리보기, 인쇄하면 A4 세로 1장 */}
      <div className="print:contents">
        <p className="no-print mb-1 text-xs text-neutral-500">미리보기 (A4 세로)</p>
        <article className="poster-sheet" aria-label="포스터 미리보기">
          <div className="poster-inner">
            <h2 className="poster-title">{title || "제목"}</h2>
            <div className="poster-lines">
              {lines.slice(0, POSTER_MAX_LINES).map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
            {shownProducts.length > 0 && (
              <div className="poster-products">
                <p className="poster-products-head">이번 시즌 준비 상품</p>
                <ul>
                  {shownProducts.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="poster-notice">{REQUIRED_NOTICE}</p>
          </div>
        </article>
      </div>
    </div>
  );
}
