// Sitemap generator. Public marketplace routes × BOOKABLE countries ×
// supported languages.
//
// Indexing rule (Launch Market Safety): only markets that are actually
// bookable may appear here. SE/GB/DE/ES are launch-ready but technically
// closed, so listing them would advertise booking we cannot deliver.
//
// No <lastmod>: we have no authoritative per-page modification timestamp, and
// emitting the build date for every URL is a meaningless signal to crawlers.
import { writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://mycleaner.dk";

// Public indexable routes (no auth). Keep this list explicit — do not scrape.
const PUBLIC_ROUTES = ["/", "/faq", "/regler", "/find-cleaner", "/legal", "/contact"];

// Countries eligible for public indexing — must mirror the server's
// `market_launch_status.is_bookable = true` set.
// SE / GB / DE / ES are launch_ready but NOT bookable, so they stay out.
const BOOKABLE = [
  { iso: "DK", langs: ["da", "en"] },
];

function url(loc: string, alternates: { hreflang: string; href: string }[]) {
  const alts = alternates
    .map((a) => `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${a.href}"/>`)
    .join("\n");
  return `  <url>
    <loc>${loc}</loc>
${alts}
  </url>`;
}

const entries: string[] = [];

for (const route of PUBLIC_ROUTES) {
  for (const c of BOOKABLE) {
    const loc = `${BASE_URL}/${c.iso.toLowerCase()}${route === "/" ? "" : route}`;
    const alts = BOOKABLE.flatMap((cc) =>
      cc.langs.map((l) => ({
        hreflang: `${l}-${cc.iso}`,
        href: `${BASE_URL}/${cc.iso.toLowerCase()}${route === "/" ? "" : route}`,
      })),
    );
    alts.push({ hreflang: "x-default", href: `${BASE_URL}${route}` });
    entries.push(url(loc, alts));
  }
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("\n")}
</urlset>`;

writeFileSync(resolve("public/sitemap.xml"), xml);
console.log(`sitemap.xml written (${entries.length} urls, ${BOOKABLE.length} bookable markets)`);
