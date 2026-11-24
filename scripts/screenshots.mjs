#!/usr/bin/env node
// Regenerates the README images in docs/screenshots from the demo server.
//
//   node scripts/screenshots.mjs            every image
//   node scripts/screenshots.mjs hero dark  only the ones named
//
// Needs Node 22+ (built-in WebSocket), Google Chrome or Chromium (set CHROME=/path/to/binary
// if it isn't found) and, for the animated tours, ffmpeg on the PATH.
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
  'detail-infra': () => browserShot({path: '/?scenario=ko&theme=light#infra/gateway'}),
  events: () => browserShot({path: '/?scenario=ko&theme=light#events'}),
  dark: () => browserShot({path: '/?scenario=ok&theme=dark#infra', theme: 'dark', height: 960}),
  mobile: () => phoneShot([
    {path: '/?scenario=ko&theme=light'},
    {path: '/?scenario=ok&theme=dark', theme: 'dark'},
  ]),
  'tour-processes': () => tour('processes'),
  'tour-infrastructure': () => tour('infrastructure'),
};

/* ── Frames ───────────────────────────────────────────────────────────────── */
const BACKDROP = `
  background:
    radial-gradient(900px 520px at 18% -10%, rgb(74 118 140 / .55), transparent 65%),
    radial-gradient(800px 520px at 100% 110%, rgb(23 147 95 / .22), transparent 60%),
    linear-gradient(160deg, #1b2b35 0%, #0e171d 100%);`;

// With src = null the page area is left transparent (and the backdrop is cut around it),
// so animated frames can be composited underneath.
function windowPage({src, width, height, pad, theme, address}) {
  const dark = theme === 'dark';
  const W = width + pad * 2, H = height + 40 + pad * 2, x = pad, y = pad + 40, r = 12;
  const hole = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}'><path fill-rule='evenodd' d='M0 0H${W}V${H}H0Z M${x} ${y}H${x + width}V${y + height - r}A${r} ${r} 0 0 1 ${x + width - r} ${y + height}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + height - r}Z'/></svg>`;
  const backdrop = src ? BACKDROP : `background: transparent;`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; }
    body { width: ${W}px; height: ${H}px; display: grid; place-items: center; ${backdrop} }
    .cut { position: fixed; inset: 0; ${BACKDROP} -webkit-mask: url("data:image/svg+xml,${encodeURIComponent(hole)}") 0 0 / 100% 100%; mask: url("data:image/svg+xml,${encodeURIComponent(hole)}") 0 0 / 100% 100%; }
    .window { position: relative; border-radius: 12px; overflow: hidden; background: ${src ? (dark ? '#0f181e' : '#edf1f3') : 'transparent'};
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
    img, .page { display: block; width: ${width}px; height: ${height}px; }
  </style></head><body>
    ${src ? '' : '<div class="cut"></div>'}
    <div class="window">
      <div class="bar"><div class="dots"><i></i><i></i><i></i></div>
        <div class="address"><svg viewBox="0 0 12 12"><rect x="2" y="5.5" width="8" height="5.5" rx="1.2"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5"/></svg>${address}</div></div>
      ${src ? `<img src="${src}" alt="">` : '<div class="page"></div>'}
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

  const browser = {
    // A fresh tab: tours use one each, because Chrome's virtual clock can be set only once per tab.
    async fresh() {
      if (browser.targetId) await send('Target.closeTarget', {targetId: browser.targetId});
      const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
      const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});
      Object.assign(browser, {
        targetId,
        page: (method, params) => send(method, params, sessionId),
        waitFor: (method) => waitFor(method, sessionId),
      });
      await browser.page('Page.enable');
    },
    close: () => { socket.close(); chrome.kill(); },
  };
  await browser.fresh();
  return browser;
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

/* ── Guided tours (animated GIFs) ─────────────────────────────────────────── */
// A tour drives the real page: a visible cursor moves with eased motion, real mouse
// events give hover and click, and frames are stepped with virtual time, so sparks,
// the heartbeat and the modal animation play at their true speed however slow the
// capture is. The frames are then composited into the browser window with ffmpeg.
const CURSOR = `
  const cursor = document.createElement('div');
  cursor.popover = 'manual';
  cursor.style.cssText = 'position:fixed;inset:auto;left:0;top:0;margin:0;padding:0;border:0;background:transparent;overflow:visible;width:26px;height:26px;pointer-events:none;';
  cursor.innerHTML = '<svg width="26" height="26" viewBox="0 0 26 26" style="filter:drop-shadow(0 2px 3px rgb(0 0 0 / .35))"><path d="M5 3v18l4.5-4.2 3.1 6.6 3-1.4-3-6.4h6.2z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const style = document.createElement('style');
  style.textContent = '@keyframes tour-ripple { from { transform: scale(.2); opacity: .55; } to { transform: scale(1); opacity: 0; } }';
  document.head.append(style);
  document.body.append(cursor);
  cursor.showPopover();
  window.__tour = {
    move(x, y) { cursor.style.transform = 'translate(' + (x - 5) + 'px,' + (y - 3) + 'px)'; },
    // Keep the cursor above the modal: re-entering the top layer puts it last.
    sync() {
      const open = document.getElementById('pulso-detail').open;
      if (open && !this.above) { cursor.hidePopover(); cursor.showPopover(); }
      this.above = open;
    },
    ripple() {
      const ring = document.createElement('div');
      ring.style.cssText = 'position:absolute;left:-13px;top:-15px;width:36px;height:36px;border-radius:50%;background:rgb(21 35 45 / .35);animation:tour-ripple .45s ease-out forwards;';
      cursor.prepend(ring);
      setTimeout(() => ring.remove(), 600);
    },
  };`;

