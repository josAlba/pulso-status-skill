---
name: pulso
description: Builds a full-screen system status page (health page, /status, /system/health, ops dashboard) for the admin area of any web project. A huge plain-language verdict, an animated diagram of workers, queues and cron around a core, an infrastructure map with gauges and trends, an event timeline, linkable detail modals, auto-refresh and dark mode. Use it when someone asks for a status or health page, a monitor for workers, queues, cron jobs or external services, a screen to leave open in the office, or "something like /system/health". Works with any backend (Symfony, Laravel, Django, Rails, Express, Next.js, Go…) because the page is one self-contained HTML file that renders a JSON document.
---

# Pulso: status pages you can read at a glance

Pulso gives any project a status page meant to stay open in a spare tab or on a wall
screen. It answers "is everything working?" with one big sentence first, and keeps the
detail one click away.

The page only paints. Every decision about what is healthy lives in the backend, in a
small pure function the project tests like any other code.

## What ships with the skill

| Piece | File |
|---|---|
| Self-contained HTML/CSS/JS template, no dependencies, English and Spanish built in | `assets/status-page.html` |
| Demo server and reference adapter (Node, no dependencies) | `scripts/demo-server.mjs` |
| JSON contract between backend and page | `references/data-contract.md` |
| What to watch and how to decide each status | `references/collectors.md` |
| Wiring it into each framework | `references/adapters.md` |
| Visual system: what to adapt and what to leave alone | `references/design.md` |

Read a reference when its step comes up, not all of them up front.

## When to use it, and when not

Use it for an **internal** page that tells the team whether the system is working:
workers, queues, schedulers, databases, caches, disks and third-party services.

Don't use it for a **public** status page for customers (incident history, uptime
percentages, subscriptions), for metrics exploration (that belongs in Grafana or
similar) or for alerting. If the project already has one of those and the user wants a
glanceable view on top, Pulso can read from it.

## Workflow

Follow the steps in order. If the project has its own rules (AGENTS.md, CLAUDE.md,
layered architecture, route or permission conventions), they win: Pulso only defines
the page and the data contract.

### 1. Inventory what actually runs

Before writing code, find out which components the system has. Read them from the
project; never invent them.

- **Processes**: workers and queue consumers (Messenger, Horizon, Celery, Sidekiq,
  BullMQ…), the scheduler or cron, daemons. Look in `docker-compose*.yml`,
  `supervisord.conf`, `Procfile`, systemd units, Kubernetes manifests, `package.json`,
  `composer.json` and the queue configuration.
- **Infrastructure**: database, cache, disk, CPU, memory, file storage and external
  services (payment gateway, email, CDN, APIs).
- **Connections**: what calls what during a normal request (proxy or web server →
  application → database, cache, queues). Take it from the web server config,
  `docker-compose*.yml` and the connection environment variables. This becomes the
  infrastructure map (`connects` in the contract).
- **What already exists**: health endpoints, monitoring commands, heartbeat tables,
  metrics exporters. Reuse them before building anything new.

**Checkpoint.** Show the user the list you intend to watch, grouped as processes (left
and right lane), the infrastructure map and the remaining infrastructure groups. Ask
before going on if anything is unclear: what to include, who may see the page, and
which language the page should speak.

### 2. Decide how each status is computed (in the backend)

Read `references/collectors.md`. For each component define:

- the signal source (heartbeat, query, ping, metric) and its timeout;
- the thresholds for `attention` and `error`, and when it becomes `off`;
- the `detail` text, written for the person looking at the page, not for the person who
  wrote the check ("No signal since 16:42", not "heartbeat_ts < now-300").

Write this as a pure, testable unit (an **assessor** that takes readings and returns the
contract document) and cover every state transition with unit tests. Gathering the
readings (I/O) stays outside it, so the tests need no database or network.

### 3. Expose two protected routes

1. **Page** (`GET /admin/system/health`, or whatever fits the project's conventions):
   serves the template with the initial JSON injected into `<script id="pulso-seed">`
   and `data-endpoint` pointing at the JSON route.
2. **JSON** (`GET …/health/status`): returns the same document.

Both require an admin session and respond with `Cache-Control: private, no-store`. The
page carries `noindex`. When the session expires the JSON route must answer 401/403 or
redirect to the login page: the page detects it and says so. Per-framework examples are
in `references/adapters.md`.

When injecting the seed, escape `<` as `<` (or use the framework helper that does,
such as `JSON_HEX_TAG` in PHP or `json_script` in Django) so the JSON can never close
the `<script>` tag.

### 4. Adapt the template

Copy `assets/status-page.html` into the project as a template for its engine (Twig,
Blade, Jinja, ERB, a route handler…) and change only what is meant to change:

- **Language**: set `<html lang>`. `en` and `es` are built in; for another language add
  a dictionary to `I18N` in the script. Dates, times and numbers follow `lang`.
- **Brand variables** in `:root` (font, neutral colours, radius). Use the project's font
  and neutrals if it has them; keep the meaning of the status colours (green, amber,
  grey, red).
- **Footer links** (`links` in the JSON), for example to the queue dashboard or the logs.

Don't rewrite the diagram, the map or the modal. `references/design.md` explains which
design decisions hold the page together and which ones are yours to change.

### 5. Verify every state

- Preview real or sample JSON with the template, without booting the project:
  `node scripts/demo-server.mjs --template path/to/template.html --data status.json`.
- Compare with the demo scenarios (`?scenario=ok`, `ko`, `live`, `empty`), dark mode
  (`?theme=dark`) and the language switch (`?lang=es`).
- In the project, check: all healthy, one component in `attention`, one `off`, one
  `error`, the backend down (connection banner), an expired session (banner with a
  sign-in link), mobile (single column) and `prefers-reduced-motion`.
- Open a modal and check that the URL changes (`#processes/<key>`) and that reloading
  opens the same detail.
- Tests: assessor unit tests, plus functional tests for both routes (200 with
  permission, redirect or 401/403 without, `Content-Type: application/json` on the JSON
  route).

## Definition of done

- [ ] Every component on the page exists in the project, and nothing important is missing.
- [ ] The assessor is pure and has a test per state transition.
- [ ] Both routes are admin-only, `private, no-store`, and the page is `noindex`.
- [ ] The seed is escaped; the page renders before the first refresh.
- [ ] `detail` texts read like sentences a colleague would say out loud.
- [ ] No secrets or personal data in `facts`, `description` or `links`.
- [ ] Healthy, warning, down, offline and expired-session states were seen in a browser.

## Rules

- The page never queries the database or services itself: it only renders the JSON.
- `key` values stay stable between refreshes. If the set of components changes, the
  page rebuilds itself, but avoid renaming keys (shared links use them).
- `detail` is one short status sentence. Longer text goes in `description`, which only
  appears in the modal.
- Never put secrets in `facts`: no DSNs with passwords, tokens or personal data.
- Keep the refresh at 10 s or more in production. If a reading is expensive, cache it on
  the server or measure it in a background job.

## Common mistakes

- **Reporting `active` when there is no data.** Absence of signal is `off` until proven
  otherwise.
- **Letting a hung check hang the page.** Every probe has a 1–2 s timeout; a timeout is
  `error` ("No response in 2 s").
- **Counting every cron task as a separate outage.** If the scheduler is down, its tasks
  inherit that state as children; the verdict counts the scheduler once.
- **Checking a worker from inside the worker.** A stopped process can't report that it
  stopped. Read heartbeats or the supervisor from outside.
- **Turning the template into framework components.** It loses portability and its tested
  behaviour. Only do it if the user asks.
