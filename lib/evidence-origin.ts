export const EVIDENCE_ORIGINS = ["public-record", "company-original", "reporting", "republication"] as const;
export type EvidenceOrigin = typeof EVIDENCE_ORIGINS[number];
export const EVIDENCE_ORIGIN_LABELS: Readonly<Record<EvidenceOrigin, string>> = {
  "public-record": "공공 자료·공시",
  "company-original": "회사 공식 자료",
  reporting: "언론 보도",
  republication: "재인용 자료",
};
export const EVIDENCE_ORIGIN_DESCRIPTIONS: Readonly<Record<EvidenceOrigin, string>> = {
  "public-record": "인원 기록과 공시·재무 자료",
  "company-original": "회사가 공개한 사업·제품 소개와 팀 이야기, 채용 자료",
  reporting: "회사의 변화와 후속 상황을 다룬 기사",
  republication: "다른 자료를 옮겨 전한 내용으로, 독립된 확인과 구분해요",
};
