'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type Over,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type {AnimateLayoutChanges} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
} from 'react';
import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  SyntheticEvent,
} from 'react';

import {
  appendStageEvent,
  buildLanes,
  isApplicationStage,
  longestWaitingFirst,
  movesFrom,
  regionLabel,
  summariseBoard,
  summariseStage,
  type ApplicationStage,
  type Region,
  type Sponsorship,
  type StageEvent,
  type StageSummary,
  type WorkMode,
} from '@lfg/core';

import {moveApplication, submitMoveApplication} from '@/app/actions';

/** One application, with the history everything about it is derived from. */
export interface BoardCard {
  readonly id: string;
  readonly company: string;
  readonly role: string;
  readonly region: Region;
  readonly workMode: WorkMode | null;
  readonly sponsorship: Sponsorship;
  readonly language: string | null;
  readonly history: readonly StageEvent[];
}

/** A card with its position worked out. */
interface PlacedCard extends BoardCard {
  readonly summary: StageSummary;
}

/** The lane an application with no recorded history falls into. */
const UNKNOWN_LANE = 'no history';

/**
 * Turns off dnd-kit's layout-change animation for a card.
 *
 * Not a preference. A card that changes lane mid-drag moves to a different
 * sortable list, and dnd-kit animates that by measuring the card in a layout
 * effect, deriving a transform from the difference and storing it in state —
 * which re-renders, re-measures and never settles. It took the page down with
 * "maximum update depth exceeded" every time a card was dragged out of a lane
 * that had other cards in it.
 *
 * What this does not turn off is the part that matters: the cards displaced
 * by the drag still slide, because that transform comes from the sorting
 * strategy while the drag is happening, not from this.
 */
const noLayoutAnimation: AnimateLayoutChanges = () => false;

/** Whether this person has asked their system for less animation. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);

    const onChange = (event: MediaQueryListEvent): void => {
      setReduced(event.matches);
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, []);

  return reduced;
}

/** An ISO date, because dates in this project are absolute (CLAUDE.md). */
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Starts a drag from anywhere on a card except its controls.
 *
 * The card carries a select and two buttons, and a pointer going down on one
 * of those means the person is using it, not grabbing the card. Without this
 * the sensor swallows the click.
 */
class CardPointerSensor extends PointerSensor {
  static override activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({nativeEvent}: ReactPointerEvent): boolean => {
        const {target} = nativeEvent;
        return !(
          target instanceof Element &&
          target.closest('select, button, input, a, label') !== null
        );
      },
    },
  ];
}

/**
 * Moves a dragged card one whole lane per arrow key.
 *
 * dnd-kit's default steps twenty-five pixels, which across a two-hundred
 * pixel lane is nine presses to reach the next one — a keyboard drag that
 * exists without being usable. Lanes are the only positions that mean
 * anything on this board, so an arrow goes to the next one or nowhere.
 *
 * The rectangles come from dnd-kit's own measurements rather than from the
 * stylesheet, so this does not have to know the lane width or the gap.
 */
const ARROWS: Readonly<Record<string, -1 | 1>> = {
  [KeyboardCode.Left]: -1,
  [KeyboardCode.Right]: 1,
};

const laneByLane: KeyboardCoordinateGetter = (
  event,
  {context, currentCoordinates},
) => {
  const direction = ARROWS[event.code];
  if (direction === undefined) {
    return undefined;
  }
  event.preventDefault();

  /* Cards are droppables too now that lanes are sortable lists, and an arrow
     key means "next lane" rather than "next card": within a lane the order is
     derived from waiting time, so there is no position to step through. */
  const lanes = [...context.droppableRects.entries()]
    .filter(([id]) => isApplicationStage(id))
    .map(([, rect]) => rect)
    .sort((a, b) => a.left - b.left);
  const width = context.collisionRect?.width ?? 0;
  const centre = currentCoordinates.x + width / 2;

  const here = lanes.findIndex(
    lane => centre >= lane.left && centre < lane.left + lane.width,
  );
  /* Not over a lane at all — the first press should land on an end rather
     than on nothing. */
  const from = here === -1 ? (direction === 1 ? -1 : lanes.length) : here;

  const next = lanes[from + direction];
  if (next === undefined) {
    return undefined;
  }
  return {x: next.left + next.width / 2 - width / 2, y: currentCoordinates.y};
};

