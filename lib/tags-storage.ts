// Design Ref: §3.1, §5.4 — 가격표 목록은 이 컴퓨터의 브라우저(localStorage)에만 저장한다. 서버에는 올리지 않는다.
// Plan SC: 작업 5번 (여러 장 추가·삭제, 브라우저에 저장·불러오기)
//
// React의 useSyncExternalStore와 함께 쓰도록 subscribe / getSnapshot / getServerSnapshot 형태로 만들었다.

import { DESC_MAX, NAME_MAX, PRICE_MAX_DIGITS, STORAGE_KEY, type PriceTag } from "@/lib/tags";

const listeners = new Set<() => void>();

// 브라우저 저장이 막혀 있을 때(시크릿 모드 등)는 이 탭이 열려 있는 동안만 메모리에 들고 있는다.
let useMemoryOnly = false;
let memoryValue: string | null = null;

// 저장된 글자를 읽는다 (저장된 게 없으면 null)
export function getSnapshot(): string | null {
  if (useMemoryOnly) return memoryValue;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// 서버에서 화면을 미리 만들 때는 저장된 게 없다고 본다
export function getServerSnapshot(): string | null {
  return null;
}

// 저장된 내용이 바뀌면 알려 달라고 등록한다 (같은 탭에서의 저장, 다른 탭에서의 저장 모두)
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

// 가격표 목록을 저장한다
export function saveTags(tags: PriceTag[]): void {
  const json = JSON.stringify(tags);
  try {
    localStorage.setItem(STORAGE_KEY, json);
    useMemoryOnly = false;
  } catch {
    // 저장 공간이 막혀 있거나 가득 찬 경우: 저장은 못 하지만 화면은 계속 쓸 수 있게 한다
    useMemoryOnly = true;
    memoryValue = json;
  }
  listeners.forEach((listener) => listener());
}

// 저장된 글자를 가격표 목록으로 바꾼다.
// 저장된 게 없거나 망가졌으면 null (이때는 기본 예시를 보여 준다).
// 칸마다 모양·길이를 다시 점검해서, 옛 형식이나 손상된 값이 있어도 화면이 깨지지 않게 한다.
export function parseTags(raw: string | null): PriceTag[] | null {
  if (raw === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;

  const tags: PriceTag[] = [];
  const usedIds = new Set<string>();
  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;

    // 같은 id가 겹치면 화면에서 오류가 나므로 겹치지 않게 만든다
    let id = typeof row.id === "string" || typeof row.id === "number" ? String(row.id) : "";
    if (id === "" || usedIds.has(id)) id = `${Date.now()}-${tags.length}-${Math.random().toString(36).slice(2, 6)}`;
    usedIds.add(id);

    tags.push({
      id,
      name: typeof row.name === "string" ? row.name.slice(0, NAME_MAX) : "",
      price: sanitizePrice(row.price),
      desc: typeof row.desc === "string" ? row.desc.slice(0, DESC_MAX) : "",
    });
  }
  return tags;
}

// 가격 값을 숫자 또는 null로 정리한다 (옛 형식의 숫자 글자도 받아 준다)
function sanitizePrice(value: unknown): number | null {
  const num = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof num !== "number" || !Number.isFinite(num) || num < 0) return null;
  const whole = Math.floor(num);
  return String(whole).length > PRICE_MAX_DIGITS ? null : whole;
}
