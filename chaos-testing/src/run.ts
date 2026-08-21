import { loadFixture, REQUIRED_FIELDS } from "./fixtures.js";
import { mutationBatch } from "./mutations.js";
import { MockCollectorAdapter } from "./adapters/mock.js";
import { runChaosBatch } from "./harness.js";
import { diagnoseChaosFailure } from "./doctor.js";
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

interface BuiltAdapter {
  adapter: CollectorAdapter;
  /** Tear down anything the adapter started (e.g. the tunnel); no-op for the mock. */
  cleanup: () => Promise<void>;
}

async function buildAdapter(mock: boolean, initialHtml: string, count: number): Promise<BuiltAdapter> {
  if (mock) return { adapter: new MockCollectorAdapter(), cleanup: async () => {} };

  const collectorId = process.env.COLLECTOR_ID;
  if (!collectorId) {
    throw new Error(
      "Real Bright Data mode needs COLLECTOR_ID — a collector trained on the fixture's page shape.\n" +
        "Also requires `cloudflared` on PATH (or CLOUDFLARED_BIN). See the chaos-testing README.\n" +
        "Run with --mock to exercise the full BREAK -> HEAL -> VERIFY -> SCORE loop locally instead.",
    );
  }

  // Serve the mutated pages over a public Cloudflare quick tunnel so the real
  // Collector can reach them. Start on the healthy fixture so the URL/collector
  // can be sanity-checked before the first break.
  const { createCloudflareTunnelPublisher } = await import("./publish.js");
  const { BrightDataCollectorAdapter } = await import("./adapters/brightdata.js");

  console.log("Starting Cloudflare tunnel (serving the healthy fixture)...");
  const publisher = await createCloudflareTunnelPublisher({ initialHtml });
  console.log(`  public URL : ${publisher.url}`);
  console.log(`  collector  : ${collectorId} (must be trained on this page's shape)`);
  console.warn(`  note: heal is a real AI job — minutes and credits per call. Running ${count} mutation(s).`);

  const adapter = new BrightDataCollectorAdapter({ collectorId, publish: publisher.publish });
  return { adapter, cleanup: () => publisher.close() };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const html = await loadFixture();

  // Real heal is a slow, paid AI job — default to a tiny batch unless a size was given.
  const count = args.mock ? args.count : args.count || 3;
  const mutations = mutationBatch(REQUIRED_FIELDS, count);

  const { adapter, cleanup } = await buildAdapter(args.mock, html, mutations.length);
  try {
    console.log(`\nChaos run — adapter: ${adapter.name}, ${mutations.length} mutations, fields: ${REQUIRED_FIELDS.join(", ")}`);

  // In-memory incident log for the mock
  const incidents: unknown[] = [];
  const recordIncident = async (
    r: ChaosResult,
    _baseline: Row[],
    diagnosis?: {
      failureType: string;
      severity: string;
      likelyCause: string;
      confidence: number;
      affectedFields: string[];
      explanation: string;
      healPrompt: string;
    },
  ) => {
    const id = `chaos-${incidents.length + 1}`;

    console.log("\n=== INCIDENT DETECTED ===");
    console.log(`Mutation: ${r.label}`);
    console.log(`Fields broken: ${r.fieldsBroken.join(", ")}`);
    console.log(`Rows affected: ${r.rowsAffected}`);

    if (diagnosis) {
      console.log("\n--- SCRAPER DOCTOR ---");
      console.log(`Failure: ${diagnosis.failureType}`);
      console.log(`Severity: ${diagnosis.severity}`);
      console.log(`Likely cause: ${diagnosis.likelyCause}`);
      console.log(`Confidence: ${(diagnosis.confidence * 100).toFixed(0)}%`);
      console.log(`Affected fields: ${diagnosis.affectedFields.join(", ")}`);
      console.log(`Explanation: ${diagnosis.explanation}`);
      console.log("\nHeal prompt:");
      console.log(diagnosis.healPrompt);
    }

    console.log("\n--- HEAL RESULT ---");
    console.log(`Outcome: ${r.outcome}`);
    console.log(`Recovery time: ${r.recoveryMs}ms`);

    incidents.push({
      id,
      detectedAt: new Date().toISOString(),
      fieldsAffected: r.fieldsBroken,
      rowsAffected: r.rowsAffected,
      failureType: diagnosis?.failureType,
      severity: diagnosis?.severity,
      likelyCause: diagnosis?.likelyCause,
      diagnosisConfidence: diagnosis?.confidence,
      diagnosis: diagnosis?.explanation,
      healPrompt: diagnosis?.healPrompt ?? r.label,
      verifiedSuccess: r.outcome === "healed",
      notes: r.selectorChanges
        .map(
          (c) =>
            `${c.field}: ${c.before} -> ${
              c.after ?? "unrecoverable"
            }`,
        )
        .join("; "),
    });

    return id;
  };

  const results = await runChaosBatch(
    adapter,
    html,
    mutations,
    REQUIRED_FIELDS,
    {
      recordIncident,

      diagnose: (
        baseline,
        broken,
        fields,
      ) =>
        diagnoseChaosFailure(
          "mock-chaos",
          baseline,
          broken,
          fields,
        ),
    },
  );

    console.log("\n" + formatBreakdown(results));
    console.log(formatScore(scoreResults(results)));
    console.log(`  ${incidents.length} incidents recorded.\n`);
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});