import { describe, it, expect } from "vitest";
import { extractEmails, extractSocials, enrichFromPages, candidateUrls } from "../src/enrich.js";

describe("extractEmails", () => {
  it("reads mailto links and plaintext emails, deduped", () => {
    const html = `
      <a href="mailto:Info@Acme.com?subject=hi">mail us</a>
      <p>or write to sales@acme.com</p>
      <p>info@acme.com again</p>
      <img src="logo@2x.png">
    `;
    expect(extractEmails(html, "https://acme.com").sort()).toEqual(["info@acme.com", "sales@acme.com"]);
  });

  it("filters asset-like and example addresses", () => {
    const html = "<p>sprite-1x.png contact@example.com ok@host.co.uk</p>";
    expect(extractEmails(html, "")).toEqual(["ok@host.co.uk"]);
  });
});

describe("extractSocials", () => {
  it("finds one URL per platform and strips tracking", () => {
    const html = `
      <a href="https://www.instagram.com/acme.plumbing/?utm_source=ig_embed">ig</a>
      <a href="https://facebook.com/acme-123">fb</a>
      <a href="https://www.linkedin.com/company/acme-plumbing/">li</a>
    `;
    const s = extractSocials(html);
    expect(s.instagram).toBe("https://www.instagram.com/acme.plumbing");
    expect(s.facebook).toBe("https://facebook.com/acme-123");
    expect(s.linkedin).toBe("https://www.linkedin.com/company/acme-plumbing");
    expect(s.twitter).toBeUndefined();
  });
});

describe("enrichFromPages", () => {
  it("merges emails and socials across pages", () => {
    const out = enrichFromPages([
      { url: "https://acme.com", html: '<a href="mailto:hi@acme.com">hi</a>' },
      { url: "https://acme.com/contact", html: "<a href=\"https://x.com/acme\">tw</a>" },
    ]);
    expect(out.emails).toEqual(["hi@acme.com"]);
    expect(out.twitter).toBe("https://x.com/acme");
  });
});

describe("candidateUrls", () => {
  it("builds origin-level contact/about guesses", () => {
    const urls = candidateUrls("https://acme.com/services/plumbing?utm=x");
    expect(urls[0]).toBe("https://acme.com/services/plumbing?utm=x");
    expect(urls).toContain("https://acme.com/contact");
    expect(urls).toContain("https://acme.com/about");
  });
});

describe("junk filtering (learned from live scrape)", () => {
  it("skips fbml namespace URL, post links and placeholder emails", () => {
    const html = `
      <html xmlns:fb="http://www.facebook.com/2008/fbml">
      <a href="https://www.facebook.com/realbiz">fb</a>
      <p>user@domain.com or hi@real.io</p>
      <a href="https://www.instagram.com/p/Ddl0QE8Fj0z">ig post (not a profile)</a>
      <a href="https://www.instagram.com/realbiz">ig profile</a>
    `;
    expect(extractSocials(html).facebook).toBe("https://www.facebook.com/realbiz");
    expect(extractSocials(html).instagram).toBe("https://www.instagram.com/realbiz");
    expect(extractEmails(html, "")).toEqual(["hi@real.io"]);
  });

  it("skips footer cross-links to the platform's own account", () => {
    const html = `<a href="https://twitter.com/facebook">share</a><a href="https://twitter.com/realbrand">me</a>`;
    expect(extractSocials(html).twitter).toBe("https://twitter.com/realbrand");
  });
});
