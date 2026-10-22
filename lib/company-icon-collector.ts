import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { COMPANY_ICON_MAX_BYTES, validCompanyIcon, wordpressIcon, type CompanyIcon } from "./company-icon";
import { PoliteClient, safeUrl, type Receipt } from "./discovery/http";
import { walkHtml } from "./discovery/html";
import { isSharedHost } from "./discovery/homepage-sources";

export type CompanyIconInput = { homepageUrl: string; homepageHtml: string; discoveryReceiptHash: string; deadline?: number };
export type CompanyIconProof = { selectionVersion?: 2; icon: CompanyIcon; requestUrl: string; finalUrl: string; receipts: Receipt[]; bodyBase64: string };
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const fail = (): never => { throw new Error("ICON_UNSUPPORTED"); };
const crcTable = Array.from({ length: 256 }, (_, i) => {
  let crc = i;
  for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

/** Deliberately bounded PNG subset: 8-bit, non-interlaced, no animation. */
export function validatePng(bytes: Buffer): { width: number; height: number } {
  if (bytes.length > COMPANY_ICON_MAX_BYTES || bytes.length < 45 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return fail();
  let offset = 8, width = 0, height = 0, channels = 0, color = -1, palette = false, ended = false, dataEnded = false;
  const data: Buffer[] = [];
  const metadata = new Set<string>();
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) return fail();
    const length = bytes.readUInt32BE(offset), end = offset + 12 + length;
    if (end > bytes.length) return fail();
    const kind = bytes.toString("ascii", offset + 4, offset + 8), body = bytes.subarray(offset + 8, end - 4);
    if (!/^[A-Za-z]{4}$/.test(kind) || kind[2] !== kind[2].toUpperCase() || crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) return fail();
    if (offset === 8 && kind !== "IHDR") return fail();
    if (kind === "IHDR") {
      if (offset !== 8 || length !== 13) return fail();
      width = body.readUInt32BE(0); height = body.readUInt32BE(4); color = body[9];
      channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color] ?? 0;
      if (width < 16 || width > 256 || height < 16 || height > 256 || body[8] !== 8 || !channels || body[10] || body[11] || body[12]) return fail();
    } else if (kind === "PLTE") {
      if (palette || data.length || !length || length % 3 || length > 768 || color === 0 || color === 4) return fail();
      palette = true;
    } else if (kind === "IDAT") {
      if (dataEnded || (color === 3 && !palette)) return fail();
      data.push(body);
    } else if (kind === "IEND") {
      if (length || !data.length || end !== bytes.length) return fail();
      ended = true;
    } else {
      // Do not pass compressed metadata or animation to a browser decoder.
      // The bounded subset only retains simple, uncompressed metadata.
      if (!["tRNS", "sRGB", "gAMA", "cHRM", "pHYs", "tIME", "tEXt"].includes(kind) || (kind !== "tEXt" && metadata.has(kind))) return fail();
      metadata.add(kind);
      if ((kind === "sRGB" && (length !== 1 || body[0] > 3)) || (kind === "gAMA" && (length !== 4 || !body.readUInt32BE(0)))
        || (kind === "cHRM" && length !== 32) || (kind === "pHYs" && (length !== 9 || body[8] > 1)) || (kind === "tIME" && length !== 7)) return fail();
      if (kind === "tRNS" && (data.length || (color === 0 ? length !== 2 : color === 2 ? length !== 6 : color === 3 ? !palette || !length || length > 256 : true))) return fail();
      if (["sRGB", "gAMA", "cHRM", "pHYs"].includes(kind) && data.length) return fail();
      if (data.length) dataEnded = true;
    }
    offset = end;
  }
  if (!ended) return fail();
  const rowBytes = width * channels + 1, expected = rowBytes * height;
  let raw: Buffer;
  try {
    const compressed = Buffer.concat(data), result = inflateSync(compressed, { maxOutputLength: expected, info: true }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
    if (result.engine.bytesWritten !== compressed.length) return fail();
    raw = result.buffer;
  } catch { return fail(); }
  if (raw.length !== expected) return fail();
  for (let row = 0; row < height; row++) if (raw[row * rowBytes] > 4) return fail();
  return { width, height };
}

/** Only explicit icon links: same host or a tightly bound WordPress image URL. */
export function iconCandidates(html: string, homepageUrl: string, selectionVersion: 1 | 2 = 1): string[] {
  const home = safeUrl(homepageUrl);
  if (!home || isSharedHost(home.hostname) || html.length > 3 * 1024 * 1024) return [];
  const decode = (value: string) => value.replace(/&amp;/gi, "&").replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, dec) => {
    const point = parseInt(hex ?? dec, hex ? 16 : 10);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
  });
  let base = home.href, hasBase = false;
  walkHtml(html, { open: ({ name, attrs }) => {
    if (name === "base" && attrs.href && !hasBase) {
      hasBase = true;
      base = safeUrl(decode(attrs.href), home.href)?.href ?? "";
    }
  } });
  // Keep v1 document order for archived proofs. v2 ranks hints only; bytes still prove PNG.
  const buckets: string[][] = [[], [], []];
  const seen = new Set<string>();
  walkHtml(html, { open: ({ name, attrs }) => {
    if (name !== "link" || !attrs.rel?.toLowerCase().split(/\s+/).some(rel => ["icon", "apple-touch-icon", "apple-touch-icon-precomposed"].includes(rel))) return;
    const href = attrs.href ? decode(attrs.href) : "";
    const url = href ? safeUrl(href, base) : null;
    if (!url || !(url.hostname === home.hostname || wordpressIcon(url, home)) || seen.has(url.href)) return;
    seen.add(url.href);
    const mime = attrs.type?.trim().toLowerCase();
    const png = mime === "image/png" || /\.png$/i.test(url.pathname);
    const unsupported = (!!mime && mime !== "image/png") || /\.(?:svg|ico|jpe?g|webp|gif|avif)$/i.test(url.pathname);
    const rank = selectionVersion === 1 ? 0 : png ? 0 : unsupported ? 2 : 1;
    // Only the first three per rank can enter the bounded final selection.
    if (buckets[rank].length < 3) buckets[rank].push(url.href);
  } });
  return buckets.flat().slice(0, 3);
}

