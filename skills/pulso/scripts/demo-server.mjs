#!/usr/bin/env node
// Pulso demo server. No dependencies, Node 18+.
//
//   node demo-server.mjs                       → http://localhost:4173 with data that changes on its own
//   node demo-server.mjs --port 8080
//   node demo-server.mjs --template path/to/page.html --data path/to/status.json
//
// URL parameters:
//   ?scenario=live|ok|ko|empty   which data set to serve (default: live)
//   ?theme=dark|light            force a colour scheme
//   ?lang=es                     interface language (sets <html lang>)
//
// It doubles as the reference adapter: it injects the initial JSON into
// <script id="pulso-seed"> and serves the same document at /status.

import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) =>
  arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs, []));
const port = Number(args.port || process.env.PORT || 4173);
const templatePath = resolve(args.template || resolve(here, '../assets/status-page.html'));
const dataPath = args.data ? resolve(args.data) : null;
const SCENARIOS = ['live', 'ok', 'ko', 'empty'];

/* ── Sample data: a fictional online shop ─────────────────────────────────── */
const SERVICE = 'Juniper Shop';
const minutes = (n) => new Date(Date.now() - n * 60_000).toISOString();
const clock = (date = new Date()) => date.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
const hhmm = (date) => date.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'});

// Stable pseudo-random series that advances with time (same shape for every request in the same 10 s).
function series(seed, base, spread, length = 30, spikeAt = -1) {
  const tick = Math.floor(Date.now() / 10_000);
  return Array.from({length}, (_, i) => {
    const x = tick - length + i;
    const wave = Math.sin((x + seed) * 0.45) * 0.5 + Math.sin((x + seed * 3) * 0.17) * 0.5;
    const spike = i >= length + spikeAt && spikeAt < 0 && spikeAt > -length ? spread * 2.2 : 0;
    return Math.max(0, Math.round((base + wave * spread + spike) * 10) / 10);
  });
}
// Last 24 checks: the pattern describes the most recent ones (a active, w attention, o off, e error).
const STATES = {a: 'active', w: 'attention', o: 'off', e: 'error'};
const history = (recent = '') => [...'a'.repeat(24 - recent.length) + recent].map((c) => STATES[c]);

