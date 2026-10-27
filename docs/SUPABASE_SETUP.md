# Supabase account storage — V5.2

The live SportyScope project uses Supabase for shared football knowledge and private account workspaces. Database credentials are entered once in Vercel, never on a visitor's device. Recovery keys and manual synchronization have been removed.

## Existing project

The connected project is SportyScope (zvwdvsibbnkekzcvkjtb). Its original six tables were present and healthy. The initial connection failure came from the missing SUPABASE_SECRET_KEY in Vercel Production. SUPABASE_URL alone cannot authenticate the server. A localhost test server also does not inherit Vercel's production variables.

The account-workspace and event-trigger permission migrations have now been applied to the connected database. New installations can run assets/supabase-setup.sql once. Server variables in Production are:

- SUPABASE_URL: the project API URL, not the dashboard URL or database connection string.
- SUPABASE_SECRET_KEY: the server secret; legacy SUPABASE_SERVICE_ROLE_KEY also works.
- SUPABASE_PUBLISHABLE_KEY: the enabled publishable key for the official browser SDK. This is public; it never grants direct access to private application tables.

After changing variables, redeploy Production. Settings → Database connection performs actual table reads and reports precise failures. The app automatically prepares its bundled legacy and OpenFootball archives in the database, and research/result requests persist current verified provider observations and snapshots.

## Sign in once on each device

1. In Supabase → Authentication → URL Configuration, set Site URL to https://sportyscope.vercel.app and allow https://sportyscope.vercel.app/** as a redirect URL. Email authentication must be enabled. If using a local development callback, explicitly allow that development origin too.
2. Open the LIVE site → Settings. Enter your email and choose Email me a sign-in link. Open the link on that device. Use the same email on another device to load the same account.
3. Your session is remembered and refreshed by the official Supabase SDK. The app automatically saves tickets, current slip, analysis preferences, imports and outcome journal. Existing device drafts and history are migrated into the first signed-in account on that browser. Each account's local cache is kept separate.
4. The save bar reports saving, saved or a concrete failure. When two devices edit the same slip/preferences simultaneously, Settings offers the cloud version or the retained device draft. This prevents silent overwrites. A read-only new device never replaces an existing cloud slip with an empty one.

Supabase's default email sender may only deliver to project organization members and has rate limits. Configure a custom SMTP sender to support other email addresses. The app displays provider errors; it does not claim that an email was sent when Supabase rejects it.

## Storage boundaries

Private account components live in scope_workspace, keyed by verified Supabase user ID and component. Tickets use a stable hash of the verified user ID in scope_tickets. Every protected request verifies the bearer token through Supabase's user endpoint; browser-provided IDs and user_metadata never grant access. All application tables have RLS and visitor table privileges revoked. The workspace save RPC uses invoker rights, restricted execution and optimistic revisions.

Shared histories, model versions, source-separated identities, observations and condition profiles remain separate from private notes and ticket backups. Browser backups never become trusted training results. Restored statuses are rechecked against the provider before local calibration.

Automatic saving and result checks run while the app is open and catch up when it returns. This release does not add an unattended server worker. Feeds remain complete snapshots with 30 visible games per page; they are not all saved as personal tickets.

Official documentation: https://supabase.com/docs/guides/auth/auth-email-passwordless and https://vercel.com/docs/environment-variables/managing-environment-variables
