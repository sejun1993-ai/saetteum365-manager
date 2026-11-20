// Design Ref: §3.2 — 읽은 매출 자료는 "브라우저 임시 저장(sessionStorage)"에만 둔다. 탭을 닫으면 사라지고 서버에는 올리지 않는다.
// 올린 원본 파일은 저장하지 않고, 일자·상품·매출액·구분만 남긴다. (이름·연락처 같은 다른 열은 읽을 때 이미 버려진다.)
// Plan SC: 작업 8번 (읽은 집계를 브라우저 임시 저장)
//
// React의 useSyncExternalStore와 함께 쓰도록 subscribe / getSnapshot / getServerSnapshot 형태로 만들었다.

import type { SalesRow, SalesSummary } from "@/lib/sales";

const STORAGE_KEY = "saetteum365-sales";

// 저장 모양: rows는 용량을 줄이려고 [날짜, 상품, 매출액, 휴무(1/0), 구분] 배열로 둔다
type Stored = {
  v: 1;
  fileName: string;
  loadedAt: string;
  summary: SalesSummary;
  rows: [string, string, number, 0 | 1, string][];
};

export type LoadedSales = { fileName: string; loadedAt: string; summary: SalesSummary; rows: SalesRow[] };

const listeners = new Set<() => void>();
let useMemoryOnly = false; // 임시 저장 공간이 막히거나 가득 차면 이 탭이 열려 있는 동안만 메모리에 둔다
let memoryValue: string | null = null;

export function getSnapshot(): string | null {
  if (useMemoryOnly) return memoryValue;
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getServerSnapshot(): string | null {
  return null;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  listeners.forEach((l) => l());
}

// 읽은 자료를 저장한다. 임시 저장 공간이 부족하면 메모리에 두고 false를 돌려준다.
export function saveSales(fileName: string, summary: SalesSummary, rows: SalesRow[]): boolean {
  const data: Stored = {
    v: 1,
    fileName,
    loadedAt: new Date().toISOString(),
    summary,
    rows: rows.map((r) => [r.date, r.product, r.amount, r.closed ? 1 : 0, r.category]),
  };
  const json = JSON.stringify(data);
  let persisted = true;
  try {
    sessionStorage.setItem(STORAGE_KEY, json);
    useMemoryOnly = false;
    memoryValue = null;
  } catch {
    useMemoryOnly = true;
    memoryValue = json;
    persisted = false;
  }
  notify();
  return persisted;
}

export function clearSales(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 지울 수 없어도 아래에서 메모리 값은 비운다
  }
  useMemoryOnly = false;
  memoryValue = null;
  notify();
}

// 저장된 글자를 자료로 바꾼다. 없거나 모양이 다르면 null.
export function parseSales(raw: string | null): LoadedSales | null {
  if (raw === null) return null;
  try {
    const data = JSON.parse(raw) as Partial<Stored> | null;
    if (!data || data.v !== 1 || !Array.isArray(data.rows) || typeof data.fileName !== "string" || !data.summary) return null;
    const rows: SalesRow[] = [];
    for (const r of data.rows) {
      if (!Array.isArray(r) || typeof r[0] !== "string" || typeof r[2] !== "number") continue;
      rows.push({ date: r[0], product: String(r[1] ?? ""), amount: r[2], closed: r[3] === 1, category: String(r[4] ?? "") });
    }
    return { fileName: data.fileName, loadedAt: String(data.loadedAt ?? ""), summary: data.summary, rows };
  } catch {
    return null;
  }
}
