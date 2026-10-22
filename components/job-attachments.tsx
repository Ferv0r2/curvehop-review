import { jobLinkPresentation } from "../lib/job-links";

export function JobAttachments({ links }: { links: unknown }) {
  const attachments = jobLinkPresentation(links);
  if (!attachments.length) return null;
  return (
    <section className="detail-section">
      <h2>공고에 첨부된 자료</h2>
      <p className="research-caption">
        채용 원문에 연결된 링크예요. 외부 작성 자료가 포함될 수 있어요.
      </p>
      <ul>
        {attachments.map(link => (
          <li key={link.url}>
            <a href={link.url} rel="noopener noreferrer" target="_blank"
              aria-label={`${link.label} (새 탭에서 열기)`}>
              {link.label} <span aria-hidden="true">↗</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
