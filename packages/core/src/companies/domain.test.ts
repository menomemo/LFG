import {describe, expect, it} from 'vitest';

import {normaliseDomain} from './domain.ts';

describe('normaliseDomain', () => {
  it.each([
    ['a bare domain', 'stripe.com', 'stripe.com'],
    ['mixed case', 'Stripe.COM', 'stripe.com'],
    ['surrounding whitespace', '  stripe.com  ', 'stripe.com'],
    ['an https scheme', 'https://stripe.com', 'stripe.com'],
    ['an http scheme', 'http://stripe.com', 'stripe.com'],
    ['a www prefix', 'www.stripe.com', 'stripe.com'],
    ['both at once', 'HTTPS://WWW.Stripe.com', 'stripe.com'],
    ['a trailing slash', 'https://stripe.com/', 'stripe.com'],
    ['a path', 'https://stripe.com/jobs/engineering', 'stripe.com'],
    ['a query string', 'https://stripe.com/jobs?id=4', 'stripe.com'],
    ['a fragment', 'stripe.com/#careers', 'stripe.com'],
    ['a port', 'https://stripe.com:443/jobs', 'stripe.com'],
    ['a trailing dot, which is the DNS root', 'stripe.com.', 'stripe.com'],
    ['an email address', 'careers@stripe.com', 'stripe.com'],
    ['url credentials', 'https://user:pw@stripe.com/jobs', 'stripe.com'],
    ['a subdomain, which is not www', 'jobs.stripe.com', 'jobs.stripe.com'],
    ['a multi-part suffix', 'www.monzo.co.uk', 'monzo.co.uk'],
    ['a hyphen', 'my-company.io', 'my-company.io'],
    ['digits', 'web3.dev', 'web3.dev'],
  ])('normalises %s', (_label, input, expected) => {
    expect(normaliseDomain(input)).toBe(expected);
  });

  it('reduces the three ways one employer gets typed to one key', () => {
    const keys = new Set(
      ['https://www.Stripe.com/', 'stripe.com', 'STRIPE.COM/jobs'].map(
        normaliseDomain,
      ),
    );
    expect(keys.size).toBe(1);
  });

  it.each([
    ['an empty field', ''],
    ['whitespace only', '   '],
    ['a company name', 'Stripe Inc'],
    ['a single label with no dot', 'stripe'],
    ['a numeric suffix', 'stripe.123'],
    ['a one-letter suffix', 'stripe.c'],
    ['a label ending in a hyphen', 'stripe-.com'],
    ['a label starting with a hyphen', '-stripe.com'],
    ['an empty label', 'stripe..com'],
    ['a sentence', 'I think it is stripe dot com'],
    ['a scheme and nothing else', 'https://'],
    ['an underscore, which is not legal in a hostname', 'my_company.com'],
  ])('refuses %s', (_label, input) => {
    expect(normaliseDomain(input)).toBeNull();
  });

  it('is idempotent, so storing a stored value changes nothing', () => {
    const once = normaliseDomain('https://WWW.Stripe.com/jobs');
    expect(once).not.toBeNull();
    expect(normaliseDomain(once ?? '')).toBe(once);
  });

  it('returns a value that satisfies the database constraint', () => {
    /* companies.domain is checked to equal lower(trim(domain)). */
    const domain = normaliseDomain(' HTTPS://WWW.Example.COM/careers ') ?? '';
    expect(domain).toBe(domain.trim().toLowerCase());
  });
});