function scenario(name) {
  const ko = name === 'ko';
  const live = name === 'live';
  const phase = Math.floor(Date.now() / 1000) % 60;
  const mailWorking = live ? phase % 14 < 7 : !ko;
  const gatewaySlow = ko || (live && phase >= 40);
  const now = new Date();
  const lastSeen = hhmm(new Date(Date.now() - 27 * 60_000));
  const visitors = Math.round(series(13, 38, 9).at(-1));
  const busy = mailWorking ? 3 : 1;

  if (name === 'empty') return {service: SERVICE, checkedAt: now.toISOString(), nodes: [], events: []};

  const nodes = [
    // Processes · left lane
    {key: 'payments', label: 'Payment checks', status: 'active', detail: 'Waiting for jobs', lane: 'workers',
      description: 'Confirms pending payments with the gateway and marks the orders as paid.',
      since: minutes(312), history: history(), facts: {'Queue': 'payments', 'Workers': '2 of 2', 'Messages queued': 0, 'Last job': clock(new Date(Date.now() - 41_000))},
      links: [{label: 'Open the queue', href: '#processes/payments'}]},
    {key: 'payments-pending', parent: 'payments', label: 'Orders awaiting payment', status: 'active', detail: 'None pending'},
    {key: 'mail', label: 'Emails and notifications', status: mailWorking ? 'working' : 'active', detail: mailWorking ? 'Sending: order confirmation' : 'Waiting for jobs', lane: 'workers',
      description: 'Sends order confirmations, shipping updates and abandoned-cart reminders.',
      since: minutes(1), history: history(), facts: {'Queue': 'mail', 'Sent today': '1,284', 'Messages queued': mailWorking ? 3 : 0}},
    {key: 'stock', label: 'Stock sync', status: ko ? 'off' : 'active', detail: ko ? `No signal since ${lastSeen}` : 'Waiting for jobs', lane: 'workers',
      description: 'Imports stock levels from the warehouse every five minutes.',
      since: ko ? minutes(27) : minutes(1440), history: history(ko ? 'aaaooooo' : ''),
      facts: {'Queue': 'stock', 'Workers': ko ? '0 of 1' : '1 of 1', 'Messages queued': ko ? 46 : 0},
      links: [{label: 'How to restart it', href: 'https://example.com/runbooks/stock'}]},
    {key: 'feeds', label: 'Exports and feeds', status: 'active', detail: 'Waiting for jobs', lane: 'workers',
      since: minutes(2880), history: history(), facts: {'Queue': 'feeds', 'Last feed': clock(new Date(Date.now() - 600_000))}},
    {key: 'search', label: 'Search indexing', status: 'active', detail: 'Waiting for jobs', lane: 'workers',
      since: minutes(600), history: history(), facts: {'Queue': 'search', 'Products indexed': '18,240'}},

    // Processes · right lane
    {key: 'database-link', label: 'Database', status: 'active', detail: 'Responding in 4 ms', lane: 'services',
      description: 'The application’s connection to the primary database.', history: history(), since: minutes(4000)},
    {key: 'scheduler', label: 'Scheduler', status: 'active', detail: `Last tick at ${clock(new Date(Date.now() - 20_000))}`, lane: 'services',
      description: 'Launches the recurring tasks. If it stops, none of its tasks run.', since: minutes(1440), history: history()},
    {key: 'cron-payments', parent: 'scheduler', label: 'Payment polling', status: 'active', detail: 'Every minute'},
    {key: 'cron-sitemaps', parent: 'scheduler', label: 'Rebuild sitemaps', status: 'active', detail: 'Every hour'},
    {key: 'cron-carts', parent: 'scheduler', label: 'Clear abandoned carts', status: 'active', detail: 'Every night at 03:00'},
    {key: 'failed', label: 'Failed jobs', status: ko ? 'error' : 'active', detail: ko ? '3 failed jobs in the last hour' : 'None', lane: 'services',
      description: 'Jobs that ran out of retries and are waiting for someone to review them.',
      since: ko ? minutes(18) : minutes(2000), history: history(ko ? 'aaaaeeee' : ''),
      facts: ko ? {'Sync stock #8812': 'Timed out', 'Sync stock #8813': 'Timed out', 'Send invoice #1204': 'Recipient rejected'} : {},
      links: ko ? [{label: 'Review failed jobs', href: '#processes/failed'}] : []},

    // Infrastructure · map: the path of a request, left to right
    {key: 'visitors', tab: 'infra', icon: 'globe', label: 'Visitors', meta: 'Internet', status: 'active',
      description: 'Anyone opening the shop or the admin panel from the internet.',
      value: `${visitors} open connections`, connects: ['web'], history: history(),
      facts: {'Shop': '/', 'Admin': '/admin'}},
    {key: 'disk', tab: 'infra', icon: 'disk', label: 'Disk', meta: 'Server disk', status: ko ? 'attention' : 'active',
      detail: ko ? '9 GB free' : '37 GB free',
      description: ko ? 'Application logs have been growing faster than usual since this morning.' : 'Images, feeds, sitemaps, caches and logs.',
      gauge: {value: ko ? 91 : 63, max: 100, unit: '%'}, history: history(ko ? 'aawwwwww' : ''),
      facts: {'Free': ko ? '9 GB' : '37 GB', 'Size': '100 GB', 'Volume': '/var/lib'}},
    {key: 'web', tab: 'infra', icon: 'server', label: 'Web server', meta: 'nginx', status: 'active',
      description: 'Receives requests, serves static files and hands the rest to the application.',
      value: `${visitors} active connections`, tag: '1.1 ms', connects: ['app', {to: 'disk', passive: true}], history: history(),
      facts: {'Reading / writing': '0 / 2', 'Idle (keep-alive)': Math.max(0, visitors - 2), 'Requests today': '48,210'}},
    {key: 'app', tab: 'infra', icon: 'cpu', label: 'Application', meta: 'php-fpm · pool www', status: mailWorking ? 'working' : 'active',
      description: 'Runs the shop and the admin panel: each request is served by a worker from the pool.',
      value: `${busy} busy · ${12 - busy} idle`, tag: '12 ms', connects: ['db', 'cache'], history: history(),
      facts: {'Workers': '12 of 24', 'Requests (1 min)': 618, 'Max children reached': '0 times'}},
    {key: 'workers', tab: 'infra', icon: 'queue', label: 'Background workers', meta: 'queues · scheduler', status: ko ? 'attention' : 'active',
      detail: ko ? 'Stock sync is down' : '',
      description: 'Process the queues and run the recurring tasks: payments, emails, stock and feeds.',
      value: ko ? '5 of 6 running' : '6 of 6 running', connects: ['db', 'cache'], history: history(ko ? 'aaawwwww' : ''),
      facts: {'Recent signal': ko ? 5 : 6, 'Need a look': 0, 'Down': ko ? 1 : 0},
      links: [{label: 'See the processes', href: '#processes'}]},
    {key: 'db', tab: 'infra', icon: 'database', label: 'Database', meta: 'MariaDB 10.11', status: 'active', detail: 'Replica up to date',
      description: 'Stores orders, catalogue, customers and the job queues.',
      gauge: {value: 18, max: 150, unit: 'connections'}, tag: '4 ms', series: series(1, 4, 1.2), seriesLabel: 'Query latency, last 5 min (ms)',
      history: history(), since: minutes(4000), facts: {'Version': '10.11.9', 'Replica lag': '0 s', 'Slow queries (1 h)': 2}},
    {key: 'cache', tab: 'infra', icon: 'bolt', label: 'Cache', meta: 'Redis 7.4', status: 'active', detail: '97 % hit rate',
      description: 'Catalogue, menus and frequent queries, so most requests skip the database.',
      gauge: {value: 412, max: 1024, unit: 'MB'}, tag: '0.3 ms', series: series(4, 97, 1), seriesLabel: 'Hit rate (%)',
      history: history(), facts: {'Keys': '184,302', 'Evicted (1 h)': 0}},

    // Infrastructure · cards without connections, grouped
    {key: 'cpu', tab: 'infra', group: 'Server', label: 'CPU', status: 'active', detail: '4 cores',
      gauge: {value: Math.round(series(7, 34, 12).at(-1)), max: 100, unit: '%'}, series: series(7, 34, 12), seriesLabel: 'Usage, last 5 min (%)', history: history()},
    {key: 'memory', tab: 'infra', group: 'Server', label: 'Memory', status: 'active', detail: 'No swap in use',
      gauge: {value: 5.1, max: 8, unit: 'GB'}, series: series(9, 5.1, 0.3), seriesLabel: 'In use, last 5 min (GB)', history: history()},
    {key: 'gateway', tab: 'infra', group: 'External services', label: 'Payment gateway', status: gatewaySlow ? 'attention' : 'active',
      detail: gatewaySlow ? 'Slow to respond: 1.8 s' : 'Responding in 180 ms',
      series: gatewaySlow ? series(11, 420, 80, 30, -6).map((v, i) => i > 23 ? v * 3.6 : v) : series(11, 180, 30), seriesLabel: 'Response time (ms)',
      history: history(gatewaySlow ? 'aaaaaaww' : ''), since: gatewaySlow ? minutes(4) : minutes(900),
      links: [{label: 'Provider status page', href: 'https://example.com/status'}]},
    {key: 'smtp', tab: 'infra', group: 'External services', label: 'Outgoing email', status: 'active', detail: 'Delivering normally',
      gauge: {value: 1284, max: 5000, unit: 'sent today'}, history: history()},
    {key: 'cdn', tab: 'infra', group: 'External services', label: 'Image CDN', status: 'active', detail: '99 % hit rate', history: history()},
  ];

  const events = [
    ...(ko ? [
      {at: minutes(18), status: 'error', title: 'Three jobs failed', detail: 'They ran out of retries while syncing stock and sending an invoice.', node: 'failed'},
      {at: minutes(27), status: 'off', title: 'Stock sync stopped sending a signal', detail: 'The last worker exited with code 137 (out of memory).', node: 'stock'},
      {at: minutes(95), status: 'attention', title: 'Disk usage passed 85 %', node: 'disk'},
    ] : []),
    ...(gatewaySlow ? [{at: minutes(4), status: 'attention', title: 'Payment gateway is responding slowly', detail: 'Over one second in the latest checks.', node: 'gateway'}] : []),
    {at: minutes(140), status: 'active', title: 'Outgoing email is delivering again', detail: 'The 212 queued emails went out.', node: 'smtp'},
    {at: minutes(152), status: 'error', title: 'Outgoing email is refusing connections', node: 'smtp'},
    {at: minutes(60 * 26), status: 'active', title: 'Workers restarted after the deploy', detail: 'Version 4.12.0.'},
  ];

  return {
    service: SERVICE,
    checkedAt: now.toISOString(),
    refreshSeconds: 5,
    lanes: [
      {key: 'workers', label: 'Job workers', side: 'left'},
      {key: 'services', label: 'Scheduling and services', side: 'right'},
    ],
    nodes,
    events,
    links: [{label: 'Queues and workers', href: '#processes'}],
  };
}