/**
 * Applies a move to the board before the server has answered.
 *
 * It calls the same `appendStageEvent` the server action calls, against the
 * same history, so the optimistic board is the rule being applied rather than
 * a guess about what the rule will say. A move the function refuses leaves
 * the card where it is, which is what dropping a card back into its own lane
 * should do.
 */
function withMove(
  cards: readonly BoardCard[],
  move: {
    readonly id: string;
    readonly stage: ApplicationStage;
    readonly at: Date;
  },
): readonly BoardCard[] {
  return cards.map(card => {
    if (card.id !== move.id) {
      return card;
    }
    const appended = appendStageEvent(card.history, move.stage, move.at);
    return appended.ok ? {...card, history: appended.value} : card;
  });
}

/** The line above the board. Only counts that are not zero, bar the total. */
function headline(totals: ReturnType<typeof summariseBoard>): string {
  const parts = [`${String(totals.total)} in the pipeline`];
  if (totals.active > 0) {
    parts.push(`${String(totals.active)} still moving`);
  }
  if (totals.ghosted > 0) {
    parts.push(`${String(totals.ghosted)} ghosted`);
  }
  if (totals.closed > 0) {
    parts.push(`${String(totals.closed)} closed`);
  }
  if (totals.unknown > 0) {
    parts.push(`${String(totals.unknown)} with no history`);
  }
  return parts.join(' · ');
}

/**
 * The application board.
 *
 * It is a client component for one reason: a move has to be visible before
 * the server has answered. One move costs five serial round trips — the
 * action, the read, the write, the re-render and the payload back — and until
 * this component existed the card did not budge until the last of them
 * landed, which on a deployed site reads as the click not having worked.
 *
 * So the move is applied here first and reconciled when the server answers.
 * That is only honest because the rule lives in one place: `movesFrom` decides
 * what is offered, `appendStageEvent` decides what is allowed, and the server
 * action calls the same two functions on the same history. The client is not
 * predicting the server's answer, it is computing it. If the server refuses
 * anyway — a stale page, a row someone else changed — React discards the
 * optimistic state and the card returns to where the database says it is.
 *
 * Everything shown is still derived from `stage_history` by `packages/core`.
 */
