/**
 * publish(html) -> publicUrl for the real Bright Data chaos path.
 *
 * Bright Data scrapes a *public URL*, not an HTML string, so to run chaos
 * against the real Collector we need to serve each mutated page somewhere it
 * can reach. This does it with a local HTTP server fronted by a Cloudflare
 * "quick tunnel" (cloudflared) — a public https URL with no account, no config.
 *
 * Key design point: the tunnel URL is STABLE for the session, and the served
 * HTML is swappable. So `publish(html)` just swaps what the server returns and
 * hands back the same URL every time. `runCollector(collectorId, url)` takes the
 * URL per run, so one collector (trained on the fixture's page shape) can be
 * pointed at this tunnel and re-run after each mutation.
 *
 * Requires the `cloudflared` binary on PATH (or set CLOUDFLARED_BIN):
 *   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
 */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";

/** A local HTTP server that serves a single, swappable HTML document on every path. */
export interface PageServer {
  origin: string; // http://127.0.0.1:<port>
  port: number;
  setHtml(html: string): void;
  close(): Promise<void>;
}

export function createPageServer(initialHtml = "", port = 0): Promise<PageServer> {
  return new Promise((resolve, reject) => {
    let currentHtml = initialHtml;
    const server = createServer((req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, max-age=0"); // each run must see the latest mutation
      res.writeHead(200);
      res.end(req.method === "HEAD" ? undefined : currentHtml);
    });
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const p = (server.address() as AddressInfo).port;
      resolve({
        origin: `http://127.0.0.1:${p}`,
        port: p,
        setHtml: (html) => {
          currentHtml = html;
        },
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

/** A running cloudflared quick tunnel exposing a local origin at a public https URL. */
export interface Tunnel {
  url: string;
  close(): Promise<void>;
}

export function startCloudflaredTunnel(
  origin: string,
  opts: { bin?: string; timeoutMs?: number } = {},
): Promise<Tunnel> {
  const bin = opts.bin ?? process.env.CLOUDFLARED_BIN ?? "cloudflared";
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const urlRe = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

  return new Promise<Tunnel>((resolve, reject) => {
    const proc = spawn(bin, ["tunnel", "--url", origin, "--no-autoupdate"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const scan = (buf: Buffer) => {
      const m = buf.toString().match(urlRe);
      if (m) {
        finish(() =>
          resolve({
            url: m[0],
            close: () =>
              new Promise<void>((r) => {
                proc.once("close", () => r());
                proc.kill();
              }),
          }),
        );
      }
    };

    proc.stdout.on("data", scan);
    proc.stderr.on("data", scan); // cloudflared prints the URL banner to stderr

    proc.on("error", (err: NodeJS.ErrnoException) => {
      finish(() =>
        reject(
          new Error(
            err.code === "ENOENT"
              ? `cloudflared not found (looked for "${bin}"). Install it — ` +
                "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ " +
                "— or set CLOUDFLARED_BIN to its path."
              : `cloudflared failed to start: ${err.message}`,
          ),
        ),
      );
    });

    proc.on("close", (code) => {
      finish(() => reject(new Error(`cloudflared exited (code ${code}) before a tunnel URL appeared.`)));
    });

    const timer = setTimeout(() => {
      finish(() => {
        proc.kill();
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for a trycloudflare.com URL.`));
      });
    }, timeoutMs);
  });
}

/** The publish surface the Bright Data adapter expects, plus lifecycle control. */
export interface Publisher {
  /** Stable public URL Bright Data scrapes (the tunnel root). */
  url: string;
  /** Swap the served page to `html`; returns the (unchanged) public URL. */
  publish(html: string): Promise<string>;
  /** Tear down the tunnel and the local server. */
  close(): Promise<void>;
}

export interface PublisherOptions {
  /** Page served until the first publish() — use the healthy fixture so a collector can be validated. */
  initialHtml?: string;
  /** Local port (default: an ephemeral free port). */
  port?: number;
  cloudflaredBin?: string;
  /** How long to wait for the tunnel URL (default 30s). */
  timeoutMs?: number;
}

export async function createCloudflareTunnelPublisher(opts: PublisherOptions = {}): Promise<Publisher> {
  const server = await createPageServer(opts.initialHtml ?? "", opts.port ?? 0);
  let tunnel: Tunnel;
  try {
    tunnel = await startCloudflaredTunnel(server.origin, {
      bin: opts.cloudflaredBin,
      timeoutMs: opts.timeoutMs,
    });
  } catch (err) {
    await server.close(); // don't leak the local server if the tunnel never came up
    throw err;
  }
  return {
    url: tunnel.url,
    publish: async (html: string) => {
      server.setHtml(html);
      return tunnel.url;
    },
    close: async () => {
      await tunnel.close().catch(() => {});
      await server.close();
    },
  };
}
