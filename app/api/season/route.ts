import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AiError, askAi } from "@/lib/ai";
import { requireSession } from "@/lib/api-auth";
import { finalizeSeason, SEASON_INSTRUCTIONS, SEASON_SCHEMA, seasonInput } from "@/lib/poster";
import { RECOMMEND_COUNT } from "@/lib/recommend";

// Design Ref: §2.1 /api/season — 추천 상품의 집계 숫자와 상품명만 받아 추천 이유·포스터 문구 초안을 AI에게 받는다.
// AI 답은 금지 표현·길이 검사를 거쳐 통과한 것만 돌려준다. 요청 내용은 로그로 남기지 않는다.
// Plan SC: 작업 20번

const payloadSchema = z.object({
  seasonName: z.string().min(1).max(30),
  seasonMonths: z.string().min(1).max(20),
  basisLabel: z.string().min(1).max(40),
  items: z
    .array(
      z.object({
        product: z.string().min(1).max(60),
        category: z.string().max(30),
        total: z.number().finite().min(0).max(1e13),
        share: z.number().finite().min(0).max(100),
        lift: z.number().finite().min(0).max(1000).nullable(),
      }),
    )
    .min(1)
    .max(RECOMMEND_COUNT),
});

export async function POST(request: NextRequest) {
  const denied = requireSession(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "bad_request", error: "보낸 내용을 읽지 못했어요." }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, code: "bad_request", error: "보낸 추천 상품 정보의 모양이 올바르지 않아요." }, { status: 400 });
  }

  try {
    const result = await askAi({
      instructions: SEASON_INSTRUCTIONS,
      input: seasonInput(parsed.data),
      maxOutputTokens: 800,
      schema: { name: SEASON_SCHEMA.name, schema: SEASON_SCHEMA.schema as unknown as Record<string, unknown> },
    });
    return NextResponse.json({ ok: true, ...finalizeSeason(result.json, parsed.data.items.length) });
  } catch (error) {
    const e = error instanceof AiError ? error : new AiError("unknown", "지금은 추천 이유와 포스터 문구를 불러올 수 없어요.");
    const status = e.code === "limit" ? 429 : e.code === "not_configured" ? 503 : e.code === "too_large" ? 413 : 502;
    return NextResponse.json({ ok: false, code: e.code, error: e.message }, { status });
  }
}
