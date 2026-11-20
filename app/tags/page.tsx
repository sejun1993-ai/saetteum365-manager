"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import PriceInput from "@/components/PriceInput";
import TagCard from "@/components/TagCard";
import { getServerSnapshot, getSnapshot, parseTags, saveTags, subscribe } from "@/lib/tags-storage";
import {
  DESC_MAX,
  NAME_MAX,
  PER_PAGE,
  countInvalidTags,
  createEmptyTag,
  validateTag,
  type PriceTag,
} from "@/lib/tags";

// Design Ref: §2.2 — 가격표 만들기 화면 (입력 → 미리보기 → 인쇄)
// 입력칸·가격표 모양은 작업 3번, 입력 규칙은 4번, 추가·삭제와 브라우저 저장은 5번, 인쇄는 6~7번에서 다듬는다.

// 처음 열었을 때(저장된 게 없을 때) 보여 주는 예시
const SAMPLE: PriceTag[] = [
  { id: "sample-1", name: "비타민C 1000", price: 15000, desc: "하루 한 알, 간편한 비타민 섭취" },
  { id: "sample-2", name: "종합감기약", price: 6500, desc: "복용 전 설명서를 꼭 확인하세요" },
];

// 화면이 브라우저에서 준비됐는지 알려 준다 (서버에서 만들 때는 false, 브라우저에서는 true)
const noopSubscribe = () => () => {};
const getReady = () => true;
const getNotReady = () => false;

export default function TagsPage() {
  const ready = useSyncExternalStore(noopSubscribe, getReady, getNotReady);

  // 브라우저에 저장된 가격표를 읽어 온다. 저장된 게 없으면 예시를 보여 준다.
  // (저장 내용이 바뀌면 자동으로 다시 읽는다)
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const tags = useMemo(() => parseTags(raw) ?? SAMPLE, [raw]);

  // 가격 변경을 "바꾸기"로 확인하기 전인 가격표 (id별로 기록)
  const [pendingMap, setPendingMap] = useState<Record<string, boolean>>({});
  function setPending(id: string, pending: boolean) {
    setPendingMap((prev) => (prev[id] === pending ? prev : { ...prev, [id]: pending }));
  }

  // 아래 세 함수는 목록을 바꾼 뒤 곧바로 브라우저에 저장한다
  function update(id: string, patch: Partial<PriceTag>) {
    saveTags(tags.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function add() {
    saveTags([...tags, createEmptyTag()]);
  }

  function remove(id: string) {
    saveTags(tags.filter((t) => t.id !== id));
  }

  // 저장된 내용을 읽어 오기 전에는 예시가 잠깐 보였다 바뀌지 않도록 안내만 보여 준다
  if (!ready) {
    return (
      <main className="mx-auto w-full max-w-5xl p-6 text-sm text-neutral-500">
        가격표를 불러오는 중이에요…
      </main>
    );
  }

  // 빈칸이나 0원이 있는 가격표 수 (있으면 인쇄를 막는다)
  const invalidCount = countInvalidTags(tags);
  // 아직 확인하지 않은 가격 변경이 있는 가격표 수 (있으면 이전 가격이 인쇄되지 않도록 인쇄를 막는다)
  const pendingCount = tags.filter((t) => pendingMap[t.id]).length;

  const pages: PriceTag[][] = [];
  for (let i = 0; i < tags.length; i += PER_PAGE) {
    pages.push(tags.slice(i, i + PER_PAGE));
  }

  return (
    <main className="mx-auto w-full max-w-5xl p-6 text-neutral-900">
      <div className="no-print">
        <h1 className="text-2xl font-bold">새뜸365 매니저 · 가격표 만들기</h1>
        <p className="mt-1 text-sm text-neutral-600">
          약이름 · 가격 · 간단한 설명만 적으면 가로 7cm × 세로 5cm 가격표가 만들어집니다.
          A4 한 장에 10장씩 인쇄돼요.
        </p>

        <div className="mt-6 space-y-3">
          {tags.map((t, i) => (
            <div
              key={t.id}
              className="grid grid-cols-1 gap-2 rounded-lg border border-neutral-300 bg-white p-3 sm:grid-cols-[2rem_1.2fr_0.8fr_2fr_auto] sm:items-center"
            >
              <span className="text-sm text-neutral-500">{i + 1}</span>
              <div>
                <input
                  className={`w-full rounded border px-2 py-1.5 ${
                    validateTag(t).name ? "border-red-400" : "border-neutral-300"
                  }`}
                  placeholder="약 이름"
                  value={t.name}
                  maxLength={NAME_MAX}
                  onChange={(e) => update(t.id, { name: e.target.value })}
                />
                <div className="mt-0.5 min-h-4 text-xs text-red-600">{validateTag(t).name}</div>
              </div>
              <PriceInput
                price={t.price}
                error={validateTag(t).price}
                onCommit={(price) => update(t.id, { price })}
                onPendingChange={(pending) => setPending(t.id, pending)}
              />
              <div>
                <input
                  className="w-full rounded border border-neutral-300 px-2 py-1.5"
                  placeholder="간단한 설명"
                  value={t.desc}
                  maxLength={DESC_MAX}
                  onChange={(e) => update(t.id, { desc: e.target.value })}
                />
                <div className="mt-0.5 text-right text-xs text-neutral-500">
                  {t.desc.length}/{DESC_MAX}
                </div>
              </div>
              <button
                className="rounded border border-neutral-300 px-2 py-1.5 text-sm hover:bg-neutral-100"
                onClick={() => remove(t.id)}
              >
                삭제
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            className="rounded bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"
            onClick={add}
          >
            + 가격표 추가
          </button>
          <button
            className="rounded bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
            onClick={() => window.print()}
            disabled={tags.length === 0 || invalidCount > 0 || pendingCount > 0}
          >
            인쇄하기
          </button>
        </div>
        {pendingCount > 0 && (
          <p className="mt-2 text-sm text-amber-700">
            확인하지 않은 가격 변경이 {pendingCount}건 있어요. &quot;바꾸기&quot; 또는 &quot;취소&quot;를 누른 뒤 인쇄할 수 있어요.
          </p>
        )}
        {invalidCount > 0 && (
          <p className="mt-2 text-sm text-red-600">
            빈칸이나 0원이 있는 가격표가 {invalidCount}장 있어요. 고친 뒤에 인쇄할 수 있어요.
          </p>
        )}

        <h2 className="mt-8 text-lg font-semibold">미리보기 ({tags.length}장)</h2>
        <p className="text-sm text-neutral-600">
          총 {tags.length}장 · A4 {pages.length}장에 10개씩 인쇄돼요. 인쇄한 뒤 2열 × 5행으로 잘라 쓰세요.
        </p>
        <div className="mt-2 rounded border border-sky-200 bg-sky-50 p-3 text-sm text-neutral-800">
          <p className="font-medium">인쇄할 때 이렇게 설정해 주세요</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>
              용지 크기: <b>A4</b>
            </li>
            <li>
              배율: <b>100%</b> — &quot;용지에 맞춤&quot;이나 &quot;축소&quot;는 끄세요. 그래야 가격표가 실제 가로 7cm ×
              세로 5cm로 나와요.
            </li>
            <li>
              머리글/바닥글: <b>끄기</b> — 날짜나 주소가 가격표 옆에 같이 인쇄되지 않게 해요.
            </li>
            <li>
              여백: <b>기본값</b>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-3">
        {pages.map((page, pi) => (
          <div className="sheet" key={pi}>
            {page.map((t) => (
              <TagCard key={t.id} tag={t} />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
