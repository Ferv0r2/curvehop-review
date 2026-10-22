"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import Link from "@/components/navigation-link";
import { bookmarkChanged, readBookmarkIds, type SavedJob } from "@/lib/bookmarks";
import { fetchSavedJobs } from "@/lib/saved-job-client";
import { Bookmark } from "./bookmark";
import { CompanyMark } from "./company-mark";

export function SavedJobs() {
  const [jobs, setJobs] = useState<SavedJob[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [retry, setRetry] = useState(0);
  const [ids, setIds] = useState<string[] | null>(null);
  const [storageError, setStorageError] = useState(false);
  useLayoutEffect(() => {
    const sync = () => {
      try { const next = readBookmarkIds(localStorage).sort(); setIds(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next); setStorageError(false); }
      catch { setStorageError(true); }
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(bookmarkChanged, sync);
    window.addEventListener("pageshow", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(bookmarkChanged, sync);
      window.removeEventListener("pageshow", sync);
    };
  }, []);
  const selectionKey = JSON.stringify(ids);
  useEffect(() => {
    if (ids === null || storageError) return;
    const controller = new AbortController();
    setUnavailable(false);
    void fetchSavedJobs(ids, controller.signal).then(items => {
      if (!controller.signal.aborted) { setJobs(items); setLoadedKey(selectionKey); }
    }).catch(() => { if (!controller.signal.aborted) { setUnavailable(true); setLoadedKey(selectionKey); } });
    return () => controller.abort();
  }, [selectionKey, storageError, retry]); // IDs are fully represented by selectionKey.
  const pending = ids === null || (!!ids.length && loadedKey !== selectionKey && !unavailable);
  useLayoutEffect(() => {
    if (!pending) document.dispatchEvent(new Event("nextstep:disclosure-ready"));
  }, [pending, jobs]);
  const selected = new Set(ids ?? []);
  const items = jobs.filter(job => selected.has(job.id));
  const known = new Set(jobs.map(job => job.id));
  const missing = (ids ?? []).filter(id => !known.has(id));

  if (storageError || unavailable) return <div className="empty" role="alert">
    <h2>{storageError ? "북마크를 읽을 수 없어요" : "공고 정보를 불러오지 못했어요"}</h2>
    <p>{storageError ? "이 브라우저의 저장소 접근이 제한되어 있어요. 설정을 확인한 뒤 다시 시도해 주세요." : "북마크는 그대로 보관돼요. 잠시 후 다시 시도해 주세요."}</p>
    <button className="button primary" onClick={() => { if (storageError) location.reload(); else { setUnavailable(false); setLoadedKey(null); setRetry(value => value + 1); } }}>다시 시도</button>
  </div>;
  if (pending) return <p role="status" data-navigation-pending="true">북마크를 불러오는 중…</p>;
  if (!ids?.length) return <div className="empty"><h2>아직 저장한 공고가 없어요</h2><p>관심 있는 공고의 북마크 버튼을 누르면 여기에 모여요.</p><Link className="button primary" href="/jobs">채용 공고 둘러보기</Link></div>;
  return <>
    <div className="results-heading"><h2>저장한 공고 <span>{ids.length}</span></h2><span className="result-caption">회사명순</span></div>
    <div className="job-list">
      {items.map(job => <article className="job-card" key={job.id} data-job-id={job.id}>
        <CompanyMark companyId={job.companyId} name={job.company} color={job.color} className="company-monogram" />
        <div className="job-card-main">
          <div className="company-name">{job.companyId ? <Link href={`/companies/${job.companyId}`}>{job.company}</Link> : job.company}</div>
          <h3><Link href={`/jobs/${encodeURIComponent(job.id)}?from=%2Fsaved`}>{job.title}</Link></h3>
          <p className="job-meta">{job.locationLabel}</p>
        </div>
        <Bookmark id={job.id} title={`${job.company} ${job.title}`} />
      </article>)}
    </div>
    {!!missing.length && <section className="saved-unavailable" aria-label="현재 자료에서 찾지 못한 공고">
      <h2>현재 자료에서 찾지 못한 공고 {missing.length}개</h2>
      <p>저장 표시는 남아 있지만 공고 내용을 확인할 수 없어요. 마감 여부는 확인되지 않았어요.</p>
      {missing.map((id, index) => <div className="saved-unavailable-row" key={id}><span>내용 미확인 공고 {index + 1}</span><Bookmark id={id} title={`내용 미확인 공고 ${index + 1}`} /></div>)}
    </section>}
  </>;
}
