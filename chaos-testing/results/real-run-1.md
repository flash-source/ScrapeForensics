# Real Bright Data run — collector c_mt5jdynw1jjnzz9k00

| Mutation | Fields broken | Diagnosis | Heal outcome | Recovery time |
|---|---|---|---|---|
| rename CSS class on title | title, price, rating (0 rows returned) | no_rows / critical / extraction_failure | partial | 350.4s |
| strip class attribute off title | title (schema changed, field removed) | schema_change / high / schema_drift | failed | 272.7s |
| remove data-*/aria attrs from title | none — resilient | — | — | — |

**Reliability Score: 25/100** — 2 breakages, 0 fully healed, 1 partial, 1 failed, 1 resilient. 50% field recovery, 311.6s avg recovery time.

Notes:
- `reset()` is a no-op on a live collector — these two heals ran sequentially on the *same* collector, so mutation 2 started from whatever state mutation 1's partial heal left, not a clean baseline. n=2, treat as a smoke test, not a stable score.
- For comparison: the mock harness (deterministic heuristic, documented as a lower-bound estimate) scores 73/100 on the same fixture. The real AI came in well below that "lower bound" on this run — worth stating plainly rather than assuming mock ≤ real.