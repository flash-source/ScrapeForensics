import type { CollectorAdapter, Row } from "./adapters/types.js";
import type { ChaosResult, Mutation } from "./types.js";

export interface DiagnosisOutput {
  failureType: string;
  severity: string;
  likelyCause: string;
  confidence: number;
  affectedFields: string[];
  explanation: string;
  healPrompt: string;
}

export interface RunChaosOptions {
  onResult?: (result: ChaosResult) => void;

  recordIncident?: (
    result: ChaosResult,
    baseline: Row[],
    diagnosis?: DiagnosisOutput,
  ) => Promise<string | void>;

  diagnose?: (
    baseline: Row[],
    broken: ReturnType<CollectorAdapter["run"]> extends Promise<infer R>
      ? R
      : never,
    fields: string[],
  ) => Promise<DiagnosisOutput> | DiagnosisOutput;
}

function fieldsThatBroke(
  baseline: Row[],
  current: Row[],
  fields: string[],
): Map<string, number> {
  const broken = new Map<string, number>();

  for (const field of fields) {
    let affected = 0;

    for (let i = 0; i < baseline.length; i++) {
      const was = baseline[i]?.[field]?.trim();
      const now = current[i]?.[field]?.trim();

      if (was && !now) {
        affected++;
      }
    }

    if (affected > 0) {
      broken.set(field, affected);
    }
  }

  return broken;
}

export async function runOneMutation(
  adapter: CollectorAdapter,
  baselineHtml: string,
  baseline: Row[],
  mutation: Mutation,
  fields: string[],
  options: RunChaosOptions = {},
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
    const mutatedHtml =
      mutation.apply(baselineHtml);

    await adapter.setPage(mutatedHtml);

    const brokenRun =
      await adapter.run();

    const broken =
      fieldsThatBroke(
        baseline,
        brokenRun.rows,
        fields,
      );

    if (broken.size === 0) {
      return base;
    }

    const fieldsBroken = [
      ...broken.keys(),
    ];

    const rowsAffected =
      Math.max(...broken.values());

    // INVESTIGATE + EXPLAIN
    let diagnosis:
      | DiagnosisOutput
      | undefined;

    if (options.diagnose) {
      diagnosis =
        await options.diagnose(
          baseline,
          brokenRun,
          fields,
        );
    }

    // HEAL + VERIFY
    const start =
      Date.now();

    const selectorChanges =
      await adapter.heal(
        fieldsBroken,
        baseline,
        diagnosis?.healPrompt,
      );

    const healedRun =
      await adapter.run();

    const recoveryMs =
      Date.now() - start;

    const stillBroken =
      fieldsThatBroke(
        baseline,
        healedRun.rows,
        fieldsBroken,
      );

    const fieldsRecovered =
      fieldsBroken.filter(
        (field) =>
          !stillBroken.has(field),
      );

    const outcome: ChaosResult["outcome"] =
      fieldsRecovered.length ===
      fieldsBroken.length
        ? "healed"
        : fieldsRecovered.length === 0
          ? "failed"
          : "partial";

    const result: ChaosResult = {
      ...base,
      broke: true,
      fieldsBroken,
      fieldsRecovered,
      rowsAffected,
      outcome,
      recoveryMs,
      selectorChanges,
    };

    if (
      result.broke &&
      options.recordIncident
    ) {
      const id =
        await options.recordIncident(
          result,
          baseline,
          diagnosis,
        );

      if (id) {
        result.incidentId = id;
      }
    }

    options.onResult?.(result);

    return result;
  } catch (err) {
    const result: ChaosResult = {
      ...base,
      broke: true,
      outcome: "failed",
      error:
        err instanceof Error
          ? err.message
          : String(err),
    };

    options.onResult?.(result);

    return result;
  }
}

export async function runChaosBatch(
  adapter: CollectorAdapter,
  baselineHtml: string,
  mutations: Mutation[],
  fields: string[],
  options: RunChaosOptions = {},
): Promise<ChaosResult[]> {
  await adapter.setPage(
    baselineHtml,
  );

  const baselineRun =
    await adapter.run();

  const baseline =
    baselineRun.rows;

  const results: ChaosResult[] = [];

  for (const mutation of mutations) {
    if (adapter.reset) {
      await adapter.reset();
    }

    const result =
      await runOneMutation(
        adapter,
        baselineHtml,
        baseline,
        mutation,
        fields,
        options,
      );

    results.push(result);
  }

  return results;
}
