# Security

## Reporting a vulnerability

**Please do not open a public issue.** Use GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository. A dedicated security contact address will be published here before the
public launch.

Please include what you found, how to reproduce it, and what an attacker could reach with
it. If you are unsure whether something counts, report it anyway.

**What to expect.** This is a single-maintainer project, so acknowledgement within a few
days rather than hours. I will tell you what I think the severity is, what I intend to do,
and when. I will credit you unless you ask me not to.

**Please do not** test against anyone else's data, use automated scanners against the hosted
service, or run a denial-of-service test. A local instance is the right place to prove a
finding.

## Supported versions

Pre-alpha; there are no releases yet. Until the first release, only `main` is supported.

## What this project holds

Taking the reporting instructions seriously requires knowing what is actually at stake. Per
user, the database holds: a full employment history and résumé content, interview notes and
feedback, private assessments of companies, contact details for third parties the user has
recorded, and — in the insight library — unfiltered personal notes. It may also hold
information that implies someone's immigration status.

That is a more sensitive dataset than a job tracker sounds like, which is why the following
are architectural rather than aspirational.

## Security model

| Control           | How it works                                                                                                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenancy           | Every table carries `user_id` with row-level security enabled in the migration that creates the table. The boundary is in the database, so a bug in a surface cannot bypass it ([ADR-0002](docs/adr/0002-use-supabase-as-the-primary-datastore.md)) |
| Tested isolation  | An automated test proves one user cannot read another's rows. It is required, not optional ([code-standards.md](docs/code-standards.md#tests))                                                                                                      |
| Privileged access | Surfaces use the end user's token. The service key is confined to scheduler plugins, which pass an explicit user context                                                                                                                            |
| Secrets           | Environment configuration only, never committed. Git history is scanned before the repository goes public                                                                                                                                           |
| Logs              | Ids, not content. No résumé text, interview notes or personal data in logs                                                                                                                                                                          |
| Model providers   | Content sent for inference goes to third-party providers. The current list is published in the privacy policy and kept in step with configuration changes                                                                                           |
| Input handling    | All external input, model output included, is schema-validated at the boundary and never evaluated                                                                                                                                                  |

## Data collection stance

These are product commitments, not settings, and they bound the damage any single bug can
do:

- **No scraping.** Public APIs and user-entered content only. No LinkedIn automation, no
  credentialed scraping, no bot-detection evasion.
- **Nothing is sent on a user's behalf.** The product drafts messages and prepares
  documents; a human presses send. There is no code path that can email, message or submit
  an application autonomously.
- **No fabrication.** Generated résumé content is traceable to a source bullet by a
  `NOT NULL` database column, not by convention.
- **Third-party data is minimal.** `contacts` holds other people's information; it is
  user-entered or from a public professional source, and it is covered by the same export
  and deletion controls as everything else.

## Privacy and GDPR

Users are in the UK, Ireland, Estonia, Japan and Germany, so GDPR and the UK GDPR apply.
Data export and account deletion are features with a Phase 5 deadline, not requests to be
handled by hand — see [docs/launch.md](docs/launch.md) for the readiness checklist.
