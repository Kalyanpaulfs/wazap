const origin = (process.env.SEO_ORIGIN || "https://wazap.lt").replace(/\/$/, "");
const sitemapOrigin = (process.env.SEO_SITEMAP_ORIGIN || origin).replace(/\/$/, "");
const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 WazapSEOAudit/1.0";

function textTag(html, pattern) {
  return html.match(pattern)?.[1]?.replace(/\s+/g, " ").trim() || "";
}

async function get(path) {
  const response = await fetch(`${origin}${path}`, { headers: { "user-agent": userAgent } });
  return { response, body: await response.text() };
}

async function auditPage(url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers: { "user-agent": userAgent }, redirect: "follow" });
    const html = await response.text();
    if (response.status !== 503 || attempt === 2) return { response, html };
    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }
}

const robots = await get("/robots.txt");
const sitemapResponse = await fetch(`${sitemapOrigin}/sitemap.xml`, { headers: { "user-agent": userAgent } });
const sitemap = { response: sitemapResponse, body: await sitemapResponse.text() };
const canonicalUrls = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const failures = [];
const warnings = [];

if (!robots.response.ok || !/Sitemap:\s*https:\/\/wazap\.lt\/sitemap\.xml/i.test(robots.body)) failures.push("robots.txt is unavailable or missing the sitemap directive");
if (!sitemap.response.ok || canonicalUrls.length === 0) failures.push("sitemap.xml is unavailable or empty");

const results = [];
for (const canonicalUrl of canonicalUrls) {
  const canonicalLocation = new URL(canonicalUrl);
  const targetUrl = `${origin}${canonicalLocation.pathname}${canonicalLocation.search}`;
  const { response, html } = await auditPage(targetUrl);
  const title = textTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1] || "";
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)/i)?.[1]
    || html.match(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i)?.[1] || "";
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const indexable = !/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html);
  results.push({ url: canonicalUrl, status: response.status, title, description, canonical, h1Count, indexable });
}

for (const page of results) {
  if (page.status !== 200) failures.push(`${page.url}: HTTP ${page.status}`);
  if (!page.title) failures.push(`${page.url}: missing title`);
  else if (page.title.length < 20 || page.title.length > 65) warnings.push(`${page.url}: review title display length ${page.title.length}`);
  if (!page.description) failures.push(`${page.url}: missing description`);
  // Google has no fixed character limit; width and writing system affect snippets.
  const cjk = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(page.description);
  if (page.description && (page.description.length < (cjk ? 35 : 70) || page.description.length > (cjk ? 100 : 170))) warnings.push(`${page.url}: review description display length ${page.description.length}`);
  if (page.canonical !== page.url) failures.push(`${page.url}: canonical is ${page.canonical || "missing"}`);
  if (page.h1Count !== 1) failures.push(`${page.url}: expected one H1, found ${page.h1Count}`);
  if (!page.indexable) failures.push(`${page.url}: sitemap URL is noindex`);
}

const duplicateTitles = Object.entries(Object.groupBy(results, (page) => page.title)).filter(([title, pages]) => title && pages.length > 1);
for (const [title, pages] of duplicateTitles) failures.push(`duplicate title on ${pages.length} pages: ${title}`);

console.log(JSON.stringify({ origin, audited: results.length, failures, warnings }, null, 2));
if (failures.length) process.exitCode = 1;
