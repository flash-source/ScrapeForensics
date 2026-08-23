# Real Bright Data run — fresh collector c_mt5yqe6g2h99u2v3bf

Second real run, on a **fresh** collector (run-1 reused an already-healed one).
Same first two mutations as run-1, so the two are directly comparable.

| Mutation | Fields broken | Diagnosis | Heal outcome | Recovery time |
|---|---|---|---|---|
| rename CSS class on title | title (100% → 0%) | schema_change / high / schema_drift (90%) | failed | 21.4s |
| strip class attribute off title | title (100% → 0%) | schema_change / high / schema_drift (90%) | failed | 12.5s |

**Reliability Score: 0/100** — 2 breakages, 0 fully healed, 0 partial, 2 failed, 0 resilient. 0% field recovery, 17.0s avg recovery time.

Both incidents persisted to `data/store.json` (`verifiedSuccess: false`), confirming the incident-store path end to end.

Notes:
- **Fresh collector, same two mutations, worse result than run-1 (0/100 vs 25/100).** On a clean collector both class-based breaks (rename, then strip) took the title to 0% and Bright Data's AI heal recovered neither. This cuts against the intuition that a fresh collector heals better — here it was *more* fragile to class changes than run-1's already-healed one.
- **Heals failed fast (~17s avg) vs run-1's ~312s.** Run-1's slow heals ran on a collector with accumulated template state; this fresh one's heal calls returned a non-recovering result in seconds. Fast-fail, not a hang.
- Same `reset()` caveat as run-1: `reset()` is a no-op on a live collector, so mutation 2 ran on the state mutation 1's (failed) heal left, not a clean baseline. n=2 — smoke test, not a stable score.
- This collector extracts one row (the first result card) with a flat `{title, price, rating}` schema, so scoring is title-on-row-0. Baseline was verified non-empty (`Aurora Wireless Over-Ear Headphones` / `$129.99` / `4.5`) before the batch, so the breaks are real, not a dead baseline.
- **Getting a harness-compatible fresh collector needed steering.** Created straight against the fixture, Bright Data's AI twice built a two-step crawler (follow each card's `/dp/` link → detail page) with a nested `products` / `product_page_url` schema *and* baked the creation-time tunnel host into the detail URLs — unusable once that tunnel closed, and no flat `title/price/rating` for the harness to score. Fix: create against a crawl-neutralized copy of the fixture (title `/dp/` `href` and `data-asin` removed, all element structure/classes kept) so the AI has nothing to crawl and emits a flat single-page extractor. At run time the normal fixture is served; the extractor's selectors still match. Worth knowing for the demo: real-path collector shape is non-deterministic and link-sensitive.
- For comparison: the mock harness (deterministic heuristic, documented lower-bound) scores 73/100 on the same fixture. Both real runs (25/100, 0/100) landed well below that "lower bound" — real AI heal underperformed the mock estimate on class-rename / class-strip breaks.
