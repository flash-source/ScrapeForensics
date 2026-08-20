# diagnosis

Role 1 — Scraper Doctor + AI diagnosis.

Owns INVESTIGATE + EXPLAIN in the ScrapeForensics pipeline: taking a failed
run from `../collector`, figuring out what broke and why, and producing the
plain-language description that gets passed into `healCollector(...)`.

See the root [README](../README.md) for how this fits into the full pipeline,
and `../collector/README.md` for the functions available to call into
(`runCollector`, `healCollector`, `store.recordIncident`, etc.).

_Not built yet — whoever's on this role, drop your stack/setup notes here._
