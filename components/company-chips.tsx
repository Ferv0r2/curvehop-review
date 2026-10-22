import { COMPANY_AGE_NOTE } from "@/lib/company-age";
import type { CompanyBasics } from "@/lib/company-basics";

/** Small text chips; unknown basics are omitted, never shown as guesses. */
export function CompanyChips({ basics, keys = ["domain", "founded", "stage"] }: { basics?: CompanyBasics; keys?: (keyof CompanyBasics)[] }) {
  const values = keys.map((key) => basics?.[key]).filter((value): value is string => !!value);
  if (!values.length) return null;
  return (
    <ul className="company-chips" aria-label="회사 기본 정보">
      {values.map((value) => (
        <li key={value}>{value}{value === basics?.founded && basics.foundedAge && <span title={COMPANY_AGE_NOTE}> ({basics.foundedAge})</span>}</li>
      ))}
    </ul>
  );
}
