import type { RunResult } from "../../collector/src/index.js";
import type {
  FieldComparison,
  SchemaComparison,
} from "./types.js";

function isPresent(value: unknown): boolean {
  return (
    value !== undefined &&
    value !== null &&
    value !== ""
  );
}

function getFields(rows: unknown[]): string[] {
  const fields = new Set<string>();

  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }

    for (const key of Object.keys(
      row as Record<string, unknown>,
    )) {
      fields.add(key);
    }
  }

  return [...fields].sort();
}

function successRate(
  rows: unknown[],
  field: string,
): number {
  if (rows.length === 0) {
    return 0;
  }

  const successful = rows.filter((row) => {
    if (!row || typeof row !== "object") {
      return false;
    }

    return isPresent(
      (row as Record<string, unknown>)[field],
    );
  }).length;

  return successful / rows.length;
}

export function compareRuns(
  previous: RunResult,
  current: RunResult,
  requiredFields: string[],
): FieldComparison[] {
  const fields = new Set([
    ...requiredFields,
    ...getFields(previous.data),
    ...getFields(current.data),
  ]);

  return [...fields].sort().map((field) => {
    const previousRate = successRate(
      previous.data,
      field,
    );

    const currentRate = successRate(
      current.data,
      field,
    );

    return {
      field,
      previousSuccessRate: previousRate,
      currentSuccessRate: currentRate,
      drop: previousRate - currentRate,

      previousSample:
        (
          previous.data[0] as
            | Record<string, unknown>
            | undefined
        )?.[field],

      currentSample:
        (
          current.data[0] as
            | Record<string, unknown>
            | undefined
        )?.[field],
    };
  });
}

export function compareSchemas(
  previous: RunResult,
  current: RunResult,
): SchemaComparison {
  const previousFields = getFields(previous.data);
  const currentFields = getFields(current.data);

  const previousSet = new Set(previousFields);
  const currentSet = new Set(currentFields);

  const removedFields = previousFields.filter(
    (field) => !currentSet.has(field),
  );

  const addedFields = currentFields.filter(
    (field) => !previousSet.has(field),
  );

  const unchangedFields = previousFields.filter(
    (field) => currentSet.has(field),
  );

  return {
    previousFields,
    currentFields,
    addedFields,
    removedFields,
    unchangedFields,
  };
}
