// Design Ref: §3.2, §5.4 — ERP 매출 엑셀(표)을 읽어 "일자·상품·매출액" 줄로 정리하는 규칙 (화면과 상관없는 규칙 코드)
// Plan SC: 작업 8번 (엑셀 파일 올리기와 읽기, 형식이 다르면 알려 주기)
//
// 이 파일은 "이미 읽어 둔 표(2차원 배열)"를 받아 계산만 한다. 파일을 여는 일은 lib/sales-reader.ts가 한다.
// 필요한 열(일자, 매출액) 외의 열은 읽지 않고 버린다. 그래서 이름·연락처 같은 열이 있어도 여기서는 저장되지 않는다.
// (개인정보 열을 찾아 경고하는 일은 PLAN 9번에서 이어서 한다.)
//
// 읽을 수 있는 표 모양
//  ① 줄 형식: 한 줄에 "일자 | 상품명 | 매출액" (상품명 열이 없으면 일별 합계)
//  ② 열 형식: 한 줄이 하루이고, 상품마다 열이 따로 있는 표 ("일자 | 상품A | 상품B | … | 합계")
//  ③ 엑셀 통합문서: 시트가 여러 개이면 상품별 시트를 고르고, "상품목록" 시트의 구분(일반/전문 등)과
//     "일별매출" 시트의 휴무 표시를 함께 가져온다.

// 한 줄: 하루 × (상품) 매출
export type SalesRow = {
  date: string; // "2025-01-01"
  product: string; // 상품명. 상품별 자료가 아니면 빈 글자("")
  amount: number; // 매출액(원)
  closed: boolean; // 휴무로 표시된 날이면 true
  category: string; // 구분(조제/일반의약품/의약외품 등). 없으면 빈 글자("")
};

// 어떤 열을 어떤 용도로 읽었는지 (화면에 보여 주기 위함)
export type SalesColumns = {
  date: string;
  amount: string;
  product?: string;
  category?: string;
  note?: string;
};

export type SalesSummary = {
  sheetName: string; // 읽은 시트 이름 (csv는 "")
  layout: "long" | "wide"; // long = 한 줄에 상품 하나, wide = 상품마다 열이 따로 있는 표
  usedSheets: string[]; // 함께 가져온 시트 설명 (예: "상품목록 시트에서 구분을 가져왔어요")
  columns: SalesColumns;
  rowCount: number; // 읽은 줄 수
  dayCount: number; // 자료가 있는 날 수
  dateFrom: string;
  dateTo: string;
  monthSpan: number; // 첫 날~마지막 날이 걸친 달 수
  hasProducts: boolean; // 상품별 자료인지 (false면 일별 합계)
  productCount: number;
  closedDays: number; // 휴무로 표시된 날 수
  missingDays: number; // 기간 안에서 자료가 없는 날 수
  skippedCount: number; // 읽지 못해 건너뛴 줄 수
  skippedExamples: number[]; // 건너뛴 줄 번호(엑셀 기준) 예시
  mergedCount: number; // 같은 날짜·상품이 여러 줄이라 합친 횟수
  personalColumns: string[]; // 개인정보로 보여 읽지 않고 버린 열의 이름 (열 안의 내용은 어디에도 남기지 않는다)
  dispensingExcludedRows: number; // 조제(처방) 매출이라 계산에서 뺀 줄 수
  dispensingExcludedAmount: number; // 그 줄들의 매출 합계(원)
  warnings: string[]; // 알려 줄 점 (오류는 아니지만 조심할 것)
};

export type SalesParseResult =
  | { ok: true; rows: SalesRow[]; summary: SalesSummary }
  | { ok: false; error: string };

export const MIN_MONTHS_FOR_COMPARE = 13; // 전년 같은 기간 비교에 필요한 최소 개월 수 (PRD 5번 B)
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

