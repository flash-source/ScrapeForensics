/**
 * The narrow surface the harness needs from "a scraper". Two implementations:
 * `mock` (local cheerio extraction + heuristic heal, runs with no login/credits)
 * and `brightdata` (delegates to collector's runCollector/healCollector/verifyHeal).
 *
 * Keeping the harness behind this interface is deliberate: the Reliability Score
 * logic is identical whether we're scoring the local mock or a real collector,
 * so the numbers mean the same thing and the fast mock stays a faithful rehearsal.
 */

import type { SelectorChange } from "../types.js";

export type Row = Record<string, string>;

export interface RunOutput {
  rows: Row[];
  rowCount: number;
}

export interface CollectorAdapter {
  readonly name: string;

  /** Install the (possibly mutated) page as the current target. */
  setPage(html: string): Promise<void>;

  /** Extract with the current selectors/template. */
  run(): Promise<RunOutput>;

  /**
   * Attempt to heal the given broken fields. `baseline` is the last-good
   * extraction, i.e. what the fields *should* return — a real AI heal has the
   * prior template + examples to work from, so the mock is given the same.
   * Returns the before/after selector for each field it touched.
   */
  heal(brokenFields: string[], baseline: Row[]): Promise<SelectorChange[]>;

  /** Current selector string for a field, for reporting. */
  selectorFor(field: string): string | null;

  /**
   * Restore the original (healthy) template so the next mutation starts from a
   * fresh scraper. Optional: the mock resets its selector map; the real adapter
   * can't cheaply reset a live collector, so it may no-op (see brightdata.ts).
   */
  reset?(): Promise<void>;
}
