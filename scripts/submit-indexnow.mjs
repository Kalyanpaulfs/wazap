const origin = (process.env.SEO_ORIGIN || "https://wazap.lt").replace(/\/$/, "");
const key = process.env.INDEXNOW_KEY || "9e4d6bc71a8f42f3b562d7944f1d7f24";
const sitemap = await fetch(`${origin}/sitemap.xml`, { headers: { "user-agent": "Wazap-IndexNow/1.0" } });
if (!sitemap.ok) throw new Error(`Could not load sitemap: HTTP ${sitemap.status}`);
const xml = await sitemap.text();
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (!urlList.length) throw new Error("Sitemap has no URLs");
const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(origin).host, key, keyLocation: `${origin}/${key}.txt`, urlList }),
});
if (!response.ok) throw new Error(`IndexNow rejected the submission: HTTP ${response.status}`);
console.log(`Submitted ${urlList.length} URLs to IndexNow (HTTP ${response.status}).`);
