# V5.3 verification — 28 October 2026

74 automated tests pass: password login and recovery UI logic, expired callbacks, account isolation, automatic draft/review persistence, equivalent-revision reconciliation, source archive import, probability-first ranking, minimum estimate filtering, 50-leg boundaries, missing evidence, accumulator mathematics, feed completeness, booking readback and result settlement. Source syntax and unique HTML IDs pass.

A real Supabase transaction wrote/read a review component at revision 1 and rolled back. The migration is applied; no test account remained. RLS remains enabled. Security advisors report server-only tables with no public policies (intentional) and disabled optional leaked-password protection in the existing Auth project. No service credential was disclosed.

The importer retrieved all 288 discovered source files successfully: 89,706 completed scored results, no failed files, 1,296 distinct labels. Digest b3d6d25ee16697ab5af10ac5d34237181e623c54cc221f8a3ae16c65b1398ff9. Source dates do not imply coverage of every match or every statistic.

Local HTTP verification loaded all four products. Real AC Milan–Bologna returned 1,948 market lines and 212 modeled outcomes; vFootball returned 45 market lines and 112 modeled outcomes on the tested fixture. Both tests replaced a weak modeled outcome with a qualifying outcome on the same event. These are live snapshots and change over time. The deployed code must be checked separately after publication.

The computer-use browser kernel failed to start (missing kernel asset path), including after a reset. No new visual screenshot or real user password sign-in is claimed. Auth/UI tests use controlled fixtures; personal cross-device saving still requires the user to complete password setup and log in. Earlier browser screenshots belong to V5.2 and are not proof of V5.3 visual rendering.
