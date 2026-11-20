import { NextResponse, type NextRequest } from "next/server";
import { getAiConfig } from "@/lib/ai";
import { getAiLimits, getAiUsage } from "@/lib/ai-limit";
import { requireSession } from "@/lib/api-auth";

// Design Ref: §5.2·5.3 — AI 설정이 되어 있는지와 오늘·이번 달 사용량을 알려 준다. (AI는 부르지 않아서 요금이 들지 않음)
// 키 값은 절대 돌려주지 않는다. 모델 이름과 한도는 비밀 값이 아니라서 보여 준다.
// Plan SC: 작업 15번

export async function GET(request: NextRequest) {
  const denied = requireSession(request);
  if (denied) return denied;

  const config = getAiConfig();
  return NextResponse.json(
    {
      ok: true,
      configured: config.ok,
      model: config.ok ? config.model : null,
      problem: config.ok ? null : config.problem,
      limits: getAiLimits(),
      usage: getAiUsage(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
