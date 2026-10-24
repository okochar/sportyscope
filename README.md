# VirtualScope — SportyBet Virtual Market Explorer

A mobile-friendly, **unofficial and read-only** SportyBet Nigeria virtual-football research interface. It displays *only odds that were fetched from the specified upstream or deliberately entered/imported by the user*. No made-up live fixture list, fake API health indicators, or guaranteed picks.

## Run locally

Requires Node.js 18+. No npm packages needed.

```bash
npm start
# open http://localhost:3000
```

Run basic tests with `npm test`.

## Deploy to Vercel

Upload this folder to a GitHub repository and import it into Vercel with Framework Preset **Other**; leave build command empty. Root `index.html` is static. `api/virtual.js` and `api/real.js` are separate on-demand Node.js Functions. The local-only server is `dev-server.js` (not `server.js`, which Vercel can auto-detect as an application entry point). No database or secrets necessary.

## What's included

- vFootball API probe for `upcoming`, `live`, and `results` via the *unofficial* Nigeria endpoints mentioned below. Endpoint structure may change at any time. A successful API HTTP status alone is NOT counted as fixture verification.
- Game-family selector: vFootball (API attempt), Scheduled Virtuals and Instant Virtuals (manual/import until a verified compatible endpoint is available).
- League filters, search and odds cards. Odds are represented as decimal, with the implied probability from 1/decimal odds. For three mutually exclusive 1X2 outcomes, sum >100% represents the bookmaker overround.
- A market detail panel to inspect outcomes and compare break-even probabilities.
- CSV or JSON import, manual entry, and a short paper observation log (saved **only in this browser** with localStorage). No bet submission or credential collection.
- Export imported/event records as CSV and export notes as CSV.

## Source transparency

The upstream methods are reverse-engineered and **not official public SportyBet APIs**. Routes used:

- `/api/ng/factsCenter/wapConfigurableUpcomingEvents`
- `/api/ng/factsCenter/wapConfigurableIndexLiveEvents`
- `/api/ng/factsCenter/eventResultList`

The vFootball sport ID `sr:sport:202120001` and the five category IDs `sv:category:202120001` through `sv:category:202120005` are documented by [Onimix's public VFL repo](https://github.com/Onimix/onimix-vfl-elite). The APIs have **not** been verified from this build environment. Actual responses might require additional query parameters, cookies, or different header values; the live connection will clearly show when it fails. The `/api/ng/factsCenter/pcUpcomingEvents` endpoint used by [Sportybet-mcp](https://github.com/UbongErnest/Sportybet-mcp) is for ordinary football (sport ID `sr:sport:1`) and **is not** wired in as a misleading fallback for virtual games.

## Import shape

CSV columns (case-insensitive):

```csv
league,home,away,home_odds,draw_odds,away_odds,game_type,starts_at
Virtual England,Team A,Team B,2.1,3.4,3.6,vFootball,2026-10-25T12:00:00Z
```

The row above is a **format example, not a genuine match**. `game_type` can be `vFootball`, `Scheduled`, or `Instant`; optional `starts_at` should use ISO 8601. Extra JSON full-market import is accepted as `[{"home":"Team A", "away":"Team B", "league":"Virtual", "markets":[{"name":"1X2", "outcomes":[{"name":"1", "odds":2.1}, {"name":"X", "odds":3.4}, {"name":"2", "odds":3.6}]}]}]`.

## Important limits

Virtual games use random number generators and algorithms. Past results do **not** establish a reproducible edge. A lower bookmaker overround isn't proof of profitable bets. The interface calculates odds mathematics only, not predictions; there are no bets, automatic staking, or guaranteed-win signals. 18+ only; set hard loss limits and never bet money you can't afford to lose.

## Version 2 — Real sports + full returned market lists

**Separate categories:** **REAL SPORTS** queries `/api/real` (proxy to `GET https://www.sportybet.com/api/ng/factsCenter/pcUpcomingEvents` with `sportId=sr:sport:1` for real football). **VIRTUAL GAMES** continue querying `/api/virtual` with the virtual football sport ID. Scheduled/Instant remain manual/import only. Changing category clears the previous live feed to prevent mixing real games and simulated fixtures; saved user imports retain their specified category.

**Market browser:** click any event to see **all markets and all outcomes included in the fetched response** as individually expandable entries, with a market-name search. Market names, lines, prices and outcome labels are read from the payload, not synthetic. User-imported JSON can also supply all markets. We removed the prior first-100-markets and first-55-outcomes UI caps, increasing safeguards to 2,000 and 200 respectively. The upstream proxy still caps response size to 2 MB, so very large records can fail explicitly instead of silently truncating them.

**Important completeness limitation:** `pcUpcomingEvents` is a **fixture/listing endpoint**, not a verified exhaustive event-detail API. SportyBet may offer hundreds of additional markets on an individual fixture that the list endpoint does **not** include. No claim of *every market SportyBet offers* can be made until the exhaustive event-detail request has been identified and independently verified. Similarly, this version's real sports live/results feed isn't connected; the REAL SPORTS tab currently offers *upcoming football only*. These endpoints are unofficial and unverified in this environment.


## Vercel 500 FUNCTION_INVOCATION_FAILED hotfix

Version 2.1 removes the root `server.js` autoconfiguration collision. The new `dev-server.js` is for `npm start` locally; Vercel serves `index.html`/`assets/` statically and `/api/virtual` or `/api/real` as functions. Re-deploy with Framework Preset **Other**, Root Directory set to the folder containing `index.html` and `vercel.json`, and no custom Output Directory. Delete any old Vercel `server.js` from your Git repository (replace files, don't merely upload the new files on top). The API URLs are not guaranteed to work; an upstream failure should return an API 502 response, not take down the homepage. If a 500 persists, Vercel Runtime Logs show the actual exception.
