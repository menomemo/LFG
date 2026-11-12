import {describe, expect, it} from 'vitest';

import {
  insightProgress,
  insightProgressLabel,
  isSalesDimension,
  SALES_DIMENSIONS,
  salesDimensionLabel,
  summariseLibrary,
  type InsightProcessing,
} from './insight';

/** A row as it exists the moment it is captured and nothing more. */
const CAPTURED: InsightProcessing = {
  summary: null,
  principle: null,
  dims: [],
};

describe('sales dimensions', () => {
  it('has the eight the product spec lists', () => {
    expect(SALES_DIMENSIONS).toHaveLength(8);
  });

  it('recognises a stored value', () => {
    expect(isSalesDimension('value_proposition')).toBe(true);
  });

  it('refuses a ninth dimension a tagger might invent', () => {
    expect(isSalesDimension('negotiation')).toBe(false);
  });

  it('labels every dimension without throwing', () => {
    const labels = SALES_DIMENSIONS.map(salesDimensionLabel);
    expect(labels).toHaveLength(new Set(labels).size);
    expect(labels.every(label => label !== '')).toBe(true);
  });

  it('expands the three whose column value is not their name', () => {
    expect(salesDimensionLabel('objections')).toBe('Handling objections');
    expect(salesDimensionLabel('trust')).toBe('Building trust');
    expect(salesDimensionLabel('value_proposition')).toBe('Value proposition');
  });
});

describe('insightProgress', () => {
  it('calls a row with only raw text captured', () => {
    expect(insightProgress(CAPTURED)).toBe('captured');
  });

  it('calls a summarised but untagged row read', () => {
    expect(
      insightProgress({...CAPTURED, summary: 'Ask before pitching.'}),
    ).toBe('read');
  });

  it('calls a tagged but unsummarised row tagged', () => {
    /* The table permits it: it constrains a principle to have a summary and
       says nothing about tags. Folding this into `read` would be a surface
       claiming a summary that is not there. */
    expect(insightProgress({...CAPTURED, dims: ['discovery']})).toBe('tagged');
  });

  it('calls a row with both filed', () => {
    expect(
      insightProgress({
        summary: 'Ask before pitching.',
        principle: 'Open with the problem, not the product.',
        dims: ['discovery', 'opening'],
      }),
    ).toBe('filed');
  });

  it('does not count a principle as a summary', () => {
    /* Unreachable through the database, which refuses it. Pinned anyway: the
       pipeline writes these one at a time and this function is what a
       half-written row is read through. */
    expect(
      insightProgress({...CAPTURED, principle: 'Lead with the problem.'}),
    ).toBe('captured');
  });

  it('labels every state, and says what is missing', () => {
    expect(insightProgressLabel(insightProgress(CAPTURED))).toContain(
      'not read yet',
    );
    expect(insightProgressLabel('filed')).toBe('Read and tagged');
  });
});

describe('summariseLibrary', () => {
  it('is three zeros for an empty library', () => {
    expect(summariseLibrary([])).toEqual({captured: 0, read: 0, tagged: 0});
  });

  it('separates what was captured from what was processed', () => {
    expect(
      summariseLibrary([
        CAPTURED,
        CAPTURED,
        {...CAPTURED, summary: 'A point.'},
        {summary: 'A point.', principle: 'A principle.', dims: ['closing']},
      ]),
    ).toEqual({captured: 4, read: 2, tagged: 1});
  });

  it('counts a library nothing has processed as captured only', () => {
    /* The number the page has to be able to say out loud: forty-one captures
       and no summaries is a notebook, not a library. */
    const many = Array.from({length: 41}, () => CAPTURED);
    expect(summariseLibrary(many)).toEqual({
      captured: 41,
      read: 0,
      tagged: 0,
    });
  });
});
