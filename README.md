# SportyScope 5.3.1

Football research for separate Real, vFootball, Scheduled and anonymous Instant products. The app does not access a betting account, submit a stake or place a bet.

## Run

Use Node 20 or newer. Run npm ci, npm start and npm test. Production is https://sportyscope.vercel.app. Local servers do not inherit Vercel variables. Deploy static assets and all API routes together; clients reject mismatched versions.

## Main flows

- Markets: all fixture pages and returned markets, with 30 matches visible per page.
- Auto picks: choose target odds, product, time window, minimum leg odds, maximum 50 legs and minimum 75–99% model estimate (80% default). There is no 1,000 target-odds ceiling; any finite target of at least 1.10 is accepted.
- New picks and replacement markets have a 1.15 minimum price. After the history/probability floor is met, ranking balances conservative history support (65%) and a bounded log-price utility (35%, saturating at 1.60 odds). This is a ranking heuristic, not a calibrated probability or profit estimate. Odds of 3 do not earn a larger price bonus than 1.60. The odds target only stops adding legs; it cannot select a weaker high-odds market. Unreachable targets show the shortfall. Price-only forecasts never qualify. At least 20 result rows per team and 20 observed comparisons where available are required.
- Check code: paste a SportyBet booking code directly, load all up to 50 legs, retain qualifying legs and replace weaker legs with the strongest supported market on the same match. Qualifying original markets stay untouched, including any short odds the user already chose. Only weak or unsupported markets are replaced; only tiny qualifying alternatives leave the match unresolved. No replacement-odds control. Missing evidence stays unresolved. Severe return collapses are displayed as comparisons with revised-code/copy actions disabled: for original totals of at least 5.00, revised totals below 2.00 or retaining under 10% of the original potential profit. Lesser major reductions (under 25% profit retained) get a visible trade-off notice. These thresholds describe return usability, not winning likelihood. The maximum total found in the supported qualifying scan is also shown where known. The revision can be reserved only when every leg meets the filter. Same-match dependence prevents a combined percentage, not individual leg review.
- History: per-leg pending/won/lost/void/unverified results; provider-verified outcomes enter local diagnostics and subsequent history refreshes. Personal backup statuses are not trusted as shared training data.
- Account: Create account, Log in with password, Set/reset password and change password. Sessions persist and refresh. Slips, preferences, imports, journal, reviewed codes and tracked tickets save automatically, with offline device retention and conflict protection. No manual save button or visitor-entered database key.
- Actions have inline status, compact notifications and scan/review progress. Background saves do not repeatedly flash an updating message. Research starts automatically in Auto picks when enabled; feed refreshes retain data across screen changes.

## Data and models

89,706 completed OpenFootball results from 288 source files were imported from a pinned CC0 source commit. Dates: 2010-07-12 to 2026-09-20. There are 1,296 distinct source labels, including spelling variants, not 1,296 verified club identities. The archive is saved in resumable, digest-versioned chunks in Supabase. Exact labels and explicit aliases can extend earlier real-team seasons; conflicting/ambiguous identities are not guessed and overlapping dates are excluded. Inference can use the bundled cache of this same versioned archive.

Real SportyBet results use exact provider IDs and retain the initial available three-year import in Supabase. Later refreshes stop at known pages and upsert new/corrected observations. vFootball retains its own source-separated dated results and refreshes recent days after its initial 14-day collection. Sources stay separated by product.

The user's 2022 Instant archive supplies 20 team profiles, 380 ordered pairs and 40 observed final-score conditions. Its missing dates, independent match IDs and current-simulator validation are disclosed. Scheduled statistics are small undated provider samples. Price fallbacks remain descriptive and cannot satisfy the history-based picker or ticket review.

Profiles include opponents, form, venues, goals, half-time/second-half scores and H2H where actually available. Poisson models cover verified result, double-chance, totals, team totals, BTTS, correct score and supported handicap settlements. Corners, cards, shots, player availability, tactics and measured xG remain unsupported without their own verified records. Google search does not supply a complete reusable sports database.

Percentages are experimental model estimates, not a measured future win rate or winning guarantee. Observed frequency is shown separately. Accumulator estimates multiply probabilities under an explicit independence assumption. Fifty independent legs at 80% each have an all-leg probability around 0.0014%. Virtual histories do not establish an advantage over a random generator.

## Codes and storage

Real/vFootball reservations are issued by SportyBet and shown only after every requested identifier matches readback. Any provider rejection remains an error; no invented code is returned. Instant/Scheduled transferable codes remain unverified. Supabase server credentials never reach visitors. The server verifies Supabase users and derives ownership from that identity. All tables have RLS and public table access is revoked; save revisions prevent silent device overwrites.

See docs/SUPABASE_SETUP.md, docs/DATA_SOURCES.md and docs/VERIFIED_RESULTS_V53.md. Automatic saving, collection and result checks run while the app is open, with catch-up after reconnection; this release does not add an unattended server worker.
