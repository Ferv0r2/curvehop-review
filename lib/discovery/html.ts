/**
 * A forward-only HTML tokenizer for discovery. Every helper here walks the
 * document once with a cursor (indexOf and single character scans), so time
 * is linear in the page size whatever the page contains. Pages are size-capped
 * but untrusted; regex parsing of them (lazy `[\s\S]*?` blocks, `<[^>]+>` with
 * many `<`) can go quadratic and block every worker's timers.
 *
 * Rules, close to what a browser does on broken markup:
 * - `<` not followed by a tag name (or `/name`, `!`, `?`) is text.
 * - A tag ends at the first `>` outside quotes. A tag with no such `>` makes
 *   the rest of the document text (tag scanning ends); an unclosed quote in a
 *   tag consumes the rest of the document.
 * - `<!-- … -->` is skipped; an unclosed comment runs to the end.
 * - Raw-text elements (script, style, textarea, title) are not parsed for
 *   tags: their content runs to the matching close tag (found with indexOf on
 *   an ASCII-lowercased copy made once, same length as the page); unclosed
 *   means the rest of the document.
 *   noscript and template are parsed normally (their markup is real markup
 *   here, as the earlier regex parsing treated it).
 */

import { asciiLower } from "../ascii";

export type Attrs = Record<string, string>;
type OpenTag = { name: string; attrs: Attrs; selfClosing: boolean };
type Visitor = {
  text?: (text: string) => void;
  open?: (tag: OpenTag) => void;
  close?: (name: string) => void;
  /** Content of a raw-text element (script, style, textarea, title), with its open tag. */
  raw?: (tag: OpenTag, content: string) => void;
};

const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);
const isNameStart = (c: number) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
const isNameChar = (c: number) => isNameStart(c) || (c >= 48 && c <= 57) || c === 45 || c === 58 || c === 95;
const isSpace = (c: number) => c === 32 || c === 9 || c === 10 || c === 12 || c === 13;

/** Attributes of one tag's inner text (after the name), in one pass; names lowercased, the first of a name wins. */
export function parseAttributes(text: string): Attrs {
  const attrs: Attrs = {};
  const n = text.length;
  let i = 0;
  while (i < n) {
    while (i < n && (isSpace(text.charCodeAt(i)) || text[i] === "/")) i++;
    if (i >= n) break;
    const nameStart = i;
    while (i < n && !isSpace(text.charCodeAt(i)) && text[i] !== "=" && text[i] !== "/" && text[i] !== ">") i++;
    const name = asciiLower(text.slice(nameStart, i));
    if (i === nameStart) { i++; continue; }
    while (i < n && isSpace(text.charCodeAt(i))) i++;
    let value = "";
    if (text[i] === "=") {
      i++;
      while (i < n && isSpace(text.charCodeAt(i))) i++;
      const quote = text[i];
      if (quote === '"' || quote === "'") {
        const end = text.indexOf(quote, i + 1);
        value = text.slice(i + 1, end < 0 ? n : end);
        i = end < 0 ? n : end + 1;
      } else {
        const start = i;
        while (i < n && !isSpace(text.charCodeAt(i))) i++;
        value = text.slice(start, i);
      }
    }
    if (name && !(name in attrs)) attrs[name] = value;
  }
  return attrs;
}

