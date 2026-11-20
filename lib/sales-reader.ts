// Design Ref: §3.2 — 올린 파일은 브라우저 안에서만 읽는다. 서버로 보내지 않는다.
// Plan SC: 작업 8번 (엑셀 파일 올리기와 읽기, 형식이 다르면 알려 주기)
//
// 엑셀(.xlsx)과 CSV(.csv)를 읽어 표(2차원 배열)로 만든 뒤, 정리는 lib/sales.ts에 맡긴다.
// 읽기 도구는 파일을 올렸을 때만 불러온다(처음 화면이 무거워지지 않게).

import { MAX_FILE_BYTES, parseSalesTable, parseSalesWorkbook, type SalesParseResult } from "@/lib/sales";

const UNREADABLE = "파일을 읽지 못했어요. 엑셀에서 열리는 파일인지 확인한 뒤 다시 올려 주세요.";

export async function readSalesFile(file: File): Promise<SalesParseResult> {
  const name = file.name.toLowerCase();

  if (file.size === 0) return { ok: false, error: "빈 파일이에요." };
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: `파일이 너무 커요. ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB 이하로 올려 주세요.` };
  }

  if (name.endsWith(".xls")) {
    return {
      ok: false,
      error:
        "예전 형식(.xls) 파일이에요. 엑셀에서 '다른 이름으로 저장'을 눌러 .xlsx 또는 .csv로 저장한 뒤 올려 주세요.",
    };
  }

  try {
    if (name.endsWith(".xlsx")) return await readXlsx(file);
    if (name.endsWith(".csv")) return await readCsv(file);
  } catch {
    return { ok: false, error: UNREADABLE };
  }

  return { ok: false, error: "엑셀(.xlsx) 또는 CSV(.csv) 파일만 올릴 수 있어요." };
}

async function readXlsx(file: File): Promise<SalesParseResult> {
  const { default: readExcelFile } = await import("read-excel-file/browser");
  const sheets = await readExcelFile(file); // 모든 시트를 읽는다
  if (sheets.length === 0) return { ok: false, error: UNREADABLE };

  // 시트를 모두 살펴서 상품별 시트를 고르고, 상품목록(구분)·일별매출(휴무)을 함께 가져온다
  return parseSalesWorkbook(sheets.map((s) => ({ sheet: s.sheet, data: s.data as unknown[][] })));
}

async function readCsv(file: File): Promise<SalesParseResult> {
  const bytes = await file.arrayBuffer();

  // ERP가 내보낸 CSV는 한글이 깨지지 않도록 UTF-8이 아닌 EUC-KR(CP949)인 경우가 많다
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("euc-kr").decode(bytes);
  }
  text = text.replace(/^﻿/, ""); // 앞에 붙은 표시(BOM) 제거

  const { default: Papa } = await import("papaparse");
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  if (parsed.data.length === 0) return { ok: false, error: "표가 비어 있어요." };

  return parseSalesTable(parsed.data, "");
}
