import {
  detectFailure,
} from "../../diagnosis/src/detector.js";

import {
  explainDiagnosis,
} from "../../diagnosis/src/diagnosis.js";

import {
  buildHealPrompt,
} from "../../diagnosis/src/prompt.js";

import type {
  Row,
  RunOutput,
} from "./adapters/types.js";

interface DiagnosisRun {
  collectorId: string;
  timestamp: string;
  success: boolean;
  rowCount: number;
  data: unknown[];
  rawOutput: string;
}

function rowsToRunResult(
  collectorId: string,
  output: RunOutput,
): DiagnosisRun {
  return {
    collectorId,
    timestamp: new Date().toISOString(),
    success: output.rowCount > 0,
    rowCount: output.rowCount,
    data: output.rows,
    rawOutput: JSON.stringify(output.rows),
  };
}

export function diagnoseChaosFailure(
  collectorId: string,
  baseline: Row[],
  broken: RunOutput,
  requiredFields: string[],
) {
  const previousRun =
    rowsToRunResult(
      collectorId,
      {
        rows: baseline,
        rowCount: baseline.length,
      },
    );

  const currentRun =
    rowsToRunResult(
      collectorId,
      broken,
    );

  const diagnosis =
    explainDiagnosis(
      detectFailure(
        previousRun as any,
        currentRun as any,
        requiredFields,
      ),
    );

  diagnosis.healPrompt =
    buildHealPrompt(
      diagnosis,
    );

  return diagnosis;
}