export function Board({
  cards,
  now,
}: {
  readonly cards: readonly BoardCard[];
  readonly now: Date;
}) {
  const [optimisticCards, recordMove] = useOptimistic(cards, withMove);
  const [problems, setProblems] = useState<Readonly<Record<string, string>>>(
    {},
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  /**
   * Where the card being dragged currently sits, before it is let go.
   *
   * Not `useOptimistic`: an optimistic update only survives the transition
   * that applied it, and a drag is not a transition — it is a span of time
   * with no server call in it yet. This is ordinary state, applied over the
   * optimistic cards by the same function the drop will use, so the board
   * during a drag and the board after one are computed the same way.
   */
  const [preview, setPreview] = useState<{
    readonly id: string;
    readonly stage: ApplicationStage;
  } | null>(null);
  const [, startTransition] = useTransition();

  /* Until this flips, the move form posts to the server action, which is how
     it works with JavaScript disabled or not yet loaded. After hydration the
     same form is handled here instead, so the move can be optimistic. */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const reducedMotion = useReducedMotion();

  const sensors = useSensors(
    useSensor(CardPointerSensor, {
      /* A click is not a drag until the pointer has travelled. Without this,
         pressing a card to focus it would start one. */
      activationConstraint: {distance: 4},
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: laneByLane,
      /* The board scrolls sideways, and dnd-kit scrolls it under a lifted
         card rather than moving the card past the edge. Smooth makes each
         arrow press an animation to sit through. */
      scrollBehavior: 'auto',
    }),
  );

  /* The drag in progress, laid over the optimistic board. */
  const shown =
    preview === null
      ? optimisticCards
      : withMove(optimisticCards, {...preview, at: now});

  const placed: readonly PlacedCard[] = shown.map(card => ({
    ...card,
    summary: summariseStage(card.history, now),
  }));

  /* Longest wait first, inside every lane: days in stage is the number the
     board exists to surface, and newest-first would bury exactly the
     applications that need a chase today. */
  const lanes = buildLanes(
    longestWaitingFirst(placed, card => card.summary.daysInStage),
    card => card.summary.stage,
  );
  const totals = summariseBoard(placed.map(card => card.summary));
  const dragged = placed.find(card => card.id === activeId) ?? null;

  function move(card: BoardCard, stage: ApplicationStage): void {
    /* The same check the server will make. A move it refuses — dropping a
       card back where it came from, most often — is not an error to report,
       it is nothing happening. */
    if (!appendStageEvent(card.history, stage, now).ok) {
      return;
    }

    startTransition(async () => {
      /* `now` rather than the browser's clock on purpose. The real timestamp
         is the server's; this one only has to place the card and read as nil
         days in stage until the true one arrives, and mixing two clocks here
         would mean deriving a duration from a moment that never happened. */
      recordMove({id: card.id, stage, at: now});

      const submitted = new FormData();
      submitted.set('id', card.id);
      submitted.set('stage', stage);
      const problem = await moveApplication(submitted);

      setProblems(previous => {
        const next: Record<string, string> = {};
        for (const [id, message] of Object.entries(previous)) {
          if (id !== card.id) {
            next[id] = message;
          }
        }
        if (problem !== null) {
          next[card.id] = problem;
        }
        return next;
      });
    });
  }

  /**
   * The lane under the pointer.
   *
   * What is under it is usually another card, because cards are drop targets
   * in a sortable list. A card answers for the lane it is in.
   */
  function laneUnder(over: Over | null): ApplicationStage | null {
    if (over === null) {
      return null;
    }
    if (isApplicationStage(over.id)) {
      return over.id;
    }
    const card = placed.find(({id}) => id === over.id);
    return card?.summary.stage ?? null;
  }

  /**
   * Moves the card into the lane it is being dragged over, during the drag.
   *
   * This is what makes the drop free of movement: by the time the card is
   * let go it is already in the lane, at the position the board's own
   * ordering gives it, and the other cards have already slid aside. There is
   * nothing left to animate on release.
   *
   * It decides with `appendStageEvent`, the same function that decides on
   * drop and on the server. A lane the rule refuses is a lane the card does
   * not enter, so it cannot be dropped somewhere it could not be moved.
   */
  function handleDragOver(event: DragOverEvent): void {
    const id = String(event.active.id);
    const card = optimisticCards.find(entry => entry.id === id);
    if (card === undefined) {
      return;
    }

    const lane = laneUnder(event.over);
    /* Back over its own lane: the drag is on its way to nowhere, and the
       card belongs where it started until it is over something else. */
    if (lane === null || !appendStageEvent(card.history, lane, now).ok) {
      setPreview(current => (current === null ? current : null));
      return;
    }
    setPreview(current =>
      current?.stage === lane && current.id === id
        ? current
        : {id, stage: lane},
    );
  }

  /**
   * Commits what the board is already showing.
   *
   * The lane comes from the preview rather than from the drop event, so what
   * was on screen when the pointer was released is what gets written. Both
   * state updates happen in this one handler, so React applies them in a
   * single render: the preview goes and the optimistic move arrives in the
   * same frame, with no gap between them for the card to flicker through.
   */
  function handleDragEnd(_event: DragEndEvent): void {
    const landed = preview;
    setActiveId(null);
    setPreview(null);

    if (landed === null) {
      return;
    }
    const card = optimisticCards.find(({id}) => id === landed.id);
    if (card !== undefined) {
      move(card, landed.stage);
    }
  }

  function handleDragStart(event: DragStartEvent): void {
    setActiveId(String(event.active.id));
    setPreview(null);
  }

  function handleDragCancel(): void {
    setActiveId(null);
    setPreview(null);
  }

  return (
    <>
      <p className="sub">{headline(totals)}</p>

      {cards.length === 0 ? (
        <p className="empty">
          Nothing here yet. Add the first application above — company, role and
          market are all it needs.
        </p>
      ) : (
        <DndContext
          /* A fixed id, because dnd-kit otherwise counts its contexts to
             name the element it describes a draggable with, and the server
             and the browser do not reach the same number. That mismatch is a
             hydration error on every load. */
          id="board"
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="lanes">
            {lanes.map(lane => (
              <Lane
                key={lane.stage ?? UNKNOWN_LANE}
                stage={lane.stage}
                count={lane.cards.length}
                cardIds={lane.cards.map(card => card.id)}
              >
                {lane.cards.map(card => (
                  <Card
                    key={card.id}
                    card={card}
                    hydrated={hydrated}
                    reducedMotion={reducedMotion}
                    problem={problems[card.id] ?? null}
                    onMove={move}
                  />
                ))}
              </Lane>
            ))}
          </div>

          {/* The card under the pointer is drawn here, while the one in the
              lane turns into the gap it will drop into. */}
          <DragOverlay>
            {dragged === null ? null : (
              <ul className="cards">
                <li className="overlay">
                  <CardFace card={dragged} />
                </li>
              </ul>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </>
  );
}

/** One lane, and the drop target it is. */
function Lane({
  stage,
  count,
  cardIds,
  children,
}: {
  readonly stage: ApplicationStage | null;
  readonly count: number;
  readonly cardIds: readonly string[];
  readonly children: ReactNode;
}) {
  /* The unknown lane takes no drops: there is no stage to append. The lane
     is a droppable in its own right as well as a sortable list, because an
     empty lane has no cards to aim at. */
  const {setNodeRef} = useDroppable({
    id: stage ?? UNKNOWN_LANE,
    disabled: stage === null,
  });

  /* A fresh array every render would give `SortableContext` a new identity
     every render, and everything it memoises would be recomputed on each one.
     The ids are uuids, so joining them is a safe way to say "these are the
     same cards in the same order". */
  const key = cardIds.join(',');
  const items = useMemo(() => (key === '' ? [] : key.split(',')), [key]);

  return (
    <section className="lane" ref={setNodeRef}>
      <div className="lane-head">
        <span className="lane-name">{stage ?? UNKNOWN_LANE}</span>
        <span className="lane-count">{count}</span>
      </div>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ul className="cards">{children}</ul>
      </SortableContext>
    </section>
  );
}

/** What a card says, without any of what it does. */
function CardFace({card}: {readonly card: PlacedCard}) {
  const {summary} = card;
  return (
    <>
      <p className="co">{card.company}</p>
      <p className="role">{card.role}</p>
      <p className="meta">
        {regionLabel(card.region)}
        {card.workMode === null ? '' : ` · ${card.workMode}`}
        {card.sponsorship === 'yes' ? ' · sponsors' : ''}
        {card.language === null ? '' : ` · ${card.language}`}
      </p>
      <p className={summary.ghosted ? 'meta ghost' : 'meta'}>
        {summary.daysInStage === null
          ? 'no recorded history'
          : `${String(summary.daysInStage)}d in stage`}
        {summary.ghosted ? ' · ghosted' : ''}
        {summary.appliedAt === null
          ? ''
          : ` · applied ${isoDate(summary.appliedAt)}`}
      </p>
    </>
  );
}

/**
 * One card: draggable by its face, movable by its control.
 *
 * Both paths exist on purpose. Dragging is the fast one and needs a pointer
 * or a keyboard and JavaScript; the select and the button need none of those
 * and are what makes the board usable without them. They call the same move.
 */
function Card({
  card,
  hydrated,
  reducedMotion,
  problem,
  onMove,
}: {
  readonly card: PlacedCard;
  readonly hydrated: boolean;
  readonly reducedMotion: boolean;
  readonly problem: string | null;
  readonly onMove: (card: BoardCard, stage: ApplicationStage) => void;
}) {
  const {attributes, listeners, setNodeRef, transform, transition, isDragging} =
    useSortable(
      reducedMotion
        ? {
            id: card.id,
            animateLayoutChanges: noLayoutAnimation,
            transition: null,
          }
        : {id: card.id, animateLayoutChanges: noLayoutAnimation},
    );

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    /* Hydrated, so this handles the submission instead of the server action
       the form still carries for the case where it is not. */
    event.preventDefault();
    const form = event.currentTarget;
    const stage = new FormData(form).get('stage');
    if (isApplicationStage(stage)) {
      onMove(card, stage);
    }
    form.reset();
  }

  return (
    <li
      ref={setNodeRef}
      /* The card being dragged is drawn by the overlay instead, so this one
         stays in the layout holding the space it will drop back into. That
         space is the gap. */
      className={isDragging ? 'placeholder' : undefined}
      style={{transform: CSS.Translate.toString(transform), transition}}
    >
      <div className="face" {...listeners} {...attributes}>
        <CardFace card={card} />
      </div>

      <form
        className="move"
        action={hydrated ? undefined : submitMoveApplication}
        onSubmit={hydrated ? handleSubmit : undefined}
      >
        <input type="hidden" name="id" value={card.id} />

        <select
          name="stage"
          defaultValue=""
          required
          aria-label={`Move ${card.role} at ${card.company} to another stage`}
        >
          <option value="">move to…</option>
          {movesFrom(card.summary.stage).map(next => (
            <option key={next} value={next}>
              {next}
            </option>
          ))}
        </select>

        <button type="submit">Move</button>

        {problem === null ? null : <p className="error">{problem}</p>}
      </form>
    </li>
  );
}
