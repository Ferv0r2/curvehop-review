import { brand } from "@/lib/brand";

export default function NotFound() {
  return (
    <section className="empty not-found">
      {/* React hoists this into <head>; the root layout's default title would otherwise stay. */}
      <title>{`페이지를 찾을 수 없어요 | ${brand.name}`}</title>
      <p className="eyebrow">404 · NOT FOUND</p>
      <h1>페이지를 찾을 수 없어요.</h1>
      <p>주소가 바뀌었거나 없는 페이지예요. 읽을거리나 채용 공고에서 다시 찾아보세요.</p>
      <a className="button primary" href="/discover">
        읽을거리로
      </a>
      <a className="button" href="/jobs">
        채용 공고 보기
      </a>
    </section>
  );
}
