# Real Bright Data run — 3rd collector c_mt5pdmat17gmw53bst

Third real run, another **fresh** collector, same fixture and same three
mutations as run-1/run-2 (title only — round-robin fix landed after this run).

| Mutation | Fields broken | Diagnosis | Heal outcome | Recovery time |
|---|---|---|---|---|
| rename CSS class on title | none | — | resilient | — |
| strip class attribute off title | none | — | resilient | — |
| remove data-*/aria attributes from title | none | — | resilient | — |

**Reliability Score: 100/100** — 0 breakages, 3 resilient. 100% field recovery, 0.0s avg recovery time.

Notes:
- **Same create description, same fixture, structurally different scraper.** This collector's title extraction wasn't anchored on a CSS class at all — unlike run-1 and run-2, none of the three mutations (which specifically target class-based selectors) had anything to break.
- **This is the most interesting finding across all three real runs, not the highest score.** Identical prompts to `scraper create` produced at least two different internal extraction strategies across 3 generations — 2 of 3 anchored on CSS classes and failed to recover when broken, 1 of 3 used something structural and was immune to the same mutations. Reliability here isn't just "does heal work" — it's also "how consistently does the AI build a robust scraper," and this run is the evidence for that second half.
- No incidents recorded to `data/store.json` — nothing broke, so nothing triggered the heal/verify path. Expected, not a gap.