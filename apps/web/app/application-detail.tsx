'use client';

import {useActionState} from 'react';
import type {ReactNode} from 'react';

import {
  REGIONS,
  SPONSORSHIP_VALUES,
  WORK_MODES,
  isApplicationStage,
  movesFrom,
  regionLabel,
  type ApplicationStage,
} from '@lfg/core';

import {updateApplication} from '@/app/actions';
import {UNSAVED} from '@/app/application-edit-state';
import type {BoardCard, PlacedCard} from '@/app/board';

/**
 * One property: its name on the left, its value on the right.
 *
 * Every row in this panel is one of these, which is the whole of the
 * borrowed idea. What is not borrowed is how the value gets rendered — see
 * the note on the panel below.
 */
function Row({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="prop">
      <span className="prop-label">{label}</span>
      <div className="prop-value">{children}</div>
    </div>
  );
}

/**
 * A property whose value is one of a closed set.
 *
 * Generic over the set, so the options and the current value have to come
 * from the same union. Passing `WORK_MODES` with a region in `value` does
 * not compile, and no option can be offered that the enum does not contain —
 * which is also what the Postgres enum and `packages/core` already agree on.
 */
function EnumRow<T extends string>({
  label,
  name,
  values,
  value,
  unset,
  describe,
}: {
  readonly label: string;
  readonly name: string;
  readonly values: readonly T[];
  readonly value: T | null;
  /** What an unset value is called, or `null` if it cannot be unset. */
  readonly unset: string | null;
  readonly describe: (value: T) => string;
}) {
  return (
    <Row label={label}>
      <select name={name} defaultValue={value ?? ''} id={`prop-${name}`}>
        {unset === null ? null : <option value="">{unset}</option>}
        {values.map(option => (
          <option key={option} value={option}>
            {describe(option)}
          </option>
        ))}
      </select>
    </Row>
  );
}

/** A property that is free text. */
function TextRow({
  label,
  name,
  value,
  placeholder,
}: {
  readonly label: string;
  readonly name: string;
  readonly value: string | null;
  readonly placeholder: string;
}) {
  return (
    <Row label={label}>
      <input
        name={name}
        defaultValue={value ?? ''}
        placeholder={placeholder}
        id={`prop-${name}`}
      />
    </Row>
  );
}

/** A property that is a calendar date. */
function DateRow({
  label,
  name,
  value,
}: {
  readonly label: string;
  readonly name: string;
  readonly value: Date | null;
}) {
  return (
    <Row label={label}>
      <input
        type="date"
        name={name}
        defaultValue={value === null ? '' : value.toISOString().slice(0, 10)}
        id={`prop-${name}`}
      />
    </Row>
  );
}

/**
 * A property that points at another row.
 *
 * Shown, not typed over. The company and the role are the identity of what
 * this application is about rather than facts about the application, and
 * editing them here would quietly rename an employer for every other
 * application pointing at it.
 */
function RelationRow({
  label,
  name,
  href,
}: {
  readonly label: string;
  readonly name: string | null;
  readonly href: string | null;
}) {
  return (
    <Row label={label}>
      {name === null ? (
        <span className="unknown">unknown</span>
      ) : href === null ? (
        <span className="relation">{name}</span>
      ) : (
        <a className="relation" href={href} target="_blank" rel="noreferrer">
          {name}
        </a>
      )}
    </Row>
  );
}

/**
 * A property that is computed, and therefore cannot be typed into.
 *
 * These are the formulas: every one of them is derived from
 * `stage_history` by `packages/core` and none of them is stored. A value
 * written here would be a second copy of a fact, free to disagree with the
 * history every metric in the product is computed from.
 */
function DerivedRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="prop derived">
      <span className="prop-label">{label}</span>
      <div className="prop-value">{children}</div>
    </div>
  );
}

/**
 * Says who else sees this note, before it is written rather than after.
 *
 * Editing shared state from a page about one thing is the trap in every
 * product that has relations, Notion included: someone annotating an
 * application annotates every application to that employer and finds out
 * later. We know what the relation means, so we can say it.
 */
function sharedWith(company: string, others: number): string {
  const kept = `Kept on ${company}, not on this application.`;
  if (others === 0) {
    return `${kept} The next role you apply to there will open with it already written.`;
  }
  if (others === 1) {
    return `${kept} One other application to this employer shows the same note, and editing it here changes it there too.`;
  }
  return (
    `${kept} ${String(others)} other applications to this employer show the ` +
    'same note, and editing it here changes it for all of them.'
  );
}

