/**
 * The chaos harness — the measurable core of Role 3.
 *
 * For each mutation: start from the healthy baseline, BREAK the page, confirm
 * something the scraper needs actually dropped out, HEAL, VERIFY the fields came
 * back, and time the recovery. Every cycle is one ChaosResult; the batch of them
 * feeds the Reliability Score.
 */

import type { CollectorAdapter, Row } from "./adapters/types.js";
import type { ChaosResult, Mutation } from "./types.js";

export interface RunChaosOptions {
  onResult?: (result: ChaosResult) => void;
  /** Persist each incident (wire to collector's store.recordIncident for the real pipeline). */
  recordIncident?: (result: ChaosResult, baseline: Row[]) => Promise<string | void>;
}

/** Fields whose value was present in baseline but is now empty/missing. */
function fieldsThatBroke(baseline: Row[], current: Row[], fields: string[]): Map<string, number> {
  const broken = new Map<string, number>();
  for (const field of fields) {
    let affected = 0;
    for (let i = 0; i < baseline.length; i++) {
      const was = baseline[i]?.[field]?.trim();
      const now = current[i]?.[field]?.trim();
      if (was && !now) affected++;
    }
    if (affected > 0) broken.set(field, affected);
  }
  return broken;
}

export async function runOneMutation(
  adapter: CollectorAdapter,
  baselineHtml: string,
  baseline: Row[],
  mutation: Mutation,
  fields: string[],
): Promise<ChaosResult> {
  const base: ChaosResult = {
    mutation: mutation.kind,
    label: mutation.label,
    targetField: mutation.targetField,
    broke: false,
    fieldsBroken: [],
    fieldsRecovered: [],
    rowsAffected: 0,
    outcome: "resilient",
    recoveryMs: 0,
    selectorChanges: [],
  };

  try {
    // BREAK
    const mutatedHtml = mutation.apply(baselineHtml);
    await adapter.setPage(mutatedHtml);
    const brokenRun = await adapter.run();
    const broken = fieldsThatBroke(baseline, brokenRun.rows, fields);

    if (broken.size === 0) {
      return base; // mutation was cosmetic — the scraper shrugged it off (resilient)
    }

    const fieldsBroken = [...broken.keys()];
    const rowsAffected = Math.max(...broken.values());

    // HEAL + VERIFY (timed — this is what the Reliability Score cares about)
    const start = Date.now();
    const selectorChanges = await adapter.heal(fieldsBroken, baseline);
    const healedRun = await adapter.run();
    const recoveryMs = Date.now() - start;

    const stillBroken = fieldsThatBroke(baseline, healedRun.rows, fieldsBroken);
    const fieldsRecovered = fieldsBroken.filter((f) => !stillBroken.has(f));

    const outcome: ChaosResult["outcome"] =
      fieldsRecovered.length === fieldsBroken.length
        ? "healed"
        : fieldsRecovered.length === 0
          ? "failed"
          : "partial";

    return {
      ...base,
      broke: true,
      fieldsBroken,
      fieldsRecovered,
      rowsAffected,
      outcome,
      recoveryMs,
      selectorChanges,
    };
  } catch (err) {
    return { ...base, broke: true, outcome: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runChaosBatch(
  adapter: CollectorAdapter,
  baselineHtml: string,
  mutations: Mutation[],
  fields: string[],
  options: RunChaosOptions = {},
): Promise<ChaosResult[]> {
  // Establish the last-good extraction once.
  await adapter.setPage(baselineHtml);
  const baselineRun = await adapter.run();
  const baseline = baselineRun.rows;

  const results: ChaosResult[] = [];
  for (const mutation of mutations) {
    // Each mutation is an independent incident from a healthy scraper.
    if (adapter.reset) await adapter.reset();
    const result = await runOneMutation(adapter, baselineHtml, baseline, mutation, fields);
    if (result.broke && options.recordIncident) {
      const id = await options.recordIncident(result, baseline);
      if (id) result.incidentId = id;
    }
    options.onResult?.(result);
    results.push(result);
  }
  return results;
}
