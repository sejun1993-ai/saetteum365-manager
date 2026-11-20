// Design Ref: §6 오류 처리 — "AI가 응답하지 않음·인터넷 끊김 → 지금은 … 불러올 수 없어요. 잠시 후 다시 시도해 주세요.
// 그래프와 가격표는 계속 사용 가능". 화면에서 AI API(/api/cause, /api/season)를 부를 때 함께 쓴다.
// Plan SC: 작업 17번 (AI가 응답하지 않거나 인터넷이 끊겼을 때 안내 문구)

const CLIENT_TIMEOUT_MS = 45_000; // 서버(30초 + 재시도 1번)보다 조금 길게

export type AiCallResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; code: string; retry: boolean; extra?: Record<string, unknown> };

export const KEEP_WORKING = "그래프·표와 가격표는 그대로 계속 쓸 수 있어요.";

// what: "원인 후보를"처럼 조사까지 붙여서 넘긴다
export async function callAiApi<T>(url: string, body: unknown, what: string): Promise<AiCallResult<T>> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return {
      ok: false,
      code: "offline",
      retry: true,
      message: `인터넷이 끊겨 있어서 ${what} 불러올 수 없어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      code: timedOut ? "timeout" : "network",
      retry: true,
      message: timedOut
        ? `AI가 제시간에 답하지 않아 ${what} 불러오지 못했어요. 잠시 후 다시 시도해 주세요.`
        : `지금은 ${what} 불러올 수 없어요. 인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요.`,
    };
  } finally {
    clearTimeout(timer);
  }

  let data: Record<string, unknown> | null = null;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = null;
  }

  if (res.status === 401) {
    return { ok: false, code: "unauthorized", retry: false, message: "로그인이 끝났어요. 화면을 새로 고쳐 비밀번호를 다시 넣어 주세요." };
  }
  if (!data || data.ok !== true) {
    const code = typeof data?.code === "string" ? data.code : "unknown";
    const serverMessage = typeof data?.error === "string" ? data.error : null;
    return {
      ok: false,
      code,
      // 설정이 없거나 한도를 다 쓴 경우는 다시 눌러도 같으니 "다시 시도" 버튼을 숨긴다
      retry: !["not_configured", "auth", "model", "bad_request", "too_large"].includes(code) && !(code === "limit" && serverMessage?.includes("달")),
      message: serverMessage ?? `지금은 ${what} 불러올 수 없어요. 잠시 후 다시 시도해 주세요.`,
      extra: data ?? undefined,
    };
  }
  return { ok: true, data: data as T };
}
