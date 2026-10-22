import { shareMetadata, siteUrl, siteTitle, siteDescription, searchBrand } from "@/lib/share-metadata";
import { brand } from "@/lib/brand";
import type { Metadata } from "next";
import "./fonts/suit-subsets.css";
import "./globals.css";
import Link from "@/components/navigation-link";
import { RequestPreferences } from "@/components/request-preferences";
import { SiteNav } from "@/components/site-nav";
import { CompanyIconsProvider } from "@/components/company-icons";
import { companyIconSources } from "@/lib/company-icon-src";
import { readRenderResearch } from "@/lib/render-data";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: searchBrand,
  ...shareMetadata(),
  title: {
    default: siteTitle,
    template: `%s | ${searchBrand}`,
  },
  description: siteDescription,
  // Public assets keep their URLs across releases. App metadata files append
  // deploymentId, which would change search crawlers' favicon URLs each deploy.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },

};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Collected company icons for every CompanyMark; the same per-request research read the pages use.
  const research = await readRenderResearch().catch(() => null);
  const icons = research?.status === "ok" ? companyIconSources(research.pack) : {};
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>
        <aside className="review-edition-notice" aria-label="검토용 공개판">
          <strong>채용 검토용 공개판</strong><span>회사·공고·근거는 모두 가상 데이터입니다.</span>
          <a href="https://curvehop.net" target="_blank" rel="noreferrer">운영 서비스 보기</a>
        </aside>
        <CompanyIconsProvider icons={icons}>
        <a className="skip-link" href="#main">
          본문으로 바로가기
        </a>
        <header className="site-header">
          <div className="header-inner">
            <Link className="brand" href="/discover" aria-label={`${brand.name} 커브홉 홈`}>
              <img className="brand-wordmark" src={brand.wordmark} alt="" width="180" height="40" />
            </Link>
            <SiteNav />
            {/* The browsing criteria live in the header as one chip; the form opens as a panel. */}
            <RequestPreferences />
          </div>
        </header>
        <main id="main" className="container" tabIndex={-1}>
          {children}
        </main>
        <footer className="site-footer">
          <div className="footer-inner">
            <img className="footer-company-logo" src="/brand/fervorlab.png" alt="운영사 펠보르랩" width="1794" height="500" loading="lazy" decoding="async" />
            <a className="footer-contact" href="mailto:contact@fervorlab.com">
              <span>문의하기</span>
              <span className="footer-contact-email">contact@fervorlab.com</span>
            </a>
            <dl className="footer-business">
              <div><dt>상호</dt><dd>펠보르랩</dd></div>
              <div><dt>대표</dt><dd>황원태</dd></div>
              <div><dt>사업자등록번호</dt><dd>196-63-00757</dd></div>
              <div><dt>통신판매업 신고번호</dt><dd>2025-서울동작-0929</dd></div>
            </dl>
            <div className="footer-meta">
              <nav className="footer-legal" aria-label="약관과 방침">
                <Link href="/terms">이용약관</Link>
                <Link className="footer-privacy" href="/privacy">개인정보처리방침</Link>
              </nav>
              <p className="footer-copyright">© {new Date().getFullYear()} Fervorlab. All rights reserved.</p>
            </div>
          </div>
        </footer>
        </CompanyIconsProvider>
      </body>
    </html>
  );
}
