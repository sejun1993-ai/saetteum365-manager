import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AiError, askAi } from "@/lib/ai";
import { requireSession } from "@/lib/api-auth";
import {
  buildFacts,
  CAUSE_INSTRUCTIONS,
  CAUSE_SCHEMA,
  causeInput,
  finalizeCause,
  MAX_CAUSE_PRODUCTS,
  type CausePayload,
} from "@/lib/cause";

// Design Ref: §2.1 /api/cause — 고른 구간의 집계 숫자와 상품명만 받아 AI에게 원인 후보를 묻는다.
// 근거는 서버가 받은 숫자로 "다시" 계산하고(화면이 보낸 문장을 믿지 않음), AI 답은 근거 id가 맞는 것만 남긴다.
// 요청 내용은 로그로 남기지 않는다. (Design §5.2)
// Plan SC: 작업 16번, 17번(오류 안내 코드)

const money = z.number().finite().min(0).max(1e13);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const period = z.object({
  label: z.string().min(1).max(40),
  start: day,
  end: day,
  total: money,
  openDays: z.number().int().min(0).max(400),
  closedDays: z.number().int().min(0).max(400),
  dailyAverage: money.nullable(),
  partial: z.boolean(),
});
const payloadSchema = z.object({
  unitLabel: z.string().min(1).max(20),
  basisLabel: z.string().min(1).max(20),
  rate: z.number().finite().min(-1000).max(100000),
  period,
  target: period,
  products: z
    .array(z.object({ product: z.string().min(1).max(60), current: money, previous: money }))
    .max(MAX_CAUSE_PRODUCTS),
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
    return NextResponse.json({ ok: false, code: "bad_request", error: "보낸 집계 숫자의 모양이 올바르지 않아요." }, { status: 400 });
  }

  const payload: CausePayload = parsed.data;
  const facts = buildFacts(payload);
  try {
    const result = await askAi({
      instructions: CAUSE_INSTRUCTIONS,
      input: causeInput(payload, facts),
      maxOutputTokens: 700,
      schema: { name: CAUSE_SCHEMA.name, schema: CAUSE_SCHEMA.schema as unknown as Record<string, unknown> },
    });
    return NextResponse.json({ ok: true, ...finalizeCause(result.json, facts) });
  } catch (error) {
    const e = error instanceof AiError ? error : new AiError("unknown", "지금은 원인 후보를 불러올 수 없어요. 잠시 후 다시 시도해 주세요.");
    const status = e.code === "limit" ? 429 : e.code === "not_configured" ? 503 : e.code === "too_large" ? 413 : 502;
    // AI가 안 돼도 코드가 계산한 근거는 함께 돌려줘서 화면에 보여 줄 수 있게 한다
    return NextResponse.json({ ok: false, code: e.code, error: e.message, facts }, { status });
  }
}
