import type { Metadata } from "next";
import { brand } from "./brand";
import { searchRobots } from "./search-indexing";

// Synthetic review edition: never emit production canonical URLs.
export const siteUrl = "http://127.0.0.1:3100";
export const searchBrand = `${brand.koreanName} (${brand.name})`;
export const siteTitle = `${searchBrand} — ${brand.tagline}`;
export const siteDescription = `${brand.koreanName}에서 서울·판교의 회사와 팀을 알아보세요. 사업 방향과 인재상, 회사 변화와 공식 채용 공고를 출처와 함께 살펴보세요.`;
/** Website identity, not a new company fact store. Render on the home redirect target. */
export const websiteIdentity = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${siteUrl}/#website`,
  url: `${siteUrl}/`,
  name: brand.koreanName,
  alternateName: brand.name,
  inLanguage: "ko-KR",
} as const;
const image = {
  url: `${siteUrl}${brand.shareImage}`, width: 1200, height: 630,
  alt: `${brand.name} · ${brand.koreanName} — ${brand.tagline}`,
};
export function shareMetadata(title = siteTitle, description = siteDescription, path = "/"): Metadata {
  const shareTitle = title === siteTitle ? title : `${title} | ${searchBrand}`;
  return {
    description,
    alternates: { canonical: `${siteUrl}${path}` },
    robots: searchRobots(),
    openGraph: {
      title: shareTitle, description, siteName: brand.koreanName, locale: "ko_KR",
      type: "website", url: `${siteUrl}${path}`, images: [image],
    },
    twitter: { card: "summary_large_image", title: shareTitle, description, images: [image] },
  };
}
