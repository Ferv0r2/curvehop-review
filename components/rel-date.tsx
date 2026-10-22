import { absoluteDate, relativeAge } from "@/lib/relative-date";

/**
 * A date read by its age: "3일 전" with the absolute date in parentheses
 * (or only in the tooltip when `compact`, for repeated check dates whose
 * absolute value is listed in the sources).
 */
export function RelDate({ value, compact = false, now }: { value: string; compact?: boolean; now?: Date }) {
  const rel = relativeAge(value, now);
  const abs = absoluteDate(value);
  return (
    <time dateTime={value} title={abs} className="rel-date">
      {rel ?? abs}
      {rel && !compact ? ` (${abs})` : ""}
    </time>
  );
}