export function verifyCompanyIcon(value: unknown): value is CompanyIcon {
  try {
    if (!validCompanyIcon(value)) return false;
    const bytes = Buffer.from(value.base64, "base64"), size = validatePng(bytes);
    return bytes.toString("base64") === value.base64 && digest(bytes) === value.sha256 && size.width === value.width && size.height === value.height;
  } catch { return false; }
}

/** Whether the icon route serves this icon for `source`: the onboarding receipt, the icon's own receipt and the request agree, and the bytes verify. */
export function servableCompanyIcon(icon: unknown, receiptHash: string | undefined, source: string | null | undefined): icon is CompanyIcon {
  return !!source && receiptHash === source && verifyCompanyIcon(icon) && icon.discoveryReceiptHash === source;
}

/** Only local, validated bytes are served; provenance mismatch never falls back to a URL fetch. */
export function companyIconResponse(icon: unknown, receiptHash: string | undefined, source: string | null): Response {
  if (!servableCompanyIcon(icon, receiptHash, source))
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const bytes = Buffer.from(icon.base64, "base64");
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": "image/png", "Content-Length": String(bytes.length),
    "Cache-Control": "public, max-age=300, must-revalidate", "X-Content-Type-Options": "nosniff", ETag: `"${icon.sha256}"`,
  } });
}

