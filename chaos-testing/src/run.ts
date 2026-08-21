/**
 * CLI entry for the chaos harness.
 *
 *   npm run chaos:mock            # local, credit-free, runs in ~seconds
 *   npm run chaos:mock -- -n 100  # 100 mutations for a headline number
 *   npm run chaos                 # same, but --mock must still be passed until
 *                                 # a real collectorId + public publish() is wired
 *
 * The real Bright Data path needs a collector id and a way to publish each
 * mutated page to a public URL (see adapters/brightdata.ts). Until that's wired
 * for your environment, use --mock.
 */

import { loadFixture, REQUIRED_FIELDS } from "./fixtures.js";
import { mutationBatch } from "./mutations.js";
import { MockCollectorAdapter } from "./adapters/mock.js";
import { runChaosBatch } from "./harness.js";
import { scoreResults, formatScore, formatBreakdown } from "./score.js";
import type { CollectorAdapter } from "./adapters/types.js";
import type { ChaosResult } from "./types.js";
import type { Row } from "./adapters/types.js";

interface Args {
  mock: boolean;
  count: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { mock: false, count: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mock") args.mock = true;
    else if (a === "-n" || a === "--count") args.count = parseInt(argv[++i], 10) || 0;
  }
  return args;
}

async function buildAdapter(mock: boolean): Promise<CollectorAdapter> {
  if (mock) return new MockCollectorAdapter();
  throw new Error(
    "Real Bright Data mode isn't wired for this environment yet.\n" +
      "It needs a collectorId + a publish(html)->publicUrl function (see adapters/brightdata.ts).\n" +
      "Run with --mock to exercise the full BREAK -> HEAL -> VERIFY -> SCORE loop locally.",
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const adapter = await buildAdapter(args.mock);

  const html = await loadFixture();
  const mutations = mutationBatch(REQUIRED_FIELDS, args.count);

  console.log(`\nChaos run — adapter: ${adapter.name}, ${mutations.length} mutations, fields: ${REQUIRED_FIELDS.join(", ")}`);

  // In-memory incident log for the mock; the real pipeline passes
  // store.recordIncident here so incidents land in collector's forensic history.
  const incidents: unknown[] = [];
  const recordIncident = async (r: ChaosResult, _baseline: Row[]) => {
    const id = `chaos-${incidents.length + 1}`;
    incidents.push({
      id,
      detectedAt: new Date().toISOString(),
      fieldsAffected: r.fieldsBroken,
      rowsAffected: r.rowsAffected,
      healPrompt: r.label,
      verifiedSuccess: r.outcome === "healed",
      notes: r.selectorChanges.map((c) => `${c.field}: ${c.before} -> ${c.after ?? "unrecoverable"}`).join("; "),
    });
    return id;
  };

  const results = await runChaosBatch(adapter, html, mutations, REQUIRED_FIELDS, { recordIncident });

  console.log("\n" + formatBreakdown(results));
  console.log(formatScore(scoreResults(results)));
  console.log(`  ${incidents.length} incidents recorded.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
