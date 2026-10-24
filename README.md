# VirtualScope V3 — Real and Virtual Sports Explorer

Independent unofficial SportyBet Nigeria market viewer. No affiliation with SportyBet. No bets are placed and no account credentials are requested.

## Improvements

- Fetches multiple pages for virtual and real football until an empty/repeated page, with a 100-page safety bound per refresh (not a 10-event cap). SportyBet determines what pages are available; a successful request does not establish complete market coverage.
- Requests real football markets with `marketId=1,18,10,29,11,26,36,14,60100`, up to 100 fixtures per page. The upstream is unofficial and may fail. There is no independently confirmed production success.
- Refetches the active supported feed on first load, on category/mode change, when returning to a visible tab, and every 45 seconds while the page is visible. Previously fetched records are kept on refresh failures and switching tabs within the page.
- Market inspector displays all markets returned in the response, not a promise to fetch every market SportyBet offers.
- Builds a **local selection slip** from available market outcomes, calculates indicative combined decimal odds, stores picks locally, and copies selections. It **does not produce SportyBet-issued booking codes**. Booking codes must be issued by SportyBet and aren't implemented.
- Scheduled and Instant Virtuals retain **import/manual mode**. Verified API access, round state, and official booking are not available; the UI labels these limitations.

## Deploy

Upload contents of this folder to your GitHub repository and deploy on Vercel with Framework Preset **Other**, project root pointing at `index.html`. Remove obsolete `server.js` from older versions. Your app's API URLs are `/api/virtual` and `/api/real`. For development, run `npm start`. Tests: `npm test`.

## Scope and safeguards

This software relies on undocumented web endpoints and may be rate-limited, changed, or blocked. Virtual game results use simulation/random generation; odds do not ensure any winning strategy. This app does not expose genuine instant virtual round data, never silently invents market data and never claims a local slip is an official booking code.
