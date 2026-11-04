# Region playbook

| | |
| --- | --- |
| **Status** | Living document |
| **Last reviewed** | 2026-11-04 |
| **Markets** | 🇬🇧 UK (home base) · 🇮🇪 Ireland · 🇪🇪 Estonia · 🇯🇵 Japan — wave 1 · 🇩🇪 Germany — wave 2 |

Why this document exists: searching in four countries at once means four sets of visa
routes, sourcing channels, résumé artefacts and etiquette. Keeping that in a person's head
does not scale, which is why `region` is a first-class column rather than a label
([ADR-0004](adr/0004-treat-region-as-a-first-class-dimension.md)).

> [!IMPORTANT]
> **No thresholds, salaries or quotas are written in this document, and none belong in
> application code.** They have changed repeatedly across all five markets and will change
> again. Numbers live in one configuration module in `packages/core` with a
> `checked_on` date per entry, and the UI shows that date whenever it shows the number.
> This document names routes and links the official source; the official source is always
> the authority.

## At a glance

| | 🇬🇧 UK | 🇮🇪 Ireland | 🇪🇪 Estonia | 🇯🇵 Japan | 🇩🇪 Germany |
| --- | --- | --- | --- | --- | --- |
| Wave | 1 (home) | 1 | 1 | 1 | 2 |
| JD language | English | English | English in tech | Japanese-first, English at global firms | German-first, English at startups/global firms |
| Résumé artefact | 2-page CV, no photo | 2-page CV, no photo | EU-style CV | 履歴書 + 職務経歴書, or English CV at global firms | Lebenslauf + Anschreiben |
| Employer sponsorship needed | Yes, licensed sponsor | Yes, employment permit | Yes, unless EU-eligible | Yes, certificate of eligibility | Yes, unless EU Blue Card eligible |
| Public sponsor register | ✅ Yes — a real data source | Partial (trusted-partner scheme) | ❌ No | ❌ No | ❌ No |
| Funnel shape | Direct + grad schemes | Direct, heavy multinational presence | Direct, small market, high signal | Agency-mediated | Direct + portals |
| Typical time to offer | Weeks | Weeks | Fast | Long, multi-round | Moderate, structured |

## 🇬🇧 United Kingdom — home base

