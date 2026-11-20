// Design Ref: §2.2 — 가격표 1장: 약이름(크게) · 가격(제일 크게, 오른쪽) · 간단한 설명(작게, 최대 3줄)
// 크기는 가로 7cm × 세로 5cm로 고정되어 있다 (스타일은 globals.css의 .tag-card).
// Plan SC: 작업 3번 (가격표 1장 양식과 미리보기)

import { formatPrice, nameFontSize, priceFontSize, type PriceTag } from "@/lib/tags";

export default function TagCard({ tag }: { tag: PriceTag }) {
  return (
    <div className="tag-card">
      <div className="tag-name" style={{ fontSize: nameFontSize(tag.name) }}>
        {tag.name || "약 이름"}
      </div>
      <div className="tag-price" style={{ fontSize: priceFontSize(tag.price) }}>
        {formatPrice(tag.price) || "0원"}
      </div>
      <div className="tag-desc">{tag.desc}</div>
    </div>
  );
}