/** Reads as "unknown" rather than as nothing (CLAUDE.md rule 8). */
function Unknown({what}: {readonly what: string}) {
  return <span className="unknown">unknown — {what}</span>;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * One application, opened.
 *
 * The interface is a property list, which is a good one and worth copying.
 * The way it is built is deliberately not copied: there is no property table
 * and no `jsonb` bag of values, because a schema stored as data is a schema
 * the database cannot check, and every guarantee this project leans on —
 * row-level security, `NOT NULL` provenance, enums, check constraints —
 * exists precisely because Postgres can see the types.
 *
 * So the editor for a property is chosen by its TypeScript type when this
 * file is compiled, not by a string read out of a row at runtime. The payoff
 * is the opposite of a blank cell: a property that does not exist is a build
 * error, and an option that is not a legal enum value cannot be offered.
 *
 * Stored properties can be edited. Derived ones are shown and cannot: days
 * in stage, ghosting and the applied date are computed from `stage_history`.
 * The stage is the exception that proves it — it is derived too, which is
 * why changing it appends an event rather than writing a column.
 */
export function ApplicationDetail({
  card,
  othersAtCompany,
  onClose,
  onMove,
}: {
  readonly card: PlacedCard;
  /** How many other applications share this company's note. */
  readonly othersAtCompany: number;
  readonly onClose: () => void;
  readonly onMove: (card: BoardCard, stage: ApplicationStage) => void;
}) {
  const [state, formAction, pending] = useActionState(
    updateApplication,
    UNSAVED,
  );
  const {summary} = card;

  return (
    <div className="detail-backdrop">
      {/* A button rather than a div with a click handler: clicking away
          from the panel closes it, and the thing that does that should be
          reachable and announced like any other control. */}
      <button
        type="button"
        className="detail-dismiss"
        aria-label="Close"
        onClick={onClose}
      />

      <aside
        className="detail"
        role="dialog"
        aria-modal="true"
        aria-label={`${card.role} at ${card.company}`}
      >
        <header className="detail-head">
          <div>
            <p className="co">{card.company}</p>
            <h2>{card.role}</h2>
          </div>
          <button type="button" className="linkish" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="props">
          {/* Outside the form below on purpose: a stage change is appended
              to the history the moment it is made, and it is the only
              property here that is not saved with the others. */}
          <Row label="Stage">
            <select
              value={summary.stage ?? ''}
              aria-label="Stage"
              onChange={event => {
                const next = event.target.value;
                if (isApplicationStage(next)) {
                  onMove(card, next);
                }
              }}
            >
              {summary.stage === null ? (
                <option value="">unknown</option>
              ) : (
                <option value={summary.stage}>{summary.stage}</option>
              )}
              {movesFrom(summary.stage).map(stage => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </Row>

          <RelationRow
            label="Company"
            name={card.company}
            href={
              card.companyDomain === null
                ? null
                : `https://${card.companyDomain}`
            }
          />
          <RelationRow label="Role" name={card.role} href={card.sourceUrl} />
          <RelationRow label="Résumé used" name={card.resume} href={null} />
        </div>

        <form action={formAction} className="props">
          <input type="hidden" name="id" value={card.id} />

          <EnumRow
            label="Market"
            name="region"
            values={REGIONS}
            value={card.region}
            unset={null}
            describe={regionLabel}
          />
          <EnumRow
            label="Work mode"
            name="workMode"
            values={WORK_MODES}
            value={card.workMode}
            unset="not stated"
            describe={mode => mode}
          />
          <EnumRow
            label="Sponsors a visa"
            name="sponsorship"
            values={SPONSORSHIP_VALUES}
            value={card.sponsorship}
            unset={null}
            describe={answer => answer}
          />
          <Row label="Sponsorship source">
            {card.sponsorshipSource === null ? (
              <Unknown what="no answer has been confirmed" />
            ) : (
              <span className="source">{card.sponsorshipSource}</span>
            )}
          </Row>

          <TextRow
            label="Job advert"
            name="sourceUrl"
            value={card.sourceUrl}
            placeholder="https://…"
          />
          <DateRow
            label="Next action"
            name="nextActionAt"
            value={card.nextActionAt}
          />

          <Row label="Notes">
            <textarea
              name="notes"
              rows={5}
              defaultValue={card.notes ?? ''}
              placeholder="What to prepare, what was said, what to chase."
              id="prop-notes"
            />
          </Row>

          {/* A property of the company, shown here because of the relation
              rather than because a copy of it lives on this application.
              Labelled with the employer's name so that is legible before
              the typing starts, not after. */}
          <Row label={`${card.company} · notes`}>
            <textarea
              name="companyNotes"
              rows={5}
              defaultValue={card.companyNotes ?? ''}
              placeholder={`What ${card.company} does, what to read before an interview, who works there.`}
              id="prop-companyNotes"
            />
            <p className="shared-warning">
              {sharedWith(card.company, othersAtCompany)}
            </p>
          </Row>

          <div className="detail-actions">
            <button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </button>
            {state.problem === null ? (
              state.saved > 0 ? (
                <span className="saved">Saved</span>
              ) : null
            ) : (
              <p className="error">{state.problem}</p>
            )}
          </div>
        </form>

        <div className="props">
          <p className="props-head">
            Derived from the stage history, and read-only — nothing here is
            stored, so nothing here can disagree with it.
          </p>

          <DerivedRow label="Days in stage">
            {summary.daysInStage === null ? (
              <Unknown what="this application has no recorded history" />
            ) : (
              String(summary.daysInStage)
            )}
          </DerivedRow>
          <DerivedRow label="Ghosted">
            {summary.ghosted ? 'yes' : 'no'}
          </DerivedRow>
          <DerivedRow label="Applied">
            {summary.appliedAt === null ? (
              <Unknown what="this role was saved, never applied to" />
            ) : (
              isoDate(summary.appliedAt)
            )}
          </DerivedRow>
          <DerivedRow label="Entered this stage">
            {summary.enteredAt === null ? (
              <Unknown what="this application has no recorded history" />
            ) : (
              isoDate(summary.enteredAt)
            )}
          </DerivedRow>
          <DerivedRow label="Added">{isoDate(card.createdAt)}</DerivedRow>
        </div>
      </aside>
    </div>
  );
}
