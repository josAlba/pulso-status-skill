#!/usr/bin/env node
// Regenerates the README images in docs/screenshots from the demo server.
//
//   node scripts/screenshots.mjs            every image
//   node scripts/screenshots.mjs hero dark  only the ones named
//
// Needs Node 22+ (built-in WebSocket), Google Chrome or Chromium (set CHROME=/path/to/binary
// if it isn't found) and, for the animated diagram, ffmpeg on the PATH.
// Chrome is driven over the DevTools protocol: each view is rendered live inside a framed
// browser window (or a phone) and captured, so the images always match the template.

import {spawn, spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/screenshots');
const PORT = Number(process.env.PORT || 4174);
const DEMO = `http://localhost:${PORT}`;
const ADDRESS = 'shop.example.com/admin/system/health';
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/* ── What to capture ──────────────────────────────────────────────────────── */
const SHOTS = {
  hero: () => browserShot({path: '/?scenario=ko&theme=light', pad: 72, height: 800}),
  infrastructure: () => browserShot({path: '/?scenario=ko&theme=light#infra', height: 960}),
  detail: () => browserShot({path: '/?scenario=ko&theme=light#processes/stock'}),
  'detail-infra': () => browserShot({path: '/?scenario=ko&theme=light#infra/gateway'}),
  events: () => browserShot({path: '/?scenario=ko&theme=light#events'}),
  dark: () => browserShot({path: '/?scenario=ok&theme=dark#infra', theme: 'dark', height: 960}),
  mobile: () => phoneShot([
    {path: '/?scenario=ko&theme=light'},
    {path: '/?scenario=ok&theme=dark', theme: 'dark'},
  ]),
  diagram: () => animation({path: '/?scenario=ok&theme=light', seconds: 6.8, fps: 20}),
};

/* ── Frames ───────────────────────────────────────────────────────────────── */
const BACKDROP = `
  background:
    radial-gradient(900px 520px at 18% -10%, rgb(74 118 140 / .55), transparent 65%),
    radial-gradient(800px 520px at 100% 110%, rgb(23 147 95 / .22), transparent 60%),
    linear-gradient(160deg, #1b2b35 0%, #0e171d 100%);`;

function windowPage({src, width, height, pad, theme, address}) {
  const dark = theme === 'dark';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; }
    body { width: ${width + pad * 2}px; height: ${height + 40 + pad * 2}px; display: grid; place-items: center; ${BACKDROP} }
    .window { border-radius: 12px; overflow: hidden; background: ${dark ? '#0f181e' : '#edf1f3'};
      box-shadow: 0 0 0 1px rgb(255 255 255 / ${dark ? '.12' : '.08'}), 0 50px 100px -30px rgb(0 0 0 / .7), 0 18px 36px -12px rgb(0 0 0 / .45); }
    .bar { height: 40px; display: grid; grid-template-columns: 90px 1fr 90px; align-items: center;
      background: ${dark ? '#1a262e' : '#e3e9ed'}; border-bottom: 1px solid ${dark ? '#2a3a44' : '#cfd8de'}; }
    .dots { display: flex; gap: 8px; padding-left: 16px; }
    .dots i { width: 12px; height: 12px; border-radius: 50%; }
    .dots i:nth-child(1) { background: #ff5f57; } .dots i:nth-child(2) { background: #febc2e; } .dots i:nth-child(3) { background: #28c840; }
    .address { justify-self: center; display: flex; align-items: center; justify-content: center; gap: 7px; width: min(560px, 70%); height: 26px;
      border-radius: 8px; background: ${dark ? '#0f181e' : '#fbfcfd'}; color: ${dark ? '#93a3ad' : '#5b6b75'};
      font: 500 13px/1 -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .01em; }
    .address svg { width: 11px; height: 11px; fill: none; stroke: currentColor; stroke-width: 2; }
    img { display: block; width: ${width}px; height: ${height}px; }
  </style></head><body>
    <div class="window">
      <div class="bar"><div class="dots"><i></i><i></i><i></i></div>
        <div class="address"><svg viewBox="0 0 12 12"><rect x="2" y="5.5" width="8" height="5.5" rx="1.2"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5"/></svg>${address}</div></div>
      <img src="${src}" alt="">
    </div>
  </body></html>`;
}

const STATUS_ICONS = '<svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>'
  + '<svg viewBox="0 0 27 12"><rect x=".5" y=".5" width="22" height="11" rx="3.2" fill="none" stroke="currentColor" opacity=".4"/><rect x="2.5" y="2.5" width="18" height="7" rx="1.8"/><rect x="24" y="4" width="1.6" height="4" rx=".8" opacity=".4"/></svg>';

function phonePage(screens, {pad = 64, gap = 72} = {}) {
  const w = 390, h = 844, bezel = 12;
  const phones = screens.map(({src, theme}) => `
    <div class="phone ${theme === 'dark' ? 'dark' : ''}"><div class="screen">
      <div class="status"><span>9:41</span><span class="icons">${STATUS_ICONS}</span></div>
      <iframe src="${src}"></iframe></div><span class="island"></span></div>`).join('');
  const width = screens.length * (w + bezel * 2) + (screens.length - 1) * gap + pad * 2;
  return {width, height: h + bezel * 2 + pad * 2, html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; }
    body { width: ${width}px; height: ${h + bezel * 2 + pad * 2}px; display: flex; align-items: center; justify-content: center; gap: ${gap}px; ${BACKDROP} }
    .phone { position: relative; padding: ${bezel}px; border-radius: 58px; background: #05090c;
      box-shadow: inset 0 0 0 2px #2c3a43, 0 0 0 1px rgb(255 255 255 / .1), 0 50px 100px -30px rgb(0 0 0 / .75); }
    .screen { width: ${w}px; height: ${h}px; overflow: hidden; border-radius: 46px; background: #edf1f3; color: #15232d; }
    .dark .screen { background: #0f181e; color: #e6edf1; }
    .status { height: 54px; display: flex; align-items: center; justify-content: space-between; padding: 4px 34px 0 42px; box-sizing: border-box;
      font: 600 16px/1 -apple-system, 'Segoe UI', system-ui, sans-serif; }
    .icons { display: flex; gap: 6px; align-items: center; }
    .icons svg { height: 12px; fill: currentColor; }
    .screen iframe { display: block; width: ${w}px; height: ${h - 54}px; border: 0; }
    .island { position: absolute; top: ${bezel + 11}px; left: 50%; width: 120px; height: 34px; margin-left: -60px; border-radius: 20px; background: #05090c; }
  </style></head><body>${phones}</body></html>`};
}

