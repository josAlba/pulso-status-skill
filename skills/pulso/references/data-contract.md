# Data contract

The page reads a single JSON document, both from the initial seed
(`<script id="pulso-seed">`) and on every refresh (`data-endpoint`). Every field is
optional unless marked as required.

## Document

```jsonc
{
  "service": "Juniper Shop",               // name in the core and in the tab title
  "status": "attention",                   // overall verdict; derived if missing
  "headline": "One thing needs a look",    // the big sentence; derived if missing
  "summary": "Everything is still running.", // supporting sentence; derived if missing
  "checkedAt": "2026-11-23T17:00:33+01:00", // ISO 8601, when the readings were taken (required in production)
  "refreshSeconds": 10,                    // how often the page asks for the JSON again
  "lanes": [                               // lanes of the Processes tab
    {"key": "workers",  "label": "Job workers",             "side": "left"},
    {"key": "services", "label": "Scheduling and services", "side": "right"}
  ],
  "nodes": [ /* components, see below */ ],
  "events": [ /* recent changes, see below; if missing, there is no Events tab */ ],
  "links": [ {"label": "Queues and workers", "href": "/admin/queues"} ]  // footer links
}
```

## Statuses

| Value | Means | Colour | Counts as |
|---|---|---|---|
| `active` | Working, with a recent signal | green | healthy |
| `working` | Working and busy right now (pulsing signal) | green | healthy |
| `attention` | Still working, but something needs a look | amber | warning |
| `off` | Stopped or silent: processing nothing | grey, dashed | down |
| `error` | The last run or check failed | red | down |

An unknown value is treated as `off`.

## Component (`nodes[]`)

```jsonc
{
  "key": "stock",                     // required, unique and stable
  "label": "Stock sync",              // required
  "status": "off",                    // required
  "detail": "No signal since 16:42",  // short sentence under the name

  "tab": "processes",                 // "processes" (default) or "infra"
  "lane": "workers",                  // top-level processes only: which lane
  "parent": null,                     // key of the parent: rendered as a sub-component
  "group": "Server",                  // infrastructure only: group heading

  "gauge": {"value": 91, "max": 100, "unit": "%"},  // big figure and bar (infra and modal)
  "series": [12, 14, 13, 40],         // trend, oldest to newest (infra and modal)
  "seriesLabel": "Latency (ms)",

  // Infrastructure only: connection map (see "Rendering rules")
  "connects": ["db", "cache", {"to": "disk", "passive": true}], // components it calls
  "column": 2,                        // force the map column (0 = first)
  "icon": "cpu",                      // globe, server, cpu, database, bolt, queue, disk, mail, cloud, card, clock, search
  "meta": "php-fpm · pool www",       // technical identity under the name
  "value": "3 busy · 9 idle",         // figure as text, when there is no gauge
  "tag": "12 ms",                     // short datum next to the figure (latency, version…)

  "description": "Imports stock levels from the warehouse every five minutes.", // long text, modal only
  "since": "2026-11-23T16:42:00+01:00", // when it entered the current status
  "history": ["active", "active", "off"], // recent checks, oldest to newest
  "facts": {"Queue": "stock", "Workers": "0 of 1"}, // key/value table in the modal
  "links": [{"label": "How to restart it", "href": "https://wiki/runbooks/stock"}]
}
```

## Rendering rules

- **Processes**: top-level components (no `parent`) with `tab: "processes"` are cards
  wired to the core by an animated line. Their children appear inside the card as
  sub-components. A component without a valid lane goes to the last lane. Without
  `lanes`, components are split half and half.
- **Infrastructure**: components with `tab: "infra"` are grouped by `group`, in the
  order they appear. `gauge` (or `value`) shows the figure and bar; `series`, the trend.
- **Infrastructure map**: if any infrastructure component has `connects`, the tab opens
  with a map of the path a request takes, left to right (visitors → web server →
  application → database and cache). Connected components are laid out in columns: each
  one sits to the right of whoever calls it, and pure callers sit just before the first
  component they call. If a computed column looks wrong, pin it with `column`. Sparks
  travel along the wires as in Processes, using the worse status of the two ends. A
  `passive` connection (disk, mounts, shared files) is dashed and has no sparks. Map
  cards show the icon, `meta`, two lines of description, the figure with its `tag`,
  `detail` and the first four `facts`. Components without connections (CPU, memory,
  external services…) follow below, grouped by `group`. In the modal, each map component
  lists what it connects to and what calls it.
- **Modal**: any component or sub-component opens with a click and shows all of the
  above. The URL becomes `#processes/<key>` or `#infra/<key>` so it can be shared.
  (Links using the 1.x Spanish slugs `#procesos/…` and `#eventos` still work.)
- `href` values are only accepted if they start with `http(s)://`, `/`, `.`, `#` or `?`.

`gauge.unit` is shown after the figure. With `max` and a unit other than `%`, it reads
"412 of 1024 MB".

## Derived verdict

If the JSON has no `status`, `headline` or `summary`, the page derives them from the
top-level components (sub-components don't count separately):

1. Any `off` or `error` → `error`, "One component is down" / "N components are down".
2. Otherwise, any `attention` → `attention`, "One thing needs a look".
3. Otherwise → `active`, "All systems go", "N components running."

Prefer computing it on the server, in the business's own words ("A worker is down",
"Payments are delayed"), and keep the client-side version as a safety net.

## Events (`events[]`)

```jsonc
{
  "at": "2026-11-23T16:42:00+01:00", // required
  "status": "off",                    // colour of the dot
  "title": "Stock sync stopped sending a signal", // required
  "detail": "The worker exited with code 137 (out of memory).",
  "node": "stock"                     // if it exists, the title opens that component's modal
}
```

Sorted newest first. The tab shows how many happened in the last 24 hours. Record state
changes only, not every check: store them while assessing (by comparing with the
previous status) or derive them from the history.

## Special endpoint responses

| Response | The page shows |
|---|---|
| 200 with JSON | The new data |
| 401, 403, a redirect, or HTML with 200 | "Your session has expired" with a link to sign in again |
| Network error or 5xx | "Can't reach the status endpoint", dims the diagram and keeps retrying |
| `checkedAt` older than 3 refreshes (and over 60 s) | A stale-data warning |
