// Captures the feature screenshots used by the quick-start guide (assets/guide/*.webp).
//
// A demo account is seeded into the browser's local storage (built with the app's own src/lib code, so every
// number on screen is real app math) and Supabase is blocked, so nothing touches real data. Re-run after UI
// changes:
//   npm run build:web
//   npx tsx scripts/guide-screenshots.mjs
// Needs Google Chrome or Microsoft Edge installed.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

import { customFoodToItem } from '../src/lib/custom-foods.ts';
import { addDays, toDateKey } from '../src/lib/dates.ts';
import { buildEntry } from '../src/lib/entries.ts';
import { makeFavorite } from '../src/lib/favorites.ts';
import { makeIngredient, recipeToItem } from '../src/lib/recipes.ts';
import { GRAMS_PER_OUNCE, poundsToKg } from '../src/lib/units.ts';

const PORT = 8097;
const DEBUG_PORT = 9333;
const OUT = resolve('assets/guide');
const USER = '00000000-0000-4000-8000-00000000d3e0';
const PREFIX = `mt:v1:${USER}:`;

// ---------- Demo data ----------

const food = (name, per100g, servings = [], brand = null) => ({
  source: 'usda',
  sourceId: String(Math.abs([...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7))),
  name,
  brand,
  per100g,
  servings,
  caloriesDerived: false,
});
const egg = food('Eggs, Grade A, Large, egg whole', { calories: 148, protein: 12.4, carbs: 1, fat: 9.96 }, [{ label: '1 large', grams: 50 }]);
const toast = food('Bread, sourdough, toasted', { calories: 293, protein: 11.6, carbs: 55.6, fat: 2 }, [{ label: '1 slice', grams: 40 }]);
const banana = food('Banana, raw', { calories: 97, protein: 0.74, carbs: 22.7, fat: 0.28 }, [{ label: '1 banana', grams: 126 }]);
const chicken = food('Chicken breast, grilled without sauce, skin not eaten', { calories: 176, protein: 29.6, carbs: 0, fat: 5.5 }, [
  { label: '1 medium breast', grams: 120 },
]);
const bar = food('Protein Bar, Chocolate Chip Cookie Dough', { calories: 333, protein: 35, carbs: 36.7, fat: 15 }, [{ label: '1 bar (60 g)', grams: 60 }], 'Quest');
const sausage = food('Italian sausage', { calories: 317, protein: 18.2, carbs: 2.16, fat: 26.2 });
const pasta = food('Pasta, dry, enriched', { calories: 371, protein: 13.04, carbs: 74.67, fat: 1.51 });
const tomatoes = food('Tomatoes, crushed, canned', { calories: 32, protein: 1.64, carbs: 7.3, fat: 0.28 });
const cream = food('Cream, heavy', { calories: 343, protein: 2.02, carbs: 3.8, fat: 35.56 }, [{ label: '1 cup', grams: 240 }]);
const parm = food('Cheese, parmesan, grated', { calories: 420, protein: 28.42, carbs: 13.91, fat: 27.84 });

const oz = (n) => ({ quantity: n, unit: 'oz' });
const serving = (f, n = 1) => ({ quantity: n, unit: 'serving', serving: f.servings[0] });

const recipe = {
  id: '11111111-2222-4333-8444-555555555555',
  name: 'Sausage pasta',
  ingredients: [
    makeIngredient(sausage, oz(8)),
    makeIngredient(pasta, oz(8)),
    makeIngredient(tomatoes, oz(16)),
    makeIngredient(cream, serving(cream, 0.5)),
    makeIngredient(parm, { quantity: 100, unit: 'g' }),
  ],
  servings: 4,
  cookedGrams: 1450,
  updatedAt: new Date().toISOString(),
};
const poke = {
  id: '66666666-7777-4888-8999-aaaaaaaaaaaa',
  name: 'Poke bowl',
  brand: 'Ono Seafood',
  servingLabel: '1 bowl',
  servingGrams: null,
  calories: 690,
  protein: 42,
  carbs: 74,
  fat: 22,
  updatedAt: new Date().toISOString(),
};
const pastaItem = recipeToItem(recipe);
const pokeItem = customFoodToItem(poke);

const today = toDateKey(new Date());
let n = 0;
const entry = (date, meal, f, portion, hour) =>
  buildEntry({
    id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    date,
    meal,
    food: f,
    portion,
    createdAt: new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).toISOString(),
  });

// Today plus the six days before it, so the week's average is meaningful.
const cache = {};
for (let d = 0; d < 7; d++) {
  const date = addDays(today, -d);
  const day = [
    entry(date, 'breakfast', egg, serving(egg, 2), 7),
    entry(date, 'breakfast', toast, serving(toast, 1), 7),
    entry(date, 'breakfast', banana, serving(banana, 1), 7),
    entry(date, 'lunch', d % 2 ? chicken : pokeItem, d % 2 ? oz(6) : serving(pokeItem, 1), 12),
    entry(date, 'snacks', bar, serving(bar, 1), 15),
  ];
  // Today's dinner hasn't happened yet in the screenshot; other days had the pasta.
  if (d > 0) day.push(entry(date, 'dinner', pastaItem, oz(d % 3 ? 6 : 8), 19));
  cache[date] = day;
}
// Lunch first, so the screenshot shows the custom food and the recipe right away.
cache[today].push(entry(today, 'dinner', pastaItem, oz(6), 19));

