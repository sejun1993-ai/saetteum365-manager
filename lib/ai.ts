import "server-only";

// Design Ref: §1-2, §5.1 — AI 키는 서버 쪽 코드(API)에서만 쓴다. 이 파일을 화면 코드에서 불러오면 빌드가 멈춘다(server-only).
// Design Ref: §5.2 — AI를 부르는 API는 요청 내용(집계 숫자·상품명)을 로그로 남기지 않는다.
// Plan SC: 작업 15번 (OPENAI_API_KEY·OPENAI_MODEL을 서버에서만 읽고, 호출 횟수 제한·월 사용 한도)
//
// 작업 16번(원인 후보)과 20번(추천 이유·포스터 문구)이 모두 이 askAi 하나로 AI를 부른다.

import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from "openai";
import { checkAiLimit, recordAiTokens, releaseAiCall } from "./ai-limit";

// 한 번 부를 때의 크기 상한 (요금이 갑자기 커지지 않도록 코드로 막는다)
export const MAX_INPUT_CHARS = 8000; // 보내는 글자 수 (집계 숫자·상품명이면 충분한 크기)
export const MAX_OUTPUT_TOKENS = 1200; // 받는 답의 최대 길이
const TIMEOUT_MS = 30_000; // 30초 안에 답이 없으면 포기

// 화면에 보여 줄 오류 종류. 안내 문구는 작업 17번에서 화면에 붙인다.
export type AiErrorCode =
  | "not_configured" // .env에 키나 모델 이름이 없음
  | "limit" // 이 앱의 호출 횟수·월 한도 초과
  | "too_large" // 보내려는 내용이 너무 큼
  | "auth" // 키가 틀렸거나 권한 없음
  | "model" // 모델 이름이 틀림
  | "quota" // OpenAI 쪽 사용량·결제 한도
  | "timeout" // 답이 너무 늦음
  | "network" // 인터넷·서버 연결 실패
  | "bad_response" // 답의 모양이 이상함
  | "unknown";

export class AiError extends Error {
  code: AiErrorCode;
  // message: 사용자에게 보여 줘도 되는 한국어 문장 (비밀 값·보낸 내용은 넣지 않는다)
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = "AiError";
    this.code = code;
  }
}

type AiConfig = { ok: true; apiKey: string; model: string } | { ok: false; problem: string };

// .env에서 AI 설정을 읽는다. 값은 어디에도 출력하지 않고, 없는 항목의 "이름"만 알려 준다.
export function getAiConfig(): AiConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim();
  const missing = [!apiKey && "OPENAI_API_KEY", !model && "OPENAI_MODEL"].filter(Boolean);
  if (missing.length > 0 || !apiKey || !model) {
    return { ok: false, problem: `.env에 ${missing.join(", ")} 값이 없어요` };
  }
  return { ok: true, apiKey, model };
}

let client: { key: string; instance: OpenAI } | null = null;
function getClient(apiKey: string): OpenAI {
  if (!client || client.key !== apiKey) {
    client = { key: apiKey, instance: new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 }) };
  }
  return client.instance;
}

export type AskAiOptions = {
  instructions: string; // AI에게 주는 규칙 (예: "가능성으로만 말한다")
  input: string; // 보낼 내용 (집계 숫자와 상품명만)
  maxOutputTokens?: number;
  // 답을 정해진 JSON 모양으로 받고 싶을 때 (작업 16·20번)
  schema?: { name: string; schema: Record<string, unknown> };
};

export type AskAiResult = { text: string; json: unknown; tokens: number };

// AI에게 한 번 묻는다. 실패하면 AiError를 던진다.
export async function askAi(options: AskAiOptions): Promise<AskAiResult> {
  const config = getAiConfig();
  if (!config.ok) throw new AiError("not_configured", `AI 설정이 아직 안 됐어요. (${config.problem})`);

  const size = options.instructions.length + options.input.length;
  if (size > MAX_INPUT_CHARS) {
    throw new AiError("too_large", "AI에 보낼 내용이 너무 길어요. 기간을 줄여서 다시 시도해 주세요.");
  }

  // 호출 횟수·월 한도 확인 (통과하면 이번 호출을 미리 1회로 센다)
  const limit = checkAiLimit();
  if (!limit.ok) throw new AiError("limit", limit.message);

  let tokens = 0;
  try {
    const response = await getClient(config.apiKey).responses.create({
      model: config.model,
      instructions: options.instructions,
      input: options.input,
      max_output_tokens: Math.min(options.maxOutputTokens ?? MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS),
      store: false, // OpenAI 쪽에 대화 기록을 남기지 않는다
      ...(options.schema
        ? { text: { format: { type: "json_schema" as const, name: options.schema.name, schema: options.schema.schema, strict: true } } }
        : {}),
    });
    tokens = response.usage?.total_tokens ?? 0;
    const text = response.output_text ?? "";
    if (!text.trim()) throw new AiError("bad_response", "AI가 빈 답을 보냈어요. 잠시 후 다시 시도해 주세요.");
    let json: unknown = null;
    if (options.schema) {
      try {
        json = JSON.parse(text);
      } catch {
        throw new AiError("bad_response", "AI 답의 모양이 올바르지 않아요. 잠시 후 다시 시도해 주세요.");
      }
    }
    return { text, json, tokens };
  } catch (error) {
    throw toAiError(error);
  } finally {
    // 쓴 토큰을 월 사용량에 더한다. 답을 못 받았으면(연결 실패 등) 미리 센 호출을 되돌린다.
    if (tokens > 0) recordAiTokens(tokens);
    else releaseAiCall();
  }
}

// OpenAI 오류를 사용자용 안내로 바꾼다. 서버 로그에는 오류 종류와 상태 번호만 남긴다(보낸 내용·키는 남기지 않음).
function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  const status = error instanceof Error && "status" in error ? String((error as { status?: unknown }).status) : "-";
  console.error(`[ai] 호출 실패: ${error instanceof Error ? error.constructor.name : typeof error} (status ${status})`);

  if (error instanceof APIConnectionTimeoutError) {
    return new AiError("timeout", "AI가 제시간에 답하지 않았어요. 잠시 후 다시 시도해 주세요.");
  }
  if (error instanceof APIConnectionError) {
    return new AiError("network", "AI 서비스에 연결하지 못했어요. 인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요.");
  }
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    return new AiError("auth", "AI 키(OPENAI_API_KEY)가 맞지 않거나 권한이 없어요. 키를 확인해 주세요.");
  }
  if (error instanceof NotFoundError) {
    return new AiError("model", "AI 모델 이름(OPENAI_MODEL)을 찾을 수 없어요. 모델 이름을 확인해 주세요.");
  }
  if (error instanceof RateLimitError) {
    return new AiError(
      "quota",
      "AI 서비스 쪽 사용 한도에 걸렸어요. 잠시 후 다시 시도하거나 OpenAI 결제·한도 설정을 확인해 주세요.",
    );
  }
  if (error instanceof BadRequestError) {
    return new AiError("model", "AI가 요청을 받지 않았어요. 모델 이름(OPENAI_MODEL)이 이 기능을 지원하는지 확인해 주세요.");
  }
  return new AiError("unknown", "지금은 AI 답을 받을 수 없어요. 잠시 후 다시 시도해 주세요.");
}
