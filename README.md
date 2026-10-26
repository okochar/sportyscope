# SportyScope / VirtualScope 5

Unofficial football research workspace with separate Real, vFootball, Scheduled and anonymous Instant products. It never signs into a betting account, submits a stake or places a bet.

## Run

Node 20 or newer; no application packages required.

```sh
npm start
npm test
```

Vercel deploys the static page and `/api` functions. Deploy the full repository together; the browser rejects mismatched API versions. Functions allow up to 60 seconds for historical collection and code verification.

## Available features

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

The site runs using bundled archival profiles and temporary current-data caches without a database. Persistent storage is prepared but requires a project and server credentials. See [Supabase setup](docs/SUPABASE_SETUP.md) and `supabase/migrations/202610250001_knowledge.sql`.

No visitor account is required. The service-role credential stays server-side. The migration enables RLS and revokes visitor table access. Ticket history currently belongs to the browser; provider observations/models persist to Supabase once configured.

## Validation

`npm test` covers recorded feeds, all market preservation, pagination, booking identity/readback, history cursors, clock windows, archival identity separation, settlement, deduplicated learning and the server-only database adapter. Browser checks use the actual local app, including 30-row paging, custom settings, genuine code loading, per-leg tracking and mobile layout. See `docs/VERIFIED_RESULTS_V5.md` for the final verification record.

Virtual outcomes remain stochastic. Historical samples and fitted rates do not guarantee a future result. Research and reservation creation do not place a bet.
