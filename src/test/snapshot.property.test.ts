/**
 * Property-based tests for `src/lib/exam-engine/snapshot.ts`.
 *
 * Validates Requirements 17.4 and 17.5:
 *   17.4 - `parseOrder(serializeOrder(xs))` and `parseCategoryIds(serializeCategoryIds(xs))`
 *          equal `xs` for any legal `string[]` (round-trip).
 *   17.5 - `parseOrder` / `parseCategoryIds` return `[]` (never throw) for any non-JSON,
 *          non-array, non-string-element, `null` or `undefined` input (safe-fail).
 *
 * Framework: Vitest + fast-check.
 *
 * Property catalog implemented in this file:
 *   - serializeOrder ∘ parseOrder is the identity on `string[]`
 *   - serializeCategoryIds ∘ parseCategoryIds is the identity on `string[]`
 *   - parseOrder is total (never throws) and returns `[]` for arbitrary non-string inputs
 *   - parseOrder returns `[]` for plain strings that are not JSON
 *   - parseOrder returns `[]` for JSON that is not an array (number / object / null / boolean / string)
 *   - parseOrder returns `[]` for JSON arrays containing any non-string element
 *   - parseCategoryIds inherits the same safe-fail surface (shared internal impl)
 *
 * `numRuns` is set to 200 (≥ 100 required by the task) so we sweep a generous slice
 * of the input space for both round-trip and safe-fail directions.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
    parseCategoryIds,
    parseOrder,
    serializeCategoryIds,
    serializeOrder,
} from '@/lib/exam-engine/snapshot';

const NUM_RUNS = 200;

// -------------------------------------------------------------------------------------
// Generators
// -------------------------------------------------------------------------------------

/**
 * Generator for legal `string[]` inputs to the serializers. Includes empty arrays,
 * unicode strings, surrogate-rich strings, embedded quotes/backslashes, control
 * characters, and arbitrary lengths up to 32 elements — anything `JSON.stringify`
 * is required to round-trip losslessly.
 */
const legalStringArray = (): fc.Arbitrary<string[]> =>
  fc.array(fc.string(), { maxLength: 32 });

/**
 * Generator for inputs that must trigger the safe-fail path of `parseOrder` /
 * `parseCategoryIds`. We deliberately bundle several disjoint failure shapes so
 * one property covers all five branches enumerated in the JSDoc of
 * `safeParseStringArray`:
 *
 *   1. non-string value (number, boolean, object, null, undefined)
 *   2. plain string that is not legal JSON
 *   3. JSON-encoded scalar (number / boolean / null / string)
 *   4. JSON-encoded object (not an array)
 *   5. JSON-encoded array containing at least one non-string element
 *
 * The generator returns `unknown` because callers feed it through the public
 * `parseOrder(json: string | null | undefined)` signature — passing non-strings
 * is a runtime concern (e.g. malformed DB rows) and Requirement 17.5 explicitly
 * names them as inputs that must be tolerated.
 */
const illegalInput = (): fc.Arbitrary<unknown> =>
  fc.oneof(
    // 1. Non-string runtime values that callers might accidentally pass in.
    fc.constant(null),
    fc.constant(undefined),
    fc.integer(),
    fc.double({ noNaN: true }),
    fc.boolean(),
    fc.object(),
    fc.array(fc.anything()).filter(
      // exclude pure string[] (they are legal — they would just fail JSON.parse
      // since they are arrays, not strings, and therefore still hit branch #1).
      // No filter actually needed for correctness since arrays-as-input always
      // fail the `typeof === 'string'` check, but keep this branch separate so
      // the assertion message is unambiguous.
      () => true,
    ),

    // 2. Plain strings that are not valid JSON. Use a string generator and
    //    filter out anything that happens to round-trip through JSON.parse, so
    //    we do not accidentally emit a coincidentally-valid JSON document.
    fc.string().filter((s) => {
      try {
        JSON.parse(s);
        return false;
      } catch {
        return true;
      }
    }),

    // 3. JSON-encoded scalars (number, boolean, null, string). All must yield [].
    fc.integer().map((n) => JSON.stringify(n)),
    fc.boolean().map((b) => JSON.stringify(b)),
    fc.constant('null'),
    fc.string().map((s) => JSON.stringify(s)),

    // 4. JSON-encoded objects (top-level non-array).
    fc.dictionary(fc.string(), fc.string()).map((o) => JSON.stringify(o)),

    // 5. JSON-encoded arrays containing at least one non-string element. We
    //    interleave strings with non-strings then guarantee the array contains
    //    >=1 non-string by construction.
    fc
      .tuple(
        fc.array(fc.string(), { maxLength: 8 }),
        fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.object()),
        fc.array(fc.string(), { maxLength: 8 }),
      )
      .map(([before, bad, after]) =>
        JSON.stringify([...before, bad, ...after]),
      ),
  );

// -------------------------------------------------------------------------------------
// Properties
// -------------------------------------------------------------------------------------

describe('snapshot.ts — property-based tests', () => {
  describe('Property: 序列化往返一致 (Requirement 17.4)', () => {
    it('parseOrder(serializeOrder(xs)) deeply equals xs for any string[]', () => {
      fc.assert(
        fc.property(legalStringArray(), (xs) => {
          const round = parseOrder(serializeOrder(xs));
          expect(round).toEqual(xs);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('parseCategoryIds(serializeCategoryIds(xs)) deeply equals xs for any string[]', () => {
      fc.assert(
        fc.property(legalStringArray(), (xs) => {
          const round = parseCategoryIds(serializeCategoryIds(xs));
          expect(round).toEqual(xs);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('serializeOrder produces a string that JSON.parse recognises as an array', () => {
      // Sanity check: the persisted form must itself be a syntactically valid
      // JSON array. This guards against accidental switches to e.g. NDJSON.
      fc.assert(
        fc.property(legalStringArray(), (xs) => {
          const json = serializeOrder(xs);
          expect(typeof json).toBe('string');
          const parsed = JSON.parse(json) as unknown;
          expect(Array.isArray(parsed)).toBe(true);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe('Property: parseOrder safe-fail (Requirement 17.5)', () => {
    it('returns [] (never throws) for any illegal input', () => {
      fc.assert(
        fc.property(illegalInput(), (bad) => {
          // The runtime signature is `string | null | undefined` but callers may
          // hand in malformed values from disk. We cast through `unknown` to
          // exercise the documented safe-fail surface.
          const result = parseOrder(bad as string | null | undefined);
          expect(result).toEqual([]);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('parseCategoryIds inherits the same safe-fail behaviour', () => {
      fc.assert(
        fc.property(illegalInput(), (bad) => {
          const result = parseCategoryIds(bad as string | null | undefined);
          expect(result).toEqual([]);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('never throws regardless of input shape', () => {
      // Belt-and-braces: even with the broadest possible generator (anything),
      // the parsers must remain total. We do not assert on the value here
      // because legitimate JSON-encoded string arrays are allowed to round-trip;
      // we only assert that no exception escapes.
      fc.assert(
        fc.property(fc.anything(), (anything) => {
          expect(() =>
            parseOrder(anything as string | null | undefined),
          ).not.toThrow();
          expect(() =>
            parseCategoryIds(anything as string | null | undefined),
          ).not.toThrow();
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });
});
