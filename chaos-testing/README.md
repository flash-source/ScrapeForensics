# chaos-testing

Role 3 — Chaos testing + verification. Owns **BREAK** and the **Scraper
Reliability Score**.

Instead of waiting for a real site to change, we deliberately mutate a sandbox
page's DOM, confirm the scraper actually broke, trigger a heal, verify the
fields came back, and time the recovery. Run a batch of mutations and it turns
"our scraper self-heals" into a number:

```
  Scraper Reliability Score
  ─────────────────────────
  12 breakages introduced
  9 successfully healed
  0 partially recovered
  3 failed
  9 resilient (mutation didn't break a required field)

  75% field recovery
  0.0s average recovery time

  ►  Reliability Score: 75 / 100
```

## Run it

```bash
npm install
npm run chaos:mock            # local, no login/credits, ~seconds
npm run chaos:mock -- -n 100  # 100 mutations for a headline number
npm run typecheck
```

`--mock` runs the entire BREAK → HEAL → VERIFY → SCORE loop locally against a
fixture page (`src/fixtures/product-page.html`) with a small deterministic
healer — no Bright Data login and no credits spent. Use it for development,
CI, and fast iteration on the score.

## How it works

- **`mutations.ts`** — the break engine. Pure `html -> html` transforms:
  `rename-class`, `drop-class-keep-testid`, `drop-attribute`, `wrap-nesting`,
  `change-tag`, `move-element`, `remove-element`. These mirror how real site
  redesigns look (e.g. the classic `.product-card .price` →
  `[data-testid="price"]` swap).
- **`adapters/`** — the harness talks to a scraper through one small interface
  so the scoring logic is identical for mock and real runs:
  - `mock.ts` — local cheerio extraction + a heuristic healer that re-derives a
    working selector from the last-good values. Intentionally a *lower bound* on
    a real AI healer (a fully deleted element is unrecoverable here), so the
    number is honest.
  - `brightdata.ts` — drives a real collector via Role 2's exported
    `runCollector` / `healCollector` / `verifyHeal`.
- **`harness.ts`** — for each mutation: start from the healthy baseline, break
  it, confirm a required field dropped out, heal, verify, time it → one
  `ChaosResult`.
- **`score.ts`** — aggregates results into the Reliability Score (healed /
  partial / failed, field-recovery %, average recovery time).

## Wiring the real Bright Data path

Two things the real adapter needs that the mock doesn't, because Bright Data
scrapes a **public URL**, not an HTML string:

1. An existing `collectorId` created against the same page shape.
2. A `publish(html) -> publicUrl` function that serves each mutated page
   somewhere Bright Data can reach (deployed static host, ngrok tunnel, …).
   **localhost will not work.**

```ts
import { BrightDataCollectorAdapter } from "./adapters/brightdata.js";

const adapter = new BrightDataCollectorAdapter({
  collectorId: "c_xxx",
  publish: async (html) => {
    /* upload `html`, return its public URL */
  },
});
```

Then pass `store.recordIncident` from the collector module as `recordIncident`
in `runChaosBatch` so each break lands in the shared forensic history.

**Heal is slow and costs credits** — minutes per call per Bright Data's docs
(see `../collector/README.md`). The real adapter is for the live demo and a
true score against Bright Data's own AI heal, *not* for "100 mutations in CI".
Use `--mock` for volume; use the real adapter for the headline demo. Note that
`reset()` is a no-op on a live collector (heals accumulate), so scope real
batches to one field-family at a time or recreate the collector.

See the root [README](../README.md) for how this fits the full pipeline.