// 열 이름 후보 (공백·괄호 안 글자를 뺀 뒤 비교한다)
const ALIASES = {
  date: ["일자", "날짜", "판매일", "판매일자", "거래일", "거래일자", "영업일", "영업일자", "일시", "date"],
  amount: ["매출액", "매출", "판매금액", "판매액", "매출금액", "총매출", "총매출액", "실매출", "실매출액", "금액", "amount"],
  product: ["상품명", "품목명", "품목", "제품명", "약품명", "품명", "상품", "약명", "product"],
  category: ["구분", "분류", "조제구분", "의약품구분", "품목구분", "상품구분", "유형", "category"],
  note: ["비고", "메모", "특이사항", "note"],
} as const;

// 열 형식에서 "상품이 아닌 열"로 보는 머리글 (요일, 합계, 차이 등)
const NON_PRODUCT_HEADER = /(요일|합계|총계|소계|비중|평균|차이|비고|메모|특이사항)/;

type Field = keyof typeof ALIASES;
type Cell = unknown;
type Table = Cell[][];
type Columns = Partial<Record<Field, number>>;

// 열 이름을 비교하기 쉽게 바꾼다: "매출액(원)" → "매출액", " 일 자 " → "일자"
function normalizeHeader(value: Cell): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[(（][^)）]*[)）]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

// 이름에 "차이, 비중, 평균, 합계, 요일"이 들어 있는 열은 '비슷한 이름' 찾기에서 뺀다.
// (예: "일별매출과 차이"를 매출액 열로 잘못 읽지 않도록)
const FUZZY_SKIP = /(차이|비중|평균|합계|요일)/;

type Found = { cols: Columns; fuzzy: Set<Field> }; // fuzzy: 이름이 똑같지는 않고 "포함"으로 찾은 용도

// 한 줄(머리글 후보)에서 용도별 열 번호를 찾는다. 이름이 똑같은 것을 먼저, 이름에 포함된 것을 그다음에 찾는다.
function findColumns(headerRow: Cell[]): Found {
  const names = headerRow.map(normalizeHeader);
  const cols: Columns = {};
  const fuzzy = new Set<Field>();
  const used = new Set<number>();
  const fields = Object.keys(ALIASES) as Field[];

  for (const field of fields) {
    const idx = names.findIndex((n, i) => !used.has(i) && n !== "" && (ALIASES[field] as readonly string[]).includes(n));
    if (idx >= 0) {
      cols[field] = idx;
      used.add(idx);
    }
  }
  for (const field of fields) {
    if (cols[field] !== undefined) continue;
    const idx = names.findIndex(
      (n, i) =>
        !used.has(i) &&
        n !== "" &&
        !FUZZY_SKIP.test(n) &&
        (ALIASES[field] as readonly string[]).some((alias) => alias.length >= 2 && n.includes(alias)),
    );
    if (idx >= 0) {
      cols[field] = idx;
      fuzzy.add(field);
      used.add(idx);
    }
  }
  return { cols, fuzzy };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// 연·월·일이 실제로 있는 날짜인지 확인하고 "YYYY-MM-DD"로 만든다
function makeDate(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// 칸 값을 날짜 글자로 바꾼다. 읽을 수 없으면 null.
export function parseDateCell(value: Cell): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // 엑셀 날짜는 UTC 자정으로 읽히므로 UTC 기준으로 꺼낸다
    return makeDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number") {
    // 엑셀 날짜 번호(1900년부터 센 일 수). 예: 45658 = 2025-01-01
    if (value >= 20000 && value <= 80000) {
      const date = new Date(Math.round((value - 25569) * 86400 * 1000));
      return makeDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    }
    if (value >= 20000101 && value <= 21001231) {
      const text = String(Math.trunc(value));
      return makeDate(Number(text.slice(0, 4)), Number(text.slice(4, 6)), Number(text.slice(6, 8)));
    }
    return null;
  }
  if (typeof value === "string") {
    const text = value.trim();
    let m = text.match(/^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})(?:\D.*)?$/);
    if (!m) m = text.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?.*$/);
    if (m) return makeDate(Number(m[1]), Number(m[2]), Number(m[3]));
    m = text.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return makeDate(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  return null;
}

