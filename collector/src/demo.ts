import { createCollector, runCollector, healCollector, verifyHeal, store } from "./index.js";
import { randomUUID } from "node:crypto";

async function main() {
  const TARGET_URL = "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html";
  const DESCRIPTION = "extract exactly these fields: 'title' (string, the book's title), 'price' (numeric value), and 'stock_availability' (string)";
  const REQUIRED_FIELDS = ["title", "price"];

  const EXISTING_COLLECTOR_ID = process.env.COLLECTOR_ID;

  console.log("1. " + (EXISTING_COLLECTOR_ID ? `Reusing collector ${EXISTING_COLLECTOR_ID}` : "Creating collector (this can take several minutes)..."));
  const collector = EXISTING_COLLECTOR_ID
    ? { collectorId: EXISTING_COLLECTOR_ID, targetUrl: TARGET_URL, description: DESCRIPTION, createdAt: new Date().toISOString() }
    : await createCollector(TARGET_URL, DESCRIPTION);
  if (!EXISTING_COLLECTOR_ID) console.log(`   -> ${collector.collectorId}`);
  await store.saveCollector(collector);

  console.log("2. Running collector...");
  const firstRun = await runCollector(collector.collectorId, TARGET_URL);
  console.log(`   -> ${firstRun.rowCount} rows, success=${firstRun.success}`);
  console.log("   raw sample row:", JSON.stringify(firstRun.data[0]));

  // --- Simulated break happens here (this is Role 3's job in the real
  // pipeline: mutate the target page's DOM before the next run). For a
  // solo smoke test, point TARGET_URL at an already-broken page instead.

  const firstSample = firstRun.data[0] as Record<string, unknown> | undefined;
  const missingNow = REQUIRED_FIELDS.filter((f) => !firstSample || !firstSample[f]);

  if (missingNow.length === 0) {
    console.log("3. Nothing's actually broken — skipping heal.");
    console.log("   Point TARGET_URL at a page you know is broken to test the heal path,");
    console.log("   or wait for Role 3's chaos harness to introduce a real one.");
    return;
  }

  console.log(`3. Healing — missing: ${missingNow.join(", ")} (auto-approve, unattended)...`);
  const heal = await healCollector(
    collector.collectorId,
    TARGET_URL,
    `The following fields are returning empty: ${missingNow.join(", ")}. The site's HTML structure likely changed.`,
    { autoApprove: true },
  );

  console.log("4. Verifying the fields we actually care about came back...");
  const verification = await verifyHeal(collector.collectorId, TARGET_URL, REQUIRED_FIELDS);
  console.log(`   -> success=${verification.success} missing=${verification.missingFields.join(", ") || "none"}`);

  console.log("5. Recording the incident...");
  await store.recordIncident({
    id: randomUUID(),
    collectorId: collector.collectorId,
    detectedAt: firstRun.timestamp,
    healPrompt: heal.prompt,
    healResult: heal,
    verifiedAt: new Date().toISOString(),
    verifiedSuccess: verification.success,
  });

  console.log("Done — check ./data/store.json for the incident log.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
