/**
 * Lead enrichment: given a business website, fetch a few pages over plain HTTP
 * (no browser) and extract email addresses + social profile links.
 */

const EMAIL_RE =
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const BAD_EMAIL_EXT =
  /\.(png|jpe?g|gif|svg|webp|avif|css|js|ico|bmp|mp4|webm)$/i;

// Template placeholders scraped from boilerplate/landing pages.
const PLACEHOLDER_EMAIL_RE =
  /^(?:user|name|email|yourname|someone)@(?:domain|example|company|email|site)\.(?:com|org|net)$/i;

const SOCIAL_PATTERNS: Record<string, RegExp> = {
  instagram: /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._@/\-]+/i,
  facebook: /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/[A-Za-z0-9._\-/\-?=@%]+/i,
  linkedin: /https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company|business)\/[A-Za-z0-9._%\-\/]+/i,
  twitter: /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[A-Za-z0-9._]+/i,
  youtube: /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:@|channel\/|c\/|user\/)[A-Za-z0-9._%\-]+|youtu\.be\/[A-Za-z0-9\-_]+)/i,
};

const MAX_PAGE_BYTES = 400_000;
const FETCH_TIMEOUT_MS = 12_000;

/** Emails from mailto: links (preferred) and free text, lowercased and deduped. */
export function extractEmails(html: string, pageUrl: string): string[] {
  const found = new Set<string>();

  const mailtoRe = /mailto:([^"'?>\s]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = mailtoRe.exec(html))) {
    addEmail(found, safeDecode(m[1] ?? ""));
  }

  for (const candidate of html.match(EMAIL_RE) ?? []) {
    addEmail(found, candidate.toLowerCase());
  }

  // Drop asset filenames and template placeholders.
  return [...found]
    .filter((e) => !BAD_EMAIL_EXT.test(e) && !PLACEHOLDER_EMAIL_RE.test(e))
    .slice(0, 10);
}

function addEmail(set: Set<string>, email: string) {
  const clean = email.trim().toLowerCase().replace(/[.,;:]+$/, "");
  if (clean.includes("@") && clean.length >= 6 && clean.length <= 100 && !clean.includes("@example.")) {
    set.add(clean);
  }
}

/** First social URL per platform found in the HTML. */
export function extractSocials(html: string): Partial<Record<keyof typeof SOCIAL_PATTERNS, string>> {
  const out: Partial<Record<keyof typeof SOCIAL_PATTERNS, string>> = {};
  for (const [key, re] of Object.entries(SOCIAL_PATTERNS)) {
    for (const candidate of html.match(new RegExp(re.source, "gi")) ?? []) {
      if (!isJunkSocial(candidate)) {
        (out as Record<string, string>)[key] = normalizeSocialUrl(candidate);
        break;
      }
    }
  }
  return out;
}

// XML namespace declarations, embed/config endpoints, and generic widget links
// are not real business profiles.
function isJunkSocial(url: string): boolean {
  const path = new URL(url).pathname.toLowerCase();
  if (/^\/2008\/fbml/.test(path)) return true; // fbml xmlns declaration
  if (/^\/20\d\d\/(og|twitter|schema)/.test(path)) return true;
  if (/^\/(widgets|sharer|share|plugins|dialog|tr|following|following_frame)/.test(path)) return true;
  if (/^\/(p|post)\//.test(path) && /facebook\.com/.test(url)) return true;
  if (/^\/(squarespace|embed|intent|hashtag|search)/.test(path)) return true;
  // Non-profile top-level handles that indicate a chrome/link element, not a page.
  const first = path.split("/").filter(Boolean)[0]?.toLowerCase();
  if (["p", "sharer", "tr", "widgets", "intent", "2008"].includes(first!)) return true;
  // Footer cross-links to the platform's own account (twitter.com/facebook etc.)
  if (["facebook", "twitter", "instagram", "youtube", "google", "t.co", "x"].includes(first!)) return true;
  return false;
}

function normalizeSocialUrl(url: string): string {
  // Strip hash + trailing slash and drop tracking query params for readability.
  try {
    const u = new URL(url);
    u.hash = "";
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url;
  }
}

interface FetchedPage {
  url: string;
  html: string;
}

/**
 * Fetch homepage + likely contact/about pages (relative to the site root).
 * Never follows off-site URLs, caps page size, and swallows per-page errors —
 * a dead site must not fail the whole job.
 */
export async function fetchSitePages(website: string): Promise<FetchedPage[]> {
  const pages: FetchedPage[] = [];
  const candidates = candidateUrls(website);

  for (const url of candidates) {
    const html = await fetchPageHtml(url);
    if (html) pages.push({ url, html });
    if (pages.length >= 3) break;
  }
  return pages;
}

export function candidateUrls(website: string): string[] {
  const urls = [website];
  try {
    const u = new URL(website);
    for (const path of ["/contact", "/contact-us", "/contactus", "/about", "/about-us"]) {
      urls.push(`${u.origin}${path}`);
    }
  } catch {
    /* ignore */
  }
  return urls;
}

async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) return null;

    const reader = res.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let html = "";
    let received = 0;
    while (received < MAX_PAGE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value?.byteLength ?? 0;
      html += decoder.decode(value ?? new Uint8Array(), { stream: true });
    }
    await reader.cancel().catch(() => {});
    return html;
  } catch {
    return null;
  }
}

export interface EnrichmentResult {
  emails: string[];
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  twitter?: string;
  youtube?: string;
}

export function enrichFromPages(pages: FetchedPage[]): EnrichmentResult {
  const allHtml = pages.map((p) => p.html).join("\n");
  const socials = extractSocials(allHtml);
  const emails = extractEmails(allHtml, pages[0]?.url ?? "");
  return { emails, ...socials };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