/** Walks the document once, calling the visitor for text, tags and raw-text element contents. */
export function walkHtml(html: string, visit: Visitor): void {
  const n = html.length;
  let lower: string | null = null;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) { if (i < n) visit.text?.(html.slice(i)); return; }
    if (lt > i) visit.text?.(html.slice(i, lt));
    const next = html.charCodeAt(lt + 1);
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      if (end < 0) return; // the rest is a comment
      i = end + 3;
      continue;
    }
    if (next === 33 /* ! */ || next === 63 /* ? */) { // doctype, CDATA, processing instruction
      const end = html.indexOf(">", lt + 2);
      if (end < 0) { visit.text?.(html.slice(lt)); return; }
      i = end + 1;
      continue;
    }
    const closing = next === 47; /* / */
    let p = lt + (closing ? 2 : 1);
    if (!isNameStart(html.charCodeAt(p))) { visit.text?.("<"); i = lt + 1; continue; }
    const nameStart = p;
    while (p < n && isNameChar(html.charCodeAt(p))) p++;
    const name = asciiLower(html.slice(nameStart, p));
    // The tag's end: the first '>' outside quotes, one forward scan.
    const attrStart = p;
    let quote = 0;
    while (p < n) {
      const c = html.charCodeAt(p);
      if (quote) { if (c === quote) quote = 0; }
      else if (c === 34 || c === 39) quote = c;
      else if (c === 62 /* > */) break;
      p++;
    }
    if (p >= n) {
      if (quote) return; // an unclosed quote consumes the rest
      visit.text?.(html.slice(lt)); // no '>' at all: the rest is text
      return;
    }
    const inner = html.slice(attrStart, p);
    i = p + 1;
    if (closing) { visit.close?.(name); continue; }
    const selfClosing = inner.trimEnd().endsWith("/");
    const tag: OpenTag = { name, attrs: visit.open || visit.raw ? parseAttributes(inner) : {}, selfClosing };
    visit.open?.(tag);
    if (RAW_TEXT.has(name) && !selfClosing) {
      lower ??= asciiLower(html);
      const close = lower.indexOf(`</${name}`, i);
      const content = html.slice(i, close < 0 ? n : close);
      visit.raw?.(tag, content);
      if (close < 0) return;
      const gt = html.indexOf(">", close);
      if (gt < 0) return;
      visit.close?.(name);
      i = gt + 1;
    }
  }
}

/**
 * Text a reader sees: tags become spaces, script and style contents are
 * dropped, other raw-text contents (title, textarea) are kept. Entities are
 * left as they are (callers decode what they need).
 */
export function visibleText(html: string): string {
  const parts: string[] = [];
  walkHtml(html, {
    text: text => parts.push(text),
    open: () => parts.push(" "),
    close: () => parts.push(" "),
    raw: (tag, content) => { if (tag.name !== "script" && tag.name !== "style") parts.push(content); },
  });
  return parts.join("");
}

/** Inline elements: rendered without a break, so text on both sides runs together ("…/<wbr>123", "사업자<span>번호</span>"). */
const INLINE = new Set(["a", "abbr", "b", "bdi", "bdo", "cite", "code", "data", "del", "dfn", "em", "font", "i", "ins", "kbd", "label", "mark", "nobr", "q", "rp", "rt", "ruby", "s", "samp", "small", "span", "strike", "strong", "sub", "sup", "time", "tt", "u", "var", "wbr"]);
/**
 * Named character references (seventh audit on 6f9e7ac), in three kinds:
 * - spaces (nbsp, ensp, emsp, thinsp, Tab, NewLine, …): the space they name, read as a space;
 * - the dashes and the punctuation a URL, a label or a number is written with (colon, sol, quest, num,
 *   equals, amp, percnt, period, comma, lpar, rpar, hyphen, dash, ndash, mdash, minus, …): that character;
 * - the invisible characters (shy, ZeroWidthSpace, zwj, zwnj, NoBreak, lrm, rlm, …): that character, dropped
 *   like the raw one, so a reference reads exactly as the character it names.
 * Every other name, valid (`&eacute;`) or not, is one visible non-space character (U+FFFD): it breaks no
 * URL or word, and a number it sits in is no longer a number. The legacy names a browser resolves without
 * the semicolon follow the same rule.
 */
