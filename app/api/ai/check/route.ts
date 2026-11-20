import { NextResponse, type NextRequest } from "next/server";
import { AiError, askAi } from "@/lib/ai";
import { getAiUsage } from "@/lib/ai-limit";
import { requireSession } from "@/lib/api-auth";

// Design Ref: §5.2 — AI 연결 시험. 매출 자료는 보내지 않고 짧은 확인 문장만 보낸다.
// 이 호출도 호출 횟수와 월 한도에 함께 센다. (아주 적은 요금이 든다)
// Plan SC: 작업 15번

export async function POST(request: NextRequest) {
  const denied = requireSession(request);
  if (denied) return denied;

  try {
    const result = await askAi({
      instructions: "연결 확인용 요청입니다. 한국어로 '연결됐어요' 한 마디만 답하세요.",
      input: "연결 확인",
      maxOutputTokens: 200,
    });
    return NextResponse.json({ ok: true, reply: result.text.slice(0, 40), tokens: result.tokens, usage: getAiUsage() });
  } catch (error) {
    const e = error instanceof AiError ? error : new AiError("unknown", "지금은 AI 답을 받을 수 없어요.");
    const status = e.code === "limit" ? 429 : e.code === "not_configured" ? 503 : 502;
    return NextResponse.json({ ok: false, code: e.code, error: e.message, usage: getAiUsage() }, { status });
  }
}
