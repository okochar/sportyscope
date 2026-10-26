# Legacy Instant bot merge — 25 October 2026

Input: the user’s `sporty-master.zip`, collected in August 2022 according to file names. Source Python was read, not executed. No account login, stake, autoplay, or bet-placement logic was carried into the new application.

## What was recovered

- 93 CSV files; four byte-identical file copies.
- 22,622 rows examined after excluding those identical files.
- 6,359 distinct scored signatures using team labels, final scores and the three recorded 1X2 prices.
- 10,497 repeated scored signatures collapsed conservatively. Some identical signatures could represent different genuine rounds; missing match IDs prevent certainty.
- 5,766 scoreless rows excluded from goal training. Some are 1X2-only exports; pattern lists are not match observations.
- 20 original team codes recovered from `data_processor.py`’s explicit numeric mapping. Each team has 592–679 distinct signatures involving it. All 380 ordered pairs are represented.
- Forty observed conditions generated from final scores, with condition-met counts and denominators for each team and ordered pair.

The aggregate model is `data/legacy-instant-profiles.json`. The public migration summary is `assets/legacy-audit.json`. Modern provider IDs and archive labels remain separate. Only exact labels within Instant England use this model; no automatic `FOR` → `NFO` alias or real-team join is made.

## Improvements to the old approach

The old picker searched for an exact three-odds match and chose the most common 1X2 result in that subset. This can yield tiny or empty samples and ignores team/opponent information. The new model uses team and venue scoring/conceding rates plus a limited head-to-head contribution, then compares supported market settlements. It reports sample sizes and the archival evidence mode.

The original CSV collector’s `generate_data` reused the accumulating row during initial construction. The old `split_data` removed fields by value rather than column position. Neither operation is reused. The new importer validates named columns, scores, team mappings, prices and result consistency; duplicate handling is explicit.

## Limits preserved in the model

There are no per-match dates, round IDs, current simulator-version identifiers, corner counts, shots, cards, xG, player records, or goal-event timelines. No chronological backtest, current form, corners prediction, or verified modern calibration can be reconstructed. Observed conditions are descriptive statistics, not forty independently validated prediction models.

Model diagnostics do not veto automatic picks. When no usable historical model exists, the application can rank a clearly labelled price fallback from verified current complementary markets. Missing/closed markets and unsupported booking-code products remain excluded.
