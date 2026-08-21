import type { ChaosResult, ReliabilityScore } from "./types.js";

export function scoreResults(results: ChaosResult[]): ReliabilityScore {
  const total = results.length;
  const broken = results.filter((r) => r.broke);
  const resilient = total - broken.length;

  const healed = broken.filter((r) => r.outcome === "healed").length;
  const partial = broken.filter((r) => r.outcome === "partial").length;
  const failed = broken.filter((r) => r.outcome === "failed").length;

  // Field-instance recovery across everything that broke.
  const brokenFieldCount = broken.reduce((n, r) => n + r.fieldsBroken.length, 0);
  const recoveredFieldCount = broken.reduce((n, r) => n + r.fieldsRecovered.length, 0);
  const fieldRecovery = brokenFieldCount === 0 ? 1 : recoveredFieldCount / brokenFieldCount;

  const recoveryTimes = broken.filter((r) => r.recoveryMs > 0).map((r) => r.recoveryMs);
  const avgRecoveryMs = recoveryTimes.length ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length : 0;

  // Headline: healed counts full, partial half, failed nothing over broken cases.
  const score = broken.length === 0 ? 100 : ((healed + partial * 0.5) / broken.length) * 100;

  return {
    total,
    broke: broken.length,
    resilient,
    healed,
    partial,
    failed,
    fieldRecovery,
    avgRecoveryMs,
    score,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

/** Render the score in the report shape from the project brief. */
export function formatScore(score: ReliabilityScore): string {
  const lines = [
    "",
    "  Scraper Reliability Score",
    "  ─────────────────────────",
    `  ${score.broke} breakages introduced`,
    `  ${score.healed} successfully healed`,
    `  ${score.partial} partially recovered`,
    `  ${score.failed} failed`,
    `  ${score.resilient} resilient (mutation didn't break a required field)`,
    "",
    `  ${pct(score.fieldRecovery)} field recovery`,
    `  ${(score.avgRecoveryMs / 1000).toFixed(1)}s average recovery time`,
    "",
    `  ►  Reliability Score: ${score.score.toFixed(0)} / 100`,
    "",
  ];
  return lines.join("\n");
}

/** One-line-per-mutation breakdown for the console. */
export function formatBreakdown(results: ChaosResult[]): string {
  const icon: Record<ChaosResult["outcome"], string> = {
    healed: "✔",
    partial: "◑",
    failed: "✘",
    resilient: "·",
  };
  return results
    .map((r) => {
      const change = r.selectorChanges.find((c) => c.after) ;
      const diff = change ? `  ${change.before} → ${change.after}` : "";
      const rows = r.broke ? `  (${r.rowsAffected} rows)` : "";
      return `  ${icon[r.outcome]} ${r.outcome.padEnd(9)} ${r.label}${rows}${diff}`;
    })
    .join("\n");
}