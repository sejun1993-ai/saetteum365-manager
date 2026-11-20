"use client";

// Design Ref: §2.2 — 이미 있는 가격을 바꿀 때는 "변경 전 → 변경 후"를 보여 주고 확인을 받은 뒤 반영한다.
// 이전 가격보다 ±30% 이상 달라지면 "오타일 수 있어요" 경고를 함께 보여 준다.
// 새로 추가한 가격표(가격이 비어 있음)는 비교할 이전 가격이 없으므로 확인 없이 바로 입력된다.
// Plan SC: 작업 6번 (가격 변경 확인과 ±30% 경고)

import { useState } from "react";
import { describePriceChange, formatPrice, formatPriceInput, parsePriceInput } from "@/lib/tags";

type Props = {
  price: number | null; // 지금 반영된 가격
  error?: string; // 입력 검사 오류 (빈칸·0원)
  onCommit: (price: number | null) => void; // 가격을 실제로 바꾼다
  onPendingChange: (pending: boolean) => void; // 확인을 기다리는 변경이 있는지 알린다
};

export default function PriceInput({ price, error, onCommit, onPendingChange }: Props) {
  // draft: 입력 중인 새 가격 (undefined = 입력 중 아님, null = 칸을 비움)
  const [draft, setDraft] = useState<number | null | undefined>(undefined);
  // 처음 가격을 적는 중(가격이 비어 있던 칸)이면 확인 없이 바로 반영한다
  const [firstEntry, setFirstEntry] = useState(false);

  // 이미 가격이 있는데 다른 값을 입력 중이면 확인이 필요하다
  const needsConfirm = draft !== undefined && draft !== null && price !== null && draft !== price;
  const change = needsConfirm ? describePriceChange(price, draft) : null;

  function updateDraft(next: number | null | undefined) {
    setDraft(next);
    onPendingChange(next !== undefined && next !== null && price !== null && next !== price);
  }

  function confirm() {
    if (draft === undefined || draft === null) return;
    onCommit(draft);
    updateDraft(undefined);
  }

  function cancel() {
    updateDraft(undefined);
  }

  const shown = draft !== undefined ? draft : price;

  return (
    <div>
      <input
        className={`w-full rounded border px-2 py-1.5 ${error ? "border-red-400" : "border-neutral-300"}`}
        placeholder="가격 (숫자만)"
        inputMode="numeric"
        value={formatPriceInput(shown)}
        onFocus={() => setFirstEntry(price === null)}
        onBlur={() => {
          setFirstEntry(false);
          // 칸을 비운 채로 나가면 원래 가격으로 되돌린다
          if (draft === null) cancel();
        }}
        onChange={(e) => {
          const next = parsePriceInput(e.target.value);
          if (firstEntry) onCommit(next);
          else updateDraft(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && needsConfirm) confirm();
          if (e.key === "Escape") cancel();
        }}
      />
      <div className="mt-0.5 min-h-4 text-xs text-red-600">{error}</div>

      {change && price !== null && draft != null && (
        <div className="mt-1 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-neutral-800">
          <div>
            <span className="font-medium">{formatPrice(price)}</span> →{" "}
            <span className="font-medium">{formatPrice(draft)}</span>으로 바꿉니다
          </div>
          {change.warn && (
            <div className="mt-1 font-semibold text-red-600">
              이전 가격보다 {change.percent}% {change.up ? "올랐어요" : "내렸어요"}. 오타일 수 있어요!
            </div>
          )}
          <div className="mt-2 flex gap-1">
            <button
              type="button"
              className="rounded bg-emerald-600 px-2 py-1 font-medium text-white hover:bg-emerald-700"
              onClick={confirm}
            >
              바꾸기
            </button>
            <button
              type="button"
              className="rounded border border-neutral-300 bg-white px-2 py-1 hover:bg-neutral-100"
              onClick={cancel}
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
