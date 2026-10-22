/** Deterministic, authored review fixtures. No scraping, model calls, credentials or random IDs.
 * All names, narratives and quantities below are fictional. `.example` URLs are inert labels,
 * not retrieved pages. `official`/`page` exercise the original runtime schema only.
 * Run from the public edition: pnpm demo:reset (or tsx scripts/demo-data.ts).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { CompanyResearch, ResearchPack } from "../lib/research";
import type { Job, Role } from "../lib/jobs";
import { comparisonPin } from "../lib/reading";
import { sameProblemLinks } from "../lib/reading-same-problem";
import { bindAssessment, emptyAssessment } from "../lib/question-assessment";

export const DEMO_DATE = "2026-10-22";
const timestamp = `${DEMO_DATE}T00:00:00.000Z`;
type GuideSeed = { key: string; topic: "vision" | "work" | "process" | "business"; title: string; preview: string; answer: string; sections: [string, string][]; limit: string };
type CompanySeed = { id: string; name: string; english: string; product: string; color: string; location: "seoul" | "pangyo"; domain: string; guides: GuideSeed[] };
const seeds: CompanySeed[] = [
  {
    id: "demo-orbit", name: "오빗 스튜디오", english: "Orbit Studio", product: "오빗 보드", color: "#e9edff", location: "seoul",
    domain: "여러 팀의 제품 출시 일정과 변경 이유를 한곳에서 기록하는 협업 소프트웨어를 만드는 회사예요.",
    guides: [
      { key: "product", topic: "vision", title: "오빗 보드는 일정이 바뀐 이유를 어떻게 남길까요?", preview: "일정표와 결정 기록을 연결하는 제품에서 사용자와 해결하려는 문제를 살펴봐요.",
        answer: "오빗 보드는 제품 담당자와 개발팀이 출시 날짜뿐 아니라 변경의 이유를 함께 확인하도록 설계한 협업 도구예요. 일정 카드에는 담당자, 선행 작업, 결정 기록이 붙어요. 날짜를 옮기면 관련 팀에 바뀐 내용을 알리지만 일정을 자동으로 약속하지는 않아요. 구직자는 화면 구현과 함께 변경 이력의 정확성을 다루는 제품이라는 점을 읽을 수 있어요.",
        sections: [["일정표에 없는 맥락", "작은 제품팀은 같은 변경을 회의와 메시지에서 반복 설명해요. 오빗 보드는 날짜 옆에 누가 어떤 조건으로 결정을 바꿨는지 남겨 이 설명을 다시 찾게 해요. 따라서 완료율 하나보다 선행 작업의 변경이 어디에 영향을 주는지 보여주는 경험이 중요해요."], ["제품이 책임지는 경계", "알림을 보냈다는 기록은 상대 팀이 새 일정을 수락했다는 뜻이 아니에요. 제품은 제안과 합의를 분리하고, 담당자가 확인해야 약속 상태로 바뀌게 해요. 프론트엔드와 백엔드 지원자는 이러한 상태 차이를 어떻게 표현하고 보존할지 면접에서 물어볼 수 있어요."]],
        limit: "직접 작성한 가상 제품 설명이에요. 실제 고객 사용량이나 업무 개선 효과를 나타내지 않아요." },
      { key: "work", topic: "work", title: "오빗 팀은 작은 출시와 회고를 어떻게 연결할까요?", preview: "결정 문서, 동료 검토, 출시 후 회고가 이어지는 팀의 작업 방식을 읽어요.",
        answer: "오빗의 팀은 작은 변경을 먼저 출시하고 그 결과를 결정 문서에 덧붙이는 방식이에요. 작성자는 해결하려는 사용자 문제와 되돌릴 조건을 적고 동료는 예외 상황을 검토해요. 회고에서는 개인의 속도보다 놓친 가정을 찾아요. 문서가 많다는 사실만으로 협업이 좋다고 판단할 수는 없어서, 실제 역할을 정할 때 검토 대기 시간과 의사결정 권한을 확인해야 해요.",
        sections: [["검토 전에 적는 것", "작업을 시작할 때 문제, 선택한 접근, 배포 뒤 확인할 신호를 짧게 적어요. 완성된 보고서를 만드는 절차가 아니라 다른 동료가 변경 이유를 검토할 수 있게 하는 약속이에요. 디자인 변경도 사용자가 되돌아갈 경로를 설명해야 해요."], ["회고가 다음 작업에 남는 방식", "회고에서는 예상과 다른 결과를 기록하고 후속 작업의 담당자를 정해요. 평가 제도와 승진 기준은 자료에 없으므로 이 작업 방식만으로 조직 전체의 문화를 단정하지 않아요."]],
        limit: "가상 팀 운영 예시이며 실제 구성원 인터뷰가 아니에요. 평가 제도와 업무량은 설정하지 않았어요." },
      { key: "hiring", topic: "process", title: "오빗 개발직 면접에서는 어떤 선택의 근거를 이야기할까요?", preview: "서류, 실무 대화, 협업 대화의 목적과 아직 정하지 않은 조건을 구분해요.",
        answer: "오빗의 전형은 서류 검토, 실무 대화, 협업 대화로 이어져요. 실무 대화에서는 지원자가 직접 참여한 변경 하나를 골라 제약과 검증 방법을 설명해요. 협업 대화는 일정이나 요구가 달라졌을 때 의사결정을 조율한 경험을 다뤄요. 공고는 직무별 경력 조건을 따로 적으며, 급여와 결과 통보 기한은 모두 명시하지 않은 상태예요.",
        sections: [["결과보다 선택을 설명하기", "완성 화면만 보여주기보다 무엇을 먼저 해결했고 무엇을 미뤘는지 설명하는 포트폴리오가 이 전형의 목적에 맞아요. 변경을 되돌린 경험도 검증 과정과 함께 이야기할 수 있어요. 회사의 기밀이나 이전 직장의 비공개 자료를 제출하라는 조건은 없어요."], ["지원 전에 남는 질문", "같은 개발직이라도 프론트엔드와 백엔드의 책임은 달라요. 공개된 공고의 담당 업무를 읽고 첫 과제, 검토 동료, 배포 책임 범위를 구체적으로 확인할 수 있어요. 전형 단계는 합격 가능성이나 소요 시간을 예측하는 지표가 아니에요."]],
        limit: "실제로 지원할 수 없는 가상 채용 전형이에요. 과제 비용, 급여, 통보 기한은 미기재예요." },
      { key: "business", topic: "business", title: "오빗의 구독 모델은 어떤 제품 선택으로 이어질까요?", preview: "팀 단위 구독과 도입 지원을 구분하고, 확인되지 않은 재무 수치는 구분해요.",
        answer: "오빗은 팀 단위 구독을 주된 사업 방식으로 삼은 회사예요. 기본 제품에는 일정과 결정 기록을 제공하고 별도 도입 지원에서는 기존 기록을 옮기는 일을 도와요. 계약을 맺는 사람과 매일 사용하는 사람이 다를 수 있어 관리자 설정과 일상 화면을 함께 설계해야 해요. 매출, 투자금, 수익성은 자료에 없으므로 사업 방식 설명을 재무 건전성 판단으로 확장할 수는 없어요.",
        sections: [["구매자와 사용자의 다른 질문", "팀 관리자는 권한과 기록 보존을 궁금해하고 사용자는 빠르게 일정을 고치고 싶어 해요. 제품팀은 두 요구를 한 화면에 모두 넣기보다 관리자 설정과 일상 작업을 나눠요. 지원자는 이 구분이 맡을 기능과 어떻게 연결되는지 확인할 수 있어요."], ["사업 설명으로 알 수 없는 것", "구독 모델이라는 설명에는 고객 수, 계약 규모, 갱신률이 들어 있지 않아요. 도입 지원이 있다는 사실도 서비스 매출의 비중을 알려주지 않아요. 계약 방식과 재무 실적은 다른 정보이므로 재무 항목은 별도 자료로 확인해야 해요."]],
        limit: "가상 사업 모델이며 매출·투자·고객 수를 만들지 않았어요. 실제 기업의 전망을 설명하지 않아요." },
    ],
  },
  {
    id: "demo-loom", name: "루움 워크스", english: "Loom Works", product: "루움 샘플", color: "#fff0dc", location: "pangyo",
    domain: "소규모 제작팀이 샘플의 변경 사항과 검수 의견을 함께 관리하는 제작 협업 서비스를 만들어요.",
    guides: [
      { key: "product", topic: "vision", title: "루움 샘플은 파일과 검수 의견을 어떻게 묶을까요?", preview: "제작 파일의 버전과 의견이 엇갈리는 문제를 푸는 서비스예요.",
        answer: "루움 샘플은 제작팀과 외부 검수자가 같은 버전의 파일을 보며 의견을 남기는 서비스예요. 댓글은 파일 이름이 아니라 버전에 연결되고, 새 파일을 올려도 이전 판단을 보존해요. 변경 사항을 승인한 사람과 단순히 확인한 사람을 나눠 보여주는 것이 제품의 핵심이에요. 제작 자체를 수행하거나 결과물의 품질을 보증하지는 않아요.",
        sections: [["파일 이름이 같아도 다른 버전", "제작 과정에서 같은 이름의 파일이 다시 올라오면 이전 의견이 어느 상태를 가리키는지 모호해져요. 서비스는 업로드마다 버전을 부여하고 댓글에 당시 화면을 연결해요. 수정이 끝난 의견도 삭제하지 않고 해결 상태로 남겨 판단 경로를 다시 확인할 수 있어요."], ["확인과 승인 나누기", "파일을 열어 본 기록은 품질을 승인한 기록과 달라요. 루움의 화면은 읽음, 수정 요청, 승인 상태를 분리해요. 이 제품을 개발한다면 권한 변경 뒤 과거 승인 이력을 어떻게 설명할지까지 생각해야 해요."]],
        limit: "직접 만든 가상 제품 시나리오예요. 실제 제작 품질이나 고객 사례를 증명하지 않아요." },
      { key: "work", topic: "work", title: "루움은 디자인과 개발의 검토 시간을 어떻게 맞출까요?", preview: "매주 시제품을 함께 보되 결정권과 남은 질문을 문서에 남기는 협업을 살펴봐요.",
        answer: "루움의 조직은 디자인과 개발이 시제품을 함께 검토하고 해결되지 않은 질문을 다음 작업에 연결해요. 화면마다 사용 목적과 예외 상태를 적어 담당자가 없는 의견이 쌓이지 않게 해요. 최종 결정은 기능 담당자가 내리되 변경 이유를 남겨요. 이 방식이 실제로 잘 작동하는지 보려면 의견이 충돌했을 때의 구체적인 사례를 더 확인해야 해요.",
        sections: [["시제품에서 함께 확인하는 것", "검토 대상은 보기 좋은 기본 화면뿐 아니라 빈 목록, 업로드 실패, 권한이 없는 상황이에요. 디자이너는 사용자가 다음에 할 일을 설명하고 개발자는 실패 이후 데이터가 어떤 상태인지 설명해요. 함께 보는 대상이 있어야 추상적인 선호가 실행 가능한 작업으로 바뀌어요."], ["결정 이후의 책임", "기능 담당자는 선택과 보류한 의견을 기록하고 다음 검토에서 결과를 보여줘요. 모든 의견이 반영된다는 뜻은 아니에요. 입사 후 맡을 권한을 알고 싶다면 어떤 결정을 독립적으로 내리는지, 다른 팀 동의가 필요한 경우가 무엇인지 확인하는 것이 좋아요."]],
        limit: "가상 작업 규칙이에요. 실제 근무 만족도, 승진 제도, 회의 부담은 알 수 없어요." },
      { key: "hiring", topic: "process", title: "루움의 사례 대화에서는 어떻게 협업을 설명할까요?", preview: "기존 작업을 바탕으로 검수 의견을 다룬 경험을 이야기하는 전형이에요.",
        answer: "루움의 채용은 서류 확인 뒤 직무 사례 대화와 팀 대화를 진행해요. 사례 대화에서는 수정 요청이 서로 충돌했던 상황과 우선순위를 정한 근거를 설명해요. 개발자는 데이터와 화면의 상태를, 디자이너는 검수자의 이해와 다음 행동을 중심으로 이야기할 수 있어요. 일부 공고는 경력 연수를 적지 않았으며 이것을 신입 채용이라는 의미로 해석하지 않아요.",
        sections: [["같은 사례를 직무에 맞게 읽기", "검수 의견을 반영한 경험은 여러 직무에서 말할 수 있지만 책임은 달라요. 개발자는 변경이 기존 데이터에 미친 영향을 설명하고 디자이너는 서로 다른 요구가 화면에서 어떻게 정리됐는지 설명해요. 제출 자료에서 본인의 기여를 구분할 수 있어야 대화가 구체적이 돼요."], ["표시되지 않은 조건", "공고는 급여 범위를 모두 제공하지 않아요. 경력 값이 비어 있는 공고도 있고 전형 일정도 정하지 않았어요. 비어 있는 항목은 좋은 조건이나 제한 없는 모집을 뜻하지 않아요. 지원 전에 담당자에게 확인할 질문으로 남겨 둘 수 있어요."]],
        limit: "가상 전형이며 실제 모집이 아니에요. 경력 미기재는 신입 가능이나 경력 무관을 뜻하지 않아요." },
      { key: "business", topic: "business", title: "루움의 협업 서비스에서 저장 공간과 프로젝트는 어떤 관계일까요?", preview: "프로젝트 단위 이용과 보관 정책의 관계를 읽고 서로 다른 인원 집계는 합치지 않아요.",
        answer: "루움은 프로젝트 단위 사용과 파일 보관 기능을 묶는 사업 모델이에요. 프로젝트가 끝나도 승인 기록을 확인할 필요가 있어 보관과 삭제의 경계를 제품에서 설명해야 해요. 회사 자료의 인원 관측은 국내와 연결 조직으로 범위가 달라 증가율을 계산할 수 없어요. 가격, 매출, 고객 수는 자료에 없고 인원 자료를 사업 성과의 지표로 사용하지 않아요.",
        sections: [["프로젝트가 끝난 뒤 남는 기록", "검수가 끝나도 누가 어떤 버전을 승인했는지 확인하는 일이 남아요. 사업 소개는 현재 협업과 종료 프로젝트의 기록 보관을 구분해요. 제품 개발자는 삭제 요청을 처리할 때 파일과 승인 기록의 관계, 사용자에게 설명할 범위를 함께 다뤄야 해요."], ["다른 범위의 수치 읽기", "인원 자료에는 2026년 3월 국내 조직 28명과 9월 연결 조직 52명이 있어요. 숫자가 커졌어도 범위가 다르므로 증원으로 단정하지 않아요. 변화를 확인하려면 같은 범위를 같은 방식으로 집계한 두 시점의 기록이 필요해요."]],
        limit: "가상 사업·인원 예시예요. 서로 다른 집계 범위의 인원은 성장률이나 채용 속도 계산에 쓰지 않아요." },
    ],
  },
  {
    id: "demo-harbor", name: "하버 랩", english: "Harbor Lab", product: "하버 큐", color: "#e2f3eb", location: "seoul",
    domain: "지역 공유공간의 예약 요청과 현장 준비 업무를 연결하는 운영 소프트웨어를 만들어요.",
    guides: [
      { key: "product", topic: "vision", title: "하버 큐는 예약과 현장 준비를 어떻게 연결할까요?", preview: "예약 확정 뒤 남는 준비 업무를 담당자에게 전달하는 제품의 범위를 읽어요.",
        answer: "하버 큐는 공유공간의 예약 요청이 확정되면 현장 담당자에게 준비 목록을 전달하는 서비스예요. 예약자는 이용 조건을 확인하고 운영자는 장비와 공간의 준비 상태를 관리해요. 결제나 실제 출입 장치 제어는 제품에 포함하지 않아요. 운영자의 예외 처리를 화면과 기록으로 연결하는 역할을 이해하기 위한 사례예요.",
        sections: [["예약 확정이 업무 완료는 아니에요", "예약 시간이 정해져도 장비 점검과 공간 배치 같은 일이 남아요. 서비스는 예약 상태와 준비 상태를 별도로 보여줘요. 따라서 예약 취소가 발생했을 때 준비 업무가 자동으로 끝나는지, 현장 담당자의 확인이 필요한지 구체적으로 정해야 해요."], ["제품 바깥의 책임", "제품에는 결제, 현장 안전 검사, 출입 장치 제어가 없어요. 연결하지 않은 기능을 이미 제공하는 것처럼 소개하지 않아요. 지원자는 공고에서 맡을 업무가 운영 화면인지 외부 시스템 연결인지 확인하고 장애가 발생했을 때 안내 책임을 물어볼 수 있어요."]],
        limit: "가상 제품 설명이에요. 실제 시설 운영·안전·결제 서비스를 제공하거나 보장하지 않아요." },
      { key: "work", topic: "work", title: "하버 팀은 현장 문의를 제품 변경으로 어떻게 이어갈까요?", preview: "문의 기록의 맥락을 남기고 반복되는 문제를 분류하는 팀의 업무를 살펴봐요.",
        answer: "하버의 팀은 현장 문의를 받은 상황, 임시 해결, 후속 개선으로 나눠 기록해요. 제품팀은 문의 횟수만 보고 우선순위를 정하지 않고 업무가 멈추는 정도와 대체 방법을 함께 봐요. 운영 담당자와 개발자가 같은 사례를 읽을 수 있게 하는 것이 협업의 출발점이에요. 지원 시간이나 당직 제도는 공개되지 않아 문의 대응을 상시 근무로 해석할 수는 없어요.",
        sections: [["문의 건수보다 막힌 작업", "예약 하나를 수정하지 못한 상황과 준비 업무 전체를 확인하지 못한 상황은 영향이 달라요. 팀은 사용자에게 남아 있는 대체 경로를 기록해 문제의 범위를 판단해요. 단순히 많이 들어온 요청이 항상 먼저 개발되는 것은 아니에요."], ["임시 해결과 제품 개선", "운영자가 수동으로 해결한 기록에는 다시 발생할 조건을 적어요. 개발자는 제품 수정으로 해결할지 안내를 바꿀지 검토해요. 문의 처리 흐름만으로 대응 시간이나 업무 강도까지 알 수는 없어요. 지원 시간과 담당자 간 인계 기준을 별도로 확인해야 해요."]],
        limit: "직접 작성한 가상 팀 사례예요. 당직, 지원 시간, 초과근무 여부는 미기재예요." },
      { key: "hiring", topic: "process", title: "하버 채용에서 운영 문제를 어떻게 설명하면 좋을까요?", preview: "서류와 직무 대화에서 문제의 영향과 확인 과정을 다루는 전형이에요.",
        answer: "하버의 채용 절차는 서류 검토와 직무 대화, 협업 대화로 구성돼요. 직무 대화에서는 문제를 발견한 경로, 영향을 확인한 방법, 해결 뒤 남긴 기록을 설명하는 사례를 다뤄요. 모든 공고가 같은 경력이나 근무 형태를 갖는 것은 아니에요. 급여와 전형 기간은 공고에 명시되지 않아 담당자에게 확인해야 해요.",
        sections: [["잘 해결한 결과에 맥락 더하기", "운영 문제를 해결했다는 결론만으로는 맡은 역할을 알기 어려워요. 영향받은 사용자와 확인한 조건, 다른 동료에게 넘긴 정보까지 설명하면 기여가 드러나요. 전형에서는 이 과정을 대화하며 실제 업무 자료나 고객 정보를 제출할 필요는 없어요."], ["역할별 책임 확인하기", "운영 공고는 문의 분류와 안내 개선을, 개발 공고는 상태 변경과 기록의 일관성을 다뤄요. 지원자는 직무 이름이 같아도 실제 담당 업무가 다를 수 있다는 점을 상세 페이지에서 확인할 수 있어요. 수습 기간과 평가 방식은 이 자료로 알 수 없어요."]],
        limit: "실제 지원 경로가 없는 가상 채용이에요. 급여·전형 기간·수습 조건은 설정하지 않았어요." },
      { key: "business", topic: "business", title: "하버의 운영 도구는 공간 운영자에게 무엇을 제공할까요?", preview: "공간별 이용 모델의 책임 범위를 읽고 인원·투자 정보가 없는 상태를 확인해요.",
        answer: "하버는 공간 운영자에게 예약과 준비 업무를 함께 관리하는 도구를 제공하는 사업이에요. 공간별 이용 계약을 맺지만 가격과 계약 기간은 공개 자료에 없어요. 회사 규모와 투자 이력도 공개되지 않아 해당 항목은 미확인으로 보여요. 정보가 없다는 이유로 작은 회사, 투자받지 않은 회사, 위험한 회사라고 판단하는 것은 이 자료의 범위를 벗어나요.",
        sections: [["운영 도구가 다루는 가치", "현장 준비의 담당자와 완료 상태를 예약 옆에서 볼 수 있게 하는 것이 제품의 제공 가치예요. 운영을 대신 수행하거나 시설의 수익을 보장한다는 뜻은 아니에요. 소프트웨어 기능과 운영자의 책임을 나눠야 실제로 맡게 될 제품 업무를 이해할 수 있어요."], ["빈 항목을 그대로 읽기", "하버의 자료에는 인원 관측이나 재무 사실이 없어요. 인원 변화나 투자 단계를 판단할 근거가 부족해요. 미확인은 확인된 부재와 다르며, 공고 수만으로 전체 직원 수를 추정해서도 안 돼요."]],
        limit: "가상 사업 설정이에요. 인원과 투자 정보의 누락은 실제 규모나 투자 부재를 뜻하지 않아요." },
    ],
  },
];

export function buildDemoData() {
  const registry = seeds.map(s => ({ id:s.id, name:s.name, legalName:`주식회사 ${s.name} (가상)`, brand:s.name, color:s.color,
    sourceKeys:[`greeting:${s.id}`], careerUrl:`https://${s.id}.example/careers`, homepage:`https://${s.id}.example`, aliases:[s.english], products:[s.product] }));
  const research: ResearchPack = { version:1, companies: seeds.map(s => {
    const evidence: CompanyResearch["evidence"] = s.guides.map(g => ({id:`${s.id}-source-${g.key}`, title:`[가상 자료] ${g.title}`, url:`https://${s.id}.example/${g.key}`,
      publisher:`${s.name} · 가상 설정`, kind:"official", access:"page", publishedOn:DEMO_DATE, checkedOn:DEMO_DATE, excerpt:g.answer}));
    evidence.push({id:`${s.id}-identity`, title:`[가상 자료] ${s.name} 소개`, url:`https://${s.id}.example/about`, publisher:`${s.name} · 가상 설정`, kind:"official", access:"page", publishedOn:null, checkedOn:DEMO_DATE, excerpt:`${s.name}은 채용 검토용 데모에만 등장하는 회사예요. ${s.domain} 사업자번호와 실제 주소는 없어요.`});
    const headcount: CompanyResearch["headcount"] = s.id === "demo-harbor" ? [] : [
      {id:`${s.id}-headcount-early`,entityId:s.id,scope:s.id === "demo-orbit" ? "legal-entity":"domestic",measurement:"reported-headcount",unit:"people",value:s.id === "demo-orbit" ? 40:28,approximate:false,referenceOn:"2026-03-31",referenceBasis:"observation",evidenceIds:[`${s.id}-source-headcount`]},
      {id:`${s.id}-headcount-late`,entityId:s.id,scope:s.id === "demo-orbit" ? "legal-entity":"consolidated",measurement:"reported-headcount",unit:"people",value:s.id === "demo-orbit" ? 46:52,approximate:false,referenceOn:"2026-09-30",referenceBasis:"observation",evidenceIds:[`${s.id}-source-headcount`]},
    ];
    if (headcount.length) evidence.push({id:`${s.id}-source-headcount`, title:"[가상 자료] 인원 비교 예시", url:`https://${s.id}.example/headcount`, publisher:`${s.name} · 가상 설정`,kind:"official",access:"page",publishedOn:DEMO_DATE,checkedOn:DEMO_DATE,excerpt:s.id === "demo-orbit" ? "가상 법인 인원: 2026-03-31 40명, 2026-09-30 46명. 같은 법인·집계 방식의 비교 예시이며 실제 관측이 아니에요." : "가상 인원: 2026-03-31 국내 조직 28명, 2026-09-30 연결 조직 52명. 범위가 달라 비교할 수 없고 실제 관측이 아니에요."});
    return {id:s.id,summary:s.domain,identityEvidence:[`${s.id}-identity`],evidence,
      facts:[{id:`${s.id}-domain`,kind:"context",text:s.domain,referenceOn:DEMO_DATE,evidenceIds:[`${s.id}-source-product`]}],headcount,
      guides:s.guides.map((g,i)=>({id:`${s.id}-${g.key}`,question:g.title,answer:g.answer,limitation:g.limit,evidenceIds:[`${s.id}-source-${g.key}`],
        sections:g.sections.map(([title,text],j)=>({id:`section-${j+1}`,title,text,kind:"context" as const,evidenceIds:[`${s.id}-source-${g.key}`]})),
        publication:{topic:g.topic,preview:g.preview,relatedIds:[`${s.id}-${s.guides[(i+1)%s.guides.length].key}`,`${s.id}-${s.guides[(i+2)%s.guides.length].key}`]}})),
      gaps:[{field:"salary",reason:"공고에 급여 범위가 명시되지 않았어요.",question:"제시할 수 있는 급여 범위와 보상 구성은 무엇인가요?"},{field:"funding",reason:"투자 이력에 관한 자료가 없어요.",question:"사업의 재원과 투자 이력을 확인할 수 있나요?"},...(s.id === "demo-harbor" ? [{field:"headcount" as const,reason:"인원의 집계 범위와 기준일을 확인할 자료가 없어요.",question:"어떤 범위와 기준일의 인원인지 확인할 수 있나요?"}]:[])]};
  })};
  // Synthetic fixture annotations, not production research or publication receipts.
  // The existing binding contract makes changed text/evidence lose its answer status.
  for (const company of research.companies) {
    const assessment = emptyAssessment();
    const mappings: Record<string, {guide:string;topic:string}> = {
      "identity.product":{guide:"product",topic:"business"},
      "identity.revenue":{guide:"business",topic:"business"},
      "culture.practice":{guide:"work",topic:"talent"},
      "process.stages":{guide:"hiring",topic:"conditions"},
    };
    for (const question of assessment.questions) for (const facet of question.facets) {
      const mapping = mappings[facet.facetId];
      if (!mapping) continue;
      const guide = company.guides!.find(guide => guide.id === `${company.id}-${mapping.guide}`)!;
      Object.assign(facet, {status:"partial",researchStatus:"completed",evidenceOutcome:"found",topic:mapping.topic,
        guideId:guide.id,claim:guide.answer.split(/(?<=[요다]\.)\s+/).slice(0,2).join(" "),limitation:guide.limitation,
        publicCaveat:guide.limitation,evidenceIds:[...guide.evidenceIds],
        scope:{entity:company.id,geography:null,role:null,jobId:null,referenceOn:DEMO_DATE}});
    }
    const draftHash = createHash("sha256").update(JSON.stringify({kind:"synthetic-review-fixture",company})).digest("hex");
    company.questionAssessment = bindAssessment(assessment,company,draftHash,timestamp);
  }
  const roles: {role:Role;label:string;title:string;stack:string;duties:string;required:string}[] = [
    {role:"frontend",label:"프론트엔드",title:"프론트엔드 엔지니어",stack:"React, TypeScript",duties:"작업 상태와 변경 이력을 보여주는 웹 화면을 개발해요. 키보드 사용과 오류 복구 경로를 함께 검토해요.",required:"React와 TypeScript로 화면 상태를 설계한 경험이 필요해요. 동료에게 변경 이유를 설명할 수 있어야 해요."},
    {role:"backend",label:"백엔드",title:"백엔드 엔지니어",stack:"Python, PostgreSQL",duties:"변경 이력 API와 권한 검사를 개발해요. 중복 요청과 취소 이후 데이터의 일관성을 확인해요.",required:"Python과 PostgreSQL을 사용해 API를 운영한 경험이 필요해요. 데이터 변경의 실패 경계를 설명할 수 있어야 해요."},
    {role:"design",label:"디자인",title:"프로덕트 디자이너",stack:"Figma",duties:"사용자 흐름과 예외 상태를 설계해요. 시제품으로 의견을 모으고 결정 이유를 기록해요.",required:"사용자 문제부터 화면 설계와 검증까지 맡은 경험이 필요해요. 본인의 기여를 구분한 작업 사례를 소개해 주세요."},
    {role:"product",label:"프로덕트·기획",title:"프로덕트 매니저",stack:"",duties:"사용자 문제와 우선순위를 정리해요. 출시 범위와 확인할 신호를 팀과 합의해요.",required:"요구가 바뀌는 상황에서 범위와 일정을 조율한 경험이 필요해요. 의사결정의 근거를 기록할 수 있어야 해요."},
    {role:"operations",label:"운영·CS",title:"서비스 운영 매니저",stack:"",duties:"문의의 영향과 해결 과정을 기록해요. 반복되는 문제를 제품팀과 공유하고 도움말을 개선해요.",required:"문의의 맥락을 파악하고 안내를 작성한 경험이 필요해요. 고객 정보와 내부 자료를 구분해 다룰 수 있어야 해요."},
  ];
  const contexts: Record<string, string> = {
    "demo-orbit": "일정 변경이 선행 작업과 담당자의 합의 상태에 미치는 영향을 다뤄요.",
    "demo-loom": "파일 버전과 검수 의견이 엇갈리지 않게 연결하고 승인 기록을 보존해요.",
    "demo-harbor": "예약 변경과 현장 준비 목록을 연결하고 취소 뒤 남은 업무를 확인해요.",
  };
  const jobs: Job[] = seeds.flatMap(s=>roles.map((r,i)=>({id:`${s.id}-job-${i+1}`,source:"greeting" as const,sourceBoard:s.id,sourceJobId:String(i+1),sourceUrl:`https://${s.id}.example/careers/${i+1}`,
    company:s.name,initial:s.english[0],color:s.color,title:`${r.title} · ${s.product}`,role:r.role,roleLabel:r.label,location:s.location,locationLabel:s.location === "pangyo" ? "판교 · 가상 오피스":"서울 · 가상 오피스",workplaceType:i%2 ? "on-site" as const:"hybrid" as const,
    experience:i===2 ? null:i===4 ? "경력 무관":"3년 이상",salary:null,tags:r.stack ? r.stack.split(", "):[],
    description:`[합성 데이터 · 실제 채용 아님]\n${s.name}의 ${s.product} 팀에서 ${r.title} 역할을 소개하는 가상 공고예요.\n\n담당 업무\n${r.duties} ${contexts[s.id]}\n\n자격 요건\n${r.required}\n${i===2 ? "경력 연수는 미기재예요.":i===4 ? "경력 무관":"관련 업무 경력 3년 이상"}\n\n우대 사항\n검토 의견을 기록하고 결과를 팀과 공유한 경험을 환영해요.\n\n근무 조건\n${s.location === "pangyo" ? "판교":"서울"}의 가상 오피스에서 ${i%2 ? "현장 근무":"하이브리드 근무"}를 해요. 급여 범위와 세부 근무 시간은 미기재예요.\n\n채용 절차\n서류 검토 → 직무 대화 → 협업 대화\n이 절차는 제품 검토용 예시이며 실제로 지원할 수 없어요.`,
    updatedAt:i===2 ? null:timestamp,fetchedAt:timestamp,firstSeenAt:i===0 ? timestamp:i===2 ? null:"2026-10-15T00:00:00.000Z",links:[{text:"가상 팀 소개",url:`https://${s.id}.example/work`}]})));
  const sources = seeds.map(s=>({provider:"greeting" as const,board:s.id,company:s.name,status:"ok" as const,checkedAt:timestamp,lastSuccessAt:timestamp}));
  return {registry,research,snapshot:{version:1 as const,jobs,sources}};
}

export function buildDemoPins(research: ResearchPack) {
  const evidence = new Map(research.companies.flatMap(company => company.evidence.map(source => [source.id, source] as const)));
  return {version:1, previews:{}, comparisons:Object.fromEntries(sameProblemLinks.map(({from,to,comparison}) => {
    const cited = [...comparison.evidenceIds.from, ...comparison.evidenceIds.to].map(id => {
      const source = evidence.get(id);
      if (!source) throw new Error(`Missing synthetic comparison source: ${id}`);
      return source;
    });
    return [`${from}>${to}`, comparisonPin(comparison, cited)];
  }))};
}

export function writeDemoData(root = process.cwd()) {
  const {registry,research,snapshot}=buildDemoData();
  const files: Record<string,unknown> = {
    "demo-companies.json":registry,"company-research.json":research,"jobs.json":snapshot,
    "discovered-sources.json":{version:1,sources:[],companies:[]},"company-relations.json":{version:1,legalEntities:[],organizations:[],relations:[],corrections:[]},
    "dart-identities.json":{version:1,checkedAt:timestamp,identities:{}},"pension-identities.json":{},"pension-roster-review.json":[],
    "reading-pins.json":buildDemoPins(research),"card-summaries.json":{},
  };
  mkdirSync(resolve(root,"data"),{recursive:true});
  for(const [name,value] of Object.entries(files)) writeFileSync(resolve(root,"data",name),JSON.stringify(value,null,2)+"\n");
  return Object.keys(files);
}
// Importing this file in tests is side-effect free.
if (process.argv[1] && /(?:^|[/\\])demo-data\.ts$/.test(process.argv[1])) {
  const files = writeDemoData();
  console.log(`Generated ${files.length} deterministic synthetic data files (${DEMO_DATE}).`);
}
