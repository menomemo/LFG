import {describe, expect, it} from 'vitest';

import {parseInsightCapture, type InsightCaptureFields} from './capture';

/** A capture that passes, so each test can change one thing about it. */
const VALID: InsightCaptureFields = {
  text: 'Ask what the team is actually stuck on before pitching anything.',
  sourceUrl: '',
};

function capture(changes: Partial<InsightCaptureFields>) {
  return parseInsightCapture({...VALID, ...changes});
}

/** The problems, or a failure that says the input was wrongly accepted. */
function problems(result: ReturnType<typeof parseInsightCapture>): string {
  if (result.ok) {
    throw new Error(`expected a refusal, got ${JSON.stringify(result.value)}`);
  }
  return result.problems.join(' ');
}

describe('parseInsightCapture', () => {
  it('accepts a bare paste with no link', () => {
    expect(capture({})).toEqual({
      ok: true,
      value: {rawText: VALID.text, sourceUrl: null},
    });
  });

  it('trims the paste', () => {
    const result = capture({text: '  two sentences.  '});
    expect(result.ok && result.value.rawText).toBe('two sentences.');
  });

  it('keeps the blank line between two pasted paragraphs', () => {
    const quote = 'First paragraph.\n\nSecond paragraph.';
    const result = capture({text: `\n${quote}\n`});
    expect(result.ok && result.value.rawText).toBe(quote);
  });

  it('keeps a paste and a separately typed link as two things', () => {
    const result = capture({sourceUrl: 'https://example.com/post'});
    expect(result).toEqual({
      ok: true,
      value: {rawText: VALID.text, sourceUrl: 'https://example.com/post'},
    });
  });

  it('trims the link, since it is stored as a key', () => {
    const result = capture({sourceUrl: '  https://example.com/post  '});
    expect(result.ok && result.value.sourceUrl).toBe(
      'https://example.com/post',
    );
  });

  it('lifts a paste that is nothing but a link into the source', () => {
    const result = capture({text: 'https://example.com/post'});
    expect(result).toEqual({
      ok: true,
      value: {
        rawText: 'https://example.com/post',
        sourceUrl: 'https://example.com/post',
      },
    });
  });

  it('captures a link that arrives in the source field alone', () => {
    /* The share sheet's shape: a link, no prose. The link is the capture. */
    const result = capture({text: '', sourceUrl: 'https://example.com/post'});
    expect(result).toEqual({
      ok: true,
      value: {
        rawText: 'https://example.com/post',
        sourceUrl: 'https://example.com/post',
      },
    });
  });

  it('does not treat a link with a note after it as a bare link', () => {
    const result = capture({text: 'https://example.com/post — worth reading'});
    expect(result).toEqual({
      ok: true,
      value: {
        rawText: 'https://example.com/post — worth reading',
        sourceUrl: null,
      },
    });
  });

  it('prefers the typed link over one inferred from the paste', () => {
    const result = capture({
      text: 'https://example.com/shortened',
      sourceUrl: 'https://example.com/the-real-article',
    });
    expect(result.ok && result.value.sourceUrl).toBe(
      'https://example.com/the-real-article',
    );
    expect(result.ok && result.value.rawText).toBe(
      'https://example.com/shortened',
    );
  });

  it('refuses an empty capture, naming both ways to fill it', () => {
    const refusal = problems(capture({text: '   ', sourceUrl: ''}));
    expect(refusal).toContain('nothing to capture');
    expect(refusal).toContain('link');
  });

  it('refuses a source that is not an http address', () => {
    expect(problems(capture({sourceUrl: 'example.com/post'}))).toContain(
      'http or https',
    );
  });

  it('refuses a javascript: source', () => {
    expect(problems(capture({sourceUrl: 'javascript:alert(1)'}))).toContain(
      'http or https',
    );
  });

  it('refuses a bad source even when the box is empty', () => {
    /* Otherwise the empty-box path would accept an unusable link as the whole
       capture, and the row would be text nobody can read and a link nothing
       can fetch. */
    expect(problems(capture({text: '', sourceUrl: 'not a link'}))).toContain(
      'http or https',
    );
  });

  it('does not mistake prose that mentions a site for a link', () => {
    const text = 'Read the Monzo engineering blog at monzo.com sometime.';
    const result = capture({text});
    expect(result.ok && result.value.sourceUrl).toBe(null);
  });
});
