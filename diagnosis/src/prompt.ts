import type { DiagnosisResult } from "./types.js";

export function buildHealPrompt(
  diagnosis: DiagnosisResult,
): string {
  if (!diagnosis.failed) {
    return "";
  }

  const affectedFields =
    diagnosis.fieldComparisons
      .filter(
        (field) =>
          field.drop >= 0.5,
      )
      .map(
        (field) =>
          `${field.field}: ` +
          `${(field.previousSuccessRate * 100).toFixed(1)}% -> ` +
          `${(field.currentSuccessRate * 100).toFixed(1)}%`,
      )
      .join("; ");

  const removed =
    diagnosis.schemaComparison.removedFields;

  const added =
    diagnosis.schemaComparison.addedFields;

  return [
    "The scraper has degraded.",
    "",
    `Failure type: ${diagnosis.failureType}`,
    `Severity: ${diagnosis.severity}`,
    `Likely cause: ${diagnosis.likelyCause}`,
    "",
    `Previous rows: ${diagnosis.previousRowCount}`,
    `Current rows: ${diagnosis.currentRowCount}`,
    "",
    `Affected fields: ${affectedFields || "none"}`,
    "",
    `Removed fields: ${removed.join(", ") || "none"}`,
    `Added fields: ${added.join(", ") || "none"}`,
    "",
    "Diagnosis:",
    diagnosis.explanation,
    "",
    "Repair the extraction logic against the current page.",
    "Preserve the existing output schema and field meanings.",
    "Do not remove unaffected fields.",
    "Do not invent new fields unless they are required to restore an existing field.",
  ].join("\n");
}
