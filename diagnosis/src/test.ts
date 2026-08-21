import assert from "node:assert/strict";

import { detectFailure } from "./detector.js";
import { explainDiagnosis } from "./diagnosis.js";
import { buildHealPrompt } from "./prompt.js";

function runTest(
  name: string,
  previous: any,
  current: any,
  expectedType: string,
  expectedFailed: boolean,
) {
  const diagnosis = explainDiagnosis(
    detectFailure(
      previous,
      current,
      ["title", "price", "rating"],
    ),
  );

  assert.equal(
    diagnosis.failed,
    expectedFailed,
  );

  assert.equal(
    diagnosis.failureType,
    expectedType,
  );

  console.log(`✓ ${name}`);

  if (diagnosis.failed) {
    console.log(
      `  ${diagnosis.failureType} | ${diagnosis.severity}`,
    );
  }
}

/* ------------------------------
   Healthy
-------------------------------- */

const healthy = {
  collectorId: "test",
  timestamp: new Date().toISOString(),
  success: true,
  rowCount: 3,
  data: [
    {
      title: "Book A",
      price: "£10",
      rating: "4",
    },
    {
      title: "Book B",
      price: "£20",
      rating: "5",
    },
    {
      title: "Book C",
      price: "£30",
      rating: "3",
    },
  ],
  rawOutput: "",
};

/* ------------------------------
   Price degradation
-------------------------------- */

const priceBroken = {
  ...healthy,
  data: [
    {
      title: "Book A",
      price: null,
      rating: "4",
    },
    {
      title: "Book B",
      price: null,
      rating: "5",
    },
    {
      title: "Book C",
      price: null,
      rating: "3",
    },
  ],
};

/* ------------------------------
   Multiple fields broken
-------------------------------- */

const multipleBroken = {
  ...healthy,
  data: [
    {
      title: "Book A",
      price: null,
      rating: null,
    },
    {
      title: "Book B",
      price: null,
      rating: null,
    },
    {
      title: "Book C",
      price: null,
      rating: null,
    },
  ],
};

/* ------------------------------
   Zero rows
-------------------------------- */

const zeroRows = {
  ...healthy,
  rowCount: 0,
  data: [],
};

/* ------------------------------
   Schema change
-------------------------------- */

const schemaChanged = {
  ...healthy,
  data: [
    {
      title: "Book A",
      cost: "£10",
      rating: "4",
    },
    {
      title: "Book B",
      cost: "£20",
      rating: "5",
    },
    {
      title: "Book C",
      cost: "£30",
      rating: "3",
    },
  ],
};

/* ------------------------------
   Tests
-------------------------------- */

runTest(
  "healthy run",
  healthy,
  healthy,
  "healthy",
  false,
);

runTest(
  "single field degradation",
  healthy,
  priceBroken,
  "field_degradation",
  true,
);

runTest(
  "multiple field degradation",
  healthy,
  multipleBroken,
  "partial_failure",
  true,
);

runTest(
  "zero rows",
  healthy,
  zeroRows,
  "no_rows",
  true,
);

runTest(
  "schema change",
  healthy,
  schemaChanged,
  "schema_change",
  true,
);


/* ------------------------------
   Nested Bright Data field
-------------------------------- */

const brightDataHealthy = {
  ...healthy,
  data: [
    {
      title: "A Light in the Attic",
      price: {
        value: 51.77,
        currency: "GBP",
        symbol: "£",
      },
      stock_availability: "In stock (22 available)",
    },
  ],
};

const brightDataPriceBroken = {
  ...brightDataHealthy,
  data: [
    {
      title: "A Light in the Attic",
      price: {
        currency: "GBP",
        symbol: "£",
      },
      stock_availability: "In stock (22 available)",
    },
  ],
};

const nestedDiagnosis = explainDiagnosis(
  detectFailure(
    brightDataHealthy,
    brightDataPriceBroken,
    ["title", "price.value", "stock_availability"],
  ),
);

assert.equal(
  nestedDiagnosis.failed,
  true,
);

assert.equal(
  nestedDiagnosis.failureType,
  "field_degradation",
);

assert.ok(
  nestedDiagnosis.affectedFields.includes(
    "price.value",
  ),
);

console.log(
  "✓ nested Bright Data field degradation",
);

console.log(
  `  price.value | ${nestedDiagnosis.severity}`,
);

/* ------------------------------
   Prompt test
-------------------------------- */

const diagnosis = explainDiagnosis(
  detectFailure(
    healthy,
    priceBroken,
    ["title", "price", "rating"],
  ),
);

const prompt = buildHealPrompt(
  diagnosis,
);

assert.match(
  prompt,
  /price/i,
);

assert.match(
  prompt,
  /field_degradation/i,
);

console.log("✓ healing prompt contains diagnosis evidence");

console.log("\nAll diagnosis tests passed.");
