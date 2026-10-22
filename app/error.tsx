"use client";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <section className="empty" role="alert">
      <h1>이 화면을 불러오지 못했어요.</h1>
      <p>저장한 북마크와 탐색 기준은 그대로 있어요. 다시 시도하거나 다른 화면에서 이어서 살펴보세요.</p>
      <button className="button primary" onClick={() => retry()}>
        다시 시도
      </button>
      <a className="button" href="/discover">
        읽을거리로
      </a>
    </section>
  );
}