/* ── Chrome over the DevTools protocol ────────────────────────────────────── */
function findChrome() {
  const candidates = [
    process.env.CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  for (const path of candidates) if (existsSync(path)) return path;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const found = spawnSync('which', [name], {encoding: 'utf8'}).stdout.trim();
    if (found) return found;
  }
  throw new Error('Chrome not found. Set CHROME=/path/to/chrome.');
}

async function launch(profile) {
  const chrome = spawn(findChrome(), [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb', '--disable-gpu', 'about:blank',
  ], {stdio: 'ignore'});
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  const [port, path] = (await readFile(portFile, 'utf8')).trim().split('\n');
  const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });

  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.onmessage = ({data}) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const {done, fail} = pending.get(message.id);
      pending.delete(message.id);
      message.error ? fail(new Error(message.error.message)) : done(message.result);
    } else for (const listener of listeners) listener(message);
  };
  const send = (method, params = {}, sessionId) => new Promise((done, fail) => {
    pending.set(++id, {done, fail});
    socket.send(JSON.stringify({id, method, params, sessionId}));
  });
  const waitFor = (method, sessionId) => new Promise((done) => {
    const listener = (message) => {
      if (message.method === method && message.sessionId === sessionId) { listeners.delete(listener); done(message.params); }
    };
    listeners.add(listener);
  });

  const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
  const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});
  const page = (method, params) => send(method, params, sessionId);
  await page('Page.enable');
  return {
    page,
    waitFor: (method) => waitFor(method, sessionId),
    close: () => { socket.close(); chrome.kill(); },
  };
}

/* ── Capture helpers ──────────────────────────────────────────────────────── */
let browser, scratch;

