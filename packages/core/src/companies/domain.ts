/**
 * Reducing whatever someone typed into the key companies deduplicate on.
 *
 * `companies.domain` carries a database constraint that it equals its own
 * lowercased, trimmed form, and a unique index per user depends on it: the
 * migration that created the table says deduplication keys on the domain and
 * never on the display name, because "Stripe", "Stripe Inc" and "Stripe
 * Payments Europe" are one employer (supabase/migrations/20261105090000).
 *
 * That makes normalisation a rule rather than a convenience. If one surface
 * stores `https://www.Stripe.com/` and another stores `stripe.com`, the
 * unique index is satisfied and the employer has two rows — each with its own
 * cached research profile, each billed for separately.
 */

/* A hostname: dot-separated labels of letters, digits and hyphens, where no
   label begins or ends with a hyphen, and the last one is alphabetic and at
   least two characters. Deliberately not a full RFC 1035 implementation —
   this rejects what a person typing a company into a form gets wrong, which
   is a company name, an email address, or a sentence. */
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * Normalises a domain, or reports that the input was not one.
 *
 * Scheme, `www.`, port, path, query, fragment and surrounding whitespace are
 * all removed: none of them distinguish one employer from another.
 *
 * @param value Raw input, typically straight from a form field.
 * @returns The normalised domain, or `null` when nothing in the input was a
 *   domain. `null` covers both an empty field and `Stripe Inc` — the caller
 *   knows which it had, and the distinction between "not given" and "not
 *   valid" is the caller's to report (docs/code-standards.md).
 */
export function normaliseDomain(value: string): string | null {
  let candidate = value.trim().toLowerCase();

  /* Scheme, if the person pasted a URL. */
  candidate = candidate.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');

  /* Anything before an `@`: the credentials a pasted URL can carry, or the
     local part of an email address. Both identify a person; the employer is
     what follows. `careers@stripe.com` is a usable answer to this field. */
  candidate = candidate.replace(/^[^/@]*@/, '');

  /* Everything from the first path, query or fragment separator onwards. */
  candidate = candidate.split(/[/?#]/, 1)[0] ?? '';

  /* Port. */
  candidate = candidate.replace(/:\d+$/, '');

  /* A trailing dot is the DNS root and is legal in a hostname, but two rows
     differing only by it are the same employer. */
  candidate = candidate.replace(/\.+$/, '');

  /* `www` is not part of an employer's identity. Only the leading label, so
     `www.co.uk`-style nonsense does not get rewritten into something else. */
  candidate = candidate.replace(/^www\./, '');

  return HOSTNAME.test(candidate) ? candidate : null;
}
