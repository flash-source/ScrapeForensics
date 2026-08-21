import type { RunResult } from "../../collector/src/index.js";

import {
  compareRuns,
  compareSchemas,
} from "./comparator.js";

import type {
  DiagnosisResult,
  FailureType,
  LikelyCause,
  Severity,
} from "./types.js";

const FIELD_DROP_THRESHOLD = 0.5;

export function detectFailure(
  previous: RunResult,
  current: RunResult,
  requiredFields: string[],
): DiagnosisResult {
  const fieldComparisons = compareRuns(
    previous,
    current,
    requiredFields,
  );

  const schemaComparison = compareSchemas(
    previous,
    current,
  );

  const degradedFields =
    fieldComparisons.filter(
      (field) =>
        field.drop >= FIELD_DROP_THRESHOLD,
    );

  const requiredFieldSet =
    new Set(requiredFields);

  const removedRequiredFields =
    schemaComparison.removedFields.filter(
      (field) =>
        requiredFieldSet.has(field),
    );

  /*
   * A top-level field disappearing completely is
   * a schema change.
   *
   * A nested field such as price.value disappearing
   * while price still exists is field degradation.
   */
  const topLevelRemovedRequiredFields =
    removedRequiredFields.filter(
      (field) => !field.includes("."),
    );

  const hasTopLevelSchemaChange =
    topLevelRemovedRequiredFields.length > 0 ||
    schemaComparison.addedFields.some(
      (field) => !field.includes("."),
    );

  let failureType: FailureType = "healthy";
  let severity: Severity = "none";
  let likelyCause: LikelyCause = "none";
  let failed = false;
  let confidence = 0.95;

  /*
   * 1. Total failure
   */
  if (
    !current.success ||
    current.rowCount === 0
  ) {
    failed = true;
    failureType = "no_rows";
    severity = "critical";
    likelyCause = current.success
      ? "page_unavailable"
      : "extraction_failure";
    confidence = 0.95;
  }

  /*
   * 2. Top-level schema change
   *
   * Give structural changes priority over field
   * degradation because a completely removed field
   * is evidence that the output schema changed.
   */
  else if (hasTopLevelSchemaChange) {
    failed = true;
    failureType = "schema_change";
    severity =
      topLevelRemovedRequiredFields.length > 0
        ? "high"
        : "medium";
    likelyCause = "schema_drift";
    confidence = 0.9;
  }

  /*
   * 3. Multiple fields degraded
   */
  else if (degradedFields.length >= 2) {
    failed = true;
    failureType = "partial_failure";
    severity = "critical";
    likelyCause = "dom_structure_change";
    confidence = 0.9;
  }

  /*
   * 4. Single field degraded
   *
   * This includes nested fields such as:
   *
   * price.value
   *
   * where the parent price object still exists.
   */
  else if (degradedFields.length === 1) {
    failed = true;
    failureType = "field_degradation";
    severity = "high";
    likelyCause = "selector_change";
    confidence = 0.9;
  }

  return {
    failed,
    failureType,
    severity,
    likelyCause,
    confidence,

    previousRowCount:
      previous.rowCount,

    currentRowCount:
      current.rowCount,

    affectedFields:
      degradedFields.map(
        (field) => field.field,
      ),

    fieldComparisons,
    schemaComparison,

    explanation: "",
    healPrompt: "",
  };
}
