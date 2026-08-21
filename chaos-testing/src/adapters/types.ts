import type { SelectorChange } from "../types.js";

export type Row = Record<string, string>;

export interface RunOutput {
  rows: Row[];
  rowCount: number;
}

export interface CollectorAdapter {
  readonly name: string;

  setPage(html: string): Promise<void>;

  run(): Promise<RunOutput>;

  /*
   * Heal the broken fields.
   *
   * healPrompt is produced by Scraper Doctor.
   * The mock may ignore it, but the Bright Data
   * adapter must pass it to healCollector().
   */
  heal(
    brokenFields: string[],
    baseline: Row[],
    healPrompt?: string,
  ): Promise<SelectorChange[]>;

  selectorFor(field: string): string | null;

  reset?(): Promise<void>;
}
