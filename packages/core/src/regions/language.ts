/**
 * Language requirements attached to a job.
 *
 * This is a level, not a boolean, because the difference between "JLPT N2
 * required" and "some Japanese appreciated" decides whether an application is
 * worth making at all. Japan and Germany are the reason the column exists;
 * see docs/regions.md.
 */

/** A language gate on a job, as recorded in `jobs.language_required`. */
export interface LanguageRequirement {
  /** ISO 639-1 code, lowercase. `ja`, `de`. */
  readonly language: string;
  /** The bar, in whatever vocabulary the market uses: `JLPT N2`, `B2`. */
  readonly level: string;
  /** Where the requirement was stated, or `null` when it was inferred. */
  readonly evidence: string | null;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(
      `language_required.${key} must be a non-empty string, got ` +
        `${JSON.stringify(value)}.`,
    );
  }
  return value;
}

/**
 * Parses a `jobs.language_required` value that came out of Postgres as JSON.
 *
 * The boundary again: the database guarantees the value is an object and
 * nothing more, so the shape is checked here rather than cast and hoped for.
 *
 * @param value The raw column value. `null` and `undefined` both mean no
 *   requirement was recorded — which is not the same as "no language is
 *   required", merely that nobody has established one.
 * @returns The requirement, or `null` when none is recorded.
 * @throws TypeError If the value is present but not a well-formed
 *   requirement. Failing is the point: a language gate silently dropped is an
 *   application made into a wall.
 */
export function parseLanguageRequirement(
  value: unknown,
): LanguageRequirement | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(
      `language_required must be an object or null, got ${typeof value}.`,
    );
  }

  const record = value as Record<string, unknown>;
  const evidence = record.evidence;
  if (
    evidence !== undefined &&
    evidence !== null &&
    typeof evidence !== 'string'
  ) {
    throw new TypeError(
      `language_required.evidence must be a string or null, got ` +
        `${JSON.stringify(evidence)}.`,
    );
  }

  return {
    language: requireString(record, 'language').toLowerCase(),
    level: requireString(record, 'level'),
    evidence: typeof evidence === 'string' ? evidence : null,
  };
}

/**
 * One-line rendering of a requirement, for a list that has no room for more.
 *
 * @example `JA · JLPT N2`
 */
export function formatLanguageRequirement(
  requirement: LanguageRequirement,
): string {
  return `${requirement.language.toUpperCase()} ${requirement.level}`;
}