**Routes.** Skilled Worker (requires an employer holding a sponsor licence), Graduate route
(post-study), High Potential Individual, Global Talent.
Source: [gov.uk work visas](https://www.gov.uk/browse/visas-immigration/work-visas).

**The register is the feature.** The Home Office publishes the
[register of licensed sponsors](https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers)
as a downloadable file. This is the only market where sponsorship capability can be checked
against an authoritative list instead of inferred, which is what makes the sponsorship
coverage metric honest. Ingest it on a schedule, match on normalised company name **and**
keep the raw matched string, because name matching against the register is fuzzy and a
wrong match here is worse than no match.

**Channels.** Greenhouse / Lever / Ashby / Workday boards, LinkedIn, Welcome to the Jungle
(formerly Otta), Indeed; graduate schemes via Bright Network and Gradcracker, which run on
their own early-autumn calendar rather than on vacancy-driven timing.

**CV.** Two pages, reverse-chronological, no photo, no date of birth, no marital status.
Cover letters still common. References on request, not listed.

**Etiquette.** Recruiter screen → technical → final, often with a take-home. Salary is
usually discussed early and openly.

## 🇮🇪 Ireland

**Routes.** Critical Skills Employment Permit — software roles typically sit on the critical
skills list, which is the fast path — General Employment Permit, and the Third Level
Graduate Programme (Stamp 1G) for graduates of Irish institutions.
Source: [Employment permits, DETE](https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/).

**Channels.** The Dublin offices of large US technology companies dominate and hire through
their global ATS; then IrishJobs.ie, Jobs.ie, LinkedIn.

**CV.** Same conventions as the UK. One CV serves both markets, which is why they are built
together.

**Worth knowing.** Because so much hiring is into EMEA offices of US companies, the research
agent should distinguish "hiring in Dublin" from "headquartered in Dublin" — the interview
loop, the stack and the decision-maker often sit in another country.

## 🇪🇪 Estonia

**Routes.** EU Blue Card, Startup Visa, registration of short-term employment, Digital
Nomad Visa. Source: [Work in Estonia](https://www.workinestonia.com/) and the
[Police and Border Guard Board](https://www.politsei.ee/en).

**Channels.** [Work in Estonia](https://www.workinestonia.com/job-offers/), cv.ee,
MeetFrank, the Startup Estonia database, and company boards directly.

**CV.** EU-style CV, English is fine throughout the technology sector.

**Worth knowing.** The market is small enough that the whole target list is tractable —
a few hundred companies rather than tens of thousands. That makes exhaustive, high-quality
coverage realistic here in a way it is not in the UK, and makes Estonia the right market to
test the research agent's depth against.

## 🇯🇵 Japan — its own track

Japan is not "another English-language market with a different flag", and pretending
otherwise is the fastest way to build something that does not work there.

**Routes.** Engineer / Specialist in Humanities / International Services
(技術・人文知識・国際業務) is the standard engineering route; Highly Skilled Professional
operates on a points system with real benefits; J-Find exists for recent graduates of
ranked universities. All require a Certificate of Eligibility obtained by the employer
before the visa.
Source: [Immigration Services Agency](https://www.isa.go.jp/en/index.html).

**Channels.** Agencies matter far more than in Europe — Robert Walters, Computer Futures,
and domestic recruiters. Then TokyoDev and Japan Dev for English-speaking roles, Wantedly,
BizReach, Green. LinkedIn is weaker here than anywhere else on the list.

**Documents.** Domestic employers expect 履歴書 (a standardised form, with photo) plus
職務経歴書 (a detailed work-history document). Global and English-first employers accept a
normal CV. The system must therefore render two genuinely different artefacts from the same
`base_json`, not restyle one.

**Language.** JLPT level is a real gate; many roles expect around N2, English-first
employers expect none. This is exactly why `jobs.language_required` carries a level and
evidence rather than a boolean.

**Etiquette and timing.** More rounds, longer cycles, a stronger expectation of commitment
and of knowing why *this* company. The follow-up cadence and the pre-interview prep need
different copy, which is a reason region drives reminder text and not just metric slicing.

## 🇩🇪 Germany — wave 2

**Routes.** EU Blue Card, Skilled Worker visa, and the Opportunity Card (Chancenkarte),
a points-based route for job seeking in Germany.
Source: [Make it in Germany](https://www.make-it-in-germany.com/en/).

**Channels.** StepStone, Xing alongside LinkedIn, Honeypot, Arbeitnow, Berlin Startup Jobs.

**Documents.** A Lebenslauf is tabular and more formal than a UK CV; the Anschreiben
(cover letter) carries real weight; applications traditionally include Zeugnisse —
reference certificates and transcripts — as attachments. A photo is traditional but
declining, partly because of anti-discrimination law; default to omitting it.

**Why wave 2.** Germany needs the language-requirement handling built for Japan plus a
third document template. Both arrive cheaply once the Japan track exists, and expensively
if attempted first.

## How this reaches the code

| Mechanism | Where |
| --- | --- |
| `region` enum on companies, jobs, applications | [data-model.md](data-model.md) |
| Résumé template and content policy per region | `resume_versions.region_profile` → Typst templates |
| Language requirement with level and evidence | `jobs.language_required`, participates in match scoring |
| Sponsorship state, inferred vs. confirmed, kept distinct | `jobs.visa_sponsorship` with `generated_by` |
| Region concentration and sponsorship coverage | [Risk dashboard](product-spec.md#module-7--portfolio-risk-dashboard) |
| Thresholds and numbers with a `checked_on` date | One config module in `packages/core` |
| Reminder and outreach copy per region | Plugin prompt templates keyed by region |

## Maintenance

Review this document at the start of each phase, and whenever a market's rules are in the
news. Every external claim carries a link; when a claim is updated, update
**Last reviewed** at the top and the `checked_on` date on the matching config entry. A
stale number presented confidently is worse than no number at all — this is a document
people would make decisions about their immigration status on.