// Six weeks of weigh-ins trending down with day-to-day noise.
const weighIns = [];
for (let d = 44; d >= 0; d--) {
  if (d % 9 === 4) continue; // a few missed days
  const lb = 191 - (44 - d) * 0.16 + Math.sin(d * 1.7) * 0.9;
  weighIns.push({ date: addDays(today, -d), weightKg: poundsToKg(Math.round(lb * 10) / 10), note: null });
}

const storage = {
  [`${PREFIX}profile`]: {
    pending: false,
    profile: {
      unitSystem: 'imperial',
      sex: 'female',
      age: 31,
      heightCm: 165,
      weightKg: poundsToKg(184),
      activityLevel: 'moderate',
      goal: 'lose',
      targets: { calories: 1900, protein: 140, carbs: 180, fat: 68 },
    },
  },
  [`${PREFIX}entries`]: cache,
  [`${PREFIX}queue`]: [],
  [`${PREFIX}weights`]: weighIns,
  [`${PREFIX}weight-queue`]: [],
  [`${PREFIX}favorites`]: [makeFavorite(chicken, oz(6), new Date().toISOString())],
  [`${PREFIX}favorites-queue`]: [],
  [`${PREFIX}custom-foods`]: [poke],
  [`${PREFIX}custom-foods-queue`]: [],
  [`${PREFIX}recipes`]: [recipe],
  [`${PREFIX}recipes-queue`]: [],
  [`${PREFIX}onboarding`]: { dismissed: true, assistantSeen: true },
};
const exp = Math.floor(Date.now() / 1000) + 3600;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const session = {
  access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER, exp, role: 'authenticated', email: 'demo@example.com' })}.demo`,
  refresh_token: 'demo',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: exp,
  user: { id: USER, email: 'demo@example.com', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
};

// ---------- Serve dist/ like Vercel (clean URLs) ----------

const root = resolve('dist');
if (!existsSync(join(root, 'index.html'))) throw new Error('Run `npm run build:web` first.');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = join(root, p);
  if (p.endsWith('/')) f = join(f, 'index.html');
  else if (!existsSync(f) || statSync(f).isDirectory()) f = existsSync(`${f}.html`) ? `${f}.html` : join(root, '+not-found.html');
  res.setHeader('Content-Type', types[extname(f)] ?? 'application/octet-stream');
  createReadStream(f).pipe(res);
}).listen(PORT);

// ---------- Headless browser over the DevTools protocol ----------

const browserPath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find(existsSync);
if (!browserPath) throw new Error('Chrome or Edge not found.');
const profileDir = mkdtempSync(join(tmpdir(), 'mt-shots-'));
const browser = spawn(browserPath, [
  '--headless=new',
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--hide-scrollbars',
  'about:blank',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error('Browser did not start.');
}
const ws = new WebSocket(await connect());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, (msg) => (msg.error ? rej(new Error(`${method}: ${msg.error.message}`)) : res(msg.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

await send('Network.enable');
await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
await send('Page.enable');

const base = `http://localhost:${PORT}`;
const go = async (path, wait = 2500) => {
  await send('Page.navigate', { url: base + path });
  await sleep(wait);
};
const click = async (label) => {
  const ok = await evaluate(`(() => {
    const el = [...document.querySelectorAll('[aria-label], [role=button]')].find((e) => e.getAttribute('aria-label') === ${JSON.stringify(label)} || e.innerText?.trim() === ${JSON.stringify(label)});
    if (!el) return false; el.click(); return true; })()`);
  if (!ok) throw new Error(`Nothing labelled "${label}"`);
  await sleep(1200);
};
const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'webp', quality: 82 });
  writeFileSync(join(OUT, `${name}.webp`), Buffer.from(data, 'base64'));
  console.log('saved', name);
};

// Seed the demo account (on the app's origin), then capture each screen.
await go('/sign-in', 1500);
await evaluate(`(() => {
  localStorage.clear();
  const data = ${JSON.stringify(storage)};
  for (const [k, v] of Object.entries(data)) localStorage.setItem(k, JSON.stringify(v));
  localStorage.setItem('sb-tinhkknfvikqaxsumksy-auth-token', ${JSON.stringify(JSON.stringify(session))});
})()`);
mkdirSync(OUT, { recursive: true });

await go('/', 3500);
await shot('log');

await go('/add?meal=dinner');
await shot('add');
await click('Choose Chicken breast, grilled without sauce, skin not eaten');
await shot('portion');

await go('/add?meal=dinner');
await click('Choose Sausage pasta');
await evaluate(`(() => { const t = [...document.querySelectorAll('[role=button]')].find((e) => e.innerText?.includes('Ingredients in this portion')); t?.click(); })()`);
await sleep(800);
// Scroll down to the batch weight, the share of the batch and the ingredient breakdown.
await evaluate(`(() => {
  const heading = [...document.querySelectorAll('div')].find((d) => d.innerText === 'This batch weighed');
  let el = heading;
  while (el && !(el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY !== 'visible')) el = el.parentElement;
  if (el && heading) el.scrollTop += heading.getBoundingClientRect().top - 90;
})()`);
await sleep(500);
await shot('recipe-log');

await click('Edit recipe');
await shot('recipe-editor');

await go('/weight', 3000);
await shot('weight');

ws.close();
browser.kill();
server.close();
await sleep(500);
try {
  rmSync(profileDir, { recursive: true, force: true });
} catch {}
console.log('done', readFileSync(join(OUT, 'log.webp')).length > 0 ? '' : '(empty?)');
