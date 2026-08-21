# chaos-testing

Chaos testing + verification. Owns **BREAK** and the **Scraper
Reliability Score**.

Instead of waiting for a real site to change, we deliberately mutate a sandbox
page's DOM, confirm the scraper actually broke, trigger a heal, verify the
fields came back, and time the recovery. Run a batch of mutations and it turns
"our scraper self-heals" into a number:

```
  Scraper Reliability Score
  ─────────────────────────
  11 breakages introduced
  8 successfully healed
  0 partially recovered
  3 failed
  10 resilient (mutation didn't break a required field)

  73% field recovery
  0.0s average recovery time

  ►  Reliability Score: 73 / 100
```

**Target: Amazon search results.** Fields are `title`, `price`, `rating` — what
an Amazon search card exposes (stock lives on the product page, not the
listing). The fixture (`src/fixtures/amazon-search.html`) is a synthetic page in
Amazon's real structure — `div[data-component-type="s-search-result"]`,
`.a-price .a-offscreen`, `h2 span`, `.a-icon-alt` — with made-up product data;
swap in a real Bright Data snapshot once the collector is wired. The harness
only needs the structure, so nothing else changes.

## Run it

```bash
npm install
npm run chaos:mock            # local, no login/credits, ~seconds
npm run chaos:mock -- -n 100  # 100 mutations for a headline number
npm run typecheck
```

`--mock` runs the entire BREAK → HEAL → VERIFY → SCORE loop locally against the
fixture page (`src/fixtures/amazon-search.html`) with a small deterministic
healer — no Bright Data login and no credits spent. Use it for development,
CI, and fast iteration on the score.

## How it works

- **`mutations.ts`** — the break engine. Pure `html -> html` transforms:
  `rename-class`, `strip-classes`, `drop-attribute`, `wrap-nesting`,
  `change-tag`, `move-element`, `remove-element`. These mirror how real Amazon
  redesigns look (e.g. `.a-price .a-offscreen` → `.a-offscreen-v2` after a class
  rename). They operate on the element the field selector actually matches, so
  they work with compound selectors, not just single-class ones.
- **`adapters/`** — the harness talks to a scraper through one small interface
  so the scoring logic is identical for mock and real runs:
  - `mock.ts` — local cheerio extraction + a heuristic healer that re-derives a
    working selector by locating the last-good values (tightest element first).
    Intentionally a *lower bound* on a real AI healer, so the number is honest —
    e.g. stripping every class off the price leaves no clean hook and it fails,
    while a deleted price is still recovered from Amazon's visible copy.
  - `brightdata.ts` — drives a real collector via Role 2's exported
    `runCollector` / `healCollector` / `verifyHeal`.
- **`harness.ts`** — for each mutation: start from the healthy baseline, break
  it, confirm a required field dropped out, heal, verify, time it → one
  `ChaosResult`.
- **`score.ts`** — aggregates results into the Reliability Score (healed /
  partial / failed, field-recovery %, average recovery time).

## The real Bright Data path

Bright Data scrapes a **public URL**, not an HTML string, so the mutated pages
have to be hosted somewhere it can reach — `localhost` won't do. `publish.ts`
solves this with a local HTTP server fronted by a **Cloudflare quick tunnel**
(`cloudflared`): a public `https://…trycloudflare.com` URL, no account, no config.
The tunnel URL is stable for the session and the served HTML is swappable, so
`publish(html)` just swaps the page and returns the same URL each time.

### Run it
```bash
# 1. install cloudflared (once): https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
# 2. bdata login   (see ../collector/README.md), and claim the wemakedevs credits
# 3. create a collector trained on the fixture's shape, once:
npm run chaos:real            # prints the tunnel URL serving the healthy fixture
#    -> in another shell: bdata scraper create <that-url> "extract title, price, rating"
#    -> export COLLECTOR_ID=c_xxx
COLLECTOR_ID=c_xxx npm run chaos:real -- -n 3
```

`chaos:real` starts the tunnel on the healthy fixture, then runs the same
BREAK → DIAGNOSE → HEAL → VERIFY → SCORE loop as the mock — except HEAL goes to
Bright Data's real AI self-healing via the Doctor's heal prompt. It defaults to
**3 mutations** (override with `-n`) because:

**Heal is slow and costs credits** — minutes per call per Bright Data's docs
(see `../collector/README.md`). This path is for the live demo and a true score
against Bright Data's own AI heal, *not* "100 mutations in CI" — use `--mock`
for volume. `reset()` is also a no-op on a live collector (heals accumulate), so
keep real batches small or recreate the collector between fields.

### Wiring it yourself
`createCloudflareTunnelPublisher()` returns `{ url, publish, close }`; hand its
`publish` straight to the adapter (this is what `run.ts --real` does):

```ts
import { createCloudflareTunnelPublisher, BrightDataCollectorAdapter } from "./index.js";

const publisher = await createCloudflareTunnelPublisher({ initialHtml });
const adapter = new BrightDataCollectorAdapter({
  collectorId: "c_xxx",
  publish: publisher.publish,
});
// …run the batch, then: await publisher.close();
```

Prefer a different host (ngrok, a deployed static bucket, …)? The adapter only
needs any `publish: (html) => Promise<string>`; swap the publisher out. Pass
`store.recordIncident` from the collector module as `recordIncident` in
`runChaosBatch` so each break lands in the shared forensic history.

See the root [README](../README.md) for how this fits the full pipeline.
