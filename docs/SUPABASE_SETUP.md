# Persistent football knowledge

The site works without Supabase using the imported archive and temporary provider caches. No Supabase project has been created or connected for this task yet.

1. Create a Supabase project and apply `supabase/migrations/202610250001_knowledge.sql` in its SQL editor or migration workflow.
2. In Vercel’s server environment settings, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Keep the service-role key out of browser code, source control and chat. Redeploy after adding environment variables.
3. From a server environment with those variables, run `node scripts/seed-supabase.js`. It writes the model, 20 team identities, and 400 team/pair condition profiles, then checks model readback.
4. `/api/status` reports whether the database is configured; provider-history requests verify connectivity. Every verified real-team history refresh persists a snapshot and upserts dated observations by provider match ID. Existing observations are not erased when a provider omits them from a later snapshot.

Tables cover source-separated identities, observations with optional dates and measurements, model versions, condition profiles, and current history snapshots. Missing corner/player fields stay absent. Archival identities explicitly use a legacy provider namespace.

There is no public database write policy and no browser credential. The migration enables row-level security and revokes visitor table privileges. The public app’s server routes only save validated provider records. User sign-in is not necessary for browsing or using the local slip; server/database authentication is still required.

Documentation: [Supabase REST API](https://supabase.com/docs/guides/api), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
