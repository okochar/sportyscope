# Source review — 26 October 2026

| Source | Verified access and use in this build |
| --- | --- |
| SportyBet full event/fixture APIs | Current anonymous market responses; all fixture pages and all returned markets preserved. Products stay separate. |
| SportyBet team results | Dated regular-time results by exact real-team IDs; actual cursor pagination and tournament IDs. Coverage is what the provider returns, not a claim of every historical match. |
| SportyBet official Results page | Its client uses `factsCenter/eventResultList` with `OperId: 2`, event ID search or daily start/end timestamps and tournament cursors. Real and vFootball completed scores were verified. A Spain vFootball test returned 5,280 records over 14 daily requests, including 528 involving each tested team. |
| SportyBet Scheduled statistics | Team ranks/form, scoring averages, recent results and H2H. Small undated samples are disclosed. |
| User's sporty-master.zip | Archival Instant England samples. Provenance, original team mapping, duplication ambiguity and missing dates are preserved. No financial automation or login code was reused. |
| OpenFootball | CC0 JSON archive. 6,083 scored results, 24 files, 200 namespaced team profiles. Separate from SportyBet model identities pending validated cross-provider matching. |
| LiveScore Bet | Public site/client inspected: live/statistics widgets, including possession and shot statistics. No reusable open structured feed was verified. No authenticated account was accessed. |
| StatsBomb / Hudl open-data | Competition catalogue and published user agreement reviewed. Research access exists, but the agreement restricts raw-data distribution and commercial exploitation; no event dataset was republished into this site. |
| Football-Data.co.uk | The source explicitly excludes automated training/data products from its intended free use. Its CSVs were not ingested for this model. |
| OpenLigaDB | Public unauthenticated results API and ODbL terms confirmed. A potential additional results source, not represented as a corners/player feed or silently merged here. |

Primary references:

- https://www.sportybet.com/ng/m/liveResult
- https://www.sportybet.com/ng/m/team-pages/sr:sport:1/sr:competitor:2817
- https://www.livescorebet.com/ng/
- https://github.com/openfootball/football.json and its `LICENSE.md`
- https://github.com/hudl/open-data and its `LICENSE.pdf`
- https://football-data.co.uk/data.php
- https://openligadb.de/

Free browsing is distinct from an open data licence. No source's missing fields are synthesized. Historical/public data does not establish a prediction edge or current completeness.
