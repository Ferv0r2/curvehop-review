import "./discover.css";
import { AnalyticsPage } from "@/components/analytics";
import { shareMetadata, websiteIdentity } from "@/lib/share-metadata";
import { searchRobots, unfilteredSearchPage } from "@/lib/search-indexing";
import { BackToTop } from "@/components/back-to-top";
import { readPreferences } from "@/lib/preference-store";
import { roleLabels } from "@/lib/jobs";
import Link from "@/components/navigation-link";
import { connection } from "next/server";
import { readRenderResearch } from "@/lib/render-data";
import { readingItems, readingTopics, type ReadingTopic } from "@/lib/reading";
import { ReadingCard, CompanyMark } from "@/components/reading-view";
import { ResearchUnavailable } from "@/components/research-view";
import { RevealActiveTab } from "@/components/reveal-active-tab";
import type { SearchParams } from "@/lib/jobs";
import { boardArrivals } from "@/lib/repository";
import { ArrivalBanner } from "@/components/arrival-banner";
import { companyListing } from "@/lib/company-listing";
import { discoveryDelivery, discoveryEmptyState, selectRecentReadings, discoveryOpening, discoveryShelves, diverseReadings } from "@/lib/reading-discovery";

/** Stories per topic in the overview before "N개 모두 보기". */
const SHELF_CARDS = 6;
export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  return { title: "지원 전 회사 이야기", ...shareMetadata("지원 전 회사 이야기", "서울·판교 채용 공고와 함께 회사의 사업, 팀 문화, 직무와 전형을 살펴보세요.", "/discover"), robots: searchRobots(unfilteredSearchPage(params) && !params.sort) };
}
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  const { topic: raw, sort } = await searchParams;
  const recentOnly = sort === "recent";
  const now = new Date();
  const topic =
    typeof raw === "string" && Object.hasOwn(readingTopics, raw)
      ? (raw as ReadingTopic)
      : "";
  const research = await readRenderResearch();
  const preferences = await readPreferences();
  // A jobs file that cannot be read only hides the strip; the stories still render.
  const arrivals = await boardArrivals().catch(() => null);
  const eligible = research.status === "ok" ? companyListing(research.pack).eligibleIds : new Set<string>();
  const all = research.status === "ok" ? readingItems(research.pack).filter(story => eligible.has(story.companyId)) : [];
  const pending = new Set(research.status === "ok" ? research.pendingGuideIds : []);
  const delivery = discoveryDelivery(all, now, pending);
  const allRecent = selectRecentReadings(all, now, { excludedGuideIds: pending, limit: Infinity, perCompany: Infinity });
  const recentById = new Map(allRecent.map(entry => [entry.id, entry]));
  const topicItems = topic ? all.filter((r) => r.topic === topic) : all;
  const recentItems = allRecent.filter(entry => !topic || entry.reading.topic === topic);
  const items = recentOnly ? recentItems.map(entry => entry.reading)
    : topic ? [...recentItems.map(entry => entry.reading), ...topicItems.filter(reading => !recentById.has(reading.id))] : all;
  const overview = !topic && !recentOnly;
  const opening = discoveryOpening(all, delivery.recent, pending);
  const topIds = new Set(opening.map(reading => reading.id));
  const recentOpening = new Map(delivery.recent.map(entry => [entry.id, entry]));
  // Only new publications lead the overview; an edit is not automatically news.
  const newFirst = [...allRecent.filter(entry => entry.change.kind === "added").map(entry => entry.reading), ...all];
  const shelves = discoveryShelves.map(shelf => ({
    ...shelf,
    items: diverseReadings(newFirst.filter(r => !pending.has(r.id)), shelf.topics, SHELF_CARDS, topIds),
  }));
  const identities = [...new Map(all.map((r) => [r.companyId, r])).values()];
  const topicCompanyCount = new Set(items.map(r => r.companyId)).size;
  const topicPath = `/discover${topic ? `?topic=${topic}` : ""}`;
  const recentPath = `${topicPath}${topic ? "&" : "?"}sort=recent`;
  const from = recentOnly ? recentPath : topicPath;
  const emptyState = discoveryEmptyState(topic, recentOnly);
  const topicHref = (key?: string) => {
    const params = new URLSearchParams();
    if (key) params.set("topic", key);
    if (recentOnly) params.set("sort", "recent");
    return `/discover${params.size ? `?${params}` : ""}`;
  };
  return (
    <div className="discovery-page" data-reading-delivery={research.status === "ok" ? delivery.hash : undefined}>
      {overview && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteIdentity).replace(/</g, "\\u003c") }} />}
      <AnalyticsPage page={{ page_type: "discover" }} resultCount={research.status === "ok" ? items.length : undefined} />
      <header className="discovery-heading">
        <div>
          <h1>{recentOnly ? "최근 이야기" : topic ? readingTopics[topic] : "지원 전에 알아보는 회사 이야기"}</h1>
          <p>{recentOnly ? "최근 14일 동안 커브홉에 새로 담거나 수정한 글이에요. 회사 소식이 나온 날짜는 각 글에서 확인할 수 있어요." : topic ? "관심 있는 주제로 회사를 이어서 살펴보세요." : "커브홉에서 서울·판교 채용 공고와 회사의 사업, 일하는 방식을 함께 살펴보세요."}</p>
        </div>
        <div className="discovery-actions">
          {overview ? <Link href="/discover?sort=recent">최근 이야기 보기</Link> : <Link href="/discover">회사 이야기 둘러보기</Link>}
          <Link className="discovery-directory" href="/companies">회사 찾아보기</Link>
        </div>
      </header>
      {!overview && <div className="discovery-bar">
        <nav className="topic-tabs" aria-label="읽을거리 주제">
          <Link href={topicHref()} aria-current={!topic ? "page" : undefined}>전체</Link>
          {Object.entries(readingTopics).map(([key, label]) => (
            <Link key={key} href={topicHref(key)} aria-current={topic === key ? "page" : undefined}>{label}</Link>
          ))}
        </nav>
        <RevealActiveTab row=".topic-tabs" active={topic} />
        {research.status === "ok" && <p>{`${topicCompanyCount.toLocaleString("ko-KR")}개 회사 · ${items.length.toLocaleString("ko-KR")}개 이야기`}</p>}
      </div>}
      {research.status !== "ok" ? (
        <ResearchUnavailable href={from} />
      ) : (
        <>
          {overview && opening.length > 0 && <section className="discovery-opening" aria-label="먼저 살펴볼 이야기">
            <div className="story-grid">
              {opening.map(reading => {
                const entry = recentOpening.get(reading.id);
                return <ReadingCard key={reading.id} reading={reading} from={from} discovery contentChange={entry?.change} deliveryContentHash={entry?.contentHash} />;
              })}
            </div>
          </section>}
          {overview && shelves.filter(shelf => shelf.items.length > 0).map(shelf => (
            <section className="reading-shelf" data-shelf={shelf.id} key={shelf.id} aria-labelledby={`shelf-${shelf.id}`}>
              <div className="shelf-heading">
                <div><h2 id={`shelf-${shelf.id}`}>{shelf.title}</h2><p>{shelf.description}</p></div>
                <nav className="shelf-topics" aria-label={`${shelf.title} 더 보기`}>
                  {shelf.topics.map(key => <Link key={key} href={`/discover?topic=${key}`}>{readingTopics[key]} 더 보기</Link>)}
                </nav>
              </div>
              <div className="story-grid" data-scroll-row={shelf.id}>
                {shelf.items.map(reading => <ReadingCard key={reading.id} reading={reading} from={from} discovery />)}
              </div>
            </section>
          ))}
          {!overview && items.length > 0 && <section className="reading-shelf is-topic" aria-label={recentOnly ? "최근 추가·수정된 이야기" : readingTopics[topic as ReadingTopic]}>
            {(topic === "work" || topic === "process") && <p className="discovery-footnote">직무별 역할과 채용 과정을 살펴보세요. 각 공고와 팀의 이야기를 구분해 읽을 수 있어요.</p>}
            <div className="story-grid">
              {items.map(reading => {
                const entry = recentById.get(reading.id);
                return <ReadingCard key={reading.id} reading={reading} from={from} discovery contentChange={entry?.change} deliveryContentHash={entry?.contentHash} />;
              })}
            </div>
          </section>}
          {overview && <ArrivalBanner data={arrivals} />}
          {preferences.role && <div className="discovery-preference"><p><strong>{roleLabels[preferences.role]}</strong> 관점에서 공고를 살펴보세요. 회사 이야기는 직무와 관계없이 모두 열려 있어요.</p><Link href={`/jobs?role=${preferences.role}`}>관심 직무 공고 보기</Link></div>}
          {items.length === 0 && (
            <div className="empty">
              <h2>{emptyState.heading}</h2>
              <Link href={emptyState.href}>{emptyState.label}</Link>
            </div>
          )}
          {identities.length > 0 && <section className="discovery-companies">
            <div>
              <h2>회사에서 시작해도 좋아요</h2>
              <p>{identities.length.toLocaleString("ko-KR")}개 회사의 이야기. 한 회사의 질문과 공고를 모아서 살펴보세요.</p>
            </div>
            <div className="company-shortcuts">
              {identities.map((r) => (
                <Link key={r.companyId} href={`/companies/${r.companyId}`}>
                  <CompanyMark companyId={r.companyId} name={r.companyName} color={r.companyColor} />
                  <span>{r.companyName}</span>
                </Link>
              ))}
            </div>
          </section>}
          <p className="discovery-footnote">
            함께 읽으면 좋을 회사와 이야기를 연결했어요. 채용 상태와 자료의 시점은
            각 글에서 확인할 수 있어요.
          </p>
        </>
      )}
      <BackToTop />
    </div>
  );
}
