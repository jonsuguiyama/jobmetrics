# jobmetrics

[![CI](https://github.com/jonsuguiyama/jobmetrics/actions/workflows/ci.yml/badge.svg)](https://github.com/jonsuguiyama/jobmetrics/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/jonsuguiyama/jobmetrics/graph/badge.svg)](https://codecov.io/gh/jonsuguiyama/jobmetrics)
[![Version](https://img.shields.io/github/package-json/v/jonsuguiyama/jobmetrics?filename=web%2Fpackage.json)](https://github.com/jonsuguiyama/jobmetrics/blob/main/web/package.json)
[![License](https://img.shields.io/github/license/jonsuguiyama/jobmetrics)](https://github.com/jonsuguiyama/jobmetrics/blob/main/LICENSE)

Upload your resume, search real developer job postings from Brazilian tech
communities, and get a live-updating match score for each one, powered by an
LLM and a real message queue behind the scenes - with a live pipeline view
showing the actual queue/worker/LLM stages as they happen, not a generic
spinner.

## Why this exists

A lot of job postings for backend/full-stack roles ask for messaging
experience (Kafka, RabbitMQ). This project is a small, honest way to actually
use that stack for something real, not a toy producer/consumer demo: matching
a resume against dozens of job postings genuinely benefits from queued,
rate-limited processing, because scoring is a real (rate-limited, free-tier)
LLM API call.

## How it works

1. **Sign in** with GitHub or Google (required so per-user usage can be rate
   limited - see [Privacy & data retention](#privacy--data-retention)).
2. **Upload your resume** (PDF, DOCX, or plain text). It's parsed into text
   server-side and never rendered or executed - just read as plain text.
3. **Pick a job source**: a dropdown of community-run GitHub repositories
   where Brazilian tech job postings are shared as Issues (`frontendbr/vagas`,
   `backend-br/vagas`, `DevOps-Brasil/Vagas`, `react-brasil/vagas`), or choose
   "None" and paste a single job description manually instead.
4. The app fetches the open Issues from the selected repository via the
   GitHub REST API.
5. The whole search - your resume plus every job posting - becomes **one
   message on a RabbitMQ queue**.
6. A worker process consumes the message and makes a **single batched call to
   the Gemini API**, scoring every job in the session at once. The free tier's
   quota is per-request (15/min), not per-token, so one call per search beats
   one call per job - see [Reliability](#reliability-the-actual-point) for what
   happens when that call is slow or hangs.
7. Results stream back to your browser over a **WebSocket** the moment
   they're ready, and reveal with a short staggered animation instead of
   dumping all 50+ at once.
8. A **Live Pipeline** panel shows the real backend stages live - GitHub
   fetch, RabbitMQ handoff, worker pickup, Gemini scoring, results delivered -
   each with its own timer, sourced entirely from server timestamps (see
   [Reliability](#reliability-the-actual-point)). It's built to be looked at,
   not just waited through.
9. Results can be filtered by match tier (Low/Fair/Good/Excellent) and are
   paginated once there are enough of them.
10. If scoring fails (API hiccup, timeout) the message retries with backoff;
    after a few attempts it lands in a dead-letter queue instead of silently
    vanishing.

## Architecture

```
                     ┌─────────────┐
  Browser  ────────► │  Next.js     │  Vercel
  (upload, search,   │  (frontend + │  - Auth.js (GitHub/Google OAuth)
   live results)     │   API routes)│  - Neon Postgres (accounts, rate limits)
                     └──────┬──────┘
                            │ fetch jobs (GitHub API)
                            │ publish 1 message per search (confirm channel)
                            ▼
                     ┌─────────────┐
                     │  RabbitMQ    │  CloudAMQP (managed, free tier)
                     │  job queue   │
                     └──────┬──────┘
                            │ consume (heartbeat + health-checked)
                            ▼
                     ┌─────────────┐
                     │  Worker      │  GCP e2-micro VM (always-on, free tier)
                     │  + WebSocket │  - one batched Gemini call per search
                     │  server      │  - pushes results + pipeline status live
                     └─────────────┘
```

The worker (and its WebSocket server) run on a small always-on VM rather than
a serverless function, because a queue consumer and a live WebSocket
connection both need a process that stays alive - something Vercel's
serverless functions intentionally don't do.

## Stack

| Piece | Technology | Why |
|---|---|---|
| Frontend + API | Next.js on Vercel | Reuses the Auth.js OAuth setup already built for csv-insights |
| Language | TypeScript | Both `web/` and `worker/` |
| Styling | Tailwind CSS | Dark theme, single neon-green accent, custom dropdown/filter components |
| Auth | GitHub/Google OAuth (Auth.js) | Required to rate-limit usage per person, not just per IP |
| Database | Neon (Postgres) | Tiny footprint on purpose - see below |
| Session cache | Upstash Redis | Holds results and pipeline status history per search, auto-expires |
| Queue | RabbitMQ (CloudAMQP) | One message per search; the right tool for "work handed off to a separate always-on process" |
| Worker | Node.js/TypeScript on a GCP e2-micro VM (Always Free) | Always-on process for the queue consumer and WebSocket server, kept alive with pm2 |
| LLM | Google Gemini API (`gemini-flash-lite-latest`, free tier) | Real rate limits on a genuinely free tier, unlike token-metered APIs |
| Job source | GitHub REST API (Issues) | The only realistic no-paywall, no-partnership source of real BR tech job postings - see below |
| Live updates | WebSocket | Server pushes each result and pipeline status the moment it happens, no polling |
| Analytics | Vercel Analytics | Free on Hobby, no per-account site limit (unlike Umami's free tier) |
| Testing | Vitest (+ React Testing Library for UI) | Unit tests in both `web/` and `worker/`, run in CI on every push |

### Why GitHub Issues as the job source

None of the major Brazilian job boards (Gupy, Catho, Vagas.com, InfoJobs,
Glassdoor, ...) offer a public API for searching job listings - the APIs they
do have are for employers to *post* jobs, not for third parties to *read*
them, and Glassdoor's public API was retired outright in 2022. The Brazilian
dev community, however, has run informal hiring boards as GitHub repositories
for years (`frontendbr/vagas`, `backend-br/vagas`, etc.), where openings are
shared as Issues. It's the only realistic source that's actually public, free,
and specific to the Brazilian tech market.

## Reliability (the actual point)

A free-tier message queue and a free-tier LLM API are both genuinely flaky in
ways that matter for a project meant to demonstrate messaging skills, not
paper over them:

- **Both ends of the queue detect and recover from a dead connection.** The
  worker (consumer) and the web app (publisher) each run their own RabbitMQ
  connection with a keep-alive heartbeat; the worker additionally runs an
  active health-check probe on a short interval so a stale connection is
  replaced in seconds, not after minutes of silent failure.
- **Publishing is confirmed, not fire-and-forget.** The web app publishes
  through a RabbitMQ confirm channel and waits for the broker's ack - a
  message that never actually reaches the broker throws instead of silently
  vanishing, so a search never gets stuck with nothing to show for it. If the
  first attempt fails (e.g. a serverless instance waking up after its cached
  connection went stale), it discards that connection and retries once on a
  fresh one before ever surfacing an error.
- **A hung Gemini call fails fast.** Scoring is wrapped in a timeout so a
  request that hangs with no response doesn't occupy a worker's consumer slot
  forever - it fails, gets nacked, and retries like any other failure.
- **The Live Pipeline's timers are immune to a wrong client clock.** Every
  timestamp in the pipeline view comes from the server (web app or worker),
  never the browser. The one client-side value used - "how many seconds have
  passed" - is corrected against the server's own clock (recalibrated on
  every status message), so the timers are correct even if the visitor's
  system clock is wrong.

## Privacy & data retention

- **Nothing about your resume is stored long-term.** It's parsed to text,
  held in Redis for the duration of an active search (2 hour TTL), and never
  written to Postgres.
- The 2 hour window exists so a page refresh or a dropped WebSocket
  connection doesn't lose in-progress results - not to "remember" your resume
  for a later visit. Come back after it expires and you'll see a clear
  message asking you to re-upload, rather than the app silently losing your
  data.
- Postgres only ever stores your account (from OAuth) and a daily search
  counter used for rate limiting. Neither grows with usage over time.

## Security notes

- Resume uploads are restricted by file type and size, given a
  server-generated filename (never the client-supplied one), and are only
  ever treated as plain text - never rendered as HTML or executed.
- Job posting text (from GitHub Issues or pasted manually) is untrusted
  third-party content that flows into an LLM prompt. The model's output is
  only ever used as a display string and a numeric score clamped server-side
  - it never triggers an action, so a job posting can't use prompt injection
    to do anything beyond producing a weird-looking score.
- Usage (searches per day) is rate-limited per authenticated user to keep one
  visitor from draining the free API/queue quotas for everyone else.

## Testing

Both packages use Vitest, run automatically on every push and pull request
via [GitHub Actions](.github/workflows/ci.yml) (type-check + lint + tests):

- `worker/`: throttling/rate-limiter behavior, and Gemini response
  parsing/clamping (score bounds, malformed/missing fields).
- `web/`: GitHub Issues fetching, per-user rate-limit + owner-exemption
  logic, and the Live Pipeline's duration display (via fake timers and
  React Testing Library) - including the freeze-on-completion behavior and
  the clock-skew correction described above.

Run locally from either `web/` or `worker/`:

```sh
npm test          # vitest run
npx tsc --noEmit  # type-check
npm run lint      # eslint
```

## Status

Working end-to-end: sign-in, resume upload, job fetch, queued scoring, live
results with filtering/pagination, and a live pipeline view of the whole
pipeline. Known limitation: a single very large batch of jobs (60+) in one
search can make the batched Gemini call noticeably slower, since generation
time doesn't scale linearly with job count - chunking that call is the next
thing to revisit if it comes up again in practice.

## License

MIT - see [LICENSE](./LICENSE).
