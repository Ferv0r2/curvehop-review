import { brand } from "@/lib/brand";
import { routingJobExists, routingReadingState } from "@/lib/published-routing";
import { readingIds } from "@/lib/reading";
import { NextResponse, type NextRequest } from "next/server";
import { companies } from "@/lib/companies";

// Next's render-time notFound recovery may send only a JS bootstrap document.
// Reject missing records before rendering to keep the 404 usable without JS.
export async function proxy(request: NextRequest) {
  const id = request.nextUrl.pathname.split("/").filter(Boolean)[1];
  if (request.nextUrl.pathname.startsWith("/read/")) {
    const state = await routingReadingState(id);
    if (state === "unavailable" && readingIds.includes(id))
      return NextResponse.next();
    if (state === "exists")
      return NextResponse.next();
    return new NextResponse(
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>읽을거리를 찾을 수 없어요 | ${brand.name}</title><style>body{font:16px/1.8 system-ui,sans-serif;color:#172033;margin:0;padding:32px}a{color:#4f50cc;display:inline-flex;align-items:center;min-height:44px}a:focus-visible{outline:3px solid #6263f1;outline-offset:4px}</style></head><body><main><p>404 · ${brand.name}</p><h1>읽을거리를 찾을 수 없어요.</h1><p>다른 질문에서 회사를 알아보세요.</p><a href="/discover">읽을거리로 돌아가기</a></main></body></html>`,
      {
        status: 404,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }
  if (request.nextUrl.pathname.startsWith("/companies/")) {
    if (companies.some((company) => company.id === id))
      return NextResponse.next();
    // Rewriting to a real prerendered page in this Next version resets 404 to
    // the cached page's 200. Respond before rendering, with no user interpolation.
    return new NextResponse(
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>기업을 찾을 수 없어요 | ${brand.name}</title><style>body{font:16px/1.65 system-ui,sans-serif;color:#172033;margin:0;padding:24px}main{max-width:820px;margin:12vh auto}a{color:#4f50cc;display:inline-flex;align-items:center;min-height:44px}a:focus-visible{outline:3px solid #6263f1;outline-offset:4px}h1{font-size:30px}</style></head><body><main><p>404 · ${brand.name}</p><h1>기업을 찾을 수 없어요.</h1><p>주소를 확인하거나 기업 목록에서 다시 찾아보세요.</p><a href="/companies">기업 목록 보기</a></main></body></html>`,
      {
        status: 404,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }
  if (!(await routingJobExists(id)))
    // Same reason as companies: a rewrite to a rendered page loses the 404
    // status or its own <title>. Respond before rendering.
    return new NextResponse(
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>공고를 찾을 수 없어요 | ${brand.name}</title><style>body{font:16px/1.65 system-ui,sans-serif;color:#172033;margin:0;padding:24px}main{max-width:820px;margin:12vh auto}a{color:#4f50cc;display:inline-flex;align-items:center;min-height:44px}a:focus-visible{outline:3px solid #6263f1;outline-offset:4px}h1{font-size:30px}</style></head><body><main><p>404 · ${brand.name}</p><h1>공고를 찾을 수 없어요.</h1><p>주소를 확인하거나 다른 공고를 둘러보세요.</p><a href="/jobs">공고 목록으로</a></main></body></html>`,
      {
        status: 404,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  return NextResponse.next();
}

export const config = { matcher: ["/jobs/:id", "/companies/:id", "/read/:id"] };
