"use client";

// Design Ref: §2.3 — ① 엑셀 파일 올리기. 올린 파일은 이 컴퓨터 안(브라우저)에서만 읽고, 형식이 다르면 이유를 알려 준다.
// Plan SC: 작업 8번 (엑셀 파일 올리기와 읽기, 읽은 집계를 브라우저 임시 저장)

import { useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from "react";
import { readSalesFile } from "@/lib/sales-reader";
import { clearSales, getServerSnapshot, getSnapshot, parseSales, saveSales, subscribe } from "@/lib/sales-storage";

const won = (n: number) => n.toLocaleString("ko-KR");

// compact: 시즌 화면처럼 다른 화면 안에 넣을 때 미리보기 표와 도움말을 숨긴 간단한 모양
export default function SalesUploader({ compact = false }: { compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [dragging, setDragging] = useState(false);

  // 임시 저장된 자료 (탭을 닫으면 사라진다)
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const loaded = useMemo(() => parseSales(raw), [raw]);

  async function handleFile(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setStorageWarning("");
    const result = await readSalesFile(file);
    if (result.ok) {
      const persisted = saveSales(file.name, result.summary, result.rows);
      if (!persisted) {
        setStorageWarning("이 브라우저의 임시 저장 공간이 부족해서, 이 탭을 닫기 전까지만 자료를 들고 있을 수 있어요.");
      }
    } else {
      // 실패해도 이전에 올린 자료는 그대로 둔다
      setError(result.error);
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = ""; // 같은 파일을 다시 골라도 반응하도록 비운다
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files[0]);
  }

  const summary = loaded?.summary;
  const previewRows = loaded?.rows.slice(0, 5) ?? [];

  return (
    <section className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed p-6 text-center ${
          dragging ? "border-emerald-500 bg-emerald-50" : "border-neutral-300 bg-neutral-50"
        }`}
      >
        <p className="font-medium">ERP에서 내려받은 매출 엑셀을 올려 주세요</p>
        <p className="mt-1 text-sm text-neutral-600">엑셀(.xlsx) 또는 CSV(.csv), 10MB 이하 · 여기에 끌어다 놓아도 돼요</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="mt-4 rounded bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          {busy ? "읽는 중…" : loaded ? "다른 파일 올리기" : "파일 선택"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <p className="mt-3 text-xs text-neutral-500">
          파일은 이 컴퓨터 안에서만 읽어요. 서버로 보내지 않고, 이 탭을 닫으면 사라져요.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <p className="font-medium">파일을 읽지 못했어요</p>
          <p className="mt-1">{error}</p>
        </div>
      )}
      {storageWarning && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{storageWarning}</div>
      )}

      {loaded && summary && (
        <div className="rounded-lg border border-neutral-300 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">{loaded.fileName}</p>
              <p className="text-xs text-neutral-500">
                {summary.sheetName ? `시트 "${summary.sheetName}"를 읽었어요` : "CSV 파일을 읽었어요"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                clearSales();
                setError("");
                setStorageWarning("");
              }}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
            >
              지우기
            </button>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-neutral-500">기간</dt>
              <dd className="font-medium">
                {summary.dateFrom} ~ {summary.dateTo} ({summary.monthSpan}개월)
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">읽은 줄</dt>
              <dd className="font-medium">
                {summary.rowCount.toLocaleString("ko-KR")}줄 ({summary.dayCount.toLocaleString("ko-KR")}일)
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">자료 종류</dt>
              <dd className="font-medium">
                {summary.hasProducts ? `상품별 (상품 ${summary.productCount.toLocaleString("ko-KR")}개)` : "일별 합계"}
              </dd>
            </div>
            {summary.closedDays > 0 && (
              <div>
                <dt className="text-neutral-500">휴무로 표시된 날</dt>
                <dd className="font-medium">{summary.closedDays}일</dd>
              </div>
            )}
          </dl>

          <p className="mt-3 text-xs text-neutral-500">
            읽은 열:{" "}
            {[
              ["일자", summary.columns.date],
              ["매출액", summary.columns.amount],
              ["상품", summary.columns.product],
              ["구분", summary.columns.category],
              ["비고", summary.columns.note],
            ]
              .filter(([, name]) => name)
              .map(([label, name]) => `${label} ← "${name}"`)
              .join(" · ")}
          </p>
          {summary.layout === "wide" && (
            <p className="mt-1 text-xs text-neutral-500">상품마다 열이 나뉜 표를 &quot;상품별 한 줄&quot; 모양으로 바꿔서 읽었어요.</p>
          )}
          {(summary.usedSheets ?? []).map((text) => (
            <p key={text} className="mt-1 text-xs text-neutral-500">
              {text}
            </p>
          ))}

          {(summary.personalColumns ?? []).length > 0 && (
            <div role="alert" className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-semibold">
                개인정보로 보이는 열 {(summary.personalColumns ?? []).length}개를 발견해서 읽지 않고 버렸어요
              </p>
              <p className="mt-1">열 이름: {(summary.personalColumns ?? []).join(", ")}</p>
              <p className="mt-1 text-xs">
                이 열의 내용은 이 앱이 읽지도, 저장하지도, 서버로 보내지도 않아요. 다만 올리신 원본 파일에는 그대로 남아 있으니, 다음부터는
                ERP에서 내려받을 때 이 열을 빼고 받는 것이 더 안전해요.
              </p>
            </div>
          )}

          {summary.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              {summary.warnings.map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
          )}

          <div className={`mt-3 overflow-x-auto ${compact ? "hidden" : ""}`}>
            <table className="w-full min-w-[22rem] text-left text-sm">
              <caption className="pb-1 text-left text-xs text-neutral-500">앞쪽 5줄 미리보기</caption>
              <thead className="border-b border-neutral-300 text-neutral-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">일자</th>
                  {summary.hasProducts && <th className="py-1 pr-3 font-medium">상품</th>}
                  {summary.columns.category && <th className="py-1 pr-3 font-medium">구분</th>}
                  <th className="py-1 pr-3 text-right font-medium">매출액(원)</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i} className="border-b border-neutral-100">
                    <td className="py-1 pr-3">
                      {r.date}
                      {r.closed && <span className="ml-1 text-xs text-neutral-500">(휴무)</span>}
                    </td>
                    {summary.hasProducts && <td className="py-1 pr-3">{r.product}</td>}
                    {summary.columns.category && <td className="py-1 pr-3">{r.category}</td>}
                    <td className="py-1 pr-3 text-right tabular-nums">{won(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <details className={`rounded border border-neutral-200 p-3 text-sm text-neutral-700 ${compact ? "hidden" : ""}`}>
        <summary className="cursor-pointer font-medium">어떤 모양의 파일을 올려야 하나요?</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            맨 위 줄에 열 이름이 있어야 해요. 꼭 필요한 열: <b>일자</b>(또는 날짜), <b>매출액</b>
          </li>
          <li>
            있으면 같이 읽는 열: <b>상품명</b>(상품별 분석), <b>구분</b>(조제/일반 등), <b>비고</b>(&quot;휴무&quot;라고 적힌 날은 휴무로 표시)
          </li>
          <li>상품별 자료는 하루에 상품마다 한 줄씩이면 돼요. 같은 날·같은 상품이 여러 줄이면 더해서 합쳐요.</li>
          <li>날짜는 2025-01-01, 2025.01.01, 2025/1/1, 20250101 모양을 읽어요.</li>
          <li>전년 비교와 시즌 추천을 위해 ERP에서 13개월 이상 내려받아 주세요.</li>
          <li>환자 이름·연락처 같은 개인정보 열은 읽지 않고 버리고, 버렸다고 알려 드려요.</li>
          <li>구분이 &quot;조제&quot;나 &quot;처방&quot;인 줄은 계산에서 빼요.</li>
        </ul>
      </details>
    </section>
  );
}
