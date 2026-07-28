# jobmetrics

Upload your resume, search real developer job postings from Brazilian tech
communities, and get a live-updating match score for each one, powered by an
LLM and a real message queue behind the scenes.

## Why this exists

A lot of job postings for backend/full-stack roles ask for messaging
experience (Kafka, RabbitMQ). This project is a small, honest way to actually
use that stack for something real, not a toy producer/consumer demo: matching
a resume against dozens of job postings genuinely benefits from parallel,
queued, rate-limited processing, because each comparison is a real (rate
limited, free-tier) LLM API call.

## How it works

1. **Sign in** with GitHub or Google (required so per-user usage can be rate
   limited - see [Privacy & data retention](#privacy--data-retention)).
2. **Upload your resume** (PDF or plain text). It's parsed into text
   server-side and never rendered or executed - just read as plain text.
3. **Pick job sources**: checkboxes for community-run GitHub repositories
   where Brazilian tech job postings are shared as Issues (`frontendbr/vagas`,
   `backend-br/vagas`, `DevOps-Brasil/Vagas`, `react-brasil/vagas`, ...). You
   can also paste a single job description manually if you found something
   elsewhere.
4. The app fetches the open Issues from the selected repositories via the
   GitHub REST API.
5. Each job posting becomes **one message on a RabbitMQ queue**.
6. A small pool of **worker processes** consumes the queue concurrently. For
   each job, a worker calls the Gemini API once to extract structured
   requirements from the posting and score it against your resume.
7. Results stream back to your browser over a **WebSocket** as each worker
   finishes - the ranking builds live instead of waiting for all 50+ jobs to
   finish sequentially.
8. Failed comparisons (API hiccup, timeout) retry with backoff; after a few
   attempts they land in a dead-letter queue and show up in the UI as
   "couldn't be scored" rather than silently vanishing.

## Architecture

```
                     ┌─────────────┐
  Browser  ────────► │  Next.js     │  Vercel
  (upload, search,   │  (frontend + │  - Auth.js (GitHub/Google OAuth)
   live results)     │   API routes)│  - Neon Postgres (accounts, rate limits)
                     └──────┬──────┘
                            │ fetch jobs (GitHub API)
                            │ publish 1 message per job
                            ▼
                     ┌─────────────┐
                     │  RabbitMQ    │  CloudAMQP (managed, free tier)
                     │  job queue   │
                     └──────┬──────┘
                            │ consume (N workers, concurrent)
                            ▼
                     ┌─────────────┐
                     │  Worker      │  GCP e2-micro VM (always-on, free tier)
                     │  + WebSocket │  - calls Gemini API per job
                     │  server      │  - pushes results straight to the browser
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
| Auth | GitHub/Google OAuth (Auth.js) | Required to rate-limit usage per person, not just per IP |
| Database | Neon (Postgres) | Tiny footprint on purpose - see below |
| Session cache | Upstash Redis | Holds the active resume + in-progress results, auto-expires |
| Queue | RabbitMQ (CloudAMQP) | Classic competing-consumers task queue - the right tool for "many independent jobs, N workers pulling work" |
| Worker | Node.js/TypeScript on a GCP e2-micro VM | Always-on process for the queue consumer and WebSocket server |
| LLM | Google Gemini API (free tier) | Real rate limits on a genuinely free tier, unlike token-metered APIs |
| Job source | GitHub REST API (Issues) | The only realistic no-paywall, no-partnership source of real BR tech job postings - see below |
| Live updates | WebSocket | Server pushes each result the moment it's ready, no polling |
| Analytics | Umami | Cookie-free, privacy-respecting page-view analytics |

### Why GitHub Issues as the job source

None of the major Brazilian job boards (Gupy, Catho, Vagas.com, InfoJobs,
Glassdoor, ...) offer a public API for searching job listings - the APIs they
do have are for employers to *post* jobs, not for third parties to *read*
them, and Glassdoor's public API was retired outright in 2022. The Brazilian
dev community, however, has run informal hiring boards as GitHub repositories
for years (`frontendbr/vagas`, `backend-br/vagas`, etc.), where openings are
shared as Issues. It's the only realistic source that's actually public, free,
and specific to the Brazilian tech market.

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

## Status

Early scaffolding in progress.
