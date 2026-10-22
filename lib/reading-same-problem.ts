import type { SameProblemComparison } from "./reading";

/** One authored bridge, bound to the fictional sources by the original pin check. */
export const sameProblemLinks: { from: string; to: string; reason?: string; comparison: SameProblemComparison }[] = [
  {
    from: "demo-orbit-product",
    to: "demo-loom-product",
    reason: "일정 대신 파일이 바뀔 때, 루움이 이전 판단을 남기는 방법도 읽어요.",
    comparison: {
      problem: "작업 대상이 바뀌어도 이전 판단과 현재 상태를 구분해 남기는 문제예요.",
      common: "두 제품 모두 변경된 대상에 판단 기록을 연결해, 지금 보이는 상태만으로 과거 결정을 해석하지 않게 해요.",
      difference: "오빗은 일정 카드에 변경 이유와 선행 작업을 붙이고 알림과 합의를 구분해요. 루움은 검수 의견을 파일 버전에 연결하고 확인과 승인을 구분해요.",
      limit: "2026-10-22에 작성한 두 가상 제품 설명의 구조를 비교해요. 실제 사용성이나 성능의 우열을 뜻하지 않아요.",
      evidenceIds: { from: ["demo-orbit-source-product"], to: ["demo-loom-source-product"] },
    },
  },
];
