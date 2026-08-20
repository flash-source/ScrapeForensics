# chaos-testing

Role 3 — Chaos testing + verification.

Owns BREAK (deliberately mutating a sandbox page's DOM) and the batch
reliability scoring: loop mutate → `runCollector` → `healCollector({ autoApprove: true })`
→ `verifyHeal` → `store.recordIncident`, then aggregate the results into the
Scraper Reliability Score.

See the root [README](../README.md) for how this fits into the full pipeline,
and `../collector/README.md` for the functions available to call into.

Heads up: heal calls are AI jobs and can take minutes each per Bright Data's
docs, not seconds — scope your mutation batch size around real measured
timing, not an assumed number.

_Not built yet — whoever's on this role, drop your stack/setup notes here._