// Own keys only (eighth audit on a7992b4): an inherited name such as &constructor; or &toString; is an ordinary
// unlisted name, one visible character, not an Object.prototype member.
const namedReference = (name: string) => Object.hasOwn(NAMED, name) ? NAMED[name] : OTHER_NAME;
const NAMED: Readonly<Record<string, string>> = {
  nbsp: "\u00a0", NonBreakingSpace: "\u00a0", ensp: "\u2002", emsp: "\u2003", emsp13: "\u2004", emsp14: "\u2005", numsp: "\u2007",
  puncsp: "\u2008", thinsp: "\u2009", ThinSpace: "\u2009", hairsp: "\u200a", VeryThinSpace: "\u200a", MediumSpace: "\u205f",
  ThickSpace: "\u205f\u200a", Tab: "\t", NewLine: "\n",
  ZeroWidthSpace: "\u200b", NegativeVeryThinSpace: "\u200b", NegativeThinSpace: "\u200b", NegativeMediumSpace: "\u200b", NegativeThickSpace: "\u200b",
  zwnj: "\u200c", zwj: "\u200d", lrm: "\u200e", rlm: "\u200f", NoBreak: "\u2060", shy: "\u00ad", af: "\u2061", ApplyFunction: "\u2061",
  it: "\u2062", InvisibleTimes: "\u2062", ic: "\u2063", InvisibleComma: "\u2063",
  amp: "&", AMP: "&", lt: "<", LT: "<", gt: ">", GT: ">", quot: '"', QUOT: '"', apos: "'", colon: ":", sol: "/", bsol: "\\", quest: "?",
  num: "#", equals: "=", percnt: "%", plus: "+", period: ".", comma: ",", semi: ";", excl: "!", commat: "@", lpar: "(", rpar: ")",
  lsqb: "[", lbrack: "[", rsqb: "]", rbrack: "]", lcub: "{", lbrace: "{", rcub: "}", rbrace: "}", lowbar: "_", UnderBar: "_", ast: "*",
  midast: "*", dollar: "$", Hat: "^", grave: "`", verbar: "|", vert: "|", VerticalLine: "|",
  hyphen: "\u2010", dash: "\u2010", ndash: "\u2013", mdash: "\u2014", horbar: "\u2015", minus: "\u2212",
};
const OTHER_NAME = "\ufffd";
/** The names HTML resolves without a semicolon (the ISO-8859-1 set), longest first so a prefix match takes the longest. */
const LEGACY = ("AElig AMP Aacute Acirc Agrave Aring Atilde Auml COPY Ccedil ETH Eacute Ecirc Egrave Euml GT Iacute Icirc Igrave Iuml LT "
  + "Ntilde Oacute Ocirc Ograve Oslash Otilde Ouml QUOT REG THORN Uacute Ucirc Ugrave Uuml Yacute aacute acirc acute aelig agrave amp "
  + "aring atilde auml brvbar ccedil cedil cent copy curren deg divide eacute ecirc egrave eth euml frac12 frac14 frac34 gt iacute icirc "
  + "iexcl igrave iquest iuml laquo lt macr micro middot nbsp not ntilde oacute ocirc ograve ordf ordm oslash otilde ouml para plusmn "
  + "pound quot raquo reg sect shy sup1 sup2 sup3 szlig thorn times uacute ucirc ugrave uml uuml yacute yen yuml").split(" ").sort((a, b) => b.length - a.length);
/** HTML's numeric-reference fix-ups for 0x80–0x9F (Windows-1252), per the HTML standard. */
const WINDOWS_1252: Readonly<Record<number, number>> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030,
  0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
  0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};
