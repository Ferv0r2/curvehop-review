import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/share-metadata";
import { searchIsPublic } from "@/lib/search-indexing";

export default function robots(): MetadataRoute.Robots {
  if (!searchIsPublic()) return { rules: { userAgent: "*", disallow: "/" } };
  // Let crawlers see noindex on excluded HTML pages. Do not block CSS/images.
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      // Free-tier budget: retain search discovery; decline these observed bulk crawlers.
      // Cooperative policy only. Enforcement before SSR belongs in the platform firewall.
      { userAgent: ["MJ12bot", "AhrefsBot", "GoogleOther"], disallow: "/" },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
