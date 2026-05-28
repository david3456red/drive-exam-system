/**
 * Property-based tests for the Wrongbook state machine
 * (`src/lib/exam-engine/wrongbook.ts` → `applyExamResult`).
 *
 * Maps to CP-8 in the design checkpoint matrix.
 *
 * **Validates: Requirements 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7**
 *
 * The 8 named properties below cover the 6 transition rules plus the two
 * monotonicity invariants from Requirement 20.7. We intentionally keep one
 * property per acceptance criterion so a failure points directly at the rule
 * being violated.
 *
 * Per task 2.4, `numRuns` is set to 200 (≥ 100).
 */
import fc from 'fast-check';
import { describe, it } from 'vitest';

import {
    applyExamResult,
    type WrongState,
} from '@/lib/exam-engine/wrongbook';

const NUM_RUNS = 200;

/**
 * Bounded date arbitrary — uses fast-check's `date()` with a finite window so
 * generated timestamps are always valid `Date` instances we can compare with
 * `<=` / `>=` directly.
 *
 * The window covers 2000-01-01 .. 2099-12-31 which is more than enough for
 * the 4-byte timestamp comparisons in the state machine.
 */
const dateArb = fc.date({
  min: new Date('2000-01-01T00:00:00Z'),
  max: new Date('2099-12-31T23:59:59Z'),
  noInvalidDate: true,
});

/**
 * Arbitrary `WrongState`. Counts are bounded to keep shrinking fast, but the
 * range is wide enough to exercise both `mastered=false` and `mastered=true`
 * branches across rightCount + 1 < 3 vs >= 3.
 */
const wrongStateArb: fc.Arbitrary<WrongState> = fc.record({
  wrongCount: fc.integer({ min: 1, max: 1_000 }),
  rightCount: fc.integer({ min: 0, max: 10 }),
  mastered: fc.boolean(),
  lastWrongAt: dateArb,
});

/**
 * `now` arbitrary that is guaranteed to be ≥ `prev.lastWrongAt` so the
 * monotonicity property under the "wrong answer" branch is well defined.
 *
 * We sample a non-negative offset (in milliseconds) and add it to
 * `prev.lastWrongAt`. The state machine itself does not enforce this ordering,
 * but realistic callers (the Server Action layer) always pass a current
 * timestamp, so this matches production behaviour.
 */
const nowAfterArb = (prevDate: Date): fc.Arbitrary<Date> =>
  fc
    .integer({ min: 0, max: 1_000 * 60 * 60 * 24 * 365 * 10 }) // up to 10 years later
    .map((deltaMs) => new Date(prevDate.getTime() + deltaMs));

