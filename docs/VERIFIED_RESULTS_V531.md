# Balanced ranking correction — 28 October 2026

The confidence-only policy could replace four original markets with 1.01–1.02 prices and present a combined 1.08 total as a high-confidence suggested ticket. The same-match constraint was already working; replacement ranking caused the collapse.

V5.3.1 preserves original qualifying markets. Weak/unsupported markets can use only same-event replacements that meet the selected history estimate floor and at least 1.15 odds. Qualifying alternatives use an explicit balance of history support and bounded price utility. Price utility saturates at 1.60, so chasing larger prices cannot endlessly increase ranking. Auto picks can add other qualifying matches toward the requested target; weak longshots and tiny prices cannot fill a shortfall.

The evaluator highlights the change in combined odds. Severe collapses are comparisons, not recommended revisions, and cannot be copied/reserved through its revision actions. If the supported markets cannot reconcile the user's history filter and useful return on the same matches, the UI says so. Higher odds and unsupported probabilities are never invented to meet a return threshold.

The user's exact existing code was loaded read-only and all four current matches researched. Current original odds were 34.63; balanced replacements returned about 2.36 at 1.15–1.35 per leg. This is still an extreme reduction, so it is rejected as a recommended revision. Original markets and fixture IDs are preserved. The maximum supported qualifying total is recorded in the local verification proof; it is a scan result, not proof that every unsupported operator market has been modeled.

82 automated tests pass, including the original odds collapse, useful replacement selection, preservation of qualifying originals, low-price-only alternatives, bounded price ranking, target assembly using other matches, previous preference migration, and versioned review persistence. Source syntax and DOM-ID checks pass. Review results from the former ranking are invalidated across local/cloud restoration and require a fresh review. Authentication, account ownership and database schemas are unchanged.

Model estimates remain uncalibrated. The main ticket cards now emphasize combined odds; the percentage is a secondary model-only scenario rather than a large confidence headline.
