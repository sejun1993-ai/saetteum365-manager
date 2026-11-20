import AiStatus from "@/components/AiStatus";
import SalesPeriods from "@/components/SalesPeriods";
import SalesUploader from "@/components/SalesUploader";

// Design Ref: §2.3 — 매출 보기 화면. ① 엑셀 올리기, ② 보기 단위·비교 기준, ③ 추이 그래프와 ±20% 구간 표시,
// ④ 선택한 구간의 원인 후보(AI, 작업 16·17번)와 AI 연결 상태.
export default function SalesPage() {
  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <h1 className="text-2xl font-bold">매출 보기</h1>
      <p className="mt-1 text-sm text-neutral-600">
        엑셀을 올려 주·월·분기·계절별 매출 추이와 등락 원인 후보를 보는 화면입니다.
      </p>

      <div className="mt-6">
        <SalesUploader />
      </div>

      <div className="mt-6">
        <SalesPeriods />
      </div>

      <div className="mt-6 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center text-sm text-neutral-600">
        <p className="font-medium">±20% 이상 변한 구간을 고르면, 그 구간 상자에서 AI에게 원인 후보를 물을 수 있어요</p>
        <p className="mt-1">AI가 안 될 때도 앱이 숫자로 확인한 변화는 보여 드려요.</p>
      </div>

      <div className="mt-6">
        <AiStatus />
      </div>
    </main>
  );
}
