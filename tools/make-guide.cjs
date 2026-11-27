// Prints the player field guide (tools/guide.html) to docs/zombie-idle-field-guide.pdf.
// Usage: start the dev server (npx vite --port 5174), then: node tools/make-guide.cjs [http://localhost:5174] [--png <dir>]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const base = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:5174';
  const b = await chromium.launch(); const errors = [];
  const p = await b.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 2 });
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${base}/tools/guide.html`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.guideReady, null, { timeout: 60000 });
  const out = path.join(__dirname, '..', 'docs', 'zombie-idle-field-guide.pdf');
  await p.pdf({ path: out, width: '8.5in', height: '11in', printBackground: true, preferCSSPageSize: true });
  const pi = process.argv.indexOf('--png');
  if (pi > 0) for (const [i, el] of (await p.$$('.page')).entries()) await el.screenshot({ path: path.join(process.argv[pi + 1], `guide-p${i + 1}.png`) });
  console.log('wrote', out, errors.length ? errors : '');
  await b.close();
})();
