import {describe, expect, it} from 'vitest';

import {MAX_WRITTEN_CHARS, parseInsightTagging} from './tagging';
import {insightTaggingPrompt} from './tagging-prompt';
import {SALES_DIMENSIONS} from './insight';

/** An answer that passes, so each test can change one thing about it. */
const VALID = {
  summary: 'Asking what they tried first earns the right to propose anything.',
  principle: 'Open with a question about their current approach.',
  dims: ['discovery', 'opening'],
};

function tag(changes: Record<string, unknown>) {
  return parseInsightTagging({...VALID, ...changes});
}

/** The tagging, or a failure that says the answer was wrongly refused. */
function tagged(result: ReturnType<typeof parseInsightTagging>) {
  if (!result.ok) {
    throw new Error(`expected a tagging, got ${result.problems.join(' ')}`);
  }
  if (result.value.kind !== 'tagged') {
    throw new Error('expected a tagging, got a declining');
  }
  return result.value.tagging;
}

/** The problems, or a failure that says the answer was wrongly accepted. */
function problems(result: ReturnType<typeof parseInsightTagging>): string {
  if (result.ok) {
    throw new Error(`expected a refusal, got ${JSON.stringify(result.value)}`);
  }
  return result.problems.join(' ');
}

describe('parseInsightTagging', () => {
  it('accepts a well-formed answer', () => {
    expect(parseInsightTagging(VALID)).toEqual({
      ok: true,
      value: {
        kind: 'tagged',
        tagging: {
          summary: VALID.summary,
          principle: VALID.principle,
          dims: ['discovery', 'opening'],
        },
      },
    });
  });

  it('keeps the model’s ordering of the dimensions', () => {
    const result = tag({dims: ['closing', 'trust']});
    expect(tagged(result).dims).toEqual(['closing', 'trust']);
  });

  it('trims the sentences', () => {
    const result = tag({summary: '  A point.  '});
    expect(tagged(result).summary).toBe('A point.');
  });

  it('refuses something that is not an object', () => {
    expect(problems(parseInsightTagging('a summary, probably'))).toContain(
      'not a JSON object',
    );
    expect(problems(parseInsightTagging([VALID]))).toContain(
      'not a JSON object',
    );
    expect(problems(parseInsightTagging(null))).toContain('not a JSON object');
  });

  it('reads an empty object as the model declining, not as a failure', () => {
    /* `{}` means the capture said nothing worth filing. Accepted, so the
       caller does not spend the one allowed retry asking a model to correct
       an answer that was right — and does not press it, on the second pass,
       to find something it has just said is not there. */
    expect(parseInsightTagging({})).toEqual({
      ok: true,
      value: {kind: 'declined'},
    });
  });

  it('collects every problem rather than the first', () => {
    const refusal = problems(
      parseInsightTagging({summary: 7, principle: '', dims: 'discovery'}),
    );
    expect(refusal).toContain('"summary"');
    expect(refusal).toContain('"principle"');
    expect(refusal).toContain('"dims"');
  });

  it('refuses a missing summary', () => {
    expect(problems(tag({summary: undefined}))).toContain('"summary"');
  });

  it('refuses a missing principle', () => {
    expect(problems(tag({principle: undefined}))).toContain('"principle"');
  });

  it('refuses a paragraph where a sentence was asked for', () => {
    const paragraph = 'a'.repeat(MAX_WRITTEN_CHARS + 1);
    expect(problems(tag({summary: paragraph}))).toContain('one sentence');
  });

  it('accepts a sentence exactly at the limit', () => {
    const atLimit = 'a'.repeat(MAX_WRITTEN_CHARS);
    expect(tag({summary: atLimit}).ok).toBe(true);
  });

  it('refuses a ninth dimension by name rather than dropping it', () => {
    /* A dropped tag is a capture that reads as filed and is not findable
       under anything. The enum exists to stop exactly this. */
    const refusal = problems(tag({dims: ['discovery', 'negotiation']}));
    expect(refusal).toContain('negotiation');
  });

  it('refuses an empty dims array', () => {
    expect(problems(tag({dims: []}))).toContain('at least one');
  });

  it('refuses more than three dimensions', () => {
    expect(problems(tag({dims: SALES_DIMENSIONS.slice(0, 4)}))).toContain(
      'at most 3',
    );
  });

  it('collapses a repeated dimension instead of spending the retry', () => {
    const result = tag({dims: ['discovery', 'discovery', 'closing']});
    expect(tagged(result).dims).toEqual(['discovery', 'closing']);
  });

  it('accepts a dimension the model shouted', () => {
    const result = tag({dims: [' Discovery ']});
    expect(tagged(result).dims).toEqual(['discovery']);
  });

  it('refuses a dims array containing a non-string', () => {
    expect(problems(tag({dims: [{name: 'discovery'}]}))).toContain(
      'must be a string',
    );
  });

  it('ignores keys nobody asked for', () => {
    expect(tag({confidence: 0.9, notes: 'hope this helps'}).ok).toBe(true);
  });
});

describe('insightTaggingPrompt', () => {
  it('names every dimension, so the enum cannot outgrow the prompt', () => {
    const prompt = insightTaggingPrompt();
    for (const dimension of SALES_DIMENSIONS) {
      expect(prompt).toContain(dimension);
    }
  });

  it('tells the model the sentence limit it will be judged against', () => {
    expect(insightTaggingPrompt()).toContain(MAX_WRITTEN_CHARS.toString());
  });

  it('asks for JSON and nothing else', () => {
    expect(insightTaggingPrompt()).toContain('single JSON object');
  });
});
