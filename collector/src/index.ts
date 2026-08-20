import { runCli, runCliToFile, parseJsonFromStdout } from "./cli.js";
import type { CollectorRecord, RunResult, HealResult } from "./types.js";

export * from "./types.js";
export * as store from "./store.js";

export async function createCollector(url: string, description: string): Promise<CollectorRecord> {
  const { result, data } = await runCliToFile<{ collector_id: string }>([
    "scraper", "create", url, description,
  ]);
  if (result.code !== 0) {
    throw new Error(`scraper create failed (exit ${result.code}): ${result.stderr || result.stdout}`);
  }
  const parsed = data ?? parseJsonFromStdout<{ collector_id: string }>(result.stdout);
  if (!parsed?.collector_id) {
    throw new Error(`scraper create succeeded but no collector_id found. Raw output:\n${result.stdout}`);
  }
  return {
    collectorId: parsed.collector_id,
    targetUrl: url,
    description,
    createdAt: new Date().toISOString(),
  };
}

export async function runCollector(collectorId: string, url: string): Promise<RunResult> {
  const { result, data } = await runCliToFile<unknown[]>([
    "scraper", "run", collectorId, url, "--pretty",
  ]);
  const rows = data ?? parseJsonFromStdout<unknown[]>(result.stdout) ?? [];
  return {
    collectorId,
    timestamp: new Date().toISOString(),
    success: result.code === 0,
    rowCount: Array.isArray(rows) ? rows.length : 0,
    data: Array.isArray(rows) ? rows : [],
    rawOutput: result.stdout,
  };
}

export async function healCollector(
  collectorId: string,
  url: string,
  whatBroke: string,
  options: { autoApprove?: boolean } = {},
): Promise<HealResult> {
  const args = ["scraper", "heal", collectorId, whatBroke, "--url", url];
  if (options.autoApprove) args.push("--auto-approve");

  const { result, data } = await runCliToFile<{
    status: string;
    preview_result?: unknown[];
    diff_summary?: string;
    view_url?: string;
  }>(args);

  if (result.code !== 0) {
    return { collectorId, status: "failed", prompt: whatBroke, timestamp: new Date().toISOString() };
  }
  const parsed = data ?? parseJsonFromStdout(result.stdout);
  return {
    collectorId,
    status: (parsed?.status as HealResult["status"]) ?? "healed",
    prompt: whatBroke,
    previewResult: parsed?.preview_result,
    diffSummary: parsed?.diff_summary,
    viewUrl: parsed?.view_url,
    timestamp: new Date().toISOString(),
  };
}

export async function approveHeal(collectorId: string, url: string): Promise<HealResult> {
  const { result, data } = await runCliToFile<{ status: string }>([
    "scraper", "approve", collectorId, "--url", url,
  ]);
  return {
    collectorId,
    status: result.code === 0 ? "healed" : "failed",
    prompt: "",
    timestamp: new Date().toISOString(),
    ...(data ?? {}),
  };
}

export async function verifyHeal(
  collectorId: string,
  url: string,
  requiredFields: string[],
): Promise<{ success: boolean; result: RunResult; missingFields: string[] }> {
  const result = await runCollector(collectorId, url);
  const sample = result.data[0] as Record<string, unknown> | undefined;
  const missingFields = requiredFields.filter((f) => !sample || sample[f] === undefined || sample[f] === null || sample[f] === "");
  return { success: result.success && result.rowCount > 0 && missingFields.length === 0, result, missingFields };
}

export async function triggerCollectorApi(collectorId: string, apiToken: string): Promise<unknown> {
  const res = await fetch("https://api.brightdata.com/dca/trigger", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ collector_id: collectorId }),
  });
  if (!res.ok) {
    throw new Error(`trigger failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
