# SportyScope 5.7.0 — reduced background IO and recommendation gates

## Operational audit, 1 November 2026

The database was approximately 68 MB. Cumulative statistics since 2 October showed 142,644 observation updates, 8,957 ticket updates and 8,085 tracking-queue updates. Model upserts had also spilled about 480 MB each of temporary reads and writes across 83 calls. These are cumulative database counters, not a measurement of the current hourly disk budget or a claim about its sole cause.

All three account workers were already paused. The once-per-minute dispatcher was still active; it is now inactive. The new private statement trigger only activates that fixed dispatcher when at least one account explicitly enables a worker, and disables it when all are paused. This release does not restart any worker, enable shadow prediction collection, or place a stake.

Identical verified observations now avoid updates, including retrieval-timestamp-only changes. Missing incoming half-time data preserves known half-time scores when full-time scores are unchanged. Real score corrections still save. Verification used an explicitly rolled-back transaction: duplicate/missing-half-time writes returned zero, a changed score returned one, the fixed schedule toggled with account enablement, and client roles remained denied RPC execution. Afterwards enabled accounts, active dispatchers and test score rows were all zero.

Clock/observation-time-only tracking changes remain on the device. Actual score, phase, status and verified-result changes persist. Unchanged server tracking checks patch the queue deadline instead of uploading the ticket again. Real history cache lifetime is six hours; the large virtual history snapshot is refreshed at most once per 15 minutes per retained snapshot. Live scores have their own refresh loop. Opening the app no longer launches historical archive imports. Bulk import/repair routes require an explicit authenticated POST.

## Recommendation changes

- Short tickets of one to three legs are the default, including migration of old maximum-50 preferences. Longshot mode must be explicitly selected for more legs, up to 50. A target is a stopping condition, never a reason to add a weak selection. A qualifying shorter ticket can be shown below target with the shortfall disclosed.
- The account's exact product, market, line, side and model version require recent settled pre-kickoff forecast evidence. At least 150 distinct fixtures, 14 match days, 80 earlier rows and 40 later test rows are required. Chronological 70/30 diagnostics check calibration, Brier error against the price-implied benchmark, and a positive lower statistical bound on simulated flat-unit return. The held-out Wilson lower win bound must also meet the selected probability floor.
- Unverified, duplicate, post-kickoff and future forecasts are excluded. Markets with push probability are excluded until their feedback handles void outcomes completely. User-submitted evidence cannot qualify an automatic server booking.
- These are retrospective diagnostic gates. They do not prove an advantage or future profit, and statistical bounds assume independent fixtures. Selecting many tested markets also introduces selection uncertainty. A prospective paper trial is still needed before any confidence in financial performance.
- No market in the current saved sample has enough qualifying evidence. Auto picks will therefore show **No reliable ticket**. The release deliberately does not manufacture alternatives or collect more forecasts by restarting a worker.
- Supported probability has 90% ranking weight; the bounded price bonus has 10%, saturating at 1.60 odds. New/replacement odds remain at least 1.15. This ranking score is not a probability. Existing qualifying original markets in a loaded code may remain unchanged. Ticket comparisons retain the same matches.
- Auto-pick output shows the product of leg probabilities under an explicit independence assumption, separately from each leg's estimate.

## What the losses mean

The account UI audit showed 849 wins in 1,023 distinct estimated legs (83.0%), but only 49 wins in 175 completed tickets (28.0%). These are different measures, include older forecasts, and do not establish profitability. Server-recorded real-market samples were generally only a handful of fixtures; the largest exact virtual market group had 138 rows across a few days. High reported confidence was insufficient validation for automatic recommendations.

The 15 historical event-feature classifiers remain research-only. They cover historical corners, cards, shots and goal targets from a 2016–2018 archive; they are not current calibrated recommendation models. This release does not claim an 80–90% future win rate.

1UP/2UP need goal-sequence data to detect a lead followed by a turnaround; early-goal markets need exact goal times and verified settlement definitions. Final and half-time scores do not supply that evidence. Current automatic coverage for those markets remains unavailable. Missing records are never inferred from a final score.

## Reproduce and operate

Run `npm ci` and `npm test`. Apply migrations through `20261101122417_reduce_background_io_and_add_validation_gates.sql`. A fresh installation can install the fixed dispatcher with `supabase/operations/enable_background.sql`; it stays inactive until an explicit account Start. Existing server credentials remain in Vercel. Historical import tooling now requires an authenticated `SCOPE_ACCESS_TOKEN` supplied privately to the process; never commit it or paste it into chat. No service credential is sent to a browser.

Security advisors found no new function/search-path issue. Server-only tables intentionally have RLS without client policies and revoked client access. The existing leaked-password-protection warning and informational index advisories were retained; the release does not weaken authentication or add indexes without workload evidence.

The deployed asset comparison, test totals, commit, archive hash and paused-worker check are recorded in the delivered verification artifact. The sustained improvement in the Supabase disk budget must be observed over a representative period; no percentage reduction has been claimed.
