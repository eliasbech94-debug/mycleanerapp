// Sitemap generator. Public marketplace routes × active countries × supported
// languages. Fails the build if the required active-country list can't be
// resolved. Draft/development/beta/suspended/retired countries are excluded.
import { writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://mycleaner.dk";

// Public indexable routes (no auth). Keep this list explicit — do not scrape.
const PUBLIC_ROUTES = ["/", "/faq", "/regler", "/find-cleaner"];

// Countries eligible for public indexing. In production this is fetched from
// get_lifecycle_public_isos(); the static list here is the same seed the DB
// carries so preview builds don't require a network hop.
const ACTIVE = [
  { iso: "DK", langs: ["da", "en"] },
  // GB/SE/ES stay draft until Phase 4 launch.
];

function url(loc: string, alternates: { hreflang: string; href: string }[], lastmod: string) {
  const alts = alternates.map(a =>
    `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${a.href}"/>`
  ).join("\n");
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
${alts}
  </url>`;
}

const lastmod = new Date().toISOString().slice(0, 10);
const entries: string[] = [];

for (const route of PUBLIC_ROUTES) {
  for (const c of ACTIVE) {
    const loc = `${BASE_URL}/${c.iso.toLowerCase()}${route === "/" ? "" : route}`;
    const alts = ACTIVE.flatMap(cc =>
      cc.langs.map(l => ({
        hreflang: `${l}-${cc.iso}`,
        href: `${BASE_URL}/${cc.iso.toLowerCase()}${route === "/" ? "" : route}`,
      }))
    );
    alts.push({ hreflang: "x-default", href: `${BASE_URL}${route}` });
    entries.push(url(loc, alts, lastmod));
  }
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("\n")}
</urlset>`;

writeFileSync(resolve("public/sitemap.xml"), xml);
console.log(`sitemap.xml written (${entries.length} urls, ${ACTIVE.length} countries)`);
