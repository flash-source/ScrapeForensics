/**
 * Real adapter: drives an actual Bright Data collector through the collector
 * module's exported functions. Used for the live demo and for a true Reliability
 * Score against Bright Data's own AI heal.
 *
 * Two things this adapter needs that the mock doesn't, both because Bright Data
 * scrapes a *public URL*, not an HTML string:
 *
 *  1. `publish(html) -> publicUrl` — you must serve each mutated page somewhere
 *     Bright Data can reach (a deployed static host, an ngrok tunnel, etc).
 *     localhost will NOT work. Wire this to your hosting of choice.
 *  2. An existing `collectorId` created against the same page shape.
 *
 * Heads up (from collector/README): heal is a real AI job — minutes per call,
 * and it spends credits. Scope batch size accordingly; this is not the path for
 * "run 100 mutations in CI". Use the mock for that and this for the headline demo.
 *
 * The collector import is dynamic so `--mock` never loads it (no cross-package
 * build needed just to run the local pipeline).
 */

import { REQUIRED_FIELDS } from "../fixtures.js";
import type { SelectorChange } from "../types.js";
import type { CollectorAdapter, Row, RunOutput } from "./types.js";

export interface BrightDataAdapterConfig {
  collectorId: string;
  /** Serve the given HTML at a public URL Bright Data can fetch, return that URL. */
  publish: (html: string) => Promise<string>;
  requiredFields?: string[];
}

/**
 * The slice of collector's API this adapter uses. Declared locally (rather than
 * `typeof import(...)`) so typechecking this module doesn't reach across the
 * package boundary into Role 2's source and its separate dependency tree.
 */
interface CollectorRunResult {
  data: unknown[];
  rowCount: number;
  success: boolean;
}
interface CollectorHealResult {
  status: string;
  diffSummary?: string;
}
interface CollectorVerifyResult {
  success: boolean;
  missingFields: string[];
}
interface CollectorModule {
  runCollector(collectorId: string, url: string): Promise<CollectorRunResult>;
  healCollector(
    collectorId: string,
    url: string,
    whatBroke: string,
    options?: { autoApprove?: boolean },
  ): Promise<CollectorHealResult>;
  verifyHeal(collectorId: string, url: string, requiredFields: string[]): Promise<CollectorVerifyResult>;
}

const COLLECTOR_PACKAGE = "scrapeforensics-collector";

export class BrightDataCollectorAdapter implements CollectorAdapter {
  readonly name = "brightdata";
  private mod: CollectorModule | null = null;
  private currentUrl: string | null = null;
  private readonly requiredFields: string[];

  constructor(private readonly config: BrightDataAdapterConfig) {
    this.requiredFields = config.requiredFields ?? REQUIRED_FIELDS;
  }

  private async collector(): Promise<CollectorModule> {
    // Non-literal specifier: resolved at runtime, not pulled into typecheck.
    if (!this.mod) this.mod = (await import(COLLECTOR_PACKAGE)) as CollectorModule;
    return this.mod;
  }

  async setPage(html: string): Promise<void> {
    this.currentUrl = await this.config.publish(html);
  }

  selectorFor(): string | null {
    return null; // Bright Data manages the template; selectors aren't exposed here
  }

  private warnedReset = false;
  async reset(): Promise<void> {
    // A live collector's template can't be cheaply rolled back between mutations.
    // Real batch scoring should heal one field-family at a time or recreate the
    // collector; otherwise each heal makes the scraper cumulatively more robust.
    if (!this.warnedReset) {
      console.warn("[brightdata] reset() is a no-op — heals accumulate on the live collector; scope the batch accordingly.");
      this.warnedReset = true;
    }
  }

  async run(): Promise<RunOutput> {
    const { runCollector } = await this.collector();
    if (!this.currentUrl) throw new Error("setPage() must be called before run()");
    const res = await runCollector(this.config.collectorId, this.currentUrl);
    const rows = (res.data as Record<string, unknown>[]).map(toStringRow);
    return { rows, rowCount: res.rowCount };
  }

  async heal(brokenFields: string[]): Promise<SelectorChange[]> {
    const { healCollector, verifyHeal } = await this.collector();
    if (!this.currentUrl) throw new Error("setPage() must be called before heal()");

    const whatBroke = `The following fields are returning empty: ${brokenFields.join(", ")}. The page's HTML structure changed.`;
    const heal = await healCollector(this.config.collectorId, this.currentUrl, whatBroke, { autoApprove: true });
    const verify = await verifyHeal(this.config.collectorId, this.currentUrl, this.requiredFields);

    // Bright Data's diff is coarse (a summary string, not a clean before/after
    // selector), so we report what we can: the summary, or recovery status.
    const after = verify.success ? heal.diffSummary ?? "recovered" : null;
    return brokenFields.map((field) => ({ field, before: "(bright data template)", after }));
  }
}

function toStringRow(obj: Record<string, unknown>): Row {
  const row: Row = {};
  for (const [k, v] of Object.entries(obj ?? {})) row[k] = v == null ? "" : String(v);
  return row;
}
