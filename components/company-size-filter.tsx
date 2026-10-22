import Link from "@/components/navigation-link";
import { SIZE_BANDS, UNKNOWN_SIZE_LABEL, type SizeFilter } from "@/lib/company-size-bands";

/** URL-based list choices; saved preferences and the underlying size classification stay unchanged. */
export function CompanySizeFilter({ sizes, href }: {
  sizes: SizeFilter[];
  href: (sizes: SizeFilter[]) => string;
}) {
  const choices: { id: SizeFilter; label: string }[] = [...SIZE_BANDS, { id: "unknown", label: UNKNOWN_SIZE_LABEL }];
  return <nav className="company-size-filter" aria-label="회사 규모">
    <div className="size-filter-heading"><strong>회사 규모</strong><span>여러 구간 선택 가능</span></div>
    <ul className="size-filter-options">
      <li><Link href={href([])} scroll={false} aria-current={!sizes.length ? "true" : undefined}>전체</Link></li>
      {choices.map(choice => {
        const selected = sizes.includes(choice.id);
        const next = selected ? sizes.filter(size => size !== choice.id) : [...sizes, choice.id];
        return <li key={choice.id}><Link href={href(next)} scroll={false} aria-current={selected ? "true" : undefined}
          aria-label={`${choice.label}${selected ? " 선택됨, 선택 해제" : " 포함"}`}>{choice.label}</Link></li>;
      })}
    </ul>
    <p>국민연금 가입자 수 기준으로, 전체 직원 수와 다를 수 있어요.</p>
  </nav>;
}
