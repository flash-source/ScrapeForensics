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

/**
 * Supports both:
 *
 * title
 *
 * and nested paths:
 *
 * price.value
 * product.price.amount
 */
function getValue(
  row: unknown,
  path: string,
): unknown {
  if (!row || typeof row !== "object") {
    return undefined;
  }

  return path
    .split(".")
    .reduce<unknown>(
      (value, key) => {
        if (
          value === null ||
          value === undefined ||
          typeof value !== "object"
        ) {
          return undefined;
        }

        return (
          value as Record<string, unknown>
        )[key];
      },
      row,
    );
}

function getFields(
  rows: unknown[],
): string[] {
  const fields = new Set<string>();

  function collect(
    value: unknown,
    prefix = "",
  ) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return;
    }

    for (const [
      key,
      child,
    ] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const path = prefix
        ? `${prefix}.${key}`
        : key;

      fields.add(path);

      if (
        child &&
        typeof child === "object" &&
        !Array.isArray(child)
      ) {
        collect(child, path);
      }
    }
  }

  for (const row of rows) {
    collect(row);
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

  const successful = rows.filter(
    (row) =>
      isPresent(
        getValue(row, field),
      ),
  ).length;

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

  return [...fields]
    .sort()
    .map((field) => {
      const previousRate =
        successRate(
          previous.data,
          field,
        );

      const currentRate =
        successRate(
          current.data,
          field,
        );

      return {
        field,

        previousSuccessRate:
          previousRate,

        currentSuccessRate:
          currentRate,

        drop:
          previousRate -
          currentRate,

        previousSample:
          getValue(
            previous.data[0],
            field,
          ),

        currentSample:
          getValue(
            current.data[0],
            field,
          ),
      };
    });
}

export function compareSchemas(
  previous: RunResult,
  current: RunResult,
): SchemaComparison {
  const previousFields =
    getFields(previous.data);

  const currentFields =
    getFields(current.data);

  const previousSet =
    new Set(previousFields);

  const currentSet =
    new Set(currentFields);

  const removedFields =
    previousFields.filter(
      (field) =>
        !currentSet.has(field),
    );

  const addedFields =
    currentFields.filter(
      (field) =>
        !previousSet.has(field),
    );

  const unchangedFields =
    previousFields.filter(
      (field) =>
        currentSet.has(field),
    );

  return {
    previousFields,
    currentFields,
    addedFields,
    removedFields,
    unchangedFields,
  };
}
