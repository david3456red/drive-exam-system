/**
 * Vitest global setup — extends `expect` with the matcher set from
 * `@testing-library/jest-dom` so component tests can use assertions like
 * `toBeInTheDocument()` / `toHaveAttribute()`.
 *
 * Aligns with Requirement 29.1 (Testing Library + jest-dom matchers).
 */
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

expect.extend(matchers);

// Unmount React trees and reset jsdom between tests to avoid cross-test leaks.
afterEach(() => {
  cleanup();
});
