import type { DiagnosisResult } from "./types.js";

export function explainDiagnosis(
  diagnosis: DiagnosisResult,
): DiagnosisResult {
  if (!diagnosis.failed) {
    return {
      ...diagnosis,
      explanation:
        "The scraper is healthy. No significant extraction or schema degradation was detected.",
      healPrompt: "",
    };
  }

  let explanation = "";

  switch (diagnosis.failureType) {
    case "no_rows":
      explanation =
        `The scraper returned ${diagnosis.currentRowCount} rows ` +
        `compared with ${diagnosis.previousRowCount} previously. ` +
        "The target page may be unavailable, the extraction logic may have failed, " +
        "or the page structure may have changed significantly.";
      break;

    case "schema_change": {
      const removed =
        diagnosis.schemaComparison.removedFields;

      const added =
        diagnosis.schemaComparison.addedFields;

      explanation =
        "The output schema changed between runs.";

      if (removed.length > 0) {
        explanation +=
          ` Removed fields: ${removed.join(", ")}.`;
      }

      if (added.length > 0) {
        explanation +=
          ` Added fields: ${added.join(", ")}.`;
      }

      explanation +=
        " This may indicate that the target site's structure or field naming changed.";

      break;
    }

    case "partial_failure":
      explanation =
        `Multiple fields degraded while the scraper continued returning rows. ` +
        `Affected fields: ${diagnosis.affectedFields.join(", ")}. ` +
        "This strongly suggests a structural change in the target page.";
      break;

    case "field_degradation": {
      const field =
        diagnosis.fieldComparisons.find(
          (comparison) =>
            diagnosis.affectedFields.includes(
              comparison.field,
            ),
        );

      if (field) {
        explanation =
          `${field.field} extraction dropped from ` +
          `${(field.previousSuccessRate * 100).toFixed(1)}% ` +
          `to ` +
          `${(field.currentSuccessRate * 100).toFixed(1)}%. ` +
          "The scraper is still returning rows, so the target page is reachable, " +
          "but the extraction logic for this field likely no longer matches the page structure.";
      }

      break;
    }

    default:
      explanation =
        "The scraper produced an unexpected extraction failure.";
  }

  return {
    ...diagnosis,
    explanation,
  };
}
