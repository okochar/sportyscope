# Real football data and learning

The checked-in run contains **15 trained classifiers**, rather than renaming the existing Poisson goals calculation. It uses 122 earlier-match predictors plus missing-value indicators. Targets cover corners, yellow cards, shots, Wyscout-tagged accurate shots, goal totals and both-teams-to-score. Logistic regression and random forests are compared on a selection period; Platt calibration has its own later period; the final 253-match test is untouched by fitting and selection. Baseline Brier error, log loss, reliability bins and failed gates are retained.

The source is Pappalardo et al.'s Wyscout event dataset, [collection DOI](https://doi.org/10.6084/m9.figshare.c.4415000), [paper](https://www.nature.com/articles/s41597-019-0247-7), licensed **CC BY 4.0**. It contains 3,251,294 events across 1,941 matches, 142 source teams and 3,603 players, dated 2016–2018. Every downloaded file is pinned and checksummed in `sources/wyscout.json`. Raw compressed archive members and their CRC/SHA-256 metadata are retained in the private Supabase `scope-source-archive` bucket. Normalized facts, historical lineups, feature rows, model artifacts and training registry are stored separately in Supabase.

## Reproduce

Use Python 3.12 in a project virtual environment, install `ml/requirements.txt`, then run:

```sh
python ml/pipeline.py
```

Use `--source-dir PATH` to reuse downloaded originals. The pipeline verifies source checksums, imports the event data, builds causal features, trains the models and runs Python leakage tests plus JavaScript/Python prediction parity tests. No current-match statistics, current lineup, final result or prices enter that fixture's feature vector. Earlier-day results are a historical availability assumption; the archive does not prove the original announcement time.

After deploying regenerated artifacts, privately supply an authenticated `SCOPE_ACCESS_TOKEN` to the process and run `node scripts/seed-research.js` against the production build to persist its fixed dataset. The import is resumable and validates every raw source object's checksum before upload. No Supabase key is entered in the browser or in this command; server credentials remain in Vercel.

## Runtime feedback

The scheduled account worker records its probability, model version and market before kickoff. It settles selections only against verified operator results and deduplicates repeated legs across ticket combinations. New outcomes immediately update the account's stored evaluation set. Logistic probability calibration retrains after 20 new observations, with at least 100 distinct matches and 20 later independent test matches required for promotion. A challenger must improve both Brier error and log loss over the forecasts actually issued. Failed candidates retain the previous active calibration.

This online calibration is separate from the 15 event-feature classifiers. Those classifiers remain **research-only**: their latest data is from 2018 and their current-season validity has not been established. They are not silently substituted into current booking recommendations. Injuries are absent from this historical archive. The optional API-Football connector is inactive without a server key and never infers injury from lineup absence. Free-season and field coverage must be tested before using it.

## Background operation

Supabase Cron calls a fixed Vercel HTTPS endpoint. Each invocation uses a random, single-use capability expiring in three minutes. Credentials are not embedded in the schedule. Jobs, account settings, prediction outcomes, calibration artifacts and tracking queues are server-only with RLS and revoked anonymous/authenticated table grants.

Real football cycles run every 30 minutes. Virtual cycles recheck upcoming round identities; in-progress scans resume in bounded batches. Each cycle can issue two different qualifying tickets. Every code must be issued and read back by SportyBet before saving. Duplicate combinations, unsupported markets and weak fillers cannot produce automatic codes. Account settings include Start/Pause. No staking or payment endpoint is implemented.

For a fresh project, apply the migrations, deploy, then run `supabase/operations/enable_background.sql` once. An account can then start its own worker from History. The schedule is installed but currently inactive because all account workers are paused; signing in on another device does not require keys or another schedule.

## Independent recommendation gates (5.7.0)

Online calibration alone no longer authorises a recommendation. `lib/recommendation-validation.js` separately checks each exact product/market/line/side/model against distinct server-recorded pre-kickoff forecasts, with chronological later test data, freshness, calibration, price-implied Brier and simulated-return gates. Push markets are excluded until void feedback is complete. Bounds assume independent fixtures and do not guarantee profit. Current samples do not pass. The worker remains paused and this release does not start automatic paper-data collection. Short mode caps new automatic tickets at three legs; longshot mode is explicit. See `docs/VERIFIED_RESULTS_V57.md` for thresholds, audit evidence and limits.

## Definitions and limits

Corners are recorded corner-taking events. Yellow, red and second-yellow tags are retained separately; bookmaker card settlement rules are not assumed equivalent. Accurate-shot tags retain their source definition rather than being labelled as operator shots-on-target. Extra-time fixtures are retained but excluded from regular-time training labels. Historical lineups are retrospective records. Missing values remain unknown.

Live ticket evaluation uses an explicitly experimental score/clock-conditioned remaining-goals scenario for supported regular-time goal markets. It has no independent live calibration and excludes unverified periods and suspended outcomes. Live scores remain provider snapshots. History displays a locally estimated ticking match clock between updates; virtual pace requires three consistent observations from the same match and period. Unknown virtual pace shows the provider clock alongside a ticking update-age timer. Clocks pause at breaks, period boundaries and stale snapshots. These display estimates never settle selections or train a model. No percentage is a guaranteed win rate.
