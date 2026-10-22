import { shareMetadata } from "@/lib/share-metadata";

const DESCRIPTION = "로컬 검토판의 데이터와 브라우저 저장 방식 안내";
export const metadata = { title: "검토판의 데이터 처리", ...shareMetadata("검토판의 데이터 처리", DESCRIPTION, "/privacy") };

export default function PrivacyPage() {
  return (
    <article className="legal-page">
      <h1>검토판의 데이터 처리</h1>
      <p>이 앱은 채용 검토를 위해 로컬에서 실행하는 커브홉 코드입니다. 회사·공고·읽을거리는 모두 가상 데이터예요.</p>
      <h2>브라우저에 남는 정보</h2>
      <p>직무·경력 설정과 저장한 항목은 이 브라우저의 쿠키와 로컬 저장소를 사용해요. 브라우저의 사이트 데이터를 지우면 초기화됩니다.</p>
      <h2>외부 전송</h2>
      <p>이 검토판은 방문 분석 스크립트를 불러오지 않고 수집·리서치 API를 호출하지 않아요. 로컬 서버는 페이지를 보여 주기 위해 요청을 처리합니다.</p>
      <p>실제 서비스 링크나 이메일 링크를 직접 열면 해당 서비스로 이동해요. 운영 서비스의 정책은 <a href="https://curvehop.net/privacy" target="_blank" rel="noopener noreferrer">커브홉 개인정보처리방침</a>에서 확인할 수 있어요.</p>
    </article>
  );
}
