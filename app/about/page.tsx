import "./about.css";
import { AnalyticsPage } from "@/components/analytics";
import { connection } from "next/server";
import { readRenderResearch } from "@/lib/render-data";
import { readPublishedSnapshotState } from "@/lib/published-data";
import { shareMetadata } from "@/lib/share-metadata";
import { ABOUT_DESCRIPTION } from "@/lib/product-intro";
import { aboutMockup } from "@/lib/about-mockup";
import { ResearchUnavailable } from "@/components/research-view";
import { AboutMotion } from "@/components/about-motion";
import { AboutHero, FinalCta, GraphSection, HowItWorks, NumbersBand, Principles, SourceOverview } from "@/components/product-intro";
import { ProductPreviewSection } from "@/components/product-preview";
import { aboutData } from "./data";

export const metadata = { title: "제품 소개", description: ABOUT_DESCRIPTION, ...shareMetadata("제품 소개", ABOUT_DESCRIPTION, "/about") };

/** The explorer needs the research: when it cannot be read, the same notice as the company pages, in the landing's section frame. */
function UnavailableGraph() {
  return (
    <section className="about-section about-graph" aria-label="지식 망">
      <div className="about-inner"><ResearchUnavailable href="/about" /></div>
    </section>
  );
}

export default async function AboutPage() {
  await connection();
  const [research, jobs] = await Promise.all([readRenderResearch(), readPublishedSnapshotState().catch(() => null)]);
  // A missing or unreadable jobs file is unknown, not zero postings (DESIGN.md 제품 소개).
  const snapshot = jobs?.available ? jobs.snapshot : null;
  // Real numbers from the listed companies (./data.ts); the hero and preview mockups are the labelled example company.
  const { stats, layout } = aboutData(research, snapshot);
  const mockup = aboutMockup(new Date());
  return (
    <div className="about-landing">
      <AnalyticsPage page={{ page_type: "about" }} />
      <AboutMotion />
      <AboutHero mockup={mockup} />
      <ProductPreviewSection mockup={mockup} />
      <NumbersBand stats={stats} />
      {research.status === "ok" && <SourceOverview stats={stats} />}
      <HowItWorks />
      {research.status === "ok" ? <GraphSection layout={layout} /> : <UnavailableGraph />}
      <Principles />
      <FinalCta stats={stats} />
    </div>
  );
}
