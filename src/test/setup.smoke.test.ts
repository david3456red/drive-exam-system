/**
 * Smoke test for the Vitest + jsdom + Testing Library + fast-check configuration.
 *
 * Validates Requirement 29.1 / 29.3 plumbing:
 *   - `globals: true` exposes `describe` / `it` / `expect` without imports
 *   - `environment: 'jsdom'` provides DOM globals (`document`, `window`)
 *   - `vitest.setup.ts` extends `expect` with `@testing-library/jest-dom` matchers
 *   - fast-check is installed and runs property checks
 *
 * Kept intentionally small; engine-layer property tests live in their own files
 * (e.g. `judger.property.test.ts`) per the design spec.
 */
import fc from 'fast-check';

describe('test infrastructure', () => {
  it('exposes globals from vitest (`globals: true`)', () => {
    expect(typeof describe).toBe('function');
    expect(typeof it).toBe('function');
    expect(typeof expect).toBe('function');
  });

  it('runs in a jsdom environment with DOM globals', () => {
    expect(typeof document).toBe('object');
    expect(typeof window).toBe('object');
    const el = document.createElement('div');
    el.textContent = 'ok';
    document.body.appendChild(el);
    // jest-dom matcher (proves vitest.setup.ts loaded matchers)
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent('ok');
  });

  it('runs fast-check property assertions', () => {
    fc.assert(
      fc.property(fc.integer(), (n) => n + 0 === n),
      { numRuns: 25 },
    );
  });
});