describe('applyExamResult — Wrongbook state machine (CP-8)', () => {
  // -------------------------------------------------------------------------
  // Rule 1 — Requirement 20.1
  // -------------------------------------------------------------------------
  it('Rule 20.1: prev=null + correct → null (do not create wrong question)', () => {
    fc.assert(
      fc.property(dateArb, (now) => {
        const next = applyExamResult(null, true, now);
        return next === null;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Rule 2 — Requirement 20.2
  // -------------------------------------------------------------------------
  it('Rule 20.2: prev=null + wrong → fresh state { wrongCount:1, rightCount:0, mastered:false, lastWrongAt:now }', () => {
    fc.assert(
      fc.property(dateArb, (now) => {
        const next = applyExamResult(null, false, now);
        if (next === null) return false;
        return (
          next.wrongCount === 1 &&
          next.rightCount === 0 &&
          next.mastered === false &&
          next.lastWrongAt.getTime() === now.getTime()
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Rules 3 + 4 combined — Requirements 20.3 / 20.4
  // -------------------------------------------------------------------------
  it('Rules 20.3 + 20.4: prev != null + wrong → wrongCount+=1, rightCount=0, mastered=false, lastWrongAt=now', () => {
    fc.assert(
      fc.property(wrongStateArb, dateArb, (prev, now) => {
        const next = applyExamResult(prev, false, now);
        if (next === null) return false;
        return (
          next.wrongCount === prev.wrongCount + 1 &&
          next.rightCount === 0 &&
          next.mastered === false &&
          next.lastWrongAt.getTime() === now.getTime()
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Rule 5 — Requirement 20.5
  // -------------------------------------------------------------------------
  it('Rule 20.5: prev != null + correct + rightCount+1 < 3 → rightCount+=1, others unchanged', () => {
    // Constrain prev.rightCount so prev.rightCount + 1 < 3 (i.e. prev.rightCount ∈ {0,1}).
    const prevArb: fc.Arbitrary<WrongState> = fc.record({
      wrongCount: fc.integer({ min: 1, max: 1_000 }),
      rightCount: fc.integer({ min: 0, max: 1 }),
      mastered: fc.boolean(),
      lastWrongAt: dateArb,
    });

    fc.assert(
      fc.property(prevArb, dateArb, (prev, now) => {
        const next = applyExamResult(prev, true, now);
        if (next === null) return false;
        return (
          next.wrongCount === prev.wrongCount &&
          next.rightCount === prev.rightCount + 1 &&
          next.mastered === prev.mastered &&
          next.lastWrongAt.getTime() === prev.lastWrongAt.getTime()
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Rule 6 — Requirement 20.6
  // -------------------------------------------------------------------------
  it('Rule 20.6: prev != null + correct + rightCount+1 >= 3 → rightCount+=1, mastered=true', () => {
    // Constrain prev.rightCount >= 2 so prev.rightCount + 1 >= 3.
    const prevArb: fc.Arbitrary<WrongState> = fc.record({
      wrongCount: fc.integer({ min: 1, max: 1_000 }),
      rightCount: fc.integer({ min: 2, max: 50 }),
      mastered: fc.boolean(),
      lastWrongAt: dateArb,
    });

    fc.assert(
      fc.property(prevArb, dateArb, (prev, now) => {
        const next = applyExamResult(prev, true, now);
        if (next === null) return false;
        return (
          next.wrongCount === prev.wrongCount &&
          next.rightCount === prev.rightCount + 1 &&
          next.mastered === true &&
          next.lastWrongAt.getTime() === prev.lastWrongAt.getTime()
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Monotonicity — Requirement 20.7
  // -------------------------------------------------------------------------
  it('Monotonicity 20.7: next.wrongCount >= prev.wrongCount for any prev / isCorrect / now', () => {
    fc.assert(
      fc.property(
        fc.option(wrongStateArb, { nil: null }),
        fc.boolean(),
        dateArb,
        (prev, isCorrect, now) => {
          const next = applyExamResult(prev, isCorrect, now);
          if (next === null) {
            // Only path returning null is prev=null && isCorrect=true (Rule 1).
            // The "previous wrongCount" baseline is 0 in that case, and there
            // is no `next` to compare, so the property holds vacuously.
            return prev === null && isCorrect === true;
          }
          const prevWrongCount = prev?.wrongCount ?? 0;
          return next.wrongCount >= prevWrongCount;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('Monotonicity 20.7: next.lastWrongAt >= prev.lastWrongAt when prev != null and now >= prev.lastWrongAt', () => {
    fc.assert(
      fc.property(
        wrongStateArb,
        fc.boolean(),
        wrongStateArb.chain((s) =>
          nowAfterArb(s.lastWrongAt).map((n) => ({ s, n })),
        ),
        (_unused, isCorrect, pair) => {
          const { s: prev, n: now } = pair;
          const next = applyExamResult(prev, isCorrect, now);
          if (next === null) return false; // prev != null so should always return state
          // Wrong path: lastWrongAt = now (>= prev.lastWrongAt by construction).
          // Correct path: lastWrongAt unchanged (== prev.lastWrongAt, also >=).
          return next.lastWrongAt.getTime() >= prev.lastWrongAt.getTime();
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Mastered transitions — Requirements 20.4 + 20.6 (combined invariant)
  // -------------------------------------------------------------------------
  it('Mastered only flips via the two specified paths (false→true via rightCount+1>=3; true→false via wrong with rightCount=0)', () => {
    fc.assert(
      fc.property(
        fc.option(wrongStateArb, { nil: null }),
        fc.boolean(),
        dateArb,
        (prev, isCorrect, now) => {
          const next = applyExamResult(prev, isCorrect, now);
          if (next === null) return true; // no transition, nothing to check
          const prevMastered = prev?.mastered ?? false;

          if (prevMastered === false && next.mastered === true) {
            // Only allowed via Rule 6: prev != null + correct + rightCount+1 >= 3
            return (
              prev !== null &&
              isCorrect === true &&
              prev.rightCount + 1 >= 3
            );
          }

          if (prevMastered === true && next.mastered === false) {
            // Only allowed via Rule 4: prev != null + wrong → mastered=false AND rightCount=0
            return (
              prev !== null &&
              isCorrect === false &&
              next.rightCount === 0
            );
          }

          // No flip — accept.
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
