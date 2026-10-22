import { dayLabel, type Arrivals } from "@/lib/new-arrivals";

// Role and size are explicit (empty) so a saved preference does not narrow the
// list below the count the strip shows.
export const newJobsHref = (day: string) => `/jobs?${new URLSearchParams({ new: day, role: "", size: "" })}`;
export const newCompaniesHref = (day: string) => `/companies?${new URLSearchParams({ new: day, size: "" })}`;

/**
 * One quiet line: what the board gained on the reference day (lib/new-arrivals.ts).
 * A zero part is left out; nothing at all renders nothing.
 */
export function NewArrivals({ arrivals, compact = false }: { arrivals: Arrivals | null; compact?: boolean }) {
  if (!arrivals || (!arrivals.jobs && !arrivals.companies)) return null;
  const when = arrivals.today ? "오늘" : dayLabel(arrivals.day);
  return (
    <p className={compact ? "new-arrivals is-compact" : "new-arrivals"}>
      {/* Spaces keep the copied text readable; flex layout drops them. */}
      <time dateTime={arrivals.day}>{when}</time>{" "}
      {arrivals.jobs > 0 && (
        <a href={newJobsHref(arrivals.day)} aria-label={`${when} 새로 들어온 공고 ${arrivals.jobs}건`}>
          {`새로 들어온 공고 ${arrivals.jobs}건`}
        </a>
      )}
      {arrivals.jobs > 0 && arrivals.companies > 0 && <> <span className="new-arrivals-sep" aria-hidden="true">·</span> </>}
      {arrivals.companies > 0 && (
        <a href={newCompaniesHref(arrivals.day)} aria-label={`${when} 새 회사 ${arrivals.companies}곳`}>
          {`새 회사 ${arrivals.companies}곳`}
        </a>
      )}
    </p>
  );
}
