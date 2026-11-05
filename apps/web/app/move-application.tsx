'use client';

import {useActionState} from 'react';

import {movesFrom, type ApplicationStage} from '@lfg/core';

import {moveApplication} from '@/app/actions';

/**
 * The control that moves one application to another stage.
 *
 * A select and a button rather than a drag, for now: this works without
 * JavaScript enabled, without a pointer, and without a client-side library.
 * Dragging is still on the list for module 1 (docs/product-spec.md) and will
 * call the same server action when it arrives.
 *
 * Which stages are offered comes from `movesFrom` in `packages/core`, which
 * is also what the server action checks against — the list a person sees and
 * the rule that admits the move are the same list.
 */
export function MoveApplication({
  id,
  stage,
}: {
  readonly id: string;
  readonly stage: ApplicationStage | null;
}) {
  const [error, formAction, pending] = useActionState(moveApplication, null);

  return (
    <form action={formAction} className="move">
      <input type="hidden" name="id" value={id} />

      <select name="stage" defaultValue="" required aria-label="Move to stage">
        <option value="">move to…</option>
        {movesFrom(stage).map(next => (
          <option key={next} value={next}>
            {next}
          </option>
        ))}
      </select>

      <button type="submit" disabled={pending}>
        {pending ? '…' : 'Move'}
      </button>

      {error === null ? null : <p className="error">{error}</p>}
    </form>
  );
}
