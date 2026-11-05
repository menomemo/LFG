'use client';

import {useActionState} from 'react';

import {
  APPLICATION_STAGES,
  REGIONS,
  SPONSORSHIP_VALUES,
  WORK_MODES,
  regionLabel,
} from '@lfg/core';

import {createApplication} from '@/app/actions';
import {EMPTY_CREATE_FORM} from '@/app/create-application-state';

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
 */
export function CreateApplication() {
  const [state, formAction, pending] = useActionState(
    createApplication,
    EMPTY_CREATE_FORM,
  );
  const {fields} = state;

  return (
    <details className="create">
      <summary>Add an application</summary>

      <form action={formAction} key={state.attempt}>
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
