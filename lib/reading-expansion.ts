import pack from "../data/company-research.json";
import type { ReadingTopic } from "./reading";

// The review snapshot's known routes stay addressable when a runtime data read
// fails. Publication metadata remains on the guide; no second editorial store.
export const additionalReadingConfiguration: Record<string, { companyId: string; topic: ReadingTopic; preview: string }> = Object.fromEntries(
  pack.companies.flatMap(company => company.guides.map(guide => [guide.id, {
    companyId: company.id, topic: guide.publication.topic as ReadingTopic, preview: guide.publication.preview,
  }]))
);
export const additionalReadingConnections: Record<string, { id: string; reason: string }[]> = {};
