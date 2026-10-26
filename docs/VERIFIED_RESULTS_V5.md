# Version 5 verification — 26 October 2026

## Automated checks

46 Node regression tests passed. They cover full market preservation, fixture/result pagination, booking readback identity, actual operator headers, result validation, half-time and handicap settlement, 30-leg assembly, WAT date windows, missing-data handling, archive separation, deduplicated learning and the server-only Supabase adapter.

## Live-source evidence

- Genuine vFootball reservation `ZU719Y` was created by the local automatic flow and successfully loaded through `/api/load-code` with both exact selections and current prices. This is a historical test code, not a recommendation or a currently usable ticket.
- The official Results client established the missing `eventId` search / daily date parameters and `OperId: 2` header. BHA–AST returned 1:2; its Under 2.5 leg was correctly marked lost. BRE–SUN returned 3:1; Under 4.5 was correctly marked won.
- One vFootball league returned 5,280 completed records over 14 daily requests. Both tested teams had 528 records. Other leagues use separate identity scopes. Completeness follows actual provider responses; no inferred games or guaranteed long-term retention is claimed.
- The Real Inter/Fiorentina research test retrieved 73 and 64 usable completed regular-time team records, actual cursor pages, opponents and half-time scores. Quality diagnostics remain visible and do not veto picks.
- The legacy archive migration yielded 6,359 distinct scored signatures, 20 teams and 380 ordered pairs. Repeated-signature ambiguity and missing dates/IDs are disclosed.
- A supplementary CC0 OpenFootball collection retrieved 6,083 scored results from 24 files with 200 namespaced team profiles. It is a separate archive rather than a fuzzy duplicate join.

## Browser checks

- Exactly 30 event rows rendered while hundreds of records remained loaded. Next changed the visible range from 1–30 to 31–60 and recomputed the page count as new feed pages arrived.
- A custom 12.00 target and a 24-hour window produced a three-leg snapshot at 12.00 rather than a fixed 2.00 output.
- Ticket history retained pending and completed tickets across reload. The completed ticket showed independently verified lost/won legs and a lost overall status.
- Background ranking runs in a Web Worker to keep controls responsive during a full scan.
- A 390px mobile viewport had equal document and viewport content widths, with no horizontal overflow. Screenshots were saved outside the repository as delivery evidence.
- No browser JavaScript errors were observed in the final checks.

## Boundaries

No bet, stake, account login, autoplay or financial action was executed. Instant/Scheduled transferable booking codes and automated result settlement remain unverified. Unsupported result markets are labelled unverified; scores cannot settle corners or player statistics. Ticket tracking runs while the page is open and catches up on return. Local calibration uses distinct verified outcomes and is not proof of predictive profitability.

Supabase migrations, RLS, seeding/readback and a server-only adapter are prepared. No project existed or was connected during these tests, so database integration was tested with controlled responses, not claimed live. Browser ticket history is device-local; provider observations and model archives persist to Supabase after configuration.