/* ── Server ───────────────────────────────────────────────────────────────── */
async function payload(name) {
  if (dataPath) return JSON.parse(await readFile(dataPath, 'utf8'));
  return scenario(name);
}
// Escape "<" so the JSON can never close the <script> tag it lives in.
const toSeed = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const name = SCENARIOS.includes(url.searchParams.get('scenario')) ? url.searchParams.get('scenario') : 'live';
  try {
    if (url.pathname === '/status') {
      response.writeHead(200, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store'});
      response.end(JSON.stringify(await payload(name)));
      return;
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const theme = ['dark', 'light'].includes(url.searchParams.get('theme')) ? url.searchParams.get('theme') : null;
      const lang = /^[a-z]{2}(-[A-Za-z]{2})?$/.test(url.searchParams.get('lang') || '') ? url.searchParams.get('lang') : null;
      const seed = toSeed(await payload(name));
      const html = (await readFile(templatePath, 'utf8'))
        .replace(/(<script type="application\/json" id="pulso-seed">)[\s\S]*?(<\/script>)/, (_, open, close) => open + seed + close)
        .replace(/data-endpoint="[^"]*"/, `data-endpoint="/status?scenario=${name}"`)
        .replace(/<html lang="[^"]*"/, (tag) => (lang ? `<html lang="${lang}"` : tag) + (theme ? ` data-theme="${theme}"` : ''));
      response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store'});
      response.end(html);
      return;
    }
    response.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
    response.end('Not found');
  } catch (error) {
    response.writeHead(500, {'Content-Type': 'text/plain; charset=utf-8'});
    response.end(String(error));
  }
}).listen(port, () => {
  console.log(`Pulso demo at http://localhost:${port}  (?scenario=live|ok|ko|empty · ?theme=dark · ?lang=es)`);
});
