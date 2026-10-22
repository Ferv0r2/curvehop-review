// architecture.html을 overview.png·request.png로 캡처하고 좁은 화면의 가로 넘침을 검사한다.
// 저장소 의존성에 브라우저를 넣지 않으므로 저장소 밖에 설치한 playwright-core 경로를 받는다.
//   npm i --prefix /tmp/pw playwright-core@1.63.0
//   /tmp/pw/node_modules/.bin/playwright-core install chromium-headless-shell
//   PLAYWRIGHT_CORE=/tmp/pw/node_modules/playwright-core/index.mjs node docs/architecture/capture.mjs
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = process.env.PLAYWRIGHT_CORE;
if (!entry) {
  console.error("PLAYWRIGHT_CORE에 playwright-core의 index.mjs 경로를 지정하세요. 설치 방법은 이 파일 첫 주석에 있습니다.");
  process.exit(1);
}
const { chromium } = await import(pathToFileURL(entry).href);
const url = pathToFileURL(join(here, "architecture.html")).href;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  for (const [selector, name] of [["#overview", "overview.png"], ["#request", "request.png"]]) {
    await page.locator(selector).screenshot({ path: join(here, name) });
  }
  for (const width of [390, 1280]) {
    const narrow = await browser.newPage({ viewport: { width, height: 900 } });
    await narrow.goto(url);
    const overflow = await narrow.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) throw new Error(`${width}px에서 가로 넘침 ${overflow}px`);
    await narrow.close();
  }
  console.log("overview.png, request.png 갱신 · 390/1280px 가로 넘침 없음");
} finally {
  await browser.close();
}