// 칸 값을 매출액(숫자)으로 바꾼다. "1,234,000", "1234000원"도 받는다. 읽을 수 없으면 null.
export function parseAmountCell(value: Cell): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const text = value.replace(/[,\s원₩]/g, "");
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  }
  return null;
}

function cellText(value: Cell): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isBlank(value: Cell): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function isEmptyRow(row: Cell[]): boolean {
  return row.every(isBlank);
}

// "합계", "총계" 같은 맨 아래 합계 줄은 자료가 아니므로 조용히 건너뛴다
function isTotalRow(row: Cell[]): boolean {
  const first = cellText(row[0]).replace(/\s+/g, "");
  return /^(합계|총계|소계|총합계|계|비중)$/.test(first);
}

// 상품명을 맞춰 볼 때 쓰는 모양: 앞뒤·가운데 공백을 정리한다
function productKey(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

// ----- 개인정보 열 찾기 (Plan SC: 작업 9번) -----
// 환자 이름·연락처 같은 열은 PRD 7번에 따라 읽지도 저장하지도 않는다. 열 이름과 열 안의 값 모양, 두 가지로 찾는다.

// 열 이름에 이런 말이 들어 있으면 개인정보 열로 본다
const PERSONAL_HEADER = /(환자|수진|고객|회원|보호자|성명|연락처|전화|휴대|핸드폰|주민|생년|생일|주소|이메일|메일|처방전|차트|카드번호|보험증|email)/i;
// 그 자체로 이름 열인 경우 ("이름", "name")
const PERSONAL_HEADER_EXACT = new Set(["이름", "name"]);
// "상품이름", "약품명" 같은 상품 이름 열은 개인정보가 아니다
const PRODUCT_LIKE_HEADER = /(상품|약품|제품|품목|품명|의약)/;
// 열 안의 값이 이런 모양이면 개인정보로 본다: 주민등록번호, 전화번호, 이메일
const PERSONAL_VALUE = [
  /\d{6}\s*-\s*[1-4]\d{6}/,
  /(?:01[016-9]|0\d{1,2})[-.\s]\d{3,4}[-.\s]\d{4}/,
  /[^\s@]+@[^\s@]+\.[^\s@]+/,
];

function looksPersonalValue(value: Cell): boolean {
  if (typeof value === "number") {
    // 숫자로 저장된 전화번호(맨 앞 0이 빠짐)나 주민등록번호
    // 끝이 00으로 끝나는 둥근 숫자는 큰 금액일 가능성이 높아 전화번호로 보지 않는다
    const t = String(Math.trunc(value));
    return (/^1[016-9]\d{7,8}$/.test(t) && !/00$/.test(t)) || /^\d{6}[1-4]\d{6}$/.test(t);
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (/^0?1[016-9]\d{7,8}$/.test(t)) return true; // 하이픈 없는 휴대전화번호
    return PERSONAL_VALUE.some((re) => re.test(t));
  }
  return false;
}

// 열 안의 값이 전화번호·주민번호·이메일 모양인 칸이 충분히 많으면 개인정보 열로 본다
function columnHasPersonalValues(table: Table, headerIndex: number, c: number): boolean {
  let seen = 0;
  let hit = 0;
  let numeric = 0;
  for (let r = headerIndex + 1; r < table.length && seen < 300; r++) {
    const cell = table[r]?.[c];
    if (isBlank(cell)) continue;
    seen++;
    if (typeof cell === "number") numeric++;
    if (looksPersonalValue(cell)) hit++;
  }
  // 숫자 열은 큰 금액과 헷갈릴 수 있으므로 더 많이 맞아야 한다
  const threshold = numeric > seen / 2 ? 0.6 : 0.2;
  return hit >= 3 && seen > 0 && hit / seen >= threshold;
}

// 쓰지 않는 열 가운데 개인정보로 보이는 열을 찾는다 (열 번호와 이름만 돌려주고, 값은 돌려주지 않는다)
function findPersonalColumns(table: Table, headerIndex: number, excludeCols: number[]): { index: number; name: string }[] {
  const header = table[headerIndex] ?? [];
  let width = header.length;
  for (const r of table.slice(headerIndex + 1, headerIndex + 40)) width = Math.max(width, r?.length ?? 0);

  const result: { index: number; name: string }[] = [];
  for (let c = 0; c < width; c++) {
    if (excludeCols.includes(c)) continue;
    const name = cellText(header[c]);
    const compact = name.replace(/\s+/g, "");

    let personal =
      compact !== "" &&
      !PRODUCT_LIKE_HEADER.test(compact) &&
      (PERSONAL_HEADER.test(compact) || PERSONAL_HEADER_EXACT.has(compact.toLowerCase()));

    // 합계·차이처럼 금액이 들어 있는 열은 값 모양 검사에서 뺀다. ("메모", "비고" 열은 검사한다)
    if (!personal && !/(요일|합계|총계|소계|비중|평균|차이)/.test(compact)) {
      // 열 이름이 평범해도 값이 전화번호·주민번호·이메일 모양이면 개인정보 열로 본다
      personal = columnHasPersonalValues(table, headerIndex, c);
    }

    if (personal) result.push({ index: c, name: name || `(이름 없는 ${c + 1}번째 열)` });
  }
  return result;
}

// ----- 조제(처방) 매출 제외 (Plan SC: 작업 9번) -----
// 구분 열에 "조제"나 "처방"이 들어 있는 줄은 약국의 일반 판매가 아니므로 계산에서 뺀다. (예: "조제", "처방조제")
// "비처방", "처방 불필요"처럼 처방이 아니라는 뜻은 뺀다.
export function isDispensingCategory(category: string): boolean {
  const t = category.replace(/\s+/g, "");
  if (/(비처방|처방불필요|처방없이|처방전없이)/.test(t)) return false;
  return /(조제|처방)/.test(t);
}

// 열 형식 표에서 상품 열을 찾는다: 머리글이 있고(요일·합계·차이 등 제외), 아래 값이 대부분 숫자인 열
function findWideProductColumns(table: Table, headerIndex: number, skipCols: number[]): number[] {
  const header = table[headerIndex] ?? [];
  const result: number[] = [];
  for (let c = 0; c < header.length; c++) {
    if (skipCols.includes(c)) continue;
    const name = cellText(header[c]);
    if (name === "" || NON_PRODUCT_HEADER.test(name.replace(/\s+/g, ""))) continue;
    let seen = 0;
    let numeric = 0;
    for (let r = headerIndex + 1; r < table.length && seen < 30; r++) {
      const cell = table[r]?.[c];
      if (isBlank(cell)) continue;
      seen++;
      if (parseAmountCell(cell) !== null) numeric++;
    }
    if (seen > 0 && numeric / seen >= 0.8) result.push(c);
  }
  return result;
}

// 읽어 둔 표 한 장을 매출 줄로 정리한다 (줄 형식과 열 형식 모두)
export function parseSalesTable(table: Table, sheetName: string): SalesParseResult {
  // 1) 머리글 줄 찾기 (위쪽 10줄 안에서 "일자" 열이 있고, "매출액" 열이 있거나 상품 열이 2개 이상인 줄)
  let headerIndex = -1;
  let cols: Columns = {};
  let wideColumns: number[] = [];
  let personal: { index: number; name: string }[] = [];
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const { cols: found, fuzzy } = findColumns(table[i] ?? []);
    if (found.date === undefined) continue;
    // 읽을 열(일자·매출액·상품·구분·비고)을 뺀 나머지 중 개인정보 열을 찾는다. 이 열들은 상품 열로도 쓰지 않는다.
    const usedCols = Object.values(found).filter((n): n is number => typeof n === "number");
    const personalFound = findPersonalColumns(table, i, usedCols);
    if (found.amount !== undefined && !fuzzy.has("amount")) {
      // 매출액 열 이름이 정확히 있으면 줄 형식이다
      headerIndex = i;
      cols = found;
      personal = personalFound;
      break;
    }
    // 매출액 열이 없거나 "비슷한 이름"으로만 찾았다면, 상품마다 열이 나뉜 표(열 형식)인지 먼저 확인한다
    const skip = [found.date, ...(found.amount !== undefined ? [found.amount] : []), ...personalFound.map((p) => p.index)];
    const wide = findWideProductColumns(table, i, skip);
    if (wide.length >= (found.amount !== undefined ? 3 : 2)) {
      headerIndex = i;
      cols = { ...found, amount: undefined };
      wideColumns = wide;
      personal = personalFound;
      break;
    }
    if (found.amount !== undefined) {
      headerIndex = i;
      cols = found;
      personal = personalFound;
      break;
    }
  }

  if (headerIndex < 0) {
    const firstRow = (table.find((r) => !isEmptyRow(r ?? [])) ?? []).map(cellText).filter((t) => t !== "");
    const seen = firstRow.length > 0 ? `맨 윗줄의 열 이름: ${firstRow.slice(0, 8).join(", ")}${firstRow.length > 8 ? " …" : ""}` : "표가 비어 있어요";
    return {
      ok: false,
      error: `필요한 열을 찾지 못했어요. 맨 위에 '일자'(또는 날짜)와 '매출액' 열 이름이 있어야 해요. (${seen})`,
    };
  }

  const isWide = wideColumns.length > 0;
  const header = table[headerIndex];

  // "비고" 같은 메모 열은 "휴무" 표시를 찾는 데만 쓴다. 그 안에 전화번호 같은 개인정보가 들어 있으면 그 열은 아예 읽지 않는다.
  if (cols.note !== undefined && columnHasPersonalValues(table, headerIndex, cols.note)) {
    personal = [...personal, { index: cols.note, name: cellText(header[cols.note]) || "(이름 없는 열)" }];
    cols = { ...cols, note: undefined };
  }
  const columnNames: SalesColumns = {
    date: cellText(header[cols.date!]),
    amount: isWide ? `상품 ${wideColumns.length}개 열의 값` : cellText(header[cols.amount!]),
    ...(isWide ? { product: "열 머리글(상품명)" } : cols.product !== undefined ? { product: cellText(header[cols.product]) } : {}),
    ...(cols.category !== undefined ? { category: cellText(header[cols.category]) } : {}),
    ...(cols.note !== undefined ? { note: cellText(header[cols.note]) } : {}),
  };

  // 2) 줄마다 읽기
  const merged = new Map<string, SalesRow>();
  let mergedCount = 0;
  let dispensingCount = 0; // 조제(처방)라서 뺀 줄 수
  let dispensingAmount = 0; // 그 매출 합계
  let skippedCount = 0;
  const skippedExamples: number[] = [];
  const skip = (rowNumber: number) => {
    skippedCount++;
    if (skippedExamples.length < 5) skippedExamples.push(rowNumber);
  };
  const add = (row: SalesRow) => {
    const key = `${row.date}\u0000${row.product}`;
    const prev = merged.get(key);
    if (prev) {
      // 같은 날짜·같은 상품이 여러 줄이면 매출을 더한다
      prev.amount += row.amount;
      prev.closed = prev.closed || row.closed;
      if (prev.category === "") prev.category = row.category;
      mergedCount++;
    } else {
      merged.set(key, row);
    }
  };

  for (let i = headerIndex + 1; i < table.length; i++) {
    const row = table[i] ?? [];
    if (isEmptyRow(row) || isTotalRow(row)) continue;
    const rowNumber = i + 1; // 엑셀에서 보이는 줄 번호

    const date = parseDateCell(row[cols.date!]);
    if (date === null) {
      skip(rowNumber);
      continue;
    }
    const closed = cols.note !== undefined && cellText(row[cols.note]).includes("휴무");
    const category = cols.category !== undefined ? cellText(row[cols.category]) : "";

    const dispensing = category !== "" && isDispensingCategory(category);

    if (isWide) {
      // 열 형식: 상품 열마다 한 줄씩 만든다
      let bad = false;
      for (const c of wideColumns) {
        const cell = row[c];
        if (isBlank(cell)) continue; // 빈 칸은 건너뛴다
        const amount = parseAmountCell(cell);
        if (amount === null) {
          bad = true;
          continue;
        }
        if (dispensing) {
          dispensingCount++;
          dispensingAmount += amount;
          continue;
        }
        add({ date, product: productKey(cellText(header[c])), amount, closed, category });
      }
      if (bad) skip(rowNumber);
    } else {
      const amount = parseAmountCell(row[cols.amount!]);
      if (amount === null) {
        skip(rowNumber);
        continue;
      }
      if (dispensing) {
        // 조제(처방) 매출은 계산에서 뺀다
        dispensingCount++;
        dispensingAmount += amount;
        continue;
      }
      const product = cols.product !== undefined ? productKey(cellText(row[cols.product])) : "";
      add({ date, product, amount, closed, category });
    }
  }

  const rows = [...merged.values()].sort((a, b) => (a.date === b.date ? a.product.localeCompare(b.product, "ko") : a.date < b.date ? -1 : 1));

  if (rows.length === 0) {
    return {
      ok: false,
      error:
        dispensingCount > 0
          ? "조제(처방) 매출 줄만 있어서 계산할 자료가 없어요. 일반 판매 자료가 들어 있는 파일을 올려 주세요."
          : skippedCount > 0
            ? `읽을 수 있는 줄이 없어요. 날짜(예: 2025-01-01)와 매출액(숫자)이 적힌 줄이 있어야 해요. (읽지 못한 줄 예: ${skippedExamples.join(", ")}번째 줄)`
            : "자료 줄이 없어요. 머리글 아래에 날짜와 매출액이 적힌 줄이 있어야 해요.",
    };
  }

  return {
    ok: true,
    rows,
    summary: summarize(rows, sheetName, isWide ? "wide" : "long", columnNames, {
      skippedCount,
      skippedExamples,
      mergedCount,
      personalColumns: personal.map((p) => p.name),
      dispensingCount,
      dispensingAmount,
    }),
  };
}

