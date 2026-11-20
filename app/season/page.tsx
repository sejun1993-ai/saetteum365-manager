import SeasonPlanner from "@/components/SeasonPlanner";

// Design Ref: §2.4 — 시즌 추천·포스터 화면. ① 시즌 선택 ② 추천 상품 5개 ③ 포스터(검사·확인 후 인쇄)
// Plan SC: 작업 18~23번
export default function SeasonPage() {
  return (
    <main className="mx-auto w-full max-w-5xl p-6 print:p-0">
      <div className="no-print">
        <h1 className="text-2xl font-bold">시즌 추천 · 포스터</h1>
        <p className="mt-1 text-sm text-neutral-600">
          다가오는 시즌에 맞춘 추천 상품을 확인하고 포스터를 만드는 화면입니다. 포스터 문구에는 효능·효과를 단정하는 표현을 쓰지 않아요.
        </p>
      </div>
      <div className="mt-6">
        <SeasonPlanner />
      </div>
    </main>
  );
}
