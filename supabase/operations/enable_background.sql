-- Run once after applying migrations and deploying the account worker.
-- Account owners start/pause their jobs through the application's controls.
-- The dispatcher creates short-lived single-use capabilities internally.
select cron.schedule(
 'scope-background-dispatch',
 '* * * * *',
 'select public.scope_dispatch_background();'
);

-- An installed dispatcher stays inactive until an account explicitly starts it.
select cron.alter_job(jobid,active=>exists(select 1 from public.scope_background_accounts where enabled))
from cron.job where jobname='scope-background-dispatch';
