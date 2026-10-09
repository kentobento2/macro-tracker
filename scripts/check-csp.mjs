// Checks that every inline <script> in the web export (dist/) is allowed by the Content-Security-Policy
// in vercel.json. Expo injects a small inline script; if an upgrade changes it, its hash changes and the
// site would break in production. Run after `npm run build:web`.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
const csp = config.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src ')) ?? '';

const htmlFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : [];
  });

let problems = 0;
for (const file of htmlFiles('dist')) {
  for (const [, body] of readFileSync(file, 'utf8').matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
    if (!scriptSrc.includes(hash)) {
      problems++;
      console.error(`${file}: inline script not allowed by the CSP. Add ${hash} to script-src in vercel.json.`);
    }
  }
}
if (problems) process.exit(1);
console.log('CSP allows every inline script in dist/.');
