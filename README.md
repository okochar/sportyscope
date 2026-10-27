# SportyScope 5.2

Unofficial football research workspace with separate Real, vFootball, Scheduled and anonymous Instant products. It never signs into a betting account, submits a stake or places a bet.

## Run

Node 20 or newer. The official Supabase SDK is pinned in package-lock.json, with its browser distribution served locally.

```sh
npm ci
npm start
npm test
```

Vercel deploys the static page and `/api` functions. Deploy the full repository together; the browser rejects mismatched API versions. Functions allow up to 60 seconds for historical collection and code verification.

## Available features

- Markets, Auto picks, Tickets, History and Settings are separate screens. Mobile navigation remains accessible at the bottom. Building/loading and evaluating tickets have their own views.
- Sign in once using an email link. Supabase sessions are remembered and refreshed. Tickets, current slip, preferences, imports and journal save automatically and load on another device using the same account. Local drafts remain available during outages; no recovery keys or manual synchronization are required.
- All available fixture pages are collected. The explorer displays 30 games per page with dynamic Next/Previous controls; this does not limit the underlying dataset.
- Target combined odds, maximum 1-30 legs, per-leg price bounds, product and WAT fixture window are configurable. One outcome per event; products have separate tickets. Target search is bounded and does not claim a global optimum or guaranteed win.
- Real football uses exact provider team IDs and up to three years of available paginated SportyBet team results. vFootball uses its own dated daily results, collected across 14 days and scoped by product and league.
- Profiles show form, opponents, venue splits, goals, half-time/second-half patterns, H2H and 40 observed final-score conditions. Independent Poisson models compare verified 1X2, double chance, totals, team totals, BTTS, correct-score, European handicap, draw-no-bet and supported whole/half-line Asian handicaps. Other returned markets remain visible without invented predictions.
- Model diagnostics are informational. They do not veto selection. Missing historical models use a visibly labelled price fallback from complementary current markets. Closed, suspended, missing and unsupported outcomes cannot be invented.
- Genuine SportyBet reservation codes work for Real and vFootball: current selections are revalidated server-side and every ID is checked on readback. Existing codes can be loaded into the local slip. Scheduled/Instant transferable booking flows remain unverified and local.
- Suggested, loaded and reserved tickets can be tracked in IndexedDB. Each leg is checked against completed provider scores. Results are calculated research outcomes, not official account payouts. Unsupported market or product results remain unverified. Pending, void, won and lost states are distinct.
- Distinct verified win/loss evaluations adjust local ranking with a shrinkage prior. Repeated tickets do not duplicate the same prediction in learning. Current provider-result histories refit the statistical model on later runs. This does not establish a profitable edge.

## Imported and additional data

The user's 2022 Instant bot archive produced 6,359 distinct scored row signatures, 20 team profiles and 380 ordered H2H profiles. Individual dates and match IDs are absent; duplicate ambiguity and current simulator comparability are disclosed. See [legacy review](docs/LEGACY_REVIEW.md).

The OpenFootball supplement contains 6,083 completed results from 24 league/season files and 200 namespaced team profiles, retrieved for 2024/25-2026/27. The latest supplied scored fixture was 20 September 2026 at collection time. It is a separate CC0 archive, not silently joined to SportyBet IDs or used to double-count matches. Refresh it with `node scripts/collect-openfootball.js`.

Corners, shots, cards, possession, player availability, tactics and measured xG require additional verified records. Final scores cannot supply them. Public viewing of statistics widgets does not establish an open reusable feed. See [data-source review](docs/DATA_SOURCES.md).

## Supabase

The connected SportyScope database stores shared research and private account workspaces. Configure the server URL/secret and public sign-in key once in Vercel Production, then redeploy. See [Supabase setup](docs/SUPABASE_SETUP.md). New installations can apply `assets/supabase-setup.sql`.

Browsing does not require sign-in. Cross-device personal storage requires the same signed-in account. The server verifies each access token using Supabase getUser, scopes every record to that verified identity, and keeps the service credential server-side. All tables have RLS with visitor grants revoked. Optimistic revisions prevent silent overwrites between devices. Shared archives seed automatically; research/result requests persist provider histories. Saving and result checks run while the app is open.

## Validation

`npm test` covers feeds, markets, pagination, genuine booking readback, historical models, settlement, learning, server-only credentials, verified account isolation, automatic draft migration, new-device loading and conflicting edits. Browser checks include the actual five-screen interface and mobile navigation. Earlier feed/model verification remains in `docs/VERIFIED_RESULTS_V5.md` and `docs/VERIFIED_RESULTS_V51.md`.

Virtual outcomes remain stochastic. Historical samples and fitted rates do not guarantee a future result. Research and reservation creation do not place a bet.
