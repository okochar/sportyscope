-- Run once after applying migrations and deploying the account worker.
-- Account owners start/pause their jobs through the application's controls.
-- The dispatcher creates short-lived single-use capabilities internally.
select cron.schedule(
 'scope-background-dispatch',
 '* * * * *',
 'select public.scope_dispatch_background();'
);
