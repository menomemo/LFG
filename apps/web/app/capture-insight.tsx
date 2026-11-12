'use client';

import {useActionState} from 'react';

import {captureInsight} from '@/app/actions';
import {EMPTY_CAPTURE_FORM} from '@/app/capture-insight-state';

/**
 * The box something learned goes into.
 *
 * Two fields and one button, and that is the whole design. Module 6 of
 * docs/product-spec.md is built on capture being nearly free — three seconds
 * from a share sheet — and every question this form could usefully ask is a
 * question that makes it cost more than the insight is worth at the moment it
 * occurs. What it is about, which dimensions it belongs to and what the
 * actionable principle is are all the pipeline's to work out later.
 *
 * Open by default, unlike the create form behind its `<details>`: this is the
 * page's purpose, and one click before a paste is the friction this module is
 * specifically meant not to have.
 *
 * Nothing here validates. `parseInsightCapture` in `packages/core` decides
 * what a capture is, so the mobile share sheet gets the same answers from the
 * same code (ADR-0003).
 */
export function CaptureInsight() {
  const [state, formAction, pending] = useActionState(
    captureInsight,
    EMPTY_CAPTURE_FORM,
  );

  return (
    /* Keyed on the attempt so every returned submission mounts a fresh form:
       that is what clears the box after a capture is stored, while a refusal
       comes back with the paste still in it. */
    <form className="capture" action={formAction} key={state.attempt}>
      <label>
        Something you learned
        <textarea
          name="text"
          rows={4}
          autoComplete="off"
          placeholder="Paste a quote, a thought, or a link. Nothing here has to be tidy."
          defaultValue={state.fields.text}
        />
      </label>

      <label>
        Where it came from
        <input
          name="sourceUrl"
          placeholder="https://… optional"
          defaultValue={state.fields.sourceUrl}
        />
      </label>

      <div className="row">
        <button type="submit" disabled={pending}>
          {pending ? 'Capturing…' : 'Capture'}
        </button>
        {state.captured ? <p className="ok">Captured.</p> : null}
      </div>

      {state.problem === null ? null : <p className="error">{state.problem}</p>}
    </form>
  );
}
