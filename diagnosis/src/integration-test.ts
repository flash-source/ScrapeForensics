import {
  runCollector,
} from "../../collector/src/index.js";

import { detectFailure } from "./detector.js";
import { explainDiagnosis } from "./diagnosis.js";
import { buildHealPrompt } from "./prompt.js";

const TARGET_URL =
  "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html";

const REQUIRED_FIELDS = [
  "title",
  "price.value",
  "stock_availability",
];

async function main() {
  const collectorId =
    process.env.COLLECTOR_ID;

  if (!collectorId) {
    throw new Error(
      "COLLECTOR_ID is required.\n\n" +
      "Example:\n" +
      "COLLECTOR_ID=c_xxxxx npx tsx src/integration-test.ts",
    );
  }

  console.log("\n=== SCRAPEFORENSICS DRY RUN ===\n");

  console.log(
    `Collector: ${collectorId}`,
  );

  console.log(
    `Target: ${TARGET_URL}\n`,
  );

  /*
   * Run the collector.
   *
   * This is the real Bright Data call.
   */
  console.log(
    "Running collector...",
  );

  const currentRun =
    await runCollector(
      collectorId,
      TARGET_URL,
    );

  console.log(
    `Rows returned: ${currentRun.rowCount}`,
  );

  console.log(
    `Success: ${currentRun.success}`,
  );

  console.log(
    "\nSample output:",
  );

  console.log(
    JSON.stringify(
      currentRun.data[0],
      null,
      2,
    ),
  );

  /*
   * For the first integration test,
   * treat this run as the baseline and
   * create a simulated degraded run.
   *
   * This lets us test the real collector
   * → diagnosis boundary without calling
   * Bright Data heal.
   */
  const healthyRun = currentRun;

  const brokenData =
    currentRun.data.map(
      (row) => {
        if (
          !row ||
          typeof row !== "object"
        ) {
          return row;
        }

        const copy = {
          ...(row as Record<
            string,
            unknown
          >),
        };

        const price =
          copy.price;

        if (
          price &&
          typeof price === "object" &&
          !Array.isArray(price)
        ) {
          const brokenPrice = {
            ...(price as Record<
              string,
              unknown
            >),
          };

          /*
           * Simulate the price value selector
           * breaking while the price object still exists.
           */
          delete brokenPrice.value;

          copy.price = brokenPrice;
        }

        return copy;
      },
    );

  const brokenRun = {
    ...currentRun,
    data: brokenData,
  };

  console.log(
    "\n=== RUNNING SCRAPER DOCTOR ===\n",
  );

  let diagnosis =
    detectFailure(
      healthyRun,
      brokenRun,
      REQUIRED_FIELDS,
    );

  diagnosis =
    explainDiagnosis(
      diagnosis,
    );

  diagnosis.healPrompt =
    buildHealPrompt(
      diagnosis,
    );

  console.log(
    JSON.stringify(
      diagnosis,
      null,
      2,
    ),
  );

  console.log(
    "\n=== HEAL PROMPT ===\n",
  );

  console.log(
    diagnosis.healPrompt,
  );

  console.log(
    "\n=== DRY RUN COMPLETE ===",
  );

  console.log(
    "No Bright Data healing was triggered.",
  );
}

main().catch(
  (error) => {
    console.error(
      "\nIntegration test failed:",
    );

    console.error(error);

    process.exit(1);
  },
);