const REFERENCE = /&(?:#[xX]([0-9a-fA-F]+);?|#([0-9]+);?|([A-Za-z][A-Za-z0-9]{0,31});|([A-Za-z][A-Za-z0-9]{0,31}))/g;
/** A numeric reference as the HTML standard resolves it: 0, surrogates and values past U+10FFFF are U+FFFD; 0x80–0x9F map through Windows-1252. */
function numericReference(written: string, radix: 10 | 16): string {
  // Leading zeros never change the value; more than eight significant places is always past U+10FFFF.
  const significant = written.replace(/^0+/, "");
  const value = significant.length > 8 ? Infinity : significant ? parseInt(significant, radix) : 0;
  if (!(value > 0) || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return "\ufffd";
  return String.fromCodePoint(WINDOWS_1252[value] ?? value);
}
/** Every character reference resolved: decimal, hexadecimal (HTML's numeric rules) and named (the three kinds above). */
export function decodeCharacterReferences(text: string): string {
  return text.replace(REFERENCE, (whole, hex: string | undefined, dec: string | undefined, named: string | undefined, bare: string | undefined) => {
    if (hex !== undefined) return numericReference(hex, 16);
    if (dec !== undefined) return numericReference(dec, 10);
    if (named !== undefined) return namedReference(named);
    const legacy = LEGACY.find(name => bare!.startsWith(name));
    return legacy ? namedReference(legacy) + bare!.slice(legacy.length) : whole;
  });
}
/** Characters that render with no width and no break: soft hyphen, zero-width space/joiners, marks, word joiner, invisible operators, BOM. */
const INVISIBLE = /[\u00ad\u200b-\u200f\u2060-\u2064\ufeff]/g;
/**
 * Text as a reader sees it rendered, for reading what a page declares (lib/discovery/homepage-sources.ts
 * businessNumbersDeclared): character references resolved (`decodeCharacterReferences`), compatibility forms
 * folded (NFKC: full-width digits and punctuation), invisible characters dropped, inline elements run together,
 * block elements, `<br>` and unknown elements a space, every Unicode space one space; script and style dropped,
 * title and textarea kept. One pass over the page, then linear string passes. `visibleText` and its callers are
 * unchanged.
 */
export function renderedText(html: string): string {
  const parts: string[] = [];
  const tag = (name: string) => parts.push(INLINE.has(name) ? "" : " ");
  walkHtml(html, {
    text: text => parts.push(decodeCharacterReferences(text)),
    open: ({ name }) => tag(name),
    close: name => tag(name),
    raw: (open, content) => { if (open.name !== "script" && open.name !== "style") parts.push(decodeCharacterReferences(content)); },
  });
  return parts.join("").normalize("NFKC").replace(INVISIBLE, "").replace(/\s+/g, " ");
}

export type Anchor = { href: string; attrs: Attrs; text: string; labels: string[] };
const LABEL_ATTRS = ["alt", "aria-label", "title"];

/**
 * `<a>` and `<area>` links. An anchor's text runs until its `</a>`, the next
 * `<a`/`<area`, or the end. `labels` are the alt, aria-label and title values
 * of tags inside the anchor, then of the anchor itself.
 */
export function anchors(html: string): Anchor[] {
  const found: Anchor[] = [];
  let current: { attrs: Attrs; text: string[]; inner: string[] } | null = null;
  const finish = () => {
    if (!current) return;
    const own = LABEL_ATTRS.map(name => current!.attrs[name]).filter((v): v is string => !!v);
    found.push({ href: current.attrs.href ?? "", attrs: current.attrs, text: current.text.join(""), labels: [...current.inner, ...own] });
    current = null;
  };
  walkHtml(html, {
    text: text => current?.text.push(text),
    open: tag => {
      if (tag.name === "a" || tag.name === "area") {
        finish();
        if (tag.name === "area" || tag.attrs.href === undefined) {
          if (tag.attrs.href !== undefined) found.push({ href: tag.attrs.href, attrs: tag.attrs, text: "", labels: LABEL_ATTRS.map(name => tag.attrs[name]).filter((v): v is string => !!v) });
          return;
        }
        current = { attrs: tag.attrs, text: [], inner: [] };
        return;
      }
      if (current) {
        current.text.push(" ");
        for (const name of LABEL_ATTRS) if (tag.attrs[name]) current.inner.push(tag.attrs[name]);
      }
    },
    close: name => { if (name === "a") finish(); else current?.text.push(" "); },
    raw: (tag, content) => { if (current && tag.name !== "script" && tag.name !== "style") current.text.push(content); },
  });
  finish();
  return found;
}

/** Contents of `<script>` elements whose id and/or type equal the given values (type compared case-insensitively). */
export function scriptBlocks(html: string, filter: { id?: string; type?: string } = {}): string[] {
  const blocks: string[] = [];
  walkHtml(html, {
    raw: (tag, content) => {
      if (tag.name !== "script") return;
      if (filter.id !== undefined && tag.attrs.id !== filter.id) return;
      if (filter.type !== undefined && (tag.attrs.type ?? "").trim().toLowerCase() !== filter.type.toLowerCase()) return;
      blocks.push(content);
    },
  });
  return blocks;
}

/** Open tags with the given names, with their attributes. */
export function elements(html: string, names: string[]): { name: string; attrs: Attrs }[] {
  const wanted = new Set(names.map(name => name.toLowerCase()));
  const found: { name: string; attrs: Attrs }[] = [];
  walkHtml(html, { open: tag => { if (wanted.has(tag.name)) found.push({ name: tag.name, attrs: tag.attrs }); } });
  return found;
}

/** The document's `<base href>`, if any. */
export function baseHref(html: string): string | null {
  return elements(html, ["base"]).find(base => base.attrs.href)?.attrs.href ?? null;
}

/** Values between `<name>` and `</name>` (ASCII case-insensitive tag), with indexOf only. For sitemap and simple XML. */
export function xmlValues(xml: string, name: string): string[] {
  const lower = asciiLower(xml);
  const open = `<${asciiLower(name)}>`, close = `</${asciiLower(name)}>`;
  const values: string[] = [];
  let i = 0;
  while (true) {
    const start = lower.indexOf(open, i);
    if (start < 0) break;
    const end = lower.indexOf(close, start + open.length);
    if (end < 0) break;
    values.push(xml.slice(start + open.length, end));
    i = end + close.length;
  }
  return values;
}