// 읽은 줄들로 요약과 "알려 줄 점"을 만든다
function summarize(
  rows: SalesRow[],
  sheetName: string,
  layout: "long" | "wide",
  columns: SalesColumns,
  extra: {
    skippedCount: number;
    skippedExamples: number[];
    mergedCount: number;
    personalColumns: string[];
    dispensingCount: number;
    dispensingAmount: number;
  },
): SalesSummary {
  const days = new Set(rows.map((r) => r.date));
  const dateFrom = rows[0].date;
  const dateTo = rows[rows.length - 1].date;
  const monthSpan =
    (Number(dateTo.slice(0, 4)) - Number(dateFrom.slice(0, 4))) * 12 + (Number(dateTo.slice(5, 7)) - Number(dateFrom.slice(5, 7))) + 1;
  const spanDays = Math.round((Date.parse(dateTo) - Date.parse(dateFrom)) / 86400000) + 1;
  const missingDays = Math.max(0, spanDays - days.size);
  const hasProducts = rows.some((r) => r.product !== "");
  const closedDays = new Set(rows.filter((r) => r.closed).map((r) => r.date)).size;
  const productCount = new Set(rows.map((r) => r.product).filter((p) => p !== "")).size;

  const warnings: string[] = [];
  if (monthSpan < MIN_MONTHS_FOR_COMPARE) {
    warnings.push(
      `자료가 ${monthSpan}개월치예요. 전년 같은 기간 비교와 지난 시즌 추천에는 ${MIN_MONTHS_FOR_COMPARE}개월 이상이 필요해요. ERP에서 더 긴 기간을 내려받아 주세요.`,
    );
  }
  if (missingDays > 0) {
    warnings.push(`${dateFrom} ~ ${dateTo} 사이에 자료가 없는 날이 ${missingDays}일 있어요.`);
  }
  if (extra.skippedCount > 0) {
    warnings.push(`날짜나 매출액을 읽지 못한 ${extra.skippedCount}줄은 건너뛰었어요. (예: ${extra.skippedExamples.join(", ")}번째 줄)`);
  }
  if (extra.mergedCount > 0) {
    warnings.push(`같은 날짜·상품이 여러 줄인 경우 ${extra.mergedCount}번은 매출을 더해서 한 줄로 합쳤어요.`);
  }
  if (extra.dispensingCount > 0) {
    warnings.push(
      `조제(처방) 매출 ${extra.dispensingCount.toLocaleString("ko-KR")}줄(합계 ${Math.round(extra.dispensingAmount).toLocaleString("ko-KR")}원)은 계산에서 제외했어요.`,
    );
  }
  if (!hasProducts) {
    warnings.push("상품 열이 없어서 '일별 합계' 자료로 읽었어요. 상품별 분석과 시즌 추천 상품(C)에는 상품명이 있는 자료가 필요해요.");
  }

  return {
    sheetName,
    layout,
    usedSheets: [],
    columns,
    rowCount: rows.length,
    dayCount: days.size,
    dateFrom,
    dateTo,
    monthSpan,
    hasProducts,
    productCount,
    closedDays,
    missingDays,
    skippedCount: extra.skippedCount,
    skippedExamples: extra.skippedExamples,
    mergedCount: extra.mergedCount,
    personalColumns: extra.personalColumns,
    dispensingExcludedRows: extra.dispensingCount,
    dispensingExcludedAmount: extra.dispensingAmount,
    warnings,
  };
}

