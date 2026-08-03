#!/usr/bin/env node
/**
 * Production-build smoke test.
 *
 * Serves the built `dist/` output and loads a representative set of routes in a
 * real Chromium browser. Fails (exit code 1) on:
 *   - Blank screens (no rendered text / empty #root)
 *   - Uncaught runtime errors (pageerror)
 *   - React initialization errors ("Cannot read properties of undefined (reading 'createContext')" etc.)
 *   - Failed lazy-route imports ("Importing a module script failed", 404 on a JS chunk)
 *
 * Usage:  npm run build && node scripts/prod-smoke.mjs
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { readdirSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';

/** Resolve a Chromium binary: bundled one, or any installed build in the browsers dir. */
function resolveChromium() {
  try {
    if (existsSync(chromium.executablePath())) return undefined; // bundled build is fine
  } catch { /* not installed */ }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/ms-playwright';
  if (!existsSync(root)) return undefined;
  for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const candidate = join(root, dir, 'chrome-linux', 'chrome');
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const DIST = resolve(process.cwd(), 'dist');
const PORT = Number(process.env.SMOKE_PORT || 4183);

const ROUTES = (process.env.SMOKE_ROUTES || [
  '/',
  '/login',
  '/find-cleaner',
  '/legal',
  '/help',
  '/bliv-cleaner',
  '/dk/find-cleaner',
  '/this-route-does-not-exist',
].join(',')).split(',');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
};

/** Static file server with SPA fallback (mirrors Lovable hosting behaviour). */
async function startServer() {
  const server = createServer(async (req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let filePath = join(DIST, urlPath);
    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = join(filePath, 'index.html');
    } catch {
      // Asset requests must 404 so failed lazy imports are detectable.
      if (extname(urlPath)) {
        res.writeHead(404).end('not found');
        return;
      }
      filePath = join(DIST, 'index.html');
    }
    try {
      const body = await readFile(filePath);
      res.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(500).end('server error');
    }
  });
  await new Promise((r) => server.listen(PORT, r));
  return server;
}

const REACT_INIT_PATTERNS = [
  /reading '?createContext'?/i,
  /reading '?useState'?/i,
  /reading '?useLayoutEffect'?/i,
  /Cannot access '\w+' before initialization/i,
  /is not a function.*react/i,
];

const LAZY_IMPORT_PATTERNS = [
  /Importing a module script failed/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
];

async function main() {
  try {
    await stat(join(DIST, 'index.html'));
  } catch {
    console.error('[smoke] dist/index.html not found - run the production build first.');
    process.exit(1);
  }

  const server = await startServer();
  const executablePath = resolveChromium();
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const failures = [];

  for (const route of ROUTES) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    const failedAssets = [];

    page.on('pageerror', (err) => errors.push(String(err?.message || err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('response', (res) => {
      const url = res.url();
      if (res.status() >= 400 && /\.(js|css|mjs)(\?|$)/.test(url)) failedAssets.push(`${res.status()} ${url}`);
    });

    const url = `http://localhost:${PORT}${route}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      // Wait for hydration/lazy chunks instead of networkidle: auth and realtime
      // sockets keep the network busy indefinitely on some routes.
      await page.waitForFunction(
        () => {
          const root = document.getElementById('root');
          return !!root && (root.innerText || '').trim().length > 10;
        },
        undefined,
        { timeout: 30_000 },
      );
      await page.waitForTimeout(750);
    } catch (err) {
      failures.push(`${route}: navigation failed - ${err.message}`);
      await context.close();
      continue;
    }

    // Blank screen detection: #root must exist and contain rendered content.
    const rendered = await page.evaluate(() => {
      const root = document.getElementById('root');
      if (!root) return { hasRoot: false, nodes: 0, text: 0 };
      return {
        hasRoot: true,
        nodes: root.querySelectorAll('*').length,
        text: (root.innerText || '').trim().length,
      };
    });

    if (!rendered.hasRoot) failures.push(`${route}: #root element missing`);
    else if (rendered.nodes < 5 || rendered.text < 10) {
      failures.push(`${route}: blank screen (nodes=${rendered.nodes}, textLength=${rendered.text})`);
    }

    for (const message of errors) {
      if (REACT_INIT_PATTERNS.some((p) => p.test(message))) failures.push(`${route}: React init error - ${message}`);
      else if (LAZY_IMPORT_PATTERNS.some((p) => p.test(message))) failures.push(`${route}: lazy-route import failed - ${message}`);
      else if (/^Failed to load resource/.test(message)) continue;
      // The app intentionally logs a 404 for unknown routes; the NotFound page still renders.
      else if (/404 Error: User attempted to access non-existent route/.test(message)) continue;
      else failures.push(`${route}: uncaught error - ${message}`);
    }
    for (const asset of failedAssets) failures.push(`${route}: JS/CSS asset failed - ${asset}`);

    if (!failures.some((f) => f.startsWith(`${route}:`))) {
      console.log(`[smoke] OK  ${route} (nodes=${rendered.nodes})`);
    }
    await context.close();
  }

  await browser.close();
  server.close();

  if (failures.length) {
    console.error(`\n[smoke] FAILED with ${failures.length} issue(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\n[smoke] PASSED - ${ROUTES.length} routes rendered without errors.`);
}

main().catch((err) => {
  console.error('[smoke] unexpected failure:', err);
  process.exit(1);
});
