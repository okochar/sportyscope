# Connect SportyScope to Supabase

Supabase is not connected yet. Until you do these steps, tickets remain in your browser. The app is prepared for the database; you do not need to change source code or add a visitor login.

1. Go to https://supabase.com/dashboard and sign in. Choose **New project**, your organization, and the name **SportyScope**. Choose the Free plan if offered, set a strong database password and save it privately. Choose an available region reasonably near your users. Wait for provisioning to finish.
2. In the live app, go to **Ticket history & learning → Cloud history → Set up Supabase** and download **the setup SQL**. Or open `assets/supabase-setup.sql` in this project. It contains both migrations, so new projects need to run only that one file.
3. In Supabase choose **SQL Editor → New query**. Paste the entire SQL file, then click **Run**. Expected result: success. In Table Editor, you should see `scope_tickets`, `scope_team_history`, `scope_models`, `scope_team_identities`, `scope_observations` and `scope_condition_profiles`. Existing installations can run just `supabase/migrations/202610270002_ticket_history.sql` to add tickets.
4. Open the project's **Connect** dialog and copy its project URL, such as `https://your-project.supabase.co`. This is not the database connection string.
5. Open **Settings → API Keys**. Create/copy a server **secret key** (`sb_secret_...`). Do not use the publishable or anon key. Keep the secret in your password manager, not in chat, browser settings or GitHub.
6. Open https://vercel.com/dashboard, select the **sportyscope** project, then **Settings → Environment Variables**. Add these two names and values for **Production** (also Preview/Development only if you want those environments using this database):

   | Name | Value |
   | --- | --- |
   | `SUPABASE_URL` | Your project URL from step 4 |
   | `SUPABASE_SECRET_KEY` | Your server secret from step 5 |

   The legacy JWT `service_role` key also works under `SUPABASE_SERVICE_ROLE_KEY` if no `SUPABASE_SECRET_KEY` is set. Never prefix either key with `PUBLIC` or `NEXT_PUBLIC`.
7. Save, then go to **Deployments**, open the latest production deployment's menu, and choose **Redeploy**. Environment changes only apply to a new deployment.
8. Reload https://sportyscope.vercel.app/ and go to **Cloud history → Sync saved tickets**. The panel must say **Cloud connected** and show the number backed up. This performs a real database request; `/api/status` saying merely “configured” is not a connectivity test. Existing local tickets upload automatically. New analysis tickets, tracked slips, loaded codes, revisions and subsequent verified leg results sync while the app is open.
9. Click **Copy private recovery key** and save it in your password manager. This is a separate random key created by SportyScope, not a Supabase API key. On another device open **Restore history on another device**, paste that recovery key, and choose **Restore & merge saved history**. Anyone with it can access that history. Losing it and clearing browser storage loses access to that private history. Restored results are rechecked with SportyBet before affecting local calibration.

## What is saved

- Private ticket backups (`scope_tickets`): selections, genuine booking codes when available, forecast snapshots and leg tracking states. The backend hashes the private key and scopes every request to that hash. Table access remains server-only, with RLS enabled and visitor grants revoked.
- Football research: source-separated histories/models and provider-verified completed observations. Research requests populate these automatically; old observations are not deleted when absent from a later provider response.
- Feed listings are temporary snapshots; every unselected match is not a saved ticket. OpenFootball and legacy Instant archives remain bundled locally even before optional database seeding.
- No bet is placed. Result checks and sync run while the page is open and catch up when it returns. There is no unattended scheduled worker in this version. Recovery-key syncing provides device portability, not named user accounts.
- Ticket backups supplied by a browser never become trusted shared training records. Only completed scores fetched and validated by the server enter shared provider observations.

Optional archive seed, from a server environment with the two variables set: `node scripts/seed-supabase.js`. It saves and verifies the bundled legacy model, identities and condition profiles plus the supplementary OpenFootball archive. This is not required for ticket backup or for using those bundled datasets.

If you see “Cloud history unavailable,” check the Production variables, deployment date, and that the complete SQL ran against the same Supabase project. Local tickets remain available and can retry. A paused/offline database also prevents cloud sync.

Official references: [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Vercel environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables).
