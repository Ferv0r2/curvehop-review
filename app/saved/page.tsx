import { AnalyticsPage } from "@/components/analytics";
import { searchRobots } from "@/lib/search-indexing";
import { connection } from "next/server";
import { SavedJobs } from "@/components/saved-jobs";
import { shareMetadata } from "@/lib/share-metadata";

export const metadata = { title: "북마크", ...shareMetadata("북마크", "저장한 채용 공고를 한곳에서 다시 살펴보세요.", "/saved"), robots: searchRobots(false) };

export default async function SavedPage() {
  await connection();
  return <div className="saved-page">
    <AnalyticsPage page={{ page_type: "saved" }} />
    <header className="page-heading"><div><h1>북마크</h1><p className="intro">다시 살펴볼 공고를 모아두었어요.</p><p className="saved-note">이 브라우저에 저장한 공고예요. 다른 기기와는 공유되지 않아요.</p></div></header>
    <noscript><p>북마크를 확인하려면 브라우저에서 자바스크립트를 켜 주세요.</p></noscript>
    <SavedJobs />
  </div>;
}
