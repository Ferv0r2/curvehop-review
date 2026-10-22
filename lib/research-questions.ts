/** Canonical question contracts shared by research, review, query and evaluation. Publication authority remains in research-review-policy. */
export type QuestionContract = {
  id: string;
  question: string;
  facets: { id: string; expected: string }[];
  sources: string[];
  scriptChecks: string[];
  llmTask: string;
  forbidden: string[];
  readingTopics: ("vision" | "culture" | "work" | "process" | "business")[];
  pipelineTopics: string[];
};

export const questionContractVersion = 1;
export const researchQuestions: readonly QuestionContract[] = [
  {
    id: "company.identity", question: "무엇을 만들고 누구에게 가치를 제공하는 회사인가요?",
    facets: [{ id: "identity.entity", expected: "브랜드와 고용 법인의 관계·범위" }, { id: "identity.product", expected: "제품·고객·해결하는 문제" }, { id: "identity.revenue", expected: "확인 가능한 수익 구조" }],
    sources: ["공식 제품·회사 소개", "법인 식별 자료", "공시"],
    scriptChecks: ["법인·브랜드 식별자 대조", "출처 참조 유효성"],
    llmTask: "제품·고객·수익 구조를 근거별로 설명하고 확인 못한 항목을 구분한다.",
    forbidden: ["브랜드·모회사·채용 법인을 동일시", "제품 소개로 매출 비중 추정"], readingTopics: ["vision"], pipelineTopics: ["business"],
  },
  {
    id: "company.history", question: "어떻게 지금의 회사가 됐나요?",
    facets: [{ id: "history.turning-points", expected: "주요 사업·투자·소유권·경영진 전환점" }, { id: "history.sequence", expected: "사건의 순서와 당시 범위" }],
    sources: ["공시", "공식 연혁·발표", "사건 보도·정정"],
    scriptChecks: ["사건·공개·확인 시점 구분", "중복·대체·정정 참조"],
    llmTask: "지원 판단에 관련된 전환점을 고르고 현재 모습과 연결하되 인과 추정을 구분한다.",
    forbidden: ["확인일을 사건일로 사용", "순서만으로 인과 확정"], readingTopics: ["business"], pipelineTopics: ["changes"],
  },
  {
    id: "company.direction", question: "앞으로 무엇을 하려 하며 실제로 실행하고 있나요?",
    facets: [{ id: "direction.intent", expected: "회사가 밝힌 사업 방향" }, { id: "direction.execution", expected: "발표 이후 제품·사업 실행 기록" }, { id: "direction.hiring", expected: "관련 팀·공고와의 연결 또는 확인 한계" }],
    sources: ["대표 메시지·공식 발표", "제품 출시·사업 공시", "공식 채용 공고"],
    scriptChecks: ["발표와 후속 자료 시점", "공고 상태·고용 법인"],
    llmTask: "선언과 실행을 대조하고 채용과 연결되는 범위를 설명한다.",
    forbidden: ["계획을 달성 사실로 표현", "채용 증가를 사업 성공으로 판정"], readingTopics: ["vision", "business"], pipelineTopics: ["business", "changes"],
  },
  {
    id: "company.changes", question: "지원 전에 알아야 할 변화와 불확실성은 무엇인가요?",
    facets: [{ id: "changes.workforce", expected: "같은 기준의 인원 변화와 범위" }, { id: "changes.financials", expected: "공개 재무·조달의 기간과 의미" }, { id: "changes.events", expected: "중요 사건·후속 조치·미확인 원인" }],
    sources: ["국민연금", "DART", "공식 발표", "독립 보도·후속 보도"],
    scriptChecks: ["같은 법인·측정·기간 비교", "수치·단위·부호 대조", "민감 주장 검토 정책"],
    llmTask: "확인된 변화와 가능한 의미·해석 한계를 분리한다.",
    forbidden: ["가입자 감소를 퇴사자로 표현", "투자를 현금 보유액으로 표현", "근거 없는 안전 점수"], readingTopics: ["business"], pipelineTopics: ["changes", "signals"],
  },
  {
    id: "role.work", question: "합류하면 어떤 문제를 맡고 누구와 일하나요?",
    facets: [{ id: "work.problem", expected: "팀의 제품·고객·과제" }, { id: "work.responsibility", expected: "직무 책임·협업 대상·요구 경험" }],
    sources: ["공식 공고", "팀 인터뷰·기술 글"],
    scriptChecks: ["공고 ID·직무·경력·근무지", "팀과 전사 범위 구분"],
    llmTask: "공고와 팀 사례를 연결해 실제 업무를 설명한다.",
    forbidden: ["회사 전체 설명에 FE 선호 주입", "사용 기술만으로 업무·숙련도 단정"], readingTopics: ["work"], pipelineTopics: ["conditions"],
  },
  {
    id: "team.culture", question: "어떤 동료와 어떤 방식으로 일하나요?",
    facets: [{ id: "culture.values", expected: "회사가 밝힌 가치·기대 행동" }, { id: "culture.practice", expected: "의사결정·피드백·협업 사례와 팀 범위" }],
    sources: ["공식 문화·채용 안내", "구성원·리더 인터뷰"],
    scriptChecks: ["회사 설명·개인 경험·의견 출처 구분", "사례 시점·팀 표시"],
    llmTask: "가치 선언이 사례에서 어떻게 나타나는지 설명한다.",
    forbidden: ["팀 경험담을 전사 근무제 보장으로 표현", "인재상을 실제 면접 평가표로 단정"], readingTopics: ["culture"], pipelineTopics: ["talent"],
  },
  {
    id: "employment.conditions", question: "보상과 근무 조건이 내 생활에 맞을까요?",
    facets: [{ id: "conditions.pay", expected: "역할·경력·통화·기간·보상 구성별 공개 범위" }, { id: "conditions.workplace", expected: "공고별 근무지·근무 형태·계약·수습 조건" }],
    sources: ["공식 공고", "공식 보상·근무 안내"],
    scriptChecks: ["보상 범위·기간·통화·구성 구분", "공고별 근무 조건"],
    llmTask: "명시된 조건과 협의·미확인 조건을 구분한다.",
    forbidden: ["회사 평균으로 역할 연봉 대체", "본사 주소로 공고 근무지 보충"], readingTopics: ["work", "process"], pipelineTopics: ["conditions"],
  },
  {
    id: "hiring.process", question: "지원하면 무엇을 준비하고 어떤 과정을 거치나요?",
    facets: [{ id: "process.stages", expected: "대상 직무의 전형 단계·과제·면접" }, { id: "process.preparation", expected: "공개 평가 기준·제출물·일정과 예외" }],
    sources: ["공식 공고·전형 안내", "채용 담당자·팀의 공식 설명"],
    scriptChecks: ["전형 대상 공고·직무·시점", "공통 안내와 공고 예외 구분"],
    llmTask: "명시된 평가 기준을 지원자가 준비할 내용에 연결한다.",
    forbidden: ["후기에서 실제 평가 기준 확정", "과거 전형을 현재 모든 공고에 적용"], readingTopics: ["process"], pipelineTopics: ["conditions"],
  },
  {
    id: "company.alternatives", question: "어떤 다른 회사와 무엇을 비교하면 좋을까요?",
    facets: [{ id: "alternatives.problem", expected: "양쪽 근거가 뒷받침하는 공통 문제" }, { id: "alternatives.difference", expected: "해결 방식·조직·사업 단계의 차이와 한계" }],
    sources: ["비교하는 양쪽 회사의 근거"],
    scriptChecks: ["양쪽 근거 참조·편집 고정값", "자기 회사 추천·무효 연결 제외"],
    llmTask: "공통 문제와 차이를 설명하고 이어 읽을 이유를 제안한다.",
    forbidden: ["같은 업종만으로 경쟁사 단정", "행동 데이터 없는 함께 본 회사 표시", "지원 적합도 점수 추정"], readingTopics: [], pipelineTopics: ["comparison"],
  },
];

// Research process, evidence outcome and answer sufficiency are independent dimensions.
export const answerStatuses = ["not_assessed", "insufficient", "partial", "sufficient", "conflicting"] as const;
export const researchStatuses = ["not_recorded", "not_started", "in_progress", "completed", "blocked"] as const;
export const evidenceOutcomes = ["not_checked", "found", "inaccessible", "not_found_in_scope", "verified_absence", "conflicting"] as const;
