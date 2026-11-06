'use client';

import {useActionState, useState} from 'react';

import {
  type ApplicationDraftFields,
  APPLICATION_STAGES,
  REGIONS,
  SPONSORSHIP_VALUES,
  WORK_MODES,
  regionLabel,
} from '@lfg/core';

import {createApplication} from '@/app/actions';
import {AdvertPaste} from '@/app/advert-paste';
import {EMPTY_CREATE_FORM} from '@/app/create-application-state';
import type {SupabasePublicConfig} from '@/lib/supabase/browser';

/**
 * The form that puts a role on the board.
 *
 * One form, three rows: an application points at a job and a job points at a
 * company, and asking for them in three steps would be asking the person to
 * know the schema. The server action writes all three
 * (apps/web/app/actions.ts).
 *
 * Nothing here validates. The rules are in `parseApplicationDraft` in
 * `packages/core`, so the mobile app and the JD parser get the same answers
 * from the same code (ADR-0003); the browser's own `required` is a
 * convenience, not the check.
 *
 * Market has no default. A pre-selected region is a guess about where someone
 * is applying, and a guess that lands silently picks the wrong résumé
 * template and the wrong visa question (ADR-0004).
 *
 * Every field is seeded from the action's state, which carries back what was
 * submitted. React resets an uncontrolled form once its action returns, so
 * without this a refused submission would clear eight fields and leave the
 * person to type them again.
 *
 * A parsed advert seeds the same fields through a second piece of state
 * rather than through the action's. `useActionState` owns its state and has
 * no setter, so an extraction cannot be written into it; keeping the seed
 * separate also keeps the precedence honest -- what the person last
 * submitted wins over what a model suggested, because they have seen one of
 * those and may not have read the other.
 */
/**
 * The remount key for the form.
 *
 * A function rather than a template literal because the lint rule against
 * interpolating numbers is right: `${undefined}` reads as "undefined" and
 * silently becomes a key that never changes. Taking numbers as arguments
 * makes that impossible.
 */
function formKey(attempt: number, seedVersion: number): string {
  return `${attempt.toString()}-${seedVersion.toString()}`;
}

export function CreateApplication({config}: {config: SupabasePublicConfig}) {
  const [state, formAction, pending] = useActionState(
    createApplication,
    EMPTY_CREATE_FORM,
  );
  const [seed, setSeed] = useState<{
    readonly fields: ApplicationDraftFields;
    readonly version: number;
  } | null>(null);

  /* The action's own state wins once it has one: `attempt` is zero until a
     submission returns, so a seed only shows while nothing has been sent. */
  const fields =
    state.attempt === 0 && seed !== null ? seed.fields : state.fields;

  return (
    <details className="create">
      <summary>Add an application</summary>

      <AdvertPaste
        config={config}
        onExtracted={extracted => {
          /* `stage` is not in an extraction -- nothing in an advert says
             what stage an application is in -- so the blank form's value
             carries through rather than being asked of a model. */
          setSeed(previous => ({
            fields: {...EMPTY_CREATE_FORM.fields, ...extracted},
            version: (previous?.version ?? 0) + 1,
          }));
        }}
      />

      {/* Keyed on both counters so that either a submission or a fresh
          extraction remounts the form. React applies a `<select>`'s
          defaultValue only on mount, so without the remount a parsed market
          and work mode would stay blank while the text fields changed --
          the half-filled form that is worse than either whole one. */}
      <form
        action={formAction}
        key={formKey(state.attempt, seed?.version ?? 0)}
      >
        <div className="fields">
          <label>
            Company
            <input
              name="company"
              required
              autoComplete="off"
              defaultValue={fields.company}
            />
          </label>

          <label>
            Website
            <input
              name="domain"
              placeholder="stripe.com, optional"
              defaultValue={fields.domain}
            />
          </label>

          <label className="wide">
            Role
            <input
              name="role"
              required
              autoComplete="off"
              defaultValue={fields.role}
            />
          </label>

          <label>
            Market
            <select name="region" defaultValue={fields.region} required>
              <option value="">choose a market</option>
              {REGIONS.map(region => (
                <option key={region} value={region}>
                  {regionLabel(region)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Work mode
            <select name="workMode" defaultValue={fields.workMode}>
              <option value="">not stated</option>
              {WORK_MODES.map(mode => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>

          <label>
            Sponsors a visa
            <select name="sponsorship" defaultValue={fields.sponsorship}>
              {SPONSORSHIP_VALUES.map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label>
            Starting stage
            <select name="stage" defaultValue={fields.stage}>
              {APPLICATION_STAGES.map(stage => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </label>

          <label className="wide">
            Job advert link
            <input
              name="sourceUrl"
              placeholder="https://… optional, and the key the parser caches on"
              defaultValue={fields.sourceUrl}
            />
          </label>
        </div>

        <button type="submit" disabled={pending}>
          {pending ? 'Adding…' : 'Add to the board'}
        </button>

        {state.problem === null ? null : (
          <p className="error">{state.problem}</p>
        )}
      </form>
    </details>
  );
}
