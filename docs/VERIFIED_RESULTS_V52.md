# V5.2 verification

Story: a signed-in visitor changes a slip or saves a ticket, the browser sends the authenticated request to the app server, the server verifies the Supabase user and persists the correct account record, and another device loads that account's state. Markets, picks, ticket review, history and configuration are distinct screens.

## Confirmed root cause and repair

The connected SportyScope Supabase project was healthy and the original six tables existed with server grants. Vercel Production had SUPABASE_URL but no server secret. An initial edit updated the URL rather than creating the separate secret entry. Both variables were subsequently confirmed present; the URL was normalized to the connected project's API origin. The publishable browser key was configured through the connected services. Secrets were not read or copied into source code or browser responses.

The account-workspace and restricted event-trigger-helper migrations have been applied to the connected database. A transaction-only test inserted a temporary test identity, exercised workspace revisions 1 and 2, read the result, and rolled everything back. No test account or draft was persisted. The advisor check now has only informational RLS-without-public-policy notices: all seven application tables intentionally have server-only access and no visitor grants.

## Tests

62 automated tests passed before publication. New coverage includes missing/malformed configuration, accidental secret-key exposure prevention, Supabase user verification, account-scoped reads/writes, stale revision rejection, automatic guest draft upload, existing cloud state on a new device, and preservation of both drafts during conflicting edits.

Local browser verification confirmed one visible application screen at a time, functioning navigation and ticket subviews, expected local-only diagnostics without local server credentials, and no console errors. At a 390px viewport, document width stayed within the viewport. Game pagination still retains all fetched data with 30 visible rows.

The official browser SDK is pinned to 2.118.0 with a lockfile and locally served distribution/license; installation audit reported no vulnerabilities. The current Supabase changelog was checked, including the HTTP TLS deprecation and PostgreSQL 17.11 notices. This implementation uses current Node HTTPS, UUID/text/JSONB data and ordinary indexes; no deprecated cipher requirement or affected extension/custom-operator logic was introduced.

## Operational boundaries

Email sign-in requires the project Site URL/redirect allowlist to include the live app. The user's inbox verification is a user action, and real account sign-in must be verified separately after publication; passing a controlled identity test is not a claim that an email reached the user. Supabase's default mail delivery restrictions apply until a custom SMTP provider is configured.

Saving and result checks run automatically while the app is open and catch up on return. There is no unattended worker. Private ticket backups do not enter shared provider models as verified observations. Existing provider/history model capabilities and the distinction between experimental estimates and validated predictive accuracy remain unchanged.