async function render(html, width, height, scale) {
  const file = join(scratch, `frame-${Date.now()}.html`);
  await writeFile(file, html);
  await browser.page('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: scale, mobile: false});
  const loaded = browser.waitFor('Page.loadEventFired');
  await browser.page('Page.navigate', {url: pathToFileURL(file).href});
  await loaded;
  await sleep(1500); // fonts, first layout and wires inside the frames
}

async function capture(name, {format = 'jpeg', quality = 90} = {}) {
  const {data} = await browser.page('Page.captureScreenshot', {format, quality: format === 'jpeg' ? quality : undefined});
  const file = join(OUT, `${name}.${format === 'jpeg' ? 'jpg' : format}`);
  await writeFile(file, Buffer.from(data, 'base64'));
  return file;
}

// The page is captured on its own first and then placed in the window as an image:
// headless Chrome composites backdrop-filter (the modal backdrop) badly inside iframes.
async function browserShot({path, width = 1440, height = 900, pad = 56, theme = 'light'}) {
  const scale = 1.25;
  await browser.page('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: scale, mobile: false});
  const loaded = browser.waitFor('Page.loadEventFired');
  await browser.page('Page.navigate', {url: DEMO + path});
  await loaded;
  await sleep(1800); // fonts, wires and the modal animation
  const {data} = await browser.page('Page.captureScreenshot', {format: 'png'});
  const hash = path.includes('#') ? path.slice(path.indexOf('#')) : '';
  await render(windowPage({src: `data:image/png;base64,${data}`, width, height, pad, theme, address: ADDRESS + hash}),
    width + pad * 2, height + 40 + pad * 2, scale);
  return capture(current);
}

async function phoneShot(screens) {
  const {width, height, html} = phonePage(screens.map(({path, theme}) => ({src: DEMO + path, theme})));
  await render(html, width, height, 2);
  return capture(current);
}

// Animated GIF of the processes diagram: frames are stepped with virtual time, so the
// sparks move at their real speed no matter how long each capture takes.
async function animation({path, seconds, fps}) {
  if (spawnSync('ffmpeg', ['-version']).status !== 0) throw new Error('ffmpeg is needed for the animated diagram.');
  const width = 1440, height = 900;
  await browser.page('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
  const loaded = browser.waitFor('Page.loadEventFired');
  await browser.page('Page.navigate', {url: DEMO + path});
  await loaded;
  await sleep(1500);
  const box = JSON.parse((await browser.page('Runtime.evaluate', {
    expression: `JSON.stringify((() => { const r = document.getElementById('pulso-map').getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; })())`,
    returnByValue: true,
  })).result.value);
  const clip = {x: Math.max(0, box.x - 24), y: Math.max(0, box.y + box.h / 2 - 270), width: Math.min(width, box.w + 48), height: 540, scale: 1};
  const frames = join(scratch, 'frames');
  await mkdir(frames, {recursive: true});
  const total = Math.round(seconds * fps);
  for (let i = 0; i < total; i++) {
    const expired = browser.waitFor('Emulation.virtualTimeBudgetExpired');
    await browser.page('Emulation.setVirtualTimePolicy', {policy: 'pauseIfNetworkFetchesPending', budget: 1000 / fps});
    await expired;
    const {data} = await browser.page('Page.captureScreenshot', {format: 'png', clip});
    await writeFile(join(frames, `${String(i).padStart(4, '0')}.png`), Buffer.from(data, 'base64'));
  }
  const file = join(OUT, 'diagram.gif');
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(frames, '%04d.png'),
    '-vf', 'scale=1200:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    '-loop', '0', file], {stdio: 'inherit'});
  if (result.status !== 0) throw new Error('ffmpeg failed');
  await rm(frames, {recursive: true});
  return file;
}

/* ── Run ──────────────────────────────────────────────────────────────────── */
const wanted = process.argv.slice(2);
const unknown = wanted.filter((name) => !SHOTS[name]);
if (unknown.length) { console.error(`Unknown image: ${unknown.join(', ')}. Choose from: ${Object.keys(SHOTS).join(', ')}`); process.exit(2); }

let current;
scratch = await mkdtemp(join(tmpdir(), 'pulso-shots-'));
await mkdir(OUT, {recursive: true});
const server = spawn(process.execPath, [join(ROOT, 'skills/pulso/scripts/demo-server.mjs'), '--port', String(PORT)], {stdio: 'ignore'});
try {
  await sleep(600);
  browser = await launch(join(scratch, 'profile'));
  for (const name of wanted.length ? wanted : Object.keys(SHOTS)) {
    current = name;
    const file = await SHOTS[name]();
    console.log(`✓ ${file.replace(ROOT + '/', '')}`);
  }
} finally {
  browser?.close();
  server.kill();
  await sleep(200);
  await rm(scratch, {recursive: true, force: true});
}
