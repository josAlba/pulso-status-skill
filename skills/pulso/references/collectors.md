# What to watch and how to decide each status

A status page is only useful if its colours can be trusted. This guide turns technical
signals into the five statuses of the contract.

## Principles

- **Measure from outside the process being watched.** A stopped worker can't say it has
  stopped. Use heartbeats that the process writes and something else reads, or ask the
  supervisor (Docker, systemd, Supervisor, Kubernetes).
- **No signal means `off`, not `active`.** Without a record, the component is down until
  proven otherwise.
- **`error` is a concrete failure** (last run failed, connection refused, jobs in the
  failed queue). **`off` is silence** (no process, no heartbeat).
- **`attention` warns before something breaks**: delays, growing queues, high latency,
  a nearly full disk, a heartbeat that starts arriving late.
- **Children inherit when they depend on the parent.** If the scheduler is down, its
  tasks are too: don't count each task as another outage.
- **Every check has a time limit** (1–2 s). A hung check must never hang the page: on
  timeout the component becomes `error` ("No response in 2 s").
- **Cache what is expensive.** If a reading is costly, keep it for a few seconds on the
  server, or have a background job measure it and let the page read the result.

## Recipes by component type

### Worker or queue consumer

| Signal | Status |
|---|---|
| Heartbeat newer than 2× its interval and running a job | `working` ("Sending: order confirmation") |
| Recent heartbeat, no job | `active` ("Waiting for jobs") |
| Heartbeat between 2× and 5× the interval, or ready messages waiting more than N minutes | `attention` ("12 jobs waiting for 14 min") |
| No heartbeat or no process | `off` ("No signal since 16:42") |
| The process crash-loops, or the last job failed without retry | `error` |

To record the heartbeat, hook into the framework's "worker running / idle" event
(Symfony Messenger `WorkerRunningEvent`, Laravel `Looping`, Celery signals, BullMQ
events) and write `{pid, host, role, current_job, seen_at}` to Redis or a table. Forget
heartbeats from replaced processes: key them by role and host, not only by PID.

Useful `facts`: queue, live workers out of expected, messages queued, age of the oldest
message, last finished job.

### Scheduler (cron)

- The scheduler writes its own heartbeat on every tick. No heartbeat for 2–3 ticks → `off`.
- Each scheduled task is a child of the scheduler: `detail` gives its frequency in plain
  words ("Every hour", "Every night at 03:00") and, if stored, the last run.
- A task whose last run failed becomes `error`. One that hasn't run for more than 2
  periods becomes `attention`.

### Failed jobs (dead letter)

- 0 → `active` ("None"). More than 0 → `error` ("3 failed jobs in the last hour").
- `facts`: the latest failures with their reason, without personal data.
- `links`: to the screen where they can be retried.

### Database

- `SELECT 1` with a timeout. Responds → `active`, latency in `detail`.
- Latency over the threshold, replica lag, or connections above 80 % of the maximum →
  `attention`. No response → `error`.
- `gauge`: connections out of the maximum. `series`: recent latency.

### Cache (Redis, Memcached)

- `PING`. Used memory out of the maximum in `gauge`. Hit rate in `detail` or `series`.
- Rising evictions or memory above 90 % → `attention`.

### Disk, CPU and memory

- Disk: `attention` above 85 %, `error` above 95 %. Say how much is free in `detail`
  ("9 GB free").
- CPU: sustained load (a several-minute average, not a spike) above 85 % → `attention`.
- Memory: swap in use or available memory below 10 % → `attention`.
- In containers, measure the container limits (cgroups), not the host's.

### External services (payments, email, CDN, APIs)

- A light, cheap check (health endpoint, `HEAD`, SMTP connect without sending), run by a
  background job, not on every page load.
- High latency → `attention`; errors or timeouts → `error`.
- Better still, measure real usage: the share of failed calls in the last 5 minutes.
- `links`: to the provider's status page.

### Business signals

Business components are the most valuable ones: "Orders awaiting payment", "Feeds
published today", "Bounced emails". Make them children of the process that handles them.
Example: payments unconfirmed for more than 15 minutes → `attention`.

### Infrastructure map

- One component per hop of a request: visitors (open connections according to the web
  server), web server (nginx `stub_status`, Apache `server-status`), application (pool
  status of php-fpm, Puma or Gunicorn), background workers (a summary of the Processes
  tab), database and cache.
- `connects` says who calls whom, not which way responses travel. Disks and other
  resources read without requests are `passive` connections.
- If a map component summarises others ("5 of 6 running"), its status is `attention`
  when any of them fails, and its `detail` names which one.
- `value` and `tag` are for figures that don't fit a `gauge`: "3 busy · 9 idle" and the
  latency of the last check.

## History and events

- `history`: store each component's status on every assessment in a short list (for
  example the last 24 in Redis with `LPUSH` + `LTRIM`). It feeds the strip of recent
  checks in the modal.
- `since`: store the moment the status changed; don't recompute it on every read.
- `events`: when a component changes status, add an event with a plain-language title.
  Keep the last 50, or the last 48 hours.

## Copy

Write for the person who opens the page in the middle of an incident:

| Better | Worse |
|---|---|
| No signal since 16:42 | heartbeat stale |
| 12 jobs waiting for 14 min | backlog=12 |
| 9 GB free | disk 91% |
| Slow to respond: 1.8 s | p95 1800ms |
| Every night at 03:00 | 0 3 * * * |

If the page is in another language, write `detail`, `description`, `facts` labels and
event titles in that language too: the template translates its own chrome, not your data.