const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const TOURS = {
  processes: {path: '/?scenario=ko&theme=light', height: 820, steps: [
    {wait: 1.4},
    {move: '[data-key="stock"] .card-name .open', over: .9}, {wait: .25}, {click: true}, {wait: 2.6},
    {move: '#pulso-detail [data-close]', over: .7}, {wait: .2}, {click: true}, {wait: .6},
    {move: '[data-key="failed"] .card-name .open', over: .9}, {wait: .25}, {click: true}, {wait: 2.4},
    {move: '#pulso-detail [data-close]', over: .7}, {wait: .2}, {click: true}, {wait: .9},
  ]},
  infrastructure: {path: '/?scenario=ko&theme=light#infra', steps: [
    {wait: 1.4},
    {move: '[data-key="disk"] .card-name .open', over: .9}, {wait: .25}, {click: true}, {wait: 2.4},
    {move: '#pulso-detail [data-close]', over: .7}, {wait: .2}, {click: true}, {wait: .6},
    {move: '[data-key="app"] .card-name .open', over: .9}, {wait: .25}, {click: true}, {wait: 2.6},
    {move: '#pulso-detail [data-close]', over: .7}, {wait: .2}, {click: true}, {wait: .9},
  ]},
};

async function tour(name, {width = 1440, pad = 48, fps = 15, outWidth = 1200} = {}) {
  if (spawnSync('ffmpeg', ['-version']).status !== 0) throw new Error('ffmpeg is needed for the animated tours.');
  const {path, steps, height = 900} = TOURS[name];
  const evaluate = async (expression) => (await browser.page('Runtime.evaluate', {expression, returnByValue: true})).result.value;
  const mouse = (type, [x, y]) => browser.page('Input.dispatchMouseEvent', {type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1});

  await browser.fresh();
  // 1. The window around the page, with a transparent hole where the page goes.
  await render(windowPage({src: null, width, height, pad, theme: 'light', address: ADDRESS}),
    width + pad * 2, height + 40 + pad * 2, 1);
  await browser.page('Emulation.setDefaultBackgroundColorOverride', {color: {r: 0, g: 0, b: 0, a: 0}});
  const overlay = join(scratch, 'window.png');
  await writeFile(overlay, Buffer.from((await browser.page('Page.captureScreenshot', {format: 'png'})).data, 'base64'));
  await browser.page('Emulation.setDefaultBackgroundColorOverride', {});

  // 2. The page itself, frame by frame.
  await browser.page('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
  const loaded = browser.waitFor('Page.loadEventFired');
  await browser.page('Page.navigate', {url: DEMO + path});
  await loaded;
  await sleep(1500);
  await evaluate(CURSOR);
  const frames = join(scratch, `frames-${name}`);
  await mkdir(frames, {recursive: true});
  let at = [width - 190, height - 110], index = 0;
  const frame = async () => {
    const expired = browser.waitFor('Emulation.virtualTimeBudgetExpired');
    // The first step pins the virtual clock to real time, or the page would think its data is stale.
    await browser.page('Emulation.setVirtualTimePolicy', {policy: 'pauseIfNetworkFetchesPending', budget: 1000 / fps,
      ...(index === 0 ? {initialVirtualTime: Date.now() / 1000} : {})});
    await expired;
    await evaluate('__tour.sync()');
    const {data} = await browser.page('Page.captureScreenshot', {format: 'png'});
    await writeFile(join(frames, `${String(index++).padStart(4, '0')}.png`), Buffer.from(data, 'base64'));
  };
  await evaluate(`__tour.move(${at})`);
  for (const step of steps) {
    if (step.wait) for (let i = 0; i < Math.round(step.wait * fps); i++) await frame();
    if (step.move) {
      const to = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(step.move)}).getBoundingClientRect(); return [Math.round(r.x + Math.min(r.width / 2, 60)), Math.round(r.y + r.height / 2)]; })()`);
      const from = at, count = Math.round(step.over * fps);
      for (let i = 1; i <= count; i++) {
        const k = ease(i / count);
        at = [Math.round(from[0] + (to[0] - from[0]) * k), Math.round(from[1] + (to[1] - from[1]) * k)];
        await evaluate(`__tour.move(${at})`);
        await mouse('mouseMoved', at);
        await frame();
      }
    }
    if (step.click) {
      await evaluate('__tour.ripple()');
      await mouse('mousePressed', at);
      await mouse('mouseReleased', at);
    }
  }

  await browser.fresh();

  // 3. Composite and encode.
  const file = join(OUT, `tour-${name}.gif`);
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(frames, '%04d.png'), '-i', overlay,
    '-filter_complex', `[0:v]pad=${width + pad * 2}:${height + 40 + pad * 2}:${pad}:${pad + 40}:color=0x0e171d[page];[page][1:v]overlay=0:0,`
      + `scale=${outWidth}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
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
// An unanswered DevTools call leaves nothing to keep Node alive: say so instead of exiting quietly.
process.on('exit', (code) => { if (code === 13) console.error(`✗ ${current}: Chrome stopped responding.`); });
scratch = await mkdtemp(join(tmpdir(), 'pulso-shots-'));
await mkdir(OUT, {recursive: true});
const server = spawn(process.execPath, [join(ROOT, 'skills/pulso/scripts/demo-server.mjs'), '--port', String(PORT)], {stdio: 'ignore'});
try {
  await sleep(600);
  browser = await launch(join(scratch, 'profile'));
  // Always in SHOTS order, whatever order the names were given in.
  const order = Object.keys(SHOTS);
  for (const name of wanted.length ? [...new Set(wanted)].sort((x, y) => order.indexOf(x) - order.indexOf(y)) : order) {
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