// "상품목록" 같은 시트에서 상품명 → 구분(일반의약품/의약외품 등)을 읽는다. 날짜 열이 있는 시트는 상품 목록이 아니다.
function parseProductMaster(table: Table): { categories: Map<string, string>; header: string } | null {
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const { cols: found } = findColumns(table[i] ?? []);
    if (found.product === undefined || found.category === undefined || found.date !== undefined) continue;
    const categories = new Map<string, string>();
    for (let r = i + 1; r < table.length; r++) {
      const row = table[r] ?? [];
      const name = productKey(cellText(row[found.product]));
      const category = cellText(row[found.category]);
      if (name !== "" && category !== "" && !name.startsWith("※")) categories.set(name, category);
    }
    if (categories.size > 0) return { categories, header: cellText(table[i][found.category]) };
  }
  return null;
}

// 엑셀 통합문서(시트 여러 장)를 읽는다. 상품별 시트를 우선 쓰고,
// "상품목록" 시트의 구분과 "일별매출" 시트의 휴무 표시를 함께 가져온다.
export function parseSalesWorkbook(sheets: { sheet: string; data: Table }[]): SalesParseResult {
  const parsed: { sheet: string; result: Extract<SalesParseResult, { ok: true }> }[] = [];
  let firstError = "";
  let master: { sheet: string; categories: Map<string, string>; header: string } | null = null;

  for (const s of sheets) {
    const result = parseSalesTable(s.data, s.sheet);
    if (result.ok) {
      parsed.push({ sheet: s.sheet, result });
    } else {
      if (firstError === "") firstError = result.error;
      if (!master) {
        const m = parseProductMaster(s.data);
        if (m) master = { sheet: s.sheet, ...m };
      }
    }
  }

  if (parsed.length === 0) {
    return {
      ok: false,
      error: sheets.length > 1 ? `${firstError} (시트 ${sheets.length}개를 모두 확인했어요.)` : firstError || "표가 비어 있어요.",
    };
  }

  // 상품별 자료가 있는 시트를 우선하고, 없으면 첫 번째 시트를 쓴다
  const chosen = parsed.find((p) => p.result.summary.hasProducts) ?? parsed[0];
  const base = chosen.result.summary;
  const rows = chosen.result.rows.map((r) => ({ ...r }));
  let columns = base.columns;
  const usedSheets: string[] = [];
  const extraWarnings: string[] = [];

  if (base.hasProducts) {
    // 같은 통합문서의 일별 합계 시트: 휴무 표시를 가져오고 상품별 합계와 맞춰 본다
    const daily = parsed.find((p) => p !== chosen && !p.result.summary.hasProducts);
    if (daily) {
      const closedDates = new Set(daily.result.rows.filter((r) => r.closed).map((r) => r.date));
      if (closedDates.size > 0) {
        for (const r of rows) r.closed = closedDates.has(r.date);
        usedSheets.push(`"${daily.sheet}" 시트에서 휴무일 표시를 가져왔어요`);
      }
      const productTotals = new Map<string, number>();
      for (const r of rows) productTotals.set(r.date, (productTotals.get(r.date) ?? 0) + r.amount);
      let mismatch = 0;
      for (const d of daily.result.rows) {
        const sum = productTotals.get(d.date);
        if (sum !== undefined && Math.abs(sum - d.amount) > 0.5) mismatch++;
      }
      if (mismatch > 0) extraWarnings.push(`상품별 합계가 "${daily.sheet}" 시트의 매출과 다른 날이 ${mismatch}일 있어요. 자료를 확인해 주세요.`);
    }

    // 상품목록 시트의 구분을 상품에 붙인다
    if (master) {
      let unmatched = 0;
      const unmatchedNames = new Set<string>();
      for (const r of rows) {
        if (r.category !== "") continue;
        const category = master.categories.get(r.product);
        if (category) r.category = category;
        else if (!unmatchedNames.has(r.product)) {
          unmatchedNames.add(r.product);
          unmatched++;
        }
      }
      if (!columns.category) columns = { ...columns, category: `${master.sheet} 시트의 ${master.header}` };
      usedSheets.push(`"${master.sheet}" 시트에서 상품의 구분(일반의약품·의약외품 등)을 가져왔어요`);
      if (unmatched > 0) {
        extraWarnings.push(`"${master.sheet}" 시트에 없는 상품이 ${unmatched}개 있어요: ${[...unmatchedNames].slice(0, 5).join(", ")}${unmatched > 5 ? " …" : ""}`);
      }
    }
  }

  // 구분이 "조제/처방"인 상품(상품목록 시트에서 가져온 구분 포함)의 매출은 계산에서 뺀다
  let dispensingCount = base.dispensingExcludedRows;
  let dispensingAmount = base.dispensingExcludedAmount;
  const kept = rows.filter((r) => {
    if (r.category !== "" && isDispensingCategory(r.category)) {
      dispensingCount++;
      dispensingAmount += r.amount;
      return false;
    }
    return true;
  });
  if (kept.length === 0) {
    return { ok: false, error: "조제(처방) 매출 줄만 있어서 계산할 자료가 없어요. 일반 판매 자료가 들어 있는 파일을 올려 주세요." };
  }

  // 요약을 다시 만들고, 시트를 합치며 생긴 안내를 덧붙인다
  const summary = summarize(kept, chosen.sheet, base.layout, columns, {
    skippedCount: base.skippedCount,
    skippedExamples: base.skippedExamples,
    mergedCount: base.mergedCount,
    personalColumns: base.personalColumns,
    dispensingCount,
    dispensingAmount,
  });
  summary.usedSheets = usedSheets;
  summary.warnings.push(...extraWarnings);
  return { ok: true, rows: kept, summary };
}
