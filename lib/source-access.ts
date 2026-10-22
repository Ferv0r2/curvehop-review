import type { Provider } from "./jobs";

/** How bytes are obtained, not who authored them or permission to republish. */
export type AccessMethod = "credentialed-public-api" | "public-file" | "documented-job-api" | "public-webpage" | "website-json";
export const ACCESS_METHOD_LABELS: Readonly<Record<AccessMethod, string>> = {
  "credentialed-public-api": "인증키가 필요한 공공 API",
  "public-file": "공식 공개 파일",
  "documented-job-api": "공개 공고 API",
  "public-webpage": "공개 웹페이지",
  "website-json": "사이트 JSON 응답",
};
export type CollectionAccess = {
  label: string;
  method: AccessMethod;
  description: string;
  documentation: string | null;
  /** Neither robots allowance nor public access establishes a reuse licence. */
  reuseRights: "not-assessed";
  partnership: false;
};
export const JOB_COLLECTION_ACCESS: Readonly<Record<Provider, CollectionAccess>> = {
  greeting: {
    label: "그리팅", method: "public-webpage",
    description: "회사가 공개한 채용 페이지를 읽어요. 그리팅의 고객사 전용 OpenAPI를 사용하는 방식은 아니에요.",
    documentation: "https://guide.greetinghr.com/ko/articles/crtfd-1d1b706f",
    reuseRights: "not-assessed", partnership: false,
  },
  greenhouse: {
    label: "Greenhouse", method: "documented-job-api",
    description: "공개된 Job Board API에서 회사별 공고를 가져와요.",
    documentation: "https://docs.greenhouse.io/job-board.html",
    reuseRights: "not-assessed", partnership: false,
  },
  lever: {
    label: "Lever", method: "documented-job-api",
    description: "공개된 Postings API에서 회사별 공고를 가져와요.",
    documentation: "https://github.com/lever/postings-api",
    reuseRights: "not-assessed", partnership: false,
  },
  workday: {
    label: "Workday", method: "website-json",
    description: "회사의 공개 채용 사이트가 사용하는 JSON 응답을 읽어요. 공개 개발자 API와 구분해요.",
    documentation: null, reuseRights: "not-assessed", partnership: false,
  },
};

export const PUBLIC_DATA_ACCESS: readonly CollectionAccess[] = [
  { label: "국민연금공단 API", method: "credentialed-public-api", description: "사업장 가입자 기록", documentation: "https://www.data.go.kr/data/15083277/fileData.do", reuseRights: "not-assessed", partnership: false },
  { label: "국민연금공단 월별 파일", method: "public-file", description: "월별 사업장 자료와 회사 발굴 목록", documentation: "https://www.data.go.kr/data/15083277/fileData.do", reuseRights: "not-assessed", partnership: false },
  { label: "금융감독원 DART", method: "credentialed-public-api", description: "법인 정보와 공시·재무 자료", documentation: "https://opendart.fss.or.kr/", reuseRights: "not-assessed", partnership: false },
  { label: "금융위원회 · 공정거래위원회", method: "credentialed-public-api", description: "법인과 공식 홈페이지 확인", documentation: "https://www.data.go.kr/", reuseRights: "not-assessed", partnership: false },
];
