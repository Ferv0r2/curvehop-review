import { RestorableDetails } from "@/components/restorable-details";
import type { CompanyResearch } from "@/lib/research";
import { dartPeriodEnd, dartPriorPeriod, dartStakeText, subsidiaryFiling } from "@/lib/dart-wording";
import { subsidiaryFactId, visibleRelationsForCompany, type Relation } from "@/lib/relations";
import type { RelationsRead } from "@/lib/relations-store";
import { Citations } from "@/components/research-view";
import { RelDate } from "@/components/rel-date";

/** The collector stores at most this many characters of a note; a note this long may be cut. */
export const STORED_NOTE_MAX = 200;

export type SubsidiaryRow = { id: string; name: string; prior: number | null; current: number | null; note: string | null };
export type SubsidiaryFiling = {
  rceptNo: string;
  period: string;
  receivedOn: string | null;
  /** "2025년 감사보고서" / "2025년 사업보고서" / "2025년 정정 사업보고서": `subsidiaryFilingTitle`, the wording the wiki also uses. */
  title: string;
  evidenceIds: string[];
  rows: SubsidiaryRow[];
};
export type CompanySubsidiaries = {
  /** Newest filing first; empty means no block. */
  filings: SubsidiaryFiling[];
  /** Facts the fact list skips: shown by the block, or retracted by a `claim` correction. */
  omittedFactIds: Set<string>;
  /** Facts a `claim` correction retracted: gone from the fact list and the timeline, never restored. */
  suppressedFactIds: Set<string>;
  /** Timeline links that point into the block instead of the omitted fact. */
  factLinks: Map<string, string>;
};

export const filingAnchor = (rceptNo: string) => `relation-filing-${rceptNo}`;

// Period wording of the DART fact sentence, shared with it and the wiki (`lib/dart-wording.ts`), so the
// block, the wiki and the fact it replaces read the same way.
const endOf = dartPeriodEnd, priorOf = dartPriorPeriod, stakeText = dartStakeText;

/** The display name of one of `companyId`'s organizations; null for another company's or a malformed one. */
function organizationName(relations: RelationsRead, companyId: string, id: string): string | null {
  const org = relations.pack.organizations.find(item => !!item && typeof item === "object" && item.id === id) as { scope?: unknown; names?: unknown } | undefined;
  if (!org || org.scope !== companyId || !Array.isArray(org.names)) return null;
  const name = org.names[0];
  return typeof name === "string" && name.trim() ? name : null;
}

/**
 * What the company page shows of one company's relations (brief §7). Only
 * visible `subsidiary_of` rows make a block; identity relations never do.
 * While a filing's rows are shown, the same-evidence/same-period subsidiaries
 * fact leaves the fact list and its timeline link points at the filing. Any
 * unavailability (file, company issues, every row hidden) returns the fact;
 * only valid `claim` corrections take facts away, and they stay away. Another
 * company's malformed entries never reach this company: the page never breaks
 * over relations, at worst this company's block is hidden.
 */
export function companySubsidiaries(company: CompanyResearch, relations: RelationsRead | null): CompanySubsidiaries {
  const result: CompanySubsidiaries = { filings: [], omittedFactIds: new Set(), suppressedFactIds: new Set(), factLinks: new Map() };
  if (!relations || relations.status !== "ok") return result;
  let visible;
  try { visible = visibleRelationsForCompany(relations.pack, relations, company.id); }
  catch { return result; }
  for (const id of visible.suppressedFactIds) {
    result.suppressedFactIds.add(id);
    result.omittedFactIds.add(id);
  }
  if (visible.hidden) return result;
  try { addFilings(company, relations, visible.rows, result); }
  catch { return { ...result, filings: [], omittedFactIds: new Set(result.suppressedFactIds), factLinks: new Map() }; }
  return result;
}

