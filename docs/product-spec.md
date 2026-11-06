# Product specification

|                   |                             |
| ----------------- | --------------------------- |
| **Status**        | Draft — Phase 1 in progress |
| **Last reviewed** | 2026-11-05                  |

What each module does and in what order it gets built. Structure is in
[architecture.md](architecture.md); schema is in [data-model.md](data-model.md); phase
ordering and gates are in [roadmap.md](roadmap.md).

Status key: ✅ shipped · 🚧 in progress · 📋 planned

## Module 1 — Application pipeline

A kanban board over the real stages of a search. `stage_history` is append-only and is the
single source of truth for every conversion number elsewhere in the product.

**Stages:** saved → applied → assessment → interview → offer / rejected / withdrawn.

`ghosted` is deliberately not one of them. Ghosting is the absence of events, not an event
anyone performs, and the rule below says it reverses itself the moment a reply arrives — so
storing it would mean writing a row into an append-only history and later needing to unwrite
it. It is derived from silence instead, by `isGhosted` in `packages/core`.

| Scope    | Item                                                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ MVP   | Board view: one lane per stage, derived from `stage_history`, with the longest wait first. Order within a lane is derived too, so it cannot be set by hand — a card dropped into a lane lands where its waiting time puts it |
| ✅ MVP   | Create an application: one form across company, job and application                                                                                                                                                          |
| ✅ MVP   | Change stage from a card. The move appends to the history and never overwrites it                                                                                                                                            |
| ✅ MVP   | Drag to change stage (dnd-kit), by pointer or by keyboard. The select-and-submit control stays: it is the path that needs neither a pointer nor JavaScript                                                                   |
| 📋 MVP   | Manual create: paste a JD link or body; AI extracts company, title, key skills, region, language requirement                                                                                                                 |
| 📋 MVP   | Record which résumé version each application used                                                                                                                                                                            |
| 📋 MVP   | Interview records: round, time, notes                                                                                                                                                                                        |
| 📋 MVP   | Follow-up reminder 24h after an interview, with a drafted thank-you note                                                                                                                                                     |
| 📋 MVP   | `next_action_at` reminders, in-app and email                                                                                                                                                                                 |
| 📋 Later | Browser extension (Manifest V3): one-click JD clipping, then assisted form fill for Greenhouse / Lever / Ashby — fields and values shown for confirmation first, submission always by the user                               |
| 📋 Later | Read-only Gmail scope: detect interview invitations and rejections, propose a stage change, user confirms                                                                                                                    |
| 📋 Later | Calendar sync for interviews                                                                                                                                                                                                 |

**Build vs. use:** build the board, the clipper and the email classifier (rules first, a
small model as fallback). Use dnd-kit, Supabase cron, and a transactional email provider.

**Done when:** four straight weeks in which every application the author makes exists in
the system, with no spreadsheet.

### Funnel export (Sankey)

One shareable diagram computed entirely from `stage_history` — no extra data entry.

- Flows: applied → responded / ghosted; responded → screened out / assessment / interview;
  interview → offer / rejected / ghosted / in progress.
- **Ghost rule:** no movement in a stage for 21 days (configurable) marks it ghosted; a
  later reply reverses the mark automatically.
- Filters: date range, industry, region, résumé version.
- Export: PNG and SVG. The export hides company names by default and keeps only the
  numbers, with a small watermark — these diagrams circulate in job-search communities,
  which makes the export a distribution channel as well as a feature.

## Module 2 — Company intelligence and precision applying

A research agent produces a structured profile, and résumé tailoring stays provably
grounded in the user's own history.

**`research_json` has a fixed shape:** business lines and revenue model; team and org
(engineering headcount, what they are hiring for); recent moves (funding, launches,
layoffs, leadership changes); tech stack, each item with source and confidence; three to
five concrete interview talking points; the source list.

**Sources**

1. Search API (Tavily / Brave) for news, funding, engineering blogs
2. Public ATS endpoints — Greenhouse, Lever, Ashby job-board JSON — for every open role at
   the company
3. GitHub org: language statistics, activity
4. The company's own site: open Wappalyzer rules for front-end fingerprinting
5. Region-specific sources, including official sponsorship registers — see
   [regions.md](regions.md)

**Stack inference** cross-validates three signals: keyword frequency across all of the
company's JDs, GitHub language statistics, and the front-end fingerprint. Anything
appearing in only one source is labelled low confidence rather than dropped.

**Résumé tailoring**

- One master résumé in JSON Resume schema; every bullet has a stable id
- Parse the JD → extract a skill vector → select relevant bullets → rewrite the wording →
  render a PDF from the region's Typst template
- Rewrites may reorder and re-emphasise and may not add facts; every output line carries
  `source_bullet_id`
- The user accepts the diff bullet by bullet

**Match score:** cosine similarity between JD and résumé embeddings, plus coverage of the
required skills, returning a score and an explicit list of what is missing.

## Module 3 — Outreach

For each target company, answer who to talk to, how to open, and when to follow up.
Sources are public and lawful; LinkedIn profiles are pasted by the user, never fetched.

