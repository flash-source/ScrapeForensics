/**
 * Field names in scraper output aren't guaranteed — the AI named a title
 * field "book_title" on one run. Be explicit in createCollector's
 * description if downstream code depends on an exact key.
 */

import spawn from "cross-spawn";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const CLI_BIN = process.env.BDATA_BIN ?? "bdata";

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runCli(args: string[], timeoutMs = 20 * 60 * 1000): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(CLI_BIN, args);
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`${CLI_BIN} ${args.join(" ")} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function runCliToFile<T>(args: string[], timeoutMs?: number): Promise<{ result: CliResult; data: T | null }> {
  const tmpPath = join(tmpdir(), `bdata-${randomUUID()}.json`);
  const result = await runCli([...args, "-o", tmpPath], timeoutMs);
  let data: T | null = null;
  try {
    const raw = await readFile(tmpPath, "utf-8");
    data = JSON.parse(raw) as T;
  } catch {
    // file wasn't written or wasn't JSON, caller falls back to stdout parsing
  } finally {
    unlink(tmpPath).catch(() => {});
  }
  return { result, data };
}

export function parseJsonFromStdout<T>(stdout: string): T | null {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const lastBrace = trimmed.lastIndexOf("{");
    if (lastBrace === -1) return null;
    try {
      return JSON.parse(trimmed.slice(lastBrace)) as T;
    } catch {
      return null;
    }
  }
}