function addFilings(company: CompanyResearch, relations: RelationsRead, rows: Relation[], result: CompanySubsidiaries) {
  const evidence = new Map(company.evidence.map(item => [item.id, item]));
  const groups = new Map<string, SubsidiaryFiling & { orders: Map<string, number> }>();
  for (const relation of rows) {
    if (relation.type !== "subsidiary_of" || typeof relation.asOf !== "string") continue;
    const name = organizationName(relations, company.id, relation.from.id);
    const filing = subsidiaryFiling(company.id, relation, evidence);
    if (!name || !filing) continue;
    const { evidenceId, rceptNo, period, title } = filing;
    const group = groups.get(evidenceId) ?? groups.set(evidenceId, {
      rceptNo, period, receivedOn: relation.reportedOn, title, evidenceIds: [evidenceId], rows: [], orders: new Map(),
    }).get(evidenceId)!;
    const stake = relation.attributes?.stake;
    group.rows.push({ id: relation.id, name, prior: stake?.prior ?? null, current: stake?.current ?? null, note: relation.attributes?.note ?? null });
    group.orders.set(relation.id, relation.attributes?.order ?? Number.MAX_SAFE_INTEGER);
  }

  const desc = (a: string | null, b: string | null) => (b ?? "").localeCompare(a ?? "");
  result.filings = [...groups.values()]
    .sort((a, b) => desc(a.receivedOn, b.receivedOn) || desc(a.period, b.period) || desc(a.rceptNo, b.rceptNo))
    .map(({ orders, ...filing }) => ({
      ...filing,
      rows: filing.rows.toSorted((a, b) => orders.get(a.id)! - orders.get(b.id)! || a.id.localeCompare(b.id)),
    }));
  for (const filing of result.filings) {
    const factId = subsidiaryFactId(company.id, filing.period);
    const fact = company.facts.find(f => f.id === factId);
    if (!fact || result.suppressedFactIds.has(factId) || !filing.evidenceIds.every(id => fact.evidenceIds.includes(id))) continue;
    result.omittedFactIds.add(factId);
    result.factLinks.set(factId, `#${filingAnchor(filing.rceptNo)}`);
  }
}

/** The company as the fact list and the timeline see it: facts a `claim` correction retracted are gone. */
export function withoutSuppressedFacts(company: CompanyResearch, subsidiaries: CompanySubsidiaries): CompanyResearch {
  if (!subsidiaries.suppressedFactIds.size) return company;
  return { ...company, facts: company.facts.filter(fact => !subsidiaries.suppressedFactIds.has(fact.id)) };
}

function Stake({ row, period }: { row: SubsidiaryRow; period: string }) {
  if (row.prior === null && row.current === null) return <p className="relation-stake">지분 표기 없음(-)</p>;
  return (
    <p className="relation-stake">
      지분 <span className="relation-value">{endOf(priorOf(period))} {stakeText(row.prior)}</span>
      <span className="visually-hidden">에서 </span>{" "}
      <span className="relation-value">
        <span aria-hidden="true">→ </span>
        {endOf(period)} {stakeText(row.current)}
      </span>
      <span className="visually-hidden">{row.current === null ? "으로" : "로"}</span>
    </p>
  );
}

function Filing({ company, filing, id }: { company: CompanyResearch; filing: SubsidiaryFiling; id?: string }) {
  return (
    <div className="relation-filing" id={id}>
      <div className="fact-meta relation-filing-meta">
        <span>
          <strong>{filing.title}</strong>
          {filing.receivedOn && <> · 공시 <RelDate value={filing.receivedOn} /></>} · 지분이 바뀐 종속기업만 실려 있어요
        </span>
        <Citations company={company} ids={filing.evidenceIds} />
      </div>
      <ul className="relation-rows">
        {filing.rows.map(row => (
          <li key={row.id}>
            <span className="relation-org">{row.name}</span>
            <Stake row={row} period={filing.period} />
            {row.note && <p className="relation-note">보고서 비고: “{row.note}”</p>}
            {row.note && row.note.length >= STORED_NOTE_MAX && (
              <div className="fact-meta">
                <span>비고 앞부분만 저장돼 있어요</span>
                <Citations company={company} ids={filing.evidenceIds} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 종속기업 지분 변화: one group per filing, newest open, older ones behind one
 * native disclosure. Rows are list items in the report's table order. No
 * operating-entity row and no identifiers; nothing renders without rows.
 */
export function CompanyRelationsBlock({ company, filings }: { company: CompanyResearch; filings: SubsidiaryFiling[] }) {
  if (!filings.length) return null;
  const [newest, ...older] = filings;
  return (
    <div id="company-relations" className="company-relations">
      <h3>종속기업 지분 변화</h3>
      <p className="research-caption">종속기업은 운영 법인과 다른 법인이에요.</p>
      <Filing company={company} filing={newest} id={filingAnchor(newest.rceptNo)} />
      {older.length > 0 && (
        <>
          {/* Timeline links to older filings land on the closed disclosure itself; one element holds one id. */}
          {older.slice(1).map(filing => <span key={filing.rceptNo} id={filingAnchor(filing.rceptNo)} className="relation-anchor" />)}
          <RestorableDetails className="relation-older" id={filingAnchor(older[0].rceptNo)}>
            <summary>이전 공시 {older.length}건</summary>
            {older.map(filing => <Filing key={filing.rceptNo} company={company} filing={filing} />)}
          </RestorableDetails>
        </>
      )}
    </div>
  );
}
