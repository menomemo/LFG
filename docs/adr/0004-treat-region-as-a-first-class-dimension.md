# ADR-0004: Treat region as a first-class dimension

|              |            |
| ------------ | ---------- |
| **Status**   | Accepted   |
| **Date**     | 2026-11-04 |
| **Deciders** | @Yihong    |

## Context

The first user is based in the United Kingdom and searching in the UK, Ireland, Estonia and
Japan simultaneously, with Germany to follow. These markets differ in ways that are not
cosmetic:

- **Document artefacts differ in kind, not style.** Japan expects 履歴書 and 職務経歴書 —
  two documents with a prescribed shape. The UK and Ireland expect a two-page CV with no
  photo. Germany expects a Lebenslauf with a cover letter and reference certificates.
- **Language is a hard gate.** A Japanese role may require JLPT N2. A German startup may
  require none. This has to participate in match scoring, not sit in a notes field.
- **Visa sponsorship is a different question per market**, and in the UK alone it can be
  checked against an authoritative public register of licensed sponsors, which the other
  markets do not publish.
- **Funnel shape and etiquette differ**, so reminder cadence and outreach copy should too.
- **Concentration risk is regional.** Four countries in the pipeline is a hedge; a pipeline
  that is 90% one country while believing itself diversified is a hidden bet.

The cheap option is a free-text `location` field, as every job tracker has.

## Decision

> We will model `region` as a Postgres enum (`uk`, `ie`, `ee`, `jp`, `de`, `other`) on
> `companies`, `jobs` and `applications`, and let it drive résumé template selection,
> language-requirement handling, sponsorship checks, reminder and outreach copy, and metric
> slicing. Region-dependent policy lives in one module in `packages/core`. Thresholds and
> salary figures live in configuration with a `checked_on` date per entry, never in code
> and never in prose documentation. Market knowledge is maintained in
> [../regions.md](../regions.md).

## Alternatives considered

| Option                             | What it would give us                        | Why not                                                                                                                                                        |
| ---------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free-text `location`               | Nothing to design, handles anywhere on earth | Cannot drive behaviour. Visa and language constraints have to be queryable and must participate in matching and alerting                                       |
| ISO country code, no enum          | Universal, no migration to add a market      | Invites rows for 190 countries we have no playbook for, and loses the compile-time exhaustiveness check that forces a template decision when a market is added |
| Per-region deployments or schemas  | Clean separation                             | Absurd at this scale. One user searching four markets needs them joined in one pipeline, not partitioned                                                       |
| Handle Japan as a separate product | Honest about how different it is             | The point of the product is one pipeline across markets; splitting it discards the only feature no competitor has                                              |
| Defer regions until after Phase 2  | Faster Phase 1                               | The résumé renderer and the matcher are both built in Phase 2 and both need it. Adding it after means rebuilding both                                          |

## Consequences

**What this makes easier**

- Region concentration and sponsorship coverage become real metrics rather than intuitions
- Adding Germany is adding an enum value, a template and a config entry — the generalisation
  work is paid for once, by Japan
- Exhaustive `switch` over the enum means the compiler asks the right question when a market
  is added: what does a résumé look like there?
- Market rules stay in one documented place rather than spread through prompts

**What this makes harder**

- Adding a market requires a migration, not a text entry, so casual exploration of a fifth
  market has friction
- `other` will accumulate anything outside the list and will need a policy of its own
- Multinationals hiring across several of our markets strain a single-valued column on
  `companies`; this is an open schema question in [../data-model.md](../data-model.md)
- Region-specific copy multiplies the prompt templates to maintain and regression-test

**What this commits us to**

- Keeping `regions.md` current, and to the discipline that no threshold is written into
  code or prose. The exit cost of widening to an ISO code later is a cheap migration; the
  cost of having started with free text would have been rebuilding the renderer and matcher

**What to watch**

- `other` growing beyond a few percent of rows: the enum is then the wrong shape
- Any region conditional appearing outside the policy module in `core`
- A stale `checked_on` date reaching the UI — a confidently displayed obsolete visa rule is
  the most damaging single bug this product could ship