/** Pure replay of selection, constrained redirects and the exact collected bytes. */
export function verifyCollectedCompanyIcon(input: CompanyIconInput, proof: unknown): proof is CompanyIconProof {
  try {
    if (!proof || typeof proof !== "object") return false;
    const p = proof as CompanyIconProof, home = safeUrl(input.homepageUrl);
    if (p.selectionVersion !== undefined && p.selectionVersion !== 2) return false;
    if (!home || !verifyCompanyIcon(p.icon) || p.icon.homepageUrl !== home.href || p.icon.discoveryReceiptHash !== input.discoveryReceiptHash
      || p.icon.sourceUrl !== p.finalUrl || p.bodyBase64 !== p.icon.base64 || !iconCandidates(input.homepageHtml, home.href, p.selectionVersion ?? 1).includes(p.requestUrl)
      || !Array.isArray(p.receipts) || !p.receipts.length || p.receipts.length > 40) return false;
    const request = safeUrl(p.requestUrl)!;
    const cdn = wordpressIcon(request, home);
    for (const receipt of p.receipts) {
      const url = safeUrl(receipt.url);
      if (!url || receipt.error || receipt.truncated) return false;
      if (cdn ? url.origin !== request.origin : url.hostname !== home.hostname) return false;
      if (cdn && receipt.robots?.state !== "robots-file" && !wordpressIcon(url, home)) return false;
    }
    const hops = p.receipts.filter(r => r.robots?.state !== "robots-file");
    if (cdn && (hops.length !== 1 || p.receipts.filter(r => r.robots?.state === "robots-file").length !== 1
      || p.receipts.find(r => r.robots?.state === "robots-file")?.url !== request.origin + "/robots.txt")) return false;
    if (!hops.length || hops.length > 6 || hops[0].url !== p.requestUrl || hops.at(-1)!.url !== p.finalUrl) return false;
    for (let i = 0; i < hops.length; i++) {
      const hop = hops[i];
      if (!["allowed", "no-rules"].includes(hop.robots?.state ?? "")) return false;
      const robots = hop.robots!, robot = p.receipts.find(r => r.robots?.state === "robots-file" && r.url === robots.robotsUrl && r.sha256 === robots.sha256 && r.fetchedAt === robots.checkedAt);
      if (!robot || (robots.state === "allowed" ? !(robot.status! >= 200 && robot.status! < 300) : !(robot.status! >= 400 && robot.status! < 500 && ![401,403,429].includes(robot.status!)))) return false;
      if (i < hops.length - 1 && (!(hop.status! >= 300 && hop.status! < 400) || !hop.location || safeUrl(hop.location, hop.url)?.href !== hops[i + 1].url)) return false;
    }
    const last = hops.at(-1)!, bytes = Buffer.from(p.bodyBase64, "base64");
    return last.status === 200 && !last.location && last.contentType?.split(";")[0].trim().toLowerCase() === "image/png"
      && last.sha256 === p.icon.sha256 && last.bytes === bytes.length;
  } catch { return false; }
}

export async function collectCompanyIcon(input: CompanyIconInput, client = new PoliteClient({ timeoutMs: 5_000 })): Promise<CompanyIconProof> {
  const home = safeUrl(input.homepageUrl), candidates = iconCandidates(input.homepageHtml, input.homepageUrl, 2);
  if (!home || !/^[a-f0-9]{64}$/.test(input.discoveryReceiptHash) || !candidates.length) throw new Error("ICON_NOT_FOUND");
  let network = false;
  for (const requestUrl of candidates) {
    if (input.deadline !== undefined && Date.now() >= input.deadline) throw new Error("ICON_NETWORK");
    const request = safeUrl(requestUrl)!;
    const cdn = wordpressIcon(request, home);
    const page = await client.get(requestUrl, { robots: true, binary: "image/png", accept: "image/png", maxBytes: COMPANY_ICON_MAX_BYTES, timeoutMs: 5_000, allowedHost: request.hostname, ...(cdn ? {allowedOrigin: request.origin, noRedirects: true} : {}), deadline: input.deadline });
    if (["network-error", "rate-limited", "robots-unreachable", "robots-unreadable"].includes(page.outcome)) network = true;
    if (page.outcome !== "ok" || page.status !== 200 || !page.body) continue;
    try {
      const size = validatePng(page.body), base64 = page.body.toString("base64");
      const icon: CompanyIcon = { version: 1, mime: "image/png", base64, sha256: digest(page.body), ...size, sourceUrl: page.finalUrl, homepageUrl: home.href, discoveryReceiptHash: input.discoveryReceiptHash };
      const proof = { selectionVersion: 2 as const, icon, requestUrl, finalUrl: page.finalUrl, receipts: page.receipts, bodyBase64: base64 };
      if (verifyCollectedCompanyIcon(input, proof)) return proof;
    } catch { /* Try at most the remaining explicit candidates. */ }
  }
  throw new Error(network ? "ICON_NETWORK" : "ICON_UNSUPPORTED");
}