| Role                        | What they can tell you                        | Priority |
| --------------------------- | --------------------------------------------- | -------- |
| Engineer on the target team | The real stack, team texture, interview style | High     |
| Hiring manager              | What the role actually needs, the timeline    | High     |
| Alumni / shared background  | Referral, culture                             | Medium   |
| Recruiter                   | Process, salary band                          | Medium   |
| Conference or blog author   | Technical direction, open problems            | Low      |

**Lawful lead sources:** engineering blog authors, conference and meetup speakers, core
GitHub contributors, meetup organisers.

**Flow:** the agent proposes roles and specific leads from the company profile → the user
adds or pastes contacts → AI drafts a first message grounded in something the person
actually published → a cadence runs day 1, day 5, day 12 → on reply it becomes
relationship upkeep, linked to the application.

**Boundary:** messages are drafted, never sent. Sending is the user's action, every time.

## Module 4 — Competency model and radar

Eight axes, five to eight sub-skills each, every sub-skill with observable behaviours
described at Junior / Mid / Senior. Scores come from aggregated evidence; a sub-skill with
no evidence reads "unknown" rather than zero.

**Axes:** coding · system design · AI/ML engineering · debugging · collaboration ·
communication · product sense · sales and influence.

**Writing the framework** is content work, author-led with AI assistance: start from public
engineering career ladders, rewrite for SDE and AI Engineer, and keep every level
description a behaviour you could observe ("can design and ship a service with caching and
a documented degradation path"), never an adjective.

**Scoring.** Each piece of evidence carries a score, a weight and a timestamp. A sub-skill
score is a weighted average with time decay:

$$S_k = \frac{\sum_i w_i \, s_i \, e^{-\lambda (t - t_i)}}{\sum_i w_i \, e^{-\lambda (t - t_i)}}$$

- Source weights (initial, to be calibrated): real interview feedback 1.0 > mock interview
  0.6 > project 0.5 > flashcard 0.3 > self-assessment 0.1
- Confidence is the volume of valid evidence; below a threshold the axis is drawn dashed

**Target overlay:** parse target JDs into a requirement vector, overlay it on the radar, and
send the three largest gaps into practice recommendations.

**UI:** ECharts radar; click an axis to drill into sub-skills, click a sub-skill to see the
evidence behind the number.

## Module 5 — Practice

Two tracks, technical and behavioural. Spaced repetition uses FSRS via `ts-fsrs` — not
rebuilt. Every card and every mock attaches to a competency sub-skill, so results feed the
radar.

**Flashcards.** `ts-fsrs` scheduling with four ratings (again / hard / good / easy). Cards
come from target-JD gaps, questions that caught the user out in a real interview, and the
insight library; AI drafts, the user approves before they enter the deck. The daily queue is
due cards plus new cards for the radar's weak axes, with a configurable new-card ceiling.

**Technical.** A bank organised by sub-skill: algorithms, system design, AI engineering,
debugging scenarios. System-design questions run as a mock dialogue where the AI probes
trade-offs, then scores against a rubric.

**Behavioural.** A STAR story library, each story tagged with the question types it answers
and the sub-skills it evidences. Before an interview the system recommends stories from the
company profile and flags the gaps nothing covers. Mocks score STAR completeness,
specificity and whether the result was quantified.

📋 Later — voice: Whisper transcription, with speaking rate, filler-word frequency, answer
length and structural completeness as metrics.

## Module 6 — Insight library

The differentiating module, and the one with no off-the-shelf equivalent. The premise: the
world runs on sales, so everything you learn gets filed and trained along sales dimensions.

| Dimension           | What it looks like in a job search                     |
| ------------------- | ------------------------------------------------------ |
| Opening             | Cold messages, the first three minutes of an interview |
| Discovery           | Asking an interviewer about the team's real problems   |
| Storytelling        | STAR answers, project walkthroughs                     |
| Value proposition   | "Why you"                                              |
| Handling objections | Doubts about experience, visa, language                |
| Building trust      | Follow-ups, referral relationships                     |
| Closing             | Asking for next steps, salary conversations            |
| Following up        | Thank-you notes, staying in touch after a rejection    |

**Capture** — the lower the friction the better: the mobile share sheet plus text, voice or
screenshot (the MVP path); a paste box on the web; an offline queue when there is no
network; the browser extension later, sharing code with JD clipping.

**Pipeline:** extract a one-sentence point and an actionable principle → tag one to three
sales dimensions (a small model suffices) → dedupe by embedding similarity into clusters →
generate one or two job-search drills → turn the insight itself into an FSRS card.

**The loop that makes it worth building**

- **Sparring:** the AI plays a difficult interviewer or client, the user applies the
  principle, the AI scores and names what went unused.
- **Pre-interview push:** three most relevant insights for this company and this round.
- **Debrief:** "what did you use today, and did it work?" — the answer becomes `evidence`
  on the sales and influence axis.
- Non-work content is welcome; the AI's job is to find the transferable principle.

## Module 7 — Portfolio risk dashboard

Treat the pipeline as a portfolio: watch concentration, coverage and conversion, track
market signals, and produce a weekly rebalance note.

| Metric                 | Computation                                                                               | Initial alert threshold                   |
| ---------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------- |
| Industry concentration | HHI over industry / company size                                                          | > 0.4                                     |
| Region concentration   | HHI over `region`                                                                         | > 0.6 (betting on one market)             |
| Sponsorship coverage   | Share of applications needing sponsorship where the employer is confirmed able to sponsor | < 60%                                     |
| Pipeline coverage      | In-flight applications × historical conversion ÷ target offers                            | < 1.5                                     |
| Stage conversion       | Ratio between adjacent stages                                                             | Materially below its own trailing average |
| Time in stage          | Median days per stage                                                                     | > 14 days without movement                |
| Expected offers        | Sum over in-flight applications of their stage's conversion rate                          | < 1                                       |

Concentration, where $s_i$ is category $i$'s share of applications:

$$HHI = \sum_i s_i^2$$

### Effort tiers

Each application gets a tier, managed like a position size. AI drives the preparation cost
down; the tier decides how much of the user's own time goes in.

| Tier             | What AI does                                                                    | What you do                              | Time each | Target share |
| ---------------- | ------------------------------------------------------------------------------- | ---------------------------------------- | --------- | ------------ |
| A — concentrated | Full profile, deep tailoring, contacts and outreach drafts, interview prep list | Review, talk to people, prepare properly | 1–2 h     | 10–20%       |
| B — standard     | Research summary plus a tailored résumé                                         | Skim the diff and apply                  | 10–15 min | 40–50%       |
| C — exploratory  | Match score plus light tailoring                                                | One-click confirm                        | < 2 min   | 30–40%       |

- The AI proposes a tier from match score and stated interest; the user can always override
- Capacity cap: at most five tier-A applications in flight (configurable); beyond that the
  system suggests downgrading or pausing
- Automatic promotion: a B or C application that gets an interview moves up a tier and the
  missing preparation material is generated
- Each tier gets its own conversion rate, and the weekly report recommends rebalancing

### Market signals

- News and funding: RSS plus search API, filtered to target companies and industries
- Layoffs and hiring freezes: public trackers and news
- Headcount time series: weekly pull of each target company's ATS board; two consecutive
  weeks down more than 30% raises an alert
- Every signal is written to `signals` with a severity

**Opportunity discovery:** rule-based scoring — recently funded, growing engineering
headcount, high skill match — pushes a company into the saved column; adjacent-industry
companies hiring fast surface as off-list opportunities.

**Output:** a weekly portfolio report produced by a scheduler plugin — metric changes, new
signals, rebalancing suggestions.

## Module 8 — Mobile

The mobile app is the always-ready surface: three seconds to save a lesson, five minutes to
send a tailored résumé. It is the only mobile capture path.

**Expo (React Native)**, because it shares TypeScript, `packages/core` and the Supabase
client with the web app, and because a native shell can register a real share extension —
iOS support for PWA share targets has never been dependable. Push via Expo Notifications,
distribution via EAS and TestFlight while it is personal.

**Capture (the core)**

- System share sheet: any article, post or video link goes straight into the insight library
- Three buttons on the home screen: text, voice, screenshot
- Voice: record, transcribe with Whisper, then the normal insight pipeline
- Screenshot: on-device OCR, which keeps a model call out of the path
- Offline queue, syncing when the network returns
- The user may label the capture as insight / job / contact; by default the AI decides

📋 Later — apply from the phone: share a job link, parse and score it in the background,
accept the diff on the phone, export the PDF and send it through the share sheet; the
application lands in the board as applied. The app prepares material; form submission stays
with the user.

**Reminders and dead time:** post-interview follow-ups, `next_action_at`, the daily due-card
count; an FSRS review screen for queueing-up time; ten minutes before an interview, the
company's key points and three relevant insights; after it, a one-tap voice debrief that
transcribes into the interview record and `evidence`.

## Plugin inventory

| Plugin              | Kind             | Module | Model tier |
| ------------------- | ---------------- | ------ | ---------- |
| `followup-writer`   | skill            | 1      | light      |
| `jd-parser`         | tool             | 1      | light      |
| `company-research`  | tool             | 2      | heavy      |
| `stack-inference`   | tool             | 2      | light      |
| `resume-tailor`     | skill            | 2      | heavy      |
| `contact-mapper`    | tool             | 3      | heavy      |
| `outreach-writer`   | skill            | 3      | light      |
| `card-generator`    | skill            | 5      | light      |
| `mock-interviewer`  | skill            | 5      | heavy      |
| `fsrs-scheduler`    | scheduler        | 5      | none       |
| `insight-ingest`    | tool             | 6      | none       |
| `insight-tagger`    | skill            | 6      | light      |
| `roleplay-sparring` | skill            | 6      | heavy      |
| `signal-scanner`    | tool + scheduler | 7      | light      |
| `portfolio-report`  | skill            | 7      | heavy      |
| `db-store`          | storage          | all    | none       |

Every plugin declares a daily call ceiling and a maximum step count, ships with regression
tests, and translates parameters only — the rules it applies live in `packages/core`.
