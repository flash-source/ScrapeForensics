/**
 * Local, credit-free stand-in for a Bright Data collector.
 *
 * - `run()` extracts each record's fields with the current selectors.
 * - `heal()` re-derives a working selector by locating the last-good values in
 *   the mutated DOM — the same job Bright Data's AI heal does, done here with a
 *   small deterministic heuristic so the whole BREAK -> HEAL -> VERIFY -> SCORE
 *   loop runs on a laptop with no login.
 *
 * It is intentionally NOT as capable as the real AI healer (e.g. a fully
 * removed element is unrecoverable here), which is the point: the Reliability
 * Score measures a real healer, and the mock gives us a lower-bound rehearsal.
 */

import * as cheerio from "cheerio";
import { RECORD_SELECTOR, FIELD_SELECTORS } from "../fixtures.js";
import type { SelectorChange } from "../types.js";
import type { CollectorAdapter, Row, RunOutput } from "./types.js";

type Mode = "scoped" | "global";
interface FieldSelector {
  selector: string;
  mode: Mode; // scoped = relative to each record; global = document order, zipped to records
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Best selector we can build to re-find an element after a redesign. */
function deriveSelector($el: cheerio.Cheerio<any>): string | null {
  const testid = $el.attr("data-testid");
  if (testid) return `[data-testid="${testid}"]`;
  const cls = ($el.attr("class") ?? "").split(/\s+/).filter(Boolean)[0];
  if (cls) return `.${cls}`;
  const tag = ($el.get(0) as any)?.tagName;
  return tag ? String(tag).toLowerCase() : null;
}

export class MockCollectorAdapter implements CollectorAdapter {
  readonly name = "mock";
  private $ = cheerio.load("<html></html>");
  private selectors: Record<string, FieldSelector>;

  constructor() {
    this.selectors = this.freshSelectors();
  }

  private freshSelectors(): Record<string, FieldSelector> {
    return Object.fromEntries(
      Object.entries(FIELD_SELECTORS).map(([f, s]) => [f, { selector: s, mode: "scoped" as Mode }]),
    );
  }

  async reset(): Promise<void> {
    this.selectors = this.freshSelectors();
  }

  async setPage(html: string): Promise<void> {
    this.$ = cheerio.load(html);
  }

  selectorFor(field: string): string | null {
    return this.selectors[field]?.selector ?? null;
  }

  async run(): Promise<RunOutput> {
    const $ = this.$;
    const records = $(RECORD_SELECTOR).toArray();
    const rows: Row[] = records.map((rec, i) => {
      const row: Row = {};
      for (const [field, sel] of Object.entries(this.selectors)) {
        let text = "";
        if (sel.mode === "scoped") {
          text = $(rec).find(sel.selector).first().text();
        } else {
          text = $(sel.selector).eq(i).text();
        }
        row[field] = clean(text);
      }
      return row;
    });
    return { rows, rowCount: rows.length };
  }

  async heal(brokenFields: string[], baseline: Row[]): Promise<SelectorChange[]> {
    const $ = this.$;
    const records = $(RECORD_SELECTOR).toArray();
    const changes: SelectorChange[] = [];

    for (const field of brokenFields) {
      const before = this.selectors[field]?.selector ?? "(none)";
      const expected = baseline.map((r) => r[field]);
      const found = this.reselect(field, expected, records);
      if (found) this.selectors[field] = found;
      changes.push({ field, before, after: found?.selector ?? null });
    }
    return changes;
  }

  /** Try a record-scoped selector first, then a document-global one. */
  private reselect(field: string, expected: string[], records: any[]): FieldSelector | null {
    const $ = this.$;

    // Scoped: within record 0, find an element whose text is the expected value,
    // derive a selector from it, then confirm it holds for every record.
    const first = records[0] ? $(records[0]).find("*").toArray() : [];
    for (const node of first) {
      if (clean($(node).text()) !== expected[0]) continue;
      const candidate = deriveSelector($(node));
      if (!candidate) continue;
      const worksEverywhere = records.every((rec, i) => clean($(rec).find(candidate).first().text()) === expected[i]);
      if (worksEverywhere) return { selector: candidate, mode: "scoped" };
    }

    // Global: the element may have been moved out of its record. Find a selector
    // whose document-order matches line up with the expected values per record.
    for (const node of $("body").find("*").toArray()) {
      if (clean($(node).text()) !== expected[0]) continue;
      const candidate = deriveSelector($(node));
      if (!candidate) continue;
      const matches = $(candidate).toArray();
      if (matches.length < expected.length) continue;
      const zipsUp = expected.every((val, i) => clean($(matches[i]).text()) === val);
      if (zipsUp) return { selector: candidate, mode: "global" };
    }

    return null; // element (and its value) are gone — unrecoverable
  }
}
