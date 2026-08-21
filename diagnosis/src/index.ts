import {
  runCollector,
  healCollector,
  verifyHeal,
  store,
} from "../../collector/src/index.js";

import { detectFailure } from "./detector.js";
import { explainDiagnosis } from "./diagnosis.js";
import { buildHealPrompt } from "./prompt.js";

export interface DiagnosisOptions {
  collectorId: string;
  url: string;
  previousRun: Awaited<
    ReturnType<typeof runCollector>
  >;
  requiredFields: string[];

  /**
   * When true, diagnosis runs normally but
   * Bright Data healing is NOT triggered.
   */
  dryRun?: boolean;
}

export async function diagnoseAndHeal(
  options: DiagnosisOptions,
) {
  console.log("\n=== SCRAPER DOCTOR ===\n");

  /*
   * 1. Run the current scraper
   */
  const currentRun = await runCollector(
    options.collectorId,
    options.url,
  );

  /*
   * 2. Compare previous and current runs
   */
  let diagnosis = detectFailure(
    options.previousRun,
    currentRun,
    options.requiredFields,
  );

  /*
   * 3. Turn the evidence into a human-readable explanation
   */
  diagnosis = explainDiagnosis(diagnosis);

  /*
   * 4. Print diagnosis
   */
  console.log(
    JSON.stringify(
      {
        failed: diagnosis.failed,
        failureType: diagnosis.failureType,
        severity: diagnosis.severity,
        likelyCause: diagnosis.likelyCause,
        confidence: diagnosis.confidence,
        previousRowCount:
          diagnosis.previousRowCount,
        currentRowCount:
          diagnosis.currentRowCount,
        affectedFields:
          diagnosis.affectedFields,
        schema:
          diagnosis.schemaComparison,
        explanation:
          diagnosis.explanation,
      },
      null,
      2,
    ),
  );

  /*
   * 5. Healthy scraper
   */
  if (!diagnosis.failed) {
    console.log(
      "\n✓ Scraper is healthy. No healing required.",
    );

    return {
      diagnosis,
      healed: false,
      verification: null,
    };
  }

  /*
   * 6. Build evidence-backed healing instruction
   */
  const healPrompt =
    buildHealPrompt(diagnosis);

  diagnosis.healPrompt = healPrompt;

  console.log("\n=== HEAL PROMPT ===\n");
  console.log(healPrompt);

  /*
   * 7. Dry-run mode
   *
   * Do NOT spend Bright Data credits.
   */
  if (options.dryRun) {
    console.log(
      "\n[DRY RUN] Healing was not triggered.",
    );

    return {
      diagnosis,
      healed: false,
      dryRun: true,
      verification: null,
    };
  }

  /*
   * 8. Trigger Bright Data healing
   */
  console.log(
    "\n=== TRIGGERING HEAL ===\n",
  );

  const heal = await healCollector(
    options.collectorId,
    options.url,
    healPrompt,
    {
      autoApprove: true,
    },
  );

  /*
   * 9. Verify the repaired scraper
   */
  console.log(
    "\n=== VERIFYING HEAL ===\n",
  );

  const verification =
    await verifyHeal(
      options.collectorId,
      options.url,
      options.requiredFields,
    );

  /*
   * 10. Record incident
   */
  await store.recordIncident({
    id: crypto.randomUUID(),
    collectorId:
      options.collectorId,
    detectedAt:
      currentRun.timestamp,
    fieldsAffected:
      diagnosis.affectedFields,
    rowsAffected:
      currentRun.rowCount,
    healPrompt,
    healResult: heal,
    verifiedAt:
      new Date().toISOString(),
    verifiedSuccess:
      verification.success,
    notes:
      diagnosis.explanation,
  });

  console.log(
    verification.success
      ? "\n✓ Heal verified successfully."
      : "\n✗ Heal verification failed.",
  );

  return {
    diagnosis,
    healed: true,
    heal,
    verification,
  };
}
