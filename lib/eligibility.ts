import type { Job, Location } from "./jobs";

// Only explicit workplaces count. Country names, descriptions and company HQs
// are not evidence that this particular position is based in Seoul or Pangyo.
export function classifyLocation(label: string): Location {
  const locations = label.split(/;|\n|\s\/\s/);
  for (const location of locations) {
    if (/remote|원격|재택|home[ -]?based|except|excluding|제외/i.test(location))
      continue;
    if (/\b(?:USA?|United States|Virginia|North Korea)\b/i.test(location))
      continue;
    if (/\bpangyo\b|판교/i.test(location)) return "pangyo";
    if (/\bseoul\b|서울/i.test(location)) return "seoul";
  }
  return "global";
}

export function isInScope(
  job: Pick<Job, "locationLabel" | "title" | "workplaceType">,
): boolean {
  return (
    job.workplaceType !== "remote" &&
    classifyLocation(job.locationLabel) !== "global" &&
    !/인재풀|talent (?:pool|community)|expression of interest|general application|future opportunities/i.test(
      job.title,
    )
  );
}

/**
 * A directional Gyeonggi hiring tag paired only with a Seoul HQ is conflicting
 * evidence, not proof of that vacancy's workplace. Preserve the observation,
 * but do not advertise it or use it to register a new board. Broad/mixed areas,
 * untagged sales territories and Pangyo labels are outside this narrow check.
 */
export function hasLocationConflict(job: Pick<Job, "title" | "locationLabel">): boolean {
  const tag = job.title.match(/^\s*\[([^\]\r\n]{1,40})\]/)?.[1].replace(/\s/g, "");
  return !!tag && /^경기(?:동북|동남|서북|서남|북|남|동|서|중)부$/.test(tag)
    && /본사|\bheadquarters\b|\bHQ\b/i.test(job.locationLabel)
    && classifyLocation(job.locationLabel) === "seoul"
    && !/[;\n]|\s\/\s/.test(job.locationLabel);
}

// Vacancy presentation is narrower than collection: retain the source record
// for auditing and future reclassification, but do not advertise a referral form.
export function isVacancy(
  job: Pick<
    Job,
    | "locationLabel"
    | "title"
    | "workplaceType"
    | "source"
    | "sourceBoard"
    | "sourceJobId"
  >,
): boolean {
  return (
    isInScope(job) &&
    !hasLocationConflict(job) &&
    !(
      job.source === "greeting" &&
      ((job.sourceBoard === "modusign" && job.sourceJobId === "159341") ||
        (job.sourceBoard === "buzzvil" &&
          (job.sourceJobId === "95941" || job.sourceJobId === "117804")))
    )
  );
}
